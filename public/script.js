const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

let selectedMotorIndex = null;
let isHorizontal = true;
let lOrientation = 0; // 0: ┌, 1: ┐, 2: └, 3: ┘
let placedMotors = [];

const MOTOR_IMAGES = {
    motorbike: 'motorbike.png',
    motocross: 'motocross.png',
    scooter: 'scooter.png',
    helmet: 'helmet.png',
    main_motor: 'motorbike.png'
};

document.addEventListener('DOMContentLoaded', () => {
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
    checkAutoLogin();
});

function checkAutoLogin() {
    const savedUser = localStorage.getItem('motor_batti_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        document.getElementById('welcome-text').innerText = `Hoş geldin, ${user.username}!`;
        document.getElementById('stats-panel').innerHTML = `<p style="color:#05d9e8;">Galibiyet: ${user.wins || 0} | Mağlubiyet: ${user.losses || 0}</p>`;
        switchScreen('lobby-screen');
    }
}

function logout() {
    localStorage.removeItem('motor_batti_user');
    switchScreen('auth-screen');
}

function showModal(msg, primaryCb = null, secondaryCb = null, primaryTxt = "Tamam", secondaryTxt = "") {
    document.getElementById('modal-message').innerText = msg;
    const pBtn = document.getElementById('modal-btn-primary');
    const sBtn = document.getElementById('modal-btn-secondary');

    pBtn.innerText = primaryTxt;
    pBtn.onclick = () => { closeModal(); if (primaryCb) primaryCb(); };

    if (secondaryTxt) {
        sBtn.innerText = secondaryTxt;
        sBtn.style.display = 'block';
        sBtn.onclick = () => { closeModal(); if (secondaryCb) secondaryCb(); };
    } else {
        sBtn.style.display = 'none';
    }

    document.getElementById('custom-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('custom-modal').classList.remove('active');
}

function createBoard(boardId, clickHandler) {
    const board = document.getElementById(boardId);
    board.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        cell.onclick = () => clickHandler(i);
        board.appendChild(cell);
    }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function register() {
    socket.emit('register', { username: document.getElementById('username').value, password: document.getElementById('password').value });
}

function login() {
    socket.emit('login', { username: document.getElementById('username').value, password: document.getElementById('password').value });
}

socket.on('appAlert', (data) => showModal(data.message));
socket.on('appError', (data) => showModal("Hata: " + data.message));

socket.on('loginSuccess', (data) => {
    localStorage.setItem('motor_batti_user', JSON.stringify(data));
    switchScreen('lobby-screen');
    document.getElementById('welcome-text').innerText = `Hoş geldin, ${data.username}!`;
    document.getElementById('stats-panel').innerHTML = `<p style="color:#05d9e8;">Galibiyet: ${data.wins} | Mağlubiyet: ${data.losses}</p>`;
});

function joinRoom() {
    currentRoom = document.getElementById('roomCode').value;
    const settings = {
        fleetMode: document.getElementById('setting-fleet').value,
        touchMode: document.getElementById('setting-touch').value,
        shotMode: document.getElementById('setting-shot').value
    };
    socket.emit('joinRoom', { roomCode: currentRoom, settings: settings });
}

socket.on('gameStart', (data) => {
    showModal(data.message);
    activeSettings = data.settings;
    switchScreen('game-screen');
    switchTab('my-area');
    setupDefaultBottomFleet();
});

// YENİDEN HESAPLANMIŞ ALT SATIR DİZİMİ (KIRMIZI 4 KARE ARD ARDA, MAVİ SCOOTER 2x2 ALAN)
function setupDefaultBottomFleet() {
    createBoard('my-board', handleMyBoardClick);
    placedMotors = [];
    myHitsTaken = 0;

    if (activeSettings.fleetMode === 'helmets') {
        totalPartsToWin = 7;
        placeMotorOnBoard('main_motor', 3, 70, true);
        placeMotorOnBoard('helmet', 1, 90, true);
        placeMotorOnBoard('helmet', 1, 92, true);
        placeMotorOnBoard('helmet', 1, 94, true);
        placeMotorOnBoard('helmet', 1, 96, true);
    } else {
        totalPartsToWin = 16;
        // Kırmızı 4 kare yan yana tam 4 hücre kaplar (90, 91, 92, 93)
        placeMotorOnBoard('motorbike', 4, 90, true); 
        // Mavi Scooterlar (3 Birimlik alan)
        placeMotorOnBoard('scooter', 3, 95, true);   
        placeMotorOnBoard('scooter', 3, 70, true);   
        placeMotorOnBoard('scooter', 3, 75, true);   
        // L-Motokros (2x2 Alan kaplar)
        placeMotorOnBoard('motocross', 3, 80, true, 0); 
    }
}

function placeMotorOnBoard(type, size, startIndex, isHoriz, lOrient = 0) {
    const cellsToOccupy = calculateCellsToOccupy(type, size, startIndex, isHoriz, lOrient);
    if (!cellsToOccupy) return false;

    const boardCells = document.getElementById('my-board').children;

    cellsToOccupy.forEach(cellIndex => boardCells[cellIndex].classList.add('motor'));

    const firstCell = boardCells[startIndex];
    const img = document.createElement('img');
    img.src = MOTOR_IMAGES[type];
    img.classList.add('motor-overlay-img');

    if (type === 'motocross' || type === 'scooter') {
        // 2x2 Görsel Alanı Kaplama
        img.style.width = '200%';
        img.style.height = '200%';
        const rotations = [0, 90, 270, 180];
        img.style.transform = `rotate(${rotations[lOrient]}deg)`;
    } else if (type === 'helmet') {
        img.style.width = '100%';
        img.style.height = '100%';
    } else {
        // Kırmızı Motor (4 kare uca uca esneme)
        if (isHoriz) {
            img.style.width = `${size * 100}%`;
            img.style.height = '100%';
        } else {
            img.style.width = `${size * 100}%`;
            img.style.height = '100%';
            img.style.transformOrigin = 'top left';
            img.style.transform = `rotate(90deg) translateY(-100%)`;
        }
    }

    firstCell.appendChild(img);
    placedMotors.push({ type: type, size: size, startIndex: startIndex, isHorizontal: isHoriz, lOrientation: lOrient, cells: [...cellsToOccupy], hits: 0 });
    return true;
}

// MOTORLARI TAHTADA SEÇİP TAŞIMA VE YER DEGISTIRME
function handleMyBoardClick(index) {
    const boardCells = document.getElementById('my-board').children;

    // 1. Bir motora tıklandıysa onu seç
    const existingMotorIndex = placedMotors.findIndex(m => m.cells.includes(index));

    if (existingMotorIndex !== -1) {
        selectedMotorIndex = existingMotorIndex;
        showModal(`Motor seçildi! Taşımak istediğin yeni boş kareye tıkla. (Yön değiştirmek için YÖN butonuna bas)`);
        return;
    }

    // 2. Bir motor seçiliyken boş bir kareye tıklandıysa motoru yeni yere taşı
    if (selectedMotorIndex !== null) {
        const motor = placedMotors[selectedMotorIndex];

        // Eski görselleri ve sınıfları temizle
        motor.cells.forEach(c => {
            boardCells[c].classList.remove('motor');
            boardCells[c].innerHTML = '';
        });

        // Motoru geçici kaldır
        const currentMotor = placedMotors.splice(selectedMotorIndex, 1)[0];

        // Yeni konuma oturtmayı dene
        const success = placeMotorOnBoard(currentMotor.type, currentMotor.size, index, isHorizontal, lOrientation);

        if (!success) {
            // Başarısız olursa eski yerine geri koy
            placeMotorOnBoard(currentMotor.type, currentMotor.size, currentMotor.startIndex, currentMotor.isHorizontal, currentMotor.lOrientation);
            showModal("Taşınamadı! Motor tahtadan dışarı taşıyor veya çakışıyor.");
        } else {
            showModal("Motor yeni yerine taşındı! 🏍️");
        }
        selectedMotorIndex = null;
    }
}

function toggleRotation() {
    isHorizontal = !isHorizontal;
    lOrientation = (lOrientation + 1) % 4;
    document.getElementById('btn-rotate').innerText = isHorizontal ? "Yön: YATAY 🔄" : "Yön: DİKEY 🔄";
}

function calculateCellsToOccupy(type, size, index, isHoriz, lOrient) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const cells = [];

    if (type === 'motocross' || (type === 'scooter' && size === 3)) {
        if (lOrient === 0) {
            if (col + 1 >= 10 || row + 1 >= 10) return null;
            cells.push(index, index + 1, index + 10);
        } else if (lOrient === 1) {
            if (col - 1 < 0 || row + 1 >= 10) return null;
            cells.push(index, index - 1, index + 10);
        } else if (lOrient === 2) {
            if (col + 1 >= 10 || row - 1 < 0) return null;
            cells.push(index, index + 1, index - 10);
        } else if (lOrient === 3) {
            if (col - 1 < 0 || row - 1 < 0) return null;
            cells.push(index, index - 1, index - 10);
        }
    } else {
        for (let i = 0; i < size; i++) {
            if (isHoriz) {
                if (col + i >= 10) return null;
                cells.push(index + i);
            } else {
                if (row + i >= 10) return null;
                cells.push(index + (i * 10));
            }
        }
    }
    return cells;
}

