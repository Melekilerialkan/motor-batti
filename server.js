const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:sifre@localhost:5432/motor_batti';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                total_wins INT DEFAULT 0,
                total_losses INT DEFAULT 0
            );
        `);
        console.log("Veritabanı ve tablolar hazır! 🚀");
    } catch (err) {
        console.log("DB Hatası:", err.message);
    }
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const rooms = {}; 
const onlineUsers = {};

function calculateInitialShots(room, playerId) {
    const mode = room.settings.shotMode;
    if (mode === 'fixed3') return 3;
    if (mode === 'fixed6') return 6;
    if (mode === 'combo') return 1;
    if (mode === 'fleetCount') {
        const player = room.players.find(p => p.socketId === playerId);
        return player ? player.aliveMotorsCount : 1;
    }
    return 1;
}

io.on('connection', (socket) => {
    socket.on('register', async (data) => {
        if (!data.username || !data.password) {
            return socket.emit('appError', { message: 'Girdiler boş olamaz!' });
        }
        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [data.username, hashedPassword]);
            socket.emit('appAlert', { message: 'Kayıt başarılı! Giriş yapabilirsiniz.' });
        } catch (err) {
            socket.emit('appError', { message: 'Bu kullanıcı adı zaten alınmış!' });
        }
    });

    socket.on('login', async (data) => {
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [data.username]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const match = await bcrypt.compare(data.password, user.password);
                if (match) {
                    onlineUsers[socket.id] = { id: socket.id, username: user.username, db_id: user.id };
                    socket.emit('loginSuccess', { username: user.username, db_id: user.id, wins: user.total_wins || 0, losses: user.total_losses || 0 });
                } else {
                    socket.emit('appError', { message: 'Şifre hatalı!' });
                }
            } else {
                socket.emit('appError', { message: 'Kullanıcı bulunamadı!' });
            }
        } catch (err) {
            socket.emit('appError', { message: 'Veritabanı bağlantı hatası!' });
        }
    });

    socket.on('joinRoom', (data) => {
        const code = data.roomCode ? data.roomCode.trim() : "";
        if (!code) return socket.emit('appError', { message: 'Oda kodu giriniz!' });

        if (!rooms[code]) {
            rooms[code] = {
                players: [],
                readyCount: 0,
                turn: null,
                settings: data.settings || { fleetMode: 'normal', touchMode: 'degsin', shotMode: 'combo' },
                shotsLeft: 0,
                rematchVotes: 0
            };
        }
        
        const room = rooms[code];
        if (room.players.find(p => p.socketId === socket.id)) return;
        if (room.players.length >= 2) return socket.emit('appError', { message: 'Oda dolu!' });

        socket.join(code);
        const currentUser = onlineUsers[socket.id] || { username: 'Oyuncu', db_id: 0 };
        
        room.players.push({
            socketId: socket.id,
            username: currentUser.username,
            db_id: currentUser.db_id,
            aliveMotorsCount: room.settings.fleetMode === 'helmets' ? 5 : 6,
            ready: false,
            wantsRematch: false
        });

        if (room.players.length === 1) {
            socket.emit('appAlert', { message: 'Odaya katıldın! Kurallar belirlendi, rakip bekleniyor...' });
        } else if (room.players.length === 2) {
            io.to(code).emit('gameStart', { 
                message: 'Rakip bağlandı! Görsel filonuzu yerleştirin.',
                settings: room.settings
            });
        }
    });

    socket.on('playerReady', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);
        // Aynı oyuncu iki kez "hazırım" derse sayaç şişmesin
        if (!player || player.ready) return;
        player.ready = true;
        if (data.motorCount) player.aliveMotorsCount = data.motorCount;

        room.readyCount++;
        if (room.readyCount === 2) {
            room.turn = room.players[0].socketId;
            room.shotsLeft = calculateInitialShots(room, room.turn);

            io.to(data.roomCode).emit('allReady', {
                message: 'Savaş Başlıyor!',
                turn: room.turn,
                shotsLeft: room.shotsLeft
            });
        }
    });

    socket.on('attack', (data) => {
        const room = rooms[data.roomCode];
        if (room && room.turn === socket.id && room.shotsLeft > 0) {
            socket.to(data.roomCode).emit('receiveAttack', { index: data.index, shooterId: socket.id });
        }
    });

    socket.on('attackResult', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        // İstemci batan motorun türünü destroyedType olarak gönderiyor
        if (data.destroyedType) {
            const defender = room.players.find(p => p.socketId === socket.id);
            if (defender && defender.aliveMotorsCount > 0) {
                defender.aliveMotorsCount--;
            }
        }

        // Sonucu sadece vuran oyuncuya gönder. io.to(oda) vurulan oyuncuya da gidiyor
        // ve onun "Rakip Saha" tahtasına sahte vuruş işliyordu.
        socket.to(data.roomCode).emit('updateBoard', data);

        const mode = room.settings.shotMode;
        if (mode === 'combo') {
            if (data.result === 'hit') {
                room.shotsLeft = 1; 
            } else {
                room.shotsLeft = 0; 
            }
        } else {
            room.shotsLeft--;
        }

        if (room.shotsLeft <= 0) {
            const nextPlayer = room.players.find(p => p.socketId !== room.turn);
            if (nextPlayer) {
                room.turn = nextPlayer.socketId;
                room.shotsLeft = calculateInitialShots(room, room.turn);
            }
        }

        io.to(data.roomCode).emit('turnChange', { turn: room.turn, shotsLeft: room.shotsLeft });
    });

    socket.on('gameOver', async (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            const winner = room.players.find(p => p.socketId === data.winnerId);
            const loser = room.players.find(p => p.socketId !== data.winnerId);

            if (winner && loser && winner.db_id !== 0) {
                try {
                    await pool.query('UPDATE users SET total_wins = total_wins + 1 WHERE id = $1', [winner.db_id]);
                    await pool.query('UPDATE users SET total_losses = total_losses + 1 WHERE id = $1', [loser.db_id]);
                } catch (e) {
                    console.error("DB Güncelleme Hatası:", e.message);
                }
            }
            io.to(data.roomCode).emit('gameEnded', { winner: winner ? winner.username : 'Rakip' });
        }
    });

    // RÖVANŞ MEKANİZMASI
    socket.on('requestRematch', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            const player = room.players.find(p => p.socketId === socket.id);
            // Aynı oyuncu butona iki kez basınca rövanş tek başına başlamasın
            if (!player || player.wantsRematch) return;
            player.wantsRematch = true;
            room.rematchVotes = (room.rematchVotes || 0) + 1;
            socket.to(data.roomCode).emit('rematchOffered', { sender: onlineUsers[socket.id]?.username || 'Rakip' });
            if (room.rematchVotes === 2) {
                room.readyCount = 0;
                room.rematchVotes = 0;
                room.turn = null;
                room.shotsLeft = 0;
                room.players.forEach(p => {
                    p.aliveMotorsCount = room.settings.fleetMode === 'helmets' ? 5 : 6;
                    p.ready = false;
                    p.wantsRematch = false;
                });
                io.to(data.roomCode).emit('startRematch', { settings: room.settings });
            }
        }
    });

    // Oyuncu ayrılınca (sekme kapandı, sayfa yenilendi ya da lobiye döndü) odayı kapat.
    // Eskiden oyuncu odada kalıyordu; aynı kodla tekrar girince "Oda dolu!" çıkıyordu.
    function leaveRooms() {
        for (const code of Object.keys(rooms)) {
            const room = rooms[code];
            if (!room.players.some(p => p.socketId === socket.id)) continue;
            socket.to(code).emit('opponentLeft', { message: 'Rakip oyundan ayrıldı. Lobiye dönülüyor.' });
            io.in(code).socketsLeave(code);
            delete rooms[code];
        }
    }

    socket.on('leaveRoom', leaveRooms);

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        leaveRooms();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));