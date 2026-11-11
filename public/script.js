const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

let inventory = {};
let selectedMotorType = null;
let selectedMotorSize = 0;
let selectedMotorIndexToMove = null;
let isHorizontal = true;
let lOrientation = 0; 
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
    setupFleetSelectorBar();
});

function setupFleetSelectorBar() {
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
    placedMotors = [];
    myHitsTaken = 0;
    selectedMotorIndexToMove = null;

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
    selectedMotorIndexToMove = null;
    document.querySelectorAll('.fleet-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');

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

// TAHTADAKİ MOTORU SEÇİP TAŞIMA VE DİZME MANTIĞI
function handleMyBoardClick(index) {
    const boardCells = document.getElementById('my-board').children;

    // 1. Zaten konulmuş bir motora tıklandıysa onu kaldırmak/taşımak için seç
    const existingIndex = placedMotors.findIndex(m => m.cells.includes(index));
    if (existingIndex !== -1 && !selectedMotorType) {
        selectedMotorIndexToMove = existingIndex;
        const motorToMove = placedMotors[existingIndex];
        selectedMotorType = motorToMove.type;
        selectedMotorSize = motorToMove.size;
        
        // Eski görselleri temizle
        motorToMove.cells.forEach(c => {
            boardCells[c].classList.remove('motor');
            boardCells[c].innerHTML = '';
        });

        placedMotors.splice(existingIndex, 1);
        inventory[selectedMotorType]++;
        document.getElementById(`count-${selectedMotorType}`).innerText = `x${inventory[selectedMotorType]}`;
        showModal("Motor serbest bırakıldı! Yerleştirmek istediğin yeni boş kareye tıkla.");
        return;
    }

    // 2. Motor seçiliyken boş kareye yerleştir
    if (!selectedMotorType || inventory[selectedMotorType] <= 0) {
        return showModal("Lütfen önce aşağıdan bir motor seçin!");
    }

    const cellsToOccupy = calculateCellsToOccupy(index);
    if (!cellsToOccupy) return showModal("Motor tahtadan dışarı taşıyor!");

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

    cellsToOccupy.forEach(cellIndex => boardCells[cellIndex].classList.add('motor'));

    const firstCell = boardCells[index];
    const img = document.createElement('img');
    img.src = MOTOR_IMAGES[selectedMotorType];
    img.classList.add('motor-overlay-img');

    if (selectedMotorType === 'motocross') {
        img.style.width = '200%';
        img.style.height = '200%';
        const rotations = [0, 90, 270, 180];
        img.style.transform = `rotate(${rotations[lOrientation]}deg)`;
    } else if (selectedMotorType === 'helmet') {
        img.style.width = '100%';
        img.style.height = '100%';
    } else {
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
    placedMotors.push({ 
        type: selectedMotorType, 
        size: selectedMotorSize,
        startIndex: index,
        isHorizontal: isHorizontal,
        lOrientation: lOrientation,
        cells: [...cellsToOccupy], 
        hits: 0 
    });

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

// RASTGELE DİZME BUTONU (SIFIRLAYIP RASTGELE YERLEŞTİRME)
function randomizeFleet() {
    setupFleetSelectorBar();
    const boardCells = document.getElementById('my-board').children;

    const typesToPlace = activeSettings.fleetMode === 'helmets' 
        ? [{type:'main_motor', size:3}, {type:'helmet', size:1}, {type:'helmet', size:1}, {type:'helmet', size:1}, {type:'helmet', size:1}]
        : [{type:'motorbike', size:4}, {type:'motocross', size:3}, {type:'motocross', size:3}, {type:'scooter', size:2}, {type:'scooter', size:2}, {type:'scooter', size:2}];

    for (let item of typesToPlace) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 200) {
            attempts++;
            const randIndex = Math.floor(Math.random() * 100);
            selectedMotorType = item.type;
            selectedMotorSize = item.size;
            isHorizontal = Math.random() < 0.5;
            lOrientation = Math.floor(Math.random() * 4);

            const cellsToOccupy = calculateCellsToOccupy(randIndex);
            if (!cellsToOccupy) continue;

            let conflict = false;
            for (let cIdx of cellsToOccupy) {
                if (boardCells[cIdx].classList.contains('motor')) conflict = true;
            }

            if (activeSettings.touchMode === 'degmesin' && !conflict) {
                for (let cIdx of cellsToOccupy) {
                    if (hasAdjacentMotor(boardCells, cIdx, cellsToOccupy)) conflict = true;
                }
            }

            if (!conflict) {
                cellsToOccupy.forEach(cIdx => boardCells[cIdx].classList.add('motor'));
                const firstCell = boardCells[randIndex];
                const img = document.createElement('img');
                img.src = MOTOR_IMAGES[selectedMotorType];
                img.classList.add('motor-overlay-img');

                if (selectedMotorType === 'motocross') {
                    img.style.width = '200%'; img.style.height = '200%';
                    const rotations = [0, 90, 270, 180];
                    img.style.transform = `rotate(${rotations[lOrientation]}deg)`;
                } else if (selectedMotorType === 'helmet') {
                    img.style.width = '100%'; img.style.height = '100%';
                } else {
                    if (isHorizontal) {
                        img.style.width = `${selectedMotorSize * 100}%`; img.style.height = '100%';
                    } else {
                        img.style.width = `${selectedMotorSize * 100}%`; img.style.height = '100%';
                        img.style.transformOrigin = 'top left';
                        img.style.transform = `rotate(90deg) translateY(-100%)`;
                    }
                }

                firstCell.appendChild(img);
                placedMotors.push({ type: selectedMotorType, size: selectedMotorSize, cells: [...cellsToOccupy], hits: 0 });
                inventory[selectedMotorType]--;
                placed = true;
            }
        }
    }

    Object.keys(inventory).forEach(k => {
        const el = document.getElementById(`count-${k}`);
        if (el) el.innerText = `x${inventory[k]}`;
    });

    selectedMotorType = null;
    document.getElementById('btn-ready').style.display = 'block';
    showModal("Tüm motorlar tahtaya rastgele dizildi! 🎲");
}

function calculateCellsToOccupy(index) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const cells = [];

    if (selectedMotorType === 'motocross') {
        if (lOrientation === 0) {
            if (col + 1 >= 10 || row + 1 >= 10) return null;
            cells.push(index, index + 1, index + 10);
        } else if (lOrientation === 1) {
            if (col - 1 < 0 || row + 1 >= 10) return null;
            cells.push(index, index - 1, index + 10);
        } else if (lOrientation === 2) {
            if (col + 1 >= 10 || row - 1 < 0) return null;
            cells.push(index, index + 1, index - 10);
        } else if (lOrientation === 3) {
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
    socket.emit('playerReady', { roomCode: currentRoom, motorCount: placedMotors.length, motors: placedMotors });
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
        indicator.innerText = "SIRA SENDE! ATİŞ YAP 🎯";
        indicator.style.color = "#05d9e8"; 
    } else {
        indicator.innerText = "RAKİBİN SIRASI... ⏳";
        indicator.style.color = "#ff2a6d"; 
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
    let destroyedType = null;

    if (targetCell.classList.contains('motor')) {
        result = 'hit';
        myHitsTaken++;
        targetCell.classList.add('hit'); // 🔥 ALEV EMOJİSİ VE RENK
        triggerShake('my-board');

        // Batan motor var mı kontrol et
        const motorObj = placedMotors.find(m => m.cells.includes(data.index));
        if (motorObj) {
            motorObj.hits++;
            if (motorObj.hits === motorObj.cells.length) {
                destroyedType = motorObj.type;
            }
        }
    } else {
        targetCell.classList.add('miss'); // ❌ ÇARPI EMOJİSİ
    }

    socket.emit('attackResult', { 
        roomCode: currentRoom, 
        index: data.index, 
        result: result,
        destroyedType: destroyedType,
        shooterId: data.shooterId 
    });

    if (myHitsTaken === totalPartsToWin) {
        socket.emit('gameOver', { roomCode: currentRoom, winnerId: data.shooterId });
    }
});

// TAM BATAN MOTORUN RESMİNİ ÇIKARMA
socket.on('updateBoard', (data) => {
    const enemyBoard = document.getElementById('enemy-board');
    const enemyCells = enemyBoard.children;
    const targetCell = enemyCells[data.index];

    if (data.result === 'hit') {
        targetCell.classList.add('hit'); // 🔥 ALEV EMOJİSİ
        triggerShake('enemy-board');

        // Motor tamamen batan biri olduysa orijinal görselini tam o kare üzerinde patlat
        if (data.destroyedType) {
            const destroyedImg = document.createElement('img');
            destroyedImg.src = MOTOR_IMAGES[data.destroyedType];
            destroyedImg.classList.add('destroyed-motor-overlay');
            destroyedImg.style.width = '100%';
            destroyedImg.style.height = '100%';
            targetCell.appendChild(destroyedImg);
            showModal(`TEBRİKLER! Rakibin ${data.destroyedType.toUpperCase()} motorunu tamamen batırdın! 💥🏍️`);
        }
    } else {
        targetCell.classList.add('miss'); // ❌ ÇARPI EMOJİSİ
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
});