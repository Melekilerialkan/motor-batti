const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

let inventory = {};
let motorSizeMap = {};
let selectedMotorType = null;
let selectedMotorSize = 0;
let isHorizontal = true;
let modalCallback = null;

let placedMotors = []; // Motor batma takibi için

document.addEventListener('DOMContentLoaded', () => {
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
});

function showModal(msg, callback = null) {
    document.getElementById('modal-message').innerText = msg;
    document.getElementById('custom-modal').classList.add('active');
    modalCallback = callback;
}

function closeModal() {
    document.getElementById('custom-modal').classList.remove('active');
    if (modalCallback) { modalCallback(); modalCallback = null; }
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

    if (activeSettings.fleetMode === 'helmets') {
        inventory = { main_motor: 1, helmet: 4 };
        motorSizeMap = { main_motor: 3, helmet: 1 };
        totalPartsToWin = 7;
        
        container.innerHTML = `
            <div class="motor-item" onclick="selectMotor('main_motor', 3, event)">
                🏍️ Ana Motor (3 Birim) - Kalan: <span id="count-main_motor">1</span>
            </div>
            <div class="motor-item" onclick="selectMotor('helmet', 1, event)">
                🪖 Kask (1 Birim) - Kalan: <span id="count-helmet">4</span>
            </div>
        `;
    } else {
        inventory = { cruiser: 1, chopper: 2, scooter: 3 };
        motorSizeMap = { cruiser: 4, chopper: 3, scooter: 2 };
        totalPartsToWin = 16;

        container.innerHTML = `
            <div class="motor-item" onclick="selectMotor('cruiser', 4, event)">
                🏍️ Cruiser (4 Birim) - Kalan: <span id="count-cruiser">1</span>
            </div>
            <div class="motor-item" onclick="selectMotor('chopper', 3, event)">
                🛵 Chopper (3 Birim) - Kalan: <span id="count-chopper">2</span>
            </div>
            <div class="motor-item" onclick="selectMotor('scooter', 2, event)">
                🛴 Scooter (2 Birim) - Kalan: <span id="count-scooter">3</span>
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
}

function toggleRotation() {
    isHorizontal = !isHorizontal;
    document.getElementById('btn-rotate').innerText = isHorizontal ? "Yön: YATAY 🔄" : "Yön: DİKEY 🔄";
}

function handleMyBoardClick(index) {
    if (!selectedMotorType || inventory[selectedMotorType] <= 0) {
        return showModal("Lütfen önce bir motor veya kask seçin!");
    }

    const cellsToOccupy = [];
    let row = Math.floor(index / 10);
    let col = index % 10;

    for (let i = 0; i < selectedMotorSize; i++) {
        if (isHorizontal) {
            if (col + i >= 10) return showModal("Dışarı taşıyor!");
            cellsToOccupy.push(index + i);
        } else {
            if (row + i >= 10) return showModal("Dışarı taşıyor!");
            cellsToOccupy.push(index + (i * 10));
        }
    }

    const boardCells = document.getElementById('my-board').children;

    // 1. Çakışma Kontrolü
    for (let cellIndex of cellsToOccupy) {
        if (boardCells[cellIndex].classList.contains('motor')) {
            return showModal("Üst üste koyamazsınız!");
        }
    }

    // 2. Değmesin Kuralı (Etraftaki 8 kare kontrolü)
    if (activeSettings.touchMode === 'degmesin') {
        for (let cellIndex of cellsToOccupy) {
            if (hasAdjacentMotor(boardCells, cellIndex, cellsToOccupy)) {
                return showModal("Değmesin modu aktif! Motorların etrafı boş kalmalı.");
            }
        }
    }

    cellsToOccupy.forEach(cellIndex => boardCells[cellIndex].classList.add('motor'));
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
    socket.emit('playerReady', { 
        roomCode: currentRoom,
        motorCount: placedMotors.length
    });
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
        targetCell.innerText = "💥";

        // Batan Motor Takibi
        for (let motor of placedMotors) {
            if (motor.cells.includes(data.index)) {
                motor.hits++;
                if (motor.hits === motor.cells.length) {
                    destroyed = true;
                }
                break;
            }
        }
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
    showModal(`Oyun Bitti! Kazanan: ${data.winner} 🏆`, () => {
        location.reload(); 
    });
});