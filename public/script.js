const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

let inventory = {};
let selectedMotorType = null;
let selectedMotorSize = 0;
let lOrientation = 0; // Mavi motor için 2x2 L biçimi
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
    setupFleetSelectorBar();
});

// ALT KISIMDA YAN YANA DURAN SEÇİM ŞERİDİ
function setupFleetSelectorBar() {
    createBoard('my-board', handleMyBoardClick);
    placedMotors = [];
    myHitsTaken = 0;

    let barHTML = "";
    if (activeSettings.fleetMode === 'helmets') {
        inventory = { main_motor: 1, helmet: 4 };
        totalPartsToWin = 7;
        barHTML = `
            <div class="fleet-card" onclick="selectFleetCard('main_motor', 4, this)">
                <img src="${MOTOR_IMAGES.main_motor}">
                <span class="badge-count" id="count-main_motor">x1</span>
            </div>
            <div class="fleet-card" onclick="selectFleetCard('helmet', 1, this)">
                <img src="${MOTOR_IMAGES.helmet}">
                <span class="badge-count" id="count-helmet">x4</span>
            </div>
        `;
    } else {
        inventory = { motorbike: 1, motocross: 2, scooter: 3 };
        totalPartsToWin = 16;
        barHTML = `
            <div class="fleet-card" onclick="selectFleetCard('motorbike', 4, this)">
                <img src="${MOTOR_IMAGES.motorbike}">
                <span class="badge-count" id="count-motorbike">x1</span>
            </div>
            <div class="fleet-card" onclick="selectFleetCard('motocross', 3, this)">
                <img src="${MOTOR_IMAGES.motocross}">
                <span class="badge-count" id="count-motocross">x2</span>
            </div>
            <div class="fleet-card" onclick="selectFleetCard('scooter', 2, this)">
                <img src="${MOTOR_IMAGES.scooter}">
                <span class="badge-count" id="count-scooter">x3</span>
            </div>
        `;
    }

    let existingBar = document.getElementById('fleet-selector-bar');
    if (!existingBar) {
        existingBar = document.createElement('div');
        existingBar.id = 'fleet-selector-bar';
        document.getElementById('my-area').appendChild(existingBar);
    }
    existingBar.innerHTML = barHTML;
    document.getElementById('btn-ready').style.display = 'none';
}

function selectFleetCard(type, size, element) {
    if (inventory[type] <= 0) return showModal("Bu motordan kalmadı!");
    selectedMotorType = type;
    selectedMotorSize = size;
    document.querySelectorAll('.fleet-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
}

function handleMyBoardClick(index) {
    if (!selectedMotorType || inventory[selectedMotorType] <= 0) {
        return showModal("Lütfen önce aşağıdan bir motor seçin!");
    }

    const cellsToOccupy = calculateCellsToOccupy(selectedMotorType, index);
    if (!cellsToOccupy) return showModal("Motor dışarı taşıyor!");

    const boardCells = document.getElementById('my-board').children;

    for (let cellIndex of cellsToOccupy) {
        if (boardCells[cellIndex].classList.contains('motor')) {
            return showModal("Üst üste motor koyamazsınız!");
        }
    }

    // Mantıksal Hücre İçi İşaretleme
    cellsToOccupy.forEach(cellIndex => boardCells[cellIndex].classList.add('motor'));

    const firstCell = boardCells[index];
    const container = document.createElement('div');
    container.classList.add('motor-overlay-container');

    // 1. KIRMIZI MOTOR (2x2 Alana Peş Peşe 2 Kırmızı Motor)
    if (selectedMotorType === 'motorbike' || selectedMotorType === 'main_motor') {
        container.classList.add('double-red');
        container.innerHTML = `
            <img src="${MOTOR_IMAGES.motorbike}">
            <img src="${MOTOR_IMAGES.motorbike}">
        `;
    } 
    // 2. MAVİ / MOTOKROS (Alt iki karesi + Sağ Üst Karesi - 2x2 L Yapısı)
    else if (selectedMotorType === 'motocross' || selectedMotorType === 'scooter') {
        container.classList.add('single-icon');
        const img = document.createElement('img');
        img.src = MOTOR_IMAGES[selectedMotorType];
        container.appendChild(img);
    } 
    // 3. KASK (1x1)
    else {
        container.style.width = '100%';
        container.style.height = '100%';
        const img = document.createElement('img');
        img.src = MOTOR_IMAGES.helmet;
        img.style.width = '100%';
        container.appendChild(img);
    }

    firstCell.appendChild(container);
    placedMotors.push({ type: selectedMotorType, cells: [...cellsToOccupy], hits: 0 });

    inventory[selectedMotorType]--;
    document.getElementById(`count-${selectedMotorType}`).innerText = `x${inventory[selectedMotorType]}`;

    if (inventory[selectedMotorType] === 0) {
        selectedMotorType = null;
        document.querySelectorAll('.fleet-card').forEach(c => c.classList.remove('selected'));
    }

    const totalLeft = Object.values(inventory).reduce((a, b) => a + b, 0);
    if (totalLeft === 0) {
        document.getElementById('btn-ready').style.display = 'block';
    }
}

// 2x2 ALAN KANUNU (Kırmızı için 2x2 Blok, Mavi L için Alt iki + Sağ üst)
function calculateCellsToOccupy(type, index) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const cells = [];

    if (type === 'motorbike' || type === 'main_motor') {
        // 2x2 Kare Blok (4 Birim)
        if (col + 1 >= 10 || row + 1 >= 10) return null;
        cells.push(index, index + 1, index + 10, index + 11);
    } else if (type === 'motocross' || type === 'scooter') {
        // Alt İki Kare + Sağ Üst Kare L Şekli (3 Birim)
        if (col + 1 >= 10 || row + 1 >= 10) return null;
        cells.push(index + 10, index + 11, index + 1); // Sol alt, Sağ alt, Sağ üst
    } else {
        // 1x1 Kask
        cells.push(index);
    }
    return cells;
}

function randomizeFleet() {
    setupFleetSelectorBar();
    showModal("Tüm motorlar sıfırlandı! Aşağıdan seçip dizebilirsin. 🎲");
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
    const bar = document.getElementById('fleet-selector-bar');
    if (bar) bar.style.display = 'none';
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
        destroyedMotor: false,
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
            if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
            showModal(
                "🌪️🥩 KAVURMA KASIRGASI! 🥩🌪️\n3 Galibiyet Serisi Yaptın! Efsanesin!",
                () => socket.emit('requestRematch', { roomCode: currentRoom }),
                () => switchScreen('lobby-screen'),
                "Rövanş İste 🔄", "Lobiye Dön 🚪"
            );
            return;
        }
    }

    showModal(
        `Oyun Bitti! Kazanan: ${data.winner} 🏆`, 
        () => socket.emit('requestRematch', { roomCode: currentRoom }), 
        () => switchScreen('lobby-screen'),
        "Rövanş İste 🔄", "Lobiye Dön 🚪"
    );
});

socket.on('startRematch', (data) => {
    showModal("Rövanş Başlıyor! Motorlarınızı hazırlayın.");
    setupFleetSelectorBar();
    switchTab('my-area');
});