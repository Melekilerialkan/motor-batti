const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

let inventory = {};
let selectedMotorType = null;
let selectedMotorSize = 0;

let isHorizontal = true;
let lOrientation = 0; // 0: ┌, 1: ┐, 2: └, 3: ┘
let modalCallback = null;

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
        document.getElementById('stats-panel').innerHTML = `<p>Galibiyet: ${user.wins || 0} | Mağlubiyet: ${user.losses || 0}</p>`;
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
    document.getElementById('stats-panel').innerHTML = `<p>Galibiyet: ${data.wins} | Mağlubiyet: ${data.losses}</p>`;
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
    setupFleetInventory();
    switchScreen('game-screen');
    switchTab('my-area');
});

function setupFleetInventory() {
    const container = document.getElementById('fleet-list-container');
    container.innerHTML = '';
    placedMotors = [];
    myHitsTaken = 0;

    if (activeSettings.fleetMode === 'helmets') {
        inventory = { main_motor: 1, helmet: 4 };
        totalPartsToWin = 7;
        container.innerHTML = `
            <div class="motor-item" onclick="selectMotor('main_motor', 3, event)">
                <img src="${MOTOR_IMAGES.main_motor}"> Kırmızı Motor (3 Birim) - Kalan: <span id="count-main_motor">1</span>
            </div>
            <div class="motor-item" onclick="selectMotor('helmet', 1, event)">
                <img src="${MOTOR_IMAGES.helmet}"> Kask (1 Birim) - Kalan: <span id="count-helmet">4</span>
            </div>
        `;
    } else {
        inventory = { motorbike: 1, motocross: 2, scooter: 3 };
        totalPartsToWin = 16;
        container.innerHTML = `
            <div class="motor-item" onclick="selectMotor('motorbike', 4, event)">
                <img src="${MOTOR_IMAGES.motorbike}"> Kırmızı Yarış Motoru (4 Birim) - Kalan: <span id="count-motorbike">1</span>
            </div>
            <div class="motor-item" onclick="selectMotor('motocross', 3, event)">
                <img src="${MOTOR_IMAGES.motocross}"> L-Motokros (3 Birim - L Şekli) - Kalan: <span id="count-motocross">2</span>
            </div>
            <div class="motor-item" onclick="selectMotor('scooter', 2, event)">
                <img src="${MOTOR_IMAGES.scooter}"> Mavi Scooter (2 Birim) - Kalan: <span id="count-scooter">3</span>
            </div>
        `;
    }
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

function selectMotor(type, size, evt) {
    if (inventory[type] <= 0) return;
    selectedMotorType = type;
    selectedMotorSize = size;
    document.querySelectorAll('.motor-item').forEach(el => el.classList.remove('selected'));
    evt.currentTarget.classList.add('selected');

    if (type === 'motocross') {
        updateRotationButtonText();
    } else {
        document.getElementById('btn-rotate').innerText = isHorizontal ? "Yön: YATAY 🔄" : "Yön: DİKEY 🔄";
    }
}

function toggleRotation() {
    if (selectedMotorType === 'motocross') {
        lOrientation = (lOrientation + 1) % 4;
        updateRotationButtonText();
    } else {
        isHorizontal = !isHorizontal;
        document.getElementById('btn-rotate').innerText = isHorizontal ? "Yön: YATAY 🔄" : "Yön: DİKEY 🔄";
    }
}

function updateRotationButtonText() {
    const lShapes = ["┌ (Aşağı-Sağ)", "┐ (Aşağı-Sol)", "└ (Yukarı-Sağ)", "┘ (Yukarı-Sol)"];
    document.getElementById('btn-rotate').innerText = `L Yönü: ${lShapes[lOrientation]} 🔄`;
}

function calculateCellsToOccupy(index) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const cells = [];

    if (selectedMotorType === 'motocross') {
        if (lOrientation === 0) { // ┌
            if (col + 1 >= 10 || row + 1 >= 10) return null;
            cells.push(index, index + 1, index + 10);
        } else if (lOrientation === 1) { // ┐
            if (col - 1 < 0 || row + 1 >= 10) return null;
            cells.push(index, index - 1, index + 10);
        } else if (lOrientation === 2) { // └
            if (col + 1 >= 10 || row - 1 < 0) return null;
            cells.push(index, index + 1, index - 10);
        } else if (lOrientation === 3) { // ┘
            if (col - 1 < 0 || row - 1 < 0) return null;
            cells.push(index, index - 1, index - 10);
        }
    } else {
        for (let i = 0; i < selectedMotorSize; i++) {
            if (isHorizontal) {
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

function handleMyBoardClick(index) {
    if (!selectedMotorType || inventory[selectedMotorType] <= 0) {
        return showModal("Lütfen önce bir motor veya kask seçin!");
    }

    const cellsToOccupy = calculateCellsToOccupy(index);
    if (!cellsToOccupy) return showModal("Motor tahtadan dışarı taşıyor!");

    const boardCells = document.getElementById('my-board').children;

    for (let cellIndex of cellsToOccupy) {
        if (boardCells[cellIndex].classList.contains('motor')) {
            return showModal("Üst üste motor yerleştiremezsiniz!");
        }
    }

    if (activeSettings.touchMode === 'degmesin') {
        for (let cellIndex of cellsToOccupy) {
            if (hasAdjacentMotor(boardCells, cellIndex, cellsToOccupy)) {
                return showModal("Değmesin modu aktif! Etrafı boş kalmalı.");
            }
        }
    }

    // 1. Mantıksal hücreleri işaretle
    cellsToOccupy.forEach(cellIndex => boardCells[cellIndex].classList.add('motor'));

    // 2. BÜTÜN RESMİ ALANA YAYMA
    const firstCell = boardCells[index];
    const img = document.createElement('img');
    img.src = MOTOR_IMAGES[selectedMotorType];
    img.classList.add('motor-overlay-img');

    if (selectedMotorType === 'motocross') {
        // L-Motokros 2x2 alan kaplar
        img.style.width = '200%';
        img.style.height = '200%';
        const rotations = [0, 90, 270, 180];
        img.style.transform = `rotate(${rotations[lOrientation]}deg)`;
    } else if (selectedMotorType === 'helmet') {
        // 1x1 Kask
        img.style.width = '100%';
        img.style.height = '100%';
    } else {
        // Düz Motorlar (4 birim Kırmızı Motor veya 2-3 birim Scooter)
        if (isHorizontal) {
            img.style.width = `${selectedMotorSize * 100}%`;
            img.style.height = '100%';
        } else {
            img.style.width = `${selectedMotorSize * 100}%`;
            img.style.height = '100%';
            img.style.transformOrigin = 'top left';
            img.style.transform = `rotate(90deg) translateY(-100%)`;
        }
    }

    firstCell.appendChild(img);

    placedMotors.push({ type: selectedMotorType, cells: [...cellsToOccupy], hits: 0 });

    inventory[selectedMotorType]--;
    document.getElementById(`count-${selectedMotorType}`).innerText = inventory[selectedMotorType];
    
    selectedMotorType = null;
    document.querySelectorAll('.motor-item').forEach(el => el.classList.remove('selected'));

    const remainingTotal = Object.values(inventory).reduce((a, b) => a + b, 0);
    if (remainingTotal === 0) {
        document.getElementById('btn-ready').style.display = 'block';
    }
}

function hasAdjacentMotor(boardCells, index, currentPlacingCells) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                const checkIdx = r * 10 + c;
                if (!currentPlacingCells.includes(checkIdx) && boardCells[checkIdx].classList.contains('motor')) {
                    return true;
                }
            }
        }
    }
    return false;
}

