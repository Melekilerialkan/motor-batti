const socket = io();

let currentRoom = "";
let myTurn = false;
let myHitsTaken = 0;
const TOTAL_MOTOR_PARTS = 16; 

const inventory = { cruiser: 1, chopper: 2, scooter: 3 };
let selectedMotorType = null;
let selectedMotorSize = 0;
let isHorizontal = true;

document.addEventListener('DOMContentLoaded', () => {
    createBoard('my-board', handleMyBoardClick);
    createBoard('enemy-board', handleEnemyBoardClick);
});

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
    socket.emit('register', {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
    });
}

function login() {
    socket.emit('login', {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
    });
}

socket.on('appAlert', (data) => alert(data.message));
socket.on('appError', (data) => alert("Hata: " + data.message));

socket.on('loginSuccess', (data) => {
    switchScreen('lobby-screen');
    document.getElementById('welcome-text').innerText = `Hoş geldin, ${data.username}!`;
    document.getElementById('stats-panel').innerHTML = `<p>Galibiyet: ${data.wins} | Mağlubiyet: ${data.losses}</p>`;
});

function joinRoom() {
    currentRoom = document.getElementById('roomCode').value;
    socket.emit('joinRoom', currentRoom);
}

socket.on('gameStart', (data) => {
    alert(data.message);
    switchScreen('game-screen');
});

function switchTab(tabId) {
    document.querySelectorAll('.board-section').forEach(s => s.classList.remove('active-tab'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active-tab');
    event.target.classList.add('active');
}

function selectMotor(type, size) {
    if (inventory[type] <= 0) return;
    selectedMotorType = type;
    selectedMotorSize = size;

    document.querySelectorAll('.motor-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

function toggleRotation() {
    isHorizontal = !isHorizontal;
    document.getElementById('btn-rotate').innerText = isHorizontal ? "Yön: YATAY 🔄" : "Yön: DİKEY 🔄";
}

function handleMyBoardClick(index) {
    if (!selectedMotorType || inventory[selectedMotorType] <= 0) {
        return alert("Lütfen önce bir motor seçin!");
    }

    const cellsToOccupy = [];
    let row = Math.floor(index / 10);
    let col = index % 10;

    for (let i = 0; i < selectedMotorSize; i++) {
        if (isHorizontal) {
            if (col + i >= 10) return alert("Motor sağdan dışarı taşıyor!");
            cellsToOccupy.push(index + i);
        } else {
            if (row + i >= 10) return alert("Motor aşağıdan dışarı taşıyor!");
            cellsToOccupy.push(index + (i * 10));
        }
    }

    const boardCells = document.getElementById('my-board').children;
    for (let cellIndex of cellsToOccupy) {
        if (boardCells[cellIndex].classList.contains('motor')) {
            return alert("Burada zaten bir motor var!");
        }
    }

    cellsToOccupy.forEach(cellIndex => {
        boardCells[cellIndex].classList.add('motor');
    });

    inventory[selectedMotorType]--;
    document.getElementById(`count-${selectedMotorType}`).innerText = inventory[selectedMotorType];
    
    selectedMotorType = null;
    document.querySelectorAll('.motor-item').forEach(el => el.classList.remove('selected'));

    if (inventory.cruiser === 0 && inventory.chopper === 0 && inventory.scooter === 0) {
        document.getElementById('btn-ready').style.display = 'block';
    }
}

function sendReady() {
    socket.emit('playerReady', currentRoom);
    document.getElementById('btn-ready').innerText = "RAKİP BEKLENİYOR...";
    document.getElementById('btn-ready').disabled = true;
}

socket.on('allReady', (data) => {
    alert(data.message);
    document.getElementById('motor-fleet').style.display = 'none'; 
    document.getElementById('btn-ready').style.display = 'none'; 
    myTurn = (data.turn === socket.id);
    updateTurnUI();
});

socket.on('turnChange', (data) => {
    myTurn = (data.turn === socket.id);
    updateTurnUI();
});

function updateTurnUI() {
    const indicator = document.getElementById('turn-indicator');
    if (myTurn) {
        indicator.innerText = "SIRA SENDE! (Ateş Et) 🎯";
        indicator.style.color = "#4caf50"; 
    } else {
        indicator.innerText = "RAKİBİN SIRASI BEKLENİYOR... ⏳";
        indicator.style.color = "#e94560"; 
    }
}

function handleEnemyBoardClick(index) {
    if (!myTurn) return alert("Sıra sende değil!");
    
    const enemyCells = document.getElementById('enemy-board').children;
    if (enemyCells[index].classList.contains('hit') || enemyCells[index].classList.contains('miss')) return;

    socket.emit('attack', { roomCode: currentRoom, index: index });
}

socket.on('receiveAttack', (data) => {
    const myCells = document.getElementById('my-board').children;
    const targetCell = myCells[data.index];
    
    let result = 'miss';
    if (targetCell.classList.contains('motor')) {
        result = 'hit';
        myHitsTaken++;
        targetCell.classList.add('hit');
        targetCell.innerText = "💥";
    } else {
        targetCell.classList.add('miss');
        targetCell.innerText = "❌";
    }

    socket.emit('attackResult', { 
        roomCode: currentRoom, 
        index: data.index, 
        result: result,
        shooterId: data.shooterId 
    });

    if (myHitsTaken === TOTAL_MOTOR_PARTS) {
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
    alert(`Oyun Bitti! Kazanan: ${data.winner} 🏆`);
    location.reload(); 
});