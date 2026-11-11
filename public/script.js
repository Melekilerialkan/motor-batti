const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
let totalPartsToWin = 0;
let activeSettings = {};

// 'setup' = motorları diziyorum, 'waiting' = hazırım dedim rakibi bekliyorum, 'battle' = savaş
let gamePhase = 'setup';

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

// Filo tanımı tek yerde: kart çubuğu, rastgele dizme ve "kazanmak için gereken vuruş"
// hepsi buradan hesaplanıyor, birbirinden kopamaz.
const FLEETS = {
    normal: [
        { type: 'motorbike', size: 4, count: 1 },
        { type: 'motocross', size: 3, count: 2 },
        { type: 'scooter',   size: 2, count: 3 }
    ],
    helmets: [
        { type: 'main_motor', size: 4, count: 1 },
        { type: 'helmet',     size: 1, count: 4 }
    ]
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

// Mobil sekmeler: Kendi Sahan / Rakip Saha (HTML'de çağrılıyordu ama tanımsızdı)
function manualSwitchTab(areaId) {
    document.querySelectorAll('.board-section').forEach(s => s.classList.remove('active-tab'));
    document.getElementById(areaId).classList.add('active-tab');
    document.getElementById('tab-my').classList.toggle('active', areaId === 'my-area');
    document.getElementById('tab-enemy').classList.toggle('active', areaId === 'enemy-area');
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

// Dizme ekranını sıfırdan kurar. İlk oyunda da rövanşta da aynı fonksiyon çalışır,
// bu yüzden gizlenen butonları/çubukları da burada geri açıyoruz.
function setupFleetSelectorBar() {
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
    placedMotors = [];
    myHitsTaken = 0;
    myTurn = false;
    gamePhase = 'setup';
    selectedMotorType = null;
    selectedMotorSize = 0;
    selectedMotorIndexToMove = null;
    manualSwitchTab('my-area');

    const fleet = FLEETS[activeSettings.fleetMode] || FLEETS.normal;
    inventory = {};
    totalPartsToWin = 0;
    let barHTML = "";
    fleet.forEach(f => {
        inventory[f.type] = f.count;
        totalPartsToWin += f.size * f.count;
        barHTML += `
            <div class="fleet-card" onclick="selectFleetCard('${f.type}', ${f.size}, this)">
                <img src="${MOTOR_IMAGES[f.type]}">
                <span class="badge-count" id="count-${f.type}">x${f.count}</span>
            </div>
        `;
    });

    let existingBar = document.getElementById('fleet-selector-bar');
    if (!existingBar) {
        existingBar = document.createElement('div');
        existingBar.id = 'fleet-selector-bar';
        document.getElementById('my-area').appendChild(existingBar);
    }
    existingBar.innerHTML = barHTML;
    existingBar.style.display = '';

    document.getElementById('setup-action-bar').style.display = '';
    document.getElementById('btn-rotate').innerText = "Yön: YATAY 🔄";
    isHorizontal = true;
    lOrientation = 0;

    const readyBtn = document.getElementById('btn-ready');
    readyBtn.style.display = 'none';
    readyBtn.disabled = false;
    readyBtn.innerText = "SAVAŞA HAZIRIM 🚀";

    document.getElementById('turn-indicator').innerText = "Rakip Saha";
    document.getElementById('turn-indicator').style.color = "";
    document.getElementById('shots-left-badge').innerText = "Kalan Atış: -";
}

function selectFleetCard(type, size, element) {
    if (gamePhase !== 'setup') return;
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
    if (gamePhase !== 'setup') return;
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

// Motorun kapladığı karelerin sol-üst köşesini bulur. Resim bu kareye çizilir.
// (L şeklinde 3. ve 4. yönlerde bu, tıklanan kare değil, bir sol/üst komşusudur.
//  Eskiden resim hep tıklanan kareye çiziliyordu ve L motorlar kayık görünüyordu.)
function getAnchorIndex(cells) {
    let minRow = 99, minCol = 99;
    cells.forEach(c => {
        minRow = Math.min(minRow, Math.floor(c / 10));
        minCol = Math.min(minCol, c % 10);
    });
    return minRow * 10 + minCol;
}

// Motoru tahtaya yerleştirir: kareleri işaretler, resmi çizer, placedMotors'a ekler.
// Hem elle dizme hem rastgele dizme bunu kullanır.
// Motor resmini, kapladığı karelerin sol-üst köşesine oturacak şekilde hazırlar.
// Hem kendi tahtamız hem de rakip sahada batan motoru göstermek için kullanılır.
function createMotorImg(type, size, horizontal, lOri) {
    const img = document.createElement('img');
    img.src = MOTOR_IMAGES[type];
    img.classList.add('motor-overlay-img');

    if (type === 'motocross') {
        // L şekli 2x2'lik bir kutuya sığar
        img.style.width = '200%';
        img.style.height = '200%';
        const rotations = [0, 90, 270, 180];
        img.style.transform = `rotate(${rotations[lOri]}deg)`;
    } else if (type === 'helmet') {
        img.style.width = '100%';
        img.style.height = '100%';
    } else {
        // Düz motorlar: resim tüm karelere yayılır (CSS'te object-fit: fill)
        img.style.width = `${size * 100}%`;
        img.style.height = '100%';
        if (!horizontal) {
            img.style.transformOrigin = 'top left';
            img.style.transform = 'rotate(90deg) translateY(-100%)';
        }
    }
    return img;
}

function addMotorToBoard(boardCells, index, cells) {
    cells.forEach(c => boardCells[c].classList.add('motor'));

    const img = createMotorImg(selectedMotorType, selectedMotorSize, isHorizontal, lOrientation);

    boardCells[getAnchorIndex(cells)].appendChild(img);

    placedMotors.push({
        type: selectedMotorType,
        size: selectedMotorSize,
        startIndex: index,
        isHorizontal: isHorizontal,
        lOrientation: lOrientation,
        cells: [...cells],
        hits: 0,
        imgEl: img
    });
}

function updateInventoryBadges() {
    Object.keys(inventory).forEach(k => {
        const el = document.getElementById(`count-${k}`);
        if (el) el.innerText = `x${inventory[k]}`;
    });
}

// TAHTADAKİ MOTORU SEÇİP TAŞIMA VE DİZME MANTIĞI
function handleMyBoardClick(index) {
    // Savaş başladıktan (ya da "hazırım" dedikten) sonra kendi tahtaya tıklamak
    // motorları yerinden söküyordu. Artık sadece dizme aşamasında çalışır.
    if (gamePhase !== 'setup') return;

    const boardCells = document.getElementById('my-board').children;

    // 1. Zaten konulmuş bir motora tıklandıysa onu kaldırmak/taşımak için seç
    const existingIndex = placedMotors.findIndex(m => m.cells.includes(index));
    if (existingIndex !== -1 && !selectedMotorType) {
        selectedMotorIndexToMove = existingIndex;
        const motorToMove = placedMotors[existingIndex];
        selectedMotorType = motorToMove.type;
        selectedMotorSize = motorToMove.size;
        isHorizontal = motorToMove.isHorizontal;
        lOrientation = motorToMove.lOrientation;

        // Eski görseli ve işaretleri temizle
        motorToMove.cells.forEach(c => boardCells[c].classList.remove('motor'));
        if (motorToMove.imgEl) motorToMove.imgEl.remove();

        placedMotors.splice(existingIndex, 1);
        inventory[selectedMotorType]++;
        updateInventoryBadges();
        document.getElementById('btn-ready').style.display = 'none';
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
                return showModal("Değmesin modu aktif! Etrafı boş kalacak.");
            }
        }
    }

    addMotorToBoard(boardCells, index, cellsToOccupy);

    inventory[selectedMotorType]--;
    updateInventoryBadges();

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
    if (gamePhase !== 'setup') return;
    setupFleetSelectorBar();
    const boardCells = document.getElementById('my-board').children;

    const fleet = FLEETS[activeSettings.fleetMode] || FLEETS.normal;
    const typesToPlace = [];
    fleet.forEach(f => {
        for (let i = 0; i < f.count; i++) typesToPlace.push({ type: f.type, size: f.size });
    });

    let allPlaced = true;
    for (let item of typesToPlace) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 500) {
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
                addMotorToBoard(boardCells, randIndex, cellsToOccupy);
                inventory[item.type]--;
                placed = true;
            }
        }
        if (!placed) allPlaced = false;
    }

    updateInventoryBadges();
    selectedMotorType = null;
    selectedMotorSize = 0;
    // Rastgele dizerken yön değişkenleri de rastgele oldu; butonla tutarlı kalsın
    isHorizontal = true;
    lOrientation = 0;
    document.getElementById('btn-rotate').innerText = "Yön: YATAY 🔄";
    document.querySelectorAll('.fleet-card').forEach(c => c.classList.remove('selected'));

    if (!allPlaced) {
        // Sıkışık "Değmesin" dizilimlerinde nadiren olabilir: baştan dene dedirt
        document.getElementById('btn-ready').style.display = 'none';
        return showModal("Motorlar sığmadı, tekrar 'Rastgele Diz' butonuna bas.");
    }

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
    if (gamePhase !== 'setup') return;
    gamePhase = 'waiting';
    // imgEl (DOM elemanı) soket üzerinden gönderilemez, sadece düz veriyi yolluyoruz
    const plainMotors = placedMotors.map(m => ({ type: m.type, size: m.size, cells: m.cells }));
    socket.emit('playerReady', { roomCode: currentRoom, motorCount: placedMotors.length, motors: plainMotors });
    document.getElementById('btn-ready').innerText = "RAKİP BEKLENİYOR...";
    document.getElementById('btn-ready').disabled = true;
}