function sendReady() {
    socket.emit('playerReady', { roomCode: currentRoom, motorCount: placedMotors.length });
    document.getElementById('btn-ready').innerText = "RAKİP BEKLENİYOR...";
    document.getElementById('btn-ready').disabled = true;
}

socket.on('allReady', (data) => {
    showModal(data.message);
    document.getElementById('motor-fleet').style.display = 'none'; 
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
        indicator.style.color = "#4caf50"; 
        switchTab('enemy-area');
    } else {
        indicator.innerText = "RAKİBİN SIRASI... ⏳";
        indicator.style.color = "#e94560"; 
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
    const myCells = document.getElementById('my-board').children;
    const targetCell = myCells[data.index];
    
    let result = 'miss';
    let destroyed = false;

    if (targetCell.classList.contains('motor')) {
        result = 'hit';
        myHitsTaken++;
        targetCell.classList.add('hit');
    } else {
        targetCell.classList.add('miss');
        targetCell.innerText = "❌";
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
        targetCell.innerText = "💥";
    } else {
        targetCell.classList.add('miss');
        targetCell.innerText = "❌";
    }
});

socket.on('gameEnded', (data) => {
    showModal(
        `Oyun Bitti! Kazanan: ${data.winner} 🏆`, 
        () => socket.emit('requestRematch', { roomCode: currentRoom }), 
        () => switchScreen('lobby-screen'),
        "Rövanş İste 🔄",
        "Lobiye Dön 🚪"
    );
});

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
    showModal("Rövanş Başlıyor! Motorlarınızı yeniden dizin.");
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
    document.getElementById('motor-fleet').style.display = 'block';
    document.getElementById('btn-ready').innerText = "SAVAŞA HAZIRIM 🚀";
    document.getElementById('btn-ready').disabled = false;
    document.getElementById('btn-ready').style.display = 'none';
    setupFleetInventory();
    switchTab('my-area');
});