function randomizeFleet() {
    setupDefaultBottomFleet();
    showModal("Motorlar sıfırlandı ve dizildi! 🎲");
}

function manualSwitchTab(tabId) { switchTab(tabId); }

function switchTab(tabId) {
    document.querySelectorAll('.board-section').forEach(s => s.classList.remove('active-tab'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.add('active-tab');

    if (tabId === 'my-area') document.getElementById('tab-my').classList.add('active');
    else document.getElementById('tab-enemy').classList.add('active');
}

function sendReady() {
    socket.emit('playerReady', { roomCode: currentRoom, motorCount: placedMotors.length });
    document.getElementById('btn-ready').innerText = "RAKİP BEKLENİYOR...";
    document.getElementById('btn-ready').disabled = true;
}

socket.on('allReady', (data) => {
    showModal(data.message);
    document.getElementById('setup-action-bar').style.display = 'none';
    document.getElementById('btn-ready').style.display = 'none'; 
    myTurn = (data.turn === socket.id);
    updateTurnUI(data.shotsLeft);
});

socket.on('turnChange', (data) => {
    myTurn = (data.turn === socket.id);
    updateTurnUI(data.shotsLeft);
});

function updateTurnUI(shotsLeft) {
    const indicator = document.getElementById('turn-indicator');
    const badge = document.getElementById('shots-left-badge');
    
    badge.innerText = `Kalan Atış: ${shotsLeft}`;

    if (myTurn) {
        indicator.innerText = "SIRA SENDE! 🎯";
        indicator.style.color = "#05d9e8"; 
        switchTab('enemy-area');
    } else {
        indicator.innerText = "RAKİBİN SIRASI... ⏳";
        indicator.style.color = "#ff2a6d"; 
        switchTab('my-area');
    }
}

function handleEnemyBoardClick(index) {
    if (!myTurn) return showModal("Sıra sende değil!");
    
    const enemyCells = document.getElementById('enemy-board').children;
    if (enemyCells[index].classList.contains('hit') || enemyCells[index].classList.contains('miss')) return;

    socket.emit('attack', { roomCode: currentRoom, index: index });
}

socket.on('receiveAttack', (data) => {
    const myBoard = document.getElementById('my-board');
    const targetCell = myBoard.children[data.index];
    
    let result = 'miss';
    let destroyed = false;

    if (targetCell.classList.contains('motor')) {
        result = 'hit';
        myHitsTaken++;
        targetCell.classList.add('hit');
        triggerShake('my-board');
    } else {
        targetCell.classList.add('miss');
    }

    socket.emit('attackResult', { 
        roomCode: currentRoom, 
        index: data.index, 
        result: result,
        destroyedMotor: destroyed,
        shooterId: data.shooterId 
    });

    if (myHitsTaken === totalPartsToWin) {
        socket.emit('gameOver', { roomCode: currentRoom, winnerId: data.shooterId });
    }
});

socket.on('updateBoard', (data) => {
    const enemyCells = document.getElementById('enemy-board').children;
    const targetCell = enemyCells[data.index];

    if (data.result === 'hit') {
        targetCell.classList.add('hit');
        triggerShake('enemy-board');
    } else {
        targetCell.classList.add('miss');
    }
});

function triggerShake(boardId) {
    const board = document.getElementById(boardId);
    board.classList.add('shake');
    setTimeout(() => board.classList.remove('shake'), 300);
}

socket.on('gameEnded', (data) => {
    const savedUser = JSON.parse(localStorage.getItem('motor_batti_user') || '{}');
    const isWinner = (data.winner === savedUser.username);

    if (isWinner) {
        savedUser.wins = (savedUser.wins || 0) + 1;
        localStorage.setItem('motor_batti_user', JSON.stringify(savedUser));

        if (savedUser.wins >= 3) {
            triggerConfetti();
            showModal(
                "🌪️🥩 KAVURMA KASIRGASI! 🥩🌪️\n3 Galibiyet Serisi Yaptın! Efsanesin!",
                () => socket.emit('requestRematch', { roomCode: currentRoom }),
                () => switchScreen('lobby-screen'),
                "Rövanş İste 🔄",
                "Lobiye Dön 🚪"
            );
            return;
        }
    }

    showModal(
        `Oyun Bitti! Kazanan: ${data.winner} 🏆`, 
        () => socket.emit('requestRematch', { roomCode: currentRoom }), 
        () => switchScreen('lobby-screen'),
        "Rövanş İste 🔄",
        "Lobiye Dön 🚪"
    );
});

function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}

socket.on('rematchOffered', (data) => {
    showModal(
        `${data.sender} seninle rövanş yapmak istiyor!`,
        () => socket.emit('requestRematch', { roomCode: currentRoom }),
        () => switchScreen('lobby-screen'),
        "Kabul Et 🚀",
        "Reddet 🚪"
    );
});

socket.on('startRematch', (data) => {
    showModal("Rövanş Başlıyor! Motorlarınızı hazırlayın.");
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
    document.getElementById('setup-action-bar').style.display = 'flex';
    document.getElementById('btn-ready').innerText = "SAVAŞA HAZIRIM 🚀";
    document.getElementById('btn-ready').disabled = false;
    document.getElementById('btn-ready').style.display = 'block';
    setupDefaultBottomFleet();
    switchTab('my-area');
});