socket.on('allReady', (data) => {
    showModal(data.message);
    gamePhase = 'battle';
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

    // Mobilde sıra kimdeyse o tahtayı göster (sende: rakip saha, rakipte: kendi sahan)
    manualSwitchTab(myTurn ? 'enemy-area' : 'my-area');
}

function handleEnemyBoardClick(index) {
    if (gamePhase !== 'battle') return;
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
    let destroyedMotor = null;

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
                destroyedMotor = motorObj;
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
        // Batan motorun tamamını rakip sahada çizebilmek için şekil bilgisi de gidiyor
        destroyedCells: destroyedMotor ? destroyedMotor.cells : null,
        destroyedSize: destroyedMotor ? destroyedMotor.size : null,
        destroyedHorizontal: destroyedMotor ? destroyedMotor.isHorizontal : null,
        destroyedL: destroyedMotor ? destroyedMotor.lOrientation : null,
        shooterId: data.shooterId
    });

    if (myHitsTaken === totalPartsToWin) {
        socket.emit('gameOver', { roomCode: currentRoom, winnerId: data.shooterId });
    }
});

// TAM BATAN MOTORUN RESMİNİ ÇIKARMA
// (Sunucu artık bu olayı sadece vuran oyuncuya gönderiyor.)
socket.on('updateBoard', (data) => {
    const enemyBoard = document.getElementById('enemy-board');
    const enemyCells = enemyBoard.children;
    const targetCell = enemyCells[data.index];

    if (data.result === 'hit') {
        targetCell.classList.add('hit'); // 🔥 ALEV EMOJİSİ
        triggerShake('enemy-board');

        // Motor tamamen battıysa tüm görselini kapladığı karelerin üzerinde göster
        if (data.destroyedType) {
            const cells = Array.isArray(data.destroyedCells) && data.destroyedCells.length
                ? data.destroyedCells
                : [data.index];
            const destroyedImg = createMotorImg(
                data.destroyedType,
                data.destroyedSize || cells.length,
                data.destroyedHorizontal !== false,
                data.destroyedL || 0
            );
            destroyedImg.classList.add('destroyed-motor-overlay');
            enemyCells[getAnchorIndex(cells)].appendChild(destroyedImg);
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
    gamePhase = 'over';
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
                backToLobby,
                "Rövanş İste 🔄", "Lobiye Dön 🚪"
            );
            return;
        }
    }

    showModal(
        `Oyun Bitti! Kazanan: ${data.winner} 🏆`,
        () => socket.emit('requestRematch', { roomCode: currentRoom }),
        backToLobby,
        "Rövanş İste 🔄", "Lobiye Dön 🚪"
    );
});

function backToLobby() {
    socket.emit('leaveRoom', { roomCode: currentRoom });
    currentRoom = "";
    gamePhase = 'setup';
    switchScreen('lobby-screen');
}

socket.on('opponentLeft', (data) => {
    currentRoom = "";
    gamePhase = 'setup';
    switchScreen('lobby-screen');
    showModal(data.message);
});

socket.on('startRematch', (data) => {
    showModal("Rövanş Başlıyor! Motorlarınızı hazırlayın.");
    setupFleetSelectorBar();
    manualSwitchTab('my-area');
});
