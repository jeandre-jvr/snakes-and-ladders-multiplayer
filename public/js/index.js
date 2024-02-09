import socket from "./socket.js";
import { encryptPayload, decryptPayload } from "./crypto.js";

let roomState = false;
let players = [];
let currentPlayer;

// -- Board -- //
let canvas = document.getElementById("canvas");
canvas.width = document.documentElement.clientHeight * 0.9;
canvas.height = document.documentElement.clientHeight * 0.9;
let ctx = canvas.getContext("2d");

const side = canvas.width / 10;
const offsetX = side / 2;
const offsetY = side / 2 + 20;

const ladders = [
  [2, 23],
  [4, 68],
  [6, 45],
  [20, 59],
  [30, 96],
  [52, 72],
  [57, 96],
  [71, 92],
];

const snakes = [
  [98, 40],
  [84, 58],
  [87, 49],
  [73, 15],
  [56, 8],
  [50, 5],
  [43, 17],
];

function rollDice() {
  const number = Math.ceil(Math.random() * 6);
  return number;
}

function drawPins() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  players.forEach((player) => {
    player.draw();
  });
}

// -- PLAYER -- //
class Player {
  constructor(id, name, pos, img) {
    this.id = id;
    this.name = name;
    this.pos = pos;
    this.img = img;
  }

  draw() {
    let xPos =
      Math.floor(this.pos / 10) % 2 == 0
        ? (this.pos % 10) * side - 15 + offsetX
        : canvas.width - ((this.pos % 10) * side + offsetX + 15);
    let yPos = canvas.height - (Math.floor(this.pos / 10) * side + offsetY);

    let image = new Image();
    image.src = this.img;
    ctx.drawImage(image, xPos, yPos, 30, 40);
  }

  updatePos(num) {
    if (this.pos + num <= 99) {
      this.pos += num;
      this.pos = this.isLadderOrSnake(this.pos + 1) - 1;
    }
  }

  isLadderOrSnake(pos) {
    let newPos = pos;

    for (let i = 0; i < ladders.length; i++) {
      if (ladders[i][0] == pos) {
        newPos = ladders[i][1];
        break;
      }
    }

    for (let i = 0; i < snakes.length; i++) {
      if (snakes[i][0] == pos) {
        newPos = snakes[i][1];
        break;
      }
    }

    return newPos;
  }
}

// -- CREATED HOOK -- //
window.onload = function() {
  const userId = localStorage.getItem("userId");
 
  if (userId) {
    socket.auth = { userId };
    socket.connect();
  }
};

// -- ELEMENTS -- //
const userBtn = document.getElementById('user-btn');
const joinBtn = document.getElementById('join-btn');
const rollDiceButton = document.getElementById("roll-button");
const leaveButton = document.getElementById("leave-btn");

const joinRoomUsername = document.getElementById('join-room-username');
const roomNameEl = document.getElementById('room-name');
const currentPlayerEl = document.getElementById("current-player");
const dice = document.getElementById("dice");
const timerElement = document.getElementById('timer');
const playersTable = document.getElementById("players-table");
const scoreboardBody = document.getElementById('scoreboard-body');

const userSelect = document.getElementById('user-select');
const roomSelect = document.getElementById('room-select');
const gameSelect = document.getElementById('game-select');

// LISTERNERS -- //
userBtn.addEventListener("click", () => {
  const username = document.getElementById("username").value;

  if (!username) return console.log('Username Required');

  socket.auth = { username };
  socket.connect();
});

joinBtn.addEventListener("click", () => {
  const name = document.getElementById("join-room").value;

  if (!name) return console.log('Room Name Required');

  socket.emit('join-room', encryptPayload({ name })); 
});

rollDiceButton.addEventListener("click", () => {
 
  const num = rollDice();
  currentPlayer.updatePos(num);
  socket.emit("roll-dice", encryptPayload({
    num: num,
    id: currentPlayer.id,
    pos: currentPlayer.pos,
    roomId: socket.roomId,
    roomState: roomState
  }));
});

leaveButton.addEventListener("click", () => {
  socket.emit("leave-room");
  roomSelect.style.display = 'flex';
  gameSelect.style.display = 'none';
  roomState = false;
});


