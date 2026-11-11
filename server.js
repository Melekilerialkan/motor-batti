const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Veritabanı Bağlantısı (Lokal veya Bulut URL)
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:sifre@localhost:5432/motor_batti';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

// Otomatik Tablo Oluşturucu
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

            CREATE TABLE IF NOT EXISTS match_history (
                player1_id INT REFERENCES users(id),
                player2_id INT REFERENCES users(id),
                player1_wins INT DEFAULT 0,
                player2_wins INT DEFAULT 0,
                PRIMARY KEY (player1_id, player2_id)
            );
        `);
        console.log("Veritabanı ve tablolar hazır! 🚀");
    } catch (err) {
        console.log("DB Bağlantı / Oluşturma Notu:", err.message);
    }
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const rooms = {}; 
const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    // 1. KAYIT OL
    socket.on('register', async (data) => {
        if (!data.username || !data.password) {
            return socket.emit('appError', { message: 'Kullanıcı adı ve şifre boş olamaz!' });
        }
        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            await pool.query(
                'INSERT INTO users (username, password) VALUES ($1, $2)',
                [data.username, hashedPassword]
            );
            socket.emit('appAlert', { message: 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.' });
        } catch (err) {
            socket.emit('appError', { message: 'Bu kullanıcı adı zaten alınmış!' });
        }
    });

    // 2. GİRİŞ YAP
    socket.on('login', async (data) => {
        if (!data.username || !data.password) {
            return socket.emit('appError', { message: 'Lütfen kullanıcı adı ve şifrenizi girin!' });
        }
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [data.username]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const match = await bcrypt.compare(data.password, user.password);
                if (match) {
                    onlineUsers[socket.id] = { id: socket.id, username: user.username, db_id: user.id };
                    socket.emit('loginSuccess', { 
                        username: user.username, 
                        wins: user.total_wins || 0, 
                        losses: user.total_losses || 0 
                    });
                } else {
                    socket.emit('appError', { message: 'Şifre hatalı!' });
                }
            } else {
                socket.emit('appError', { message: 'Kullanıcı bulunamadı!' });
            }
        } catch (err) {
            console.error(err);
            socket.emit('appError', { message: 'Veritabanı bağlantı hatası!' });
        }
    });

    // 3. ODAYA KATIL
    socket.on('joinRoom', (roomCode) => {
        const code = roomCode ? roomCode.trim() : "";
        if (!code) return socket.emit('appError', { message: 'Oda kodu giriniz!' });

        if (!rooms[code]) {
            rooms[code] = { players: [], readyCount: 0, turn: 0 };
        }
        
        const room = rooms[code];
        if (room.players.find(p => p.socketId === socket.id)) return;
        if (room.players.length >= 2) return socket.emit('appError', { message: 'Bu oda dolmuş!' });

        socket.join(code);
        const currentUser = onlineUsers[socket.id] || { username: 'Oyuncu', db_id: 0 };
        
        room.players.push({ 
            socketId: socket.id, 
            username: currentUser.username,
            db_id: currentUser.db_id 
        });

        if (room.players.length === 1) {
            socket.emit('appAlert', { message: 'Odaya katıldın! Rakip bekleniyor...' });
        } else if (room.players.length === 2) {
            io.to(code).emit('gameStart', { message: 'Rakip bağlandı! Motorlarınızı tahtaya dizin.' });
        }
    });

    // 4. HAZIR OLMA DURUMU
    socket.on('playerReady', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.readyCount++;
            if (room.readyCount === 2) {
                room.turn = room.players[0].socketId;
                io.to(roomCode).emit('allReady', { 
                    message: 'Her iki taraf da hazır! Savaş Başlıyor!',
                    turn: room.turn 
                });
            }
        }
    });

    // 5. ATEŞ ETME (SALDIRI)
    socket.on('attack', (data) => {
        const room = rooms[data.roomCode];
        if (room && room.turn === socket.id) {
            socket.to(data.roomCode).emit('receiveAttack', { index: data.index, shooterId: socket.id });
        }
    });

    // 6. SALDIRI SONUCU VE SIRA DEĞİŞİMİ
    socket.on('attackResult', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            io.to(data.roomCode).emit('updateBoard', data);
            
            // Sırayı diğer oyuncuya devret
            const nextPlayer = room.players.find(p => p.socketId !== room.turn);
            if (nextPlayer) {
                room.turn = nextPlayer.socketId;
                io.to(data.roomCode).emit('turnChange', { turn: room.turn });
            }
        }
    });

    // 7. OYUN BİTİŞİ VE İSTATİSTİK GÜNCELLEME
    socket.on('gameOver', async (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            const winner = room.players.find(p => p.socketId === data.winnerId);
            const loser = room.players.find(p => p.socketId !== data.winnerId);

            if (winner && loser && winner.db_id !== 0) {
                try {
                    await pool.query('UPDATE users SET total_wins = total_wins + 1 WHERE id = $1', [winner.db_id]);
                    await pool.query('UPDATE users SET total_losses = total_losses + 1 WHERE id = $2', [loser.db_id]);
                } catch (e) {
                    console.error("DB Skor Güncelleme Hatası:", e.message);
                }
            }
            const winnerName = winner ? winner.username : 'Rakip';
            io.to(data.roomCode).emit('gameEnded', { winner: winnerName });
            delete rooms[data.roomCode];
        }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));