// -- JOIN SOCKET -- //
socket.on("joined", (payload) => {

  const { userId, username } = decryptPayload(payload);

  socket.auth = { userId };
  localStorage.setItem("userId", userId);
  socket.username = username;

  joinRoomUsername.textContent = `Hi ${username} - Join Room`;

  userSelect.style.display = 'none';
  roomSelect.style.display = 'flex';
});

// -- JOIN ROOM -- //
socket.on("join-room", (payload) => {

  const { name, roomId, currentUser } = decryptPayload(payload);

  roomNameEl.textContent = `Room: ${name}`;
  socket.roomId = roomId;

  currentPlayer = new Player(currentUser.id, currentUser.name, currentUser.pos, currentUser.img);
  
  roomSelect.style.display = 'none';
  gameSelect.style.display = 'flex';
  rollDiceButton.hidden = false;

  currentPlayerEl.innerHTML = `<p>Anyone can roll</p>`;
});

// -- LIST PLAYERS -- //
socket.on("list-players", (payload) => {

  const { users } = decryptPayload(payload);

  players = [];
  playersTable.innerHTML = "";

  users.forEach(user => {
    players.push(new Player(user.id, user.name, user.pos, user.img));
    playersTable.innerHTML += `<tr><td>${user.name}</td><td><img src=${user.img} height=50 width=40></td></tr>`;
  })

  if (players.length === 1) {
    leaveButton.disabled = false;
  }

  drawPins();
});

// -- PLAYER SCOREBOARD -- //
socket.on("player-scoreboard", (payload) => {

  const { scoreboard } = decryptPayload(payload);

  scoreboardBody.innerHTML = '';

  scoreboard.forEach(player => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const winsCell = document.createElement('td');

      nameCell.textContent = player.username;
      winsCell.textContent = player.wins;
      nameCell.classList.add('text-left', 'pl-4', 'pt-2');
      winsCell.classList.add('text-center');

      row.appendChild(nameCell);
      row.appendChild(winsCell);

      scoreboardBody.appendChild(row);
  });
});

// -- ROOM STATE -- //
socket.on("room-state", (payload) => {
  const { state } = decryptPayload(payload);
  roomState = state;
});

// -- ROLL DICE -- //
socket.on("roll-dice", (payload) => {

  const { data, turn } = decryptPayload(payload);

  const index = players.findIndex(user => user.id === data.id);
  players[index].updatePos(data.num);
  dice.src = `./images/dice/dice${data.num}.png`;
  drawPins();

  if (turn != currentPlayer.id) {
    leaveButton.disabled = false;
    const index = players.findIndex(user => user.id === turn);
    rollDiceButton.hidden = true;
    currentPlayerEl.innerHTML = `<p>It's ${players[index].name}'s turn</p>`;
  } else {
    if (players.length > 1) {
      leaveButton.disabled = true;
    }
    rollDiceButton.hidden = false;
    currentPlayerEl.innerHTML = `<p>It's your turn</p>`;
  }

  let winner;
  for (let i = 0; i < players.length; i++) {
    if (players[i].pos == 99) {
      winner = players[i];
      break;
    }
  }

  if (winner) {
    currentPlayerEl.innerHTML = `<p>${winner.name} has won!</p>`;
    rollDiceButton.hidden = true;
    dice.hidden = true;
    leaveButton.disabled = false;

    socket.emit('player-win', encryptPayload({ 
      roomId: socket.roomId, 
      userId: winner.id 
    }));
  }

});

// -- RESTART GAME -- //
socket.on("restart-game", () => {

  timerElement.style.display = 'flex';

  const updateTimer = () => {
    let timer = 10; // 10 seconds

    const countdown = () => {
        if (timer > 0) {
          timer--;
          timerElement.textContent = `Restarting Game In: ${timer} seconds`;
          setTimeout(countdown, 1000);
        } else {
          dice.hidden = false;
          rollDiceButton.hidden = false;
          timerElement.style.display = 'none';
          currentPlayerEl.innerHTML = `<p>Anyone can roll</p>`;
        }
    };

    countdown();
  };

  updateTimer();
});