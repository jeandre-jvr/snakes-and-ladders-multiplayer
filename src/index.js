import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import mongoose from "mongoose";
import { Room, User } from "./database/db.js"

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// MONGODB CONNECTION -- //
mongoose.connect(process.env.MONGO_DB)
  .then(() => console.log('Connected to Database'))
  .catch(err => console.error('Database Connection Error:', err));

// -- LOCAL USER STATE -- //
const usersState = {
  users: [],
  setUsers: function(users) {
    this.users = users;
  }
};

// -- PLAYER IMAGES -- //
const redPieceImg = "../images/red_piece.png";
const bluePieceImg = "../images/blue_piece.png";
const yellowPieceImg = "../images/yellow_piece.png";
const greenPieceImg = "../images/green_piece.png";
const images = [redPieceImg, bluePieceImg, yellowPieceImg, greenPieceImg];

// -- SOCKET MIDDLEWARE -- //
io.use(async (socket, next) => {

  const userId = socket.handshake.auth.userId;
  if (userId) {
    const user = await findUser(userId);   
    if (user) {
      socket.userId = user._id.toString();
      socket.username = user.username;
      return next();
    }
  }

  const username = socket.handshake.auth.username;
  if (!username) {
    return next(console.log('Username Required'));
  }
  socket.username = username;
  next();

});

// -- SOCKET CONNECTION -- //
io.on("connection", async (socket) => {

  // -- CREATE DB USER -- //
  if (!socket.userId) {
    const user = await saveUser(socket.username);
    socket.userId = user._id.toString();
  }

  // -- JOIN SOCKET -- //
  socket.emit("joined", {
    userId: socket.userId,
    username: socket.username,
  });

  // -- JOIN ROOM -- //
  socket.on('join-room', async (name) => {

    const room = await findRoom(name);
    if (!room) {
      return console.log('Room Required');
    }
    const roomId = room._id.toString();

    const roomActive = await getRoomState(roomId);
    if (roomActive) {
        return console.log('Room already active');
    }

    if (getUsersInRoom(roomId).length === 4) {
      return console.log('Room User Count Reached');
    }
    
    const assignedImage = await assignImageToPlayer(roomId);
    const user = setUser(socket.userId.toString(), socket.username, 0, assignedImage, room._id.toString());
  
    socket.join(roomId);

    socket.emit('join-room', { name: room.name, roomId: room._id, currentUser: user });
    io.to(roomId).emit('list-players', getUsersInRoom(roomId));
    io.to(roomId).emit('player-scoreboard', await getRoomScoreboard(room));

  });

  // -- GAME PLAY -- //
  socket.on("roll-dice", async (payload) => {
 
    const { num, id, pos, roomId, roomState } = payload;

    if (!roomState) {
      console.log('Update Room State')
      await updateRoomState(roomId, true);
      io.to(roomId).emit("room-state", true);
    }
    
    const users = getUsersInRoom(roomId)
    const index = users.findIndex(user => user.id === id);

    users[index].pos = pos;

    const turn = num != 6 ? (index + 1) % users.length : index;
    io.to(roomId).emit("roll-dice", payload, users[turn].id);

  });

  // -- PLAYER WIN (UPDATE SCOREBOARD) -- //
  socket.on('player-win', async (roomId, userId) => {

    const room = await Room.findById(roomId);
    if (!room) {
      console.log('Room not Found')
      return;
    }

    await updateRoomState(roomId, false);
    io.to(roomId).emit("room-state", false);
    getUsersInRoom(roomId).forEach(user => {
      user.pos = 0;
    });

    if (room.scoreboard.has(userId)) {
      room.scoreboard.set(userId, room.scoreboard.get(userId) + 1);
    } else {
      room.scoreboard.set(userId, 1);
    }

    await room.save();

    io.to(roomId).emit('player-scoreboard', await getRoomScoreboard(room));
    io.to(roomId).emit('list-players', getUsersInRoom(roomId));
    io.to(roomId).emit('restart-game');

  });

  // -- LEAVE ROOM -- //
  socket.on("leave-room", async () => {

    const user = getUser(socket.userId);

    if (!user) return console.log('No User');

    socket.leave(user.roomId);
    userLeavesRoom(socket.userId);

    if(getUsersInRoom(user.roomId).length === 0) {
      await updateRoomState(user.roomId, false);
    } else {
      io.to(user.roomId).emit('list-players', getUsersInRoom(user.roomId))
    }

    console.log(`User ${socket.userId} has left the room`)

  });

  // -- DISCONNECT -- //
  socket.on("disconnect", async () => {

    const user = getUser(socket.userId);
    
    if (!user) return console.log('No User');

    socket.leave(user.roomId);
    userLeavesRoom(socket.userId);

    if(getUsersInRoom(user.roomId).length === 0) {
      await updateRoomState(user.roomId, false);
    } else {
      io.to(user.roomId).emit('list-players', getUsersInRoom(user.roomId))
    }
    
    console.log(`User ${socket.userId} disconnected`)

  });

});

// -- HELPER FUNCTIONS -- //
const findUser = async (id) => {
  return await User.findById(id).exec();
};

const saveUser = async (username) => {
  return await User.create({ username });
};

const findRoom = async (name) => {
  return await Room.findOne({ name }).exec();
};

const setUser = (id, name, pos, img, roomId) => {
  const user = { id, name, pos, img, roomId };
  usersState.setUsers([
    ...usersState.users.filter(user => user.id !== id),
    user
  ]);
  return user
};

const getUser = (id) => {
  return usersState.users.find(user => user.id === id)
};

const getUsersInRoom = (roomId) => {
  return usersState.users.filter(user => user.roomId === roomId)
};

const userLeavesRoom = (id) => {
  usersState.setUsers(usersState.users.filter(user => user.id !== id))
};

const getRoomState = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) {
      console.log('Room not found');
  }
  return room.active;
};

const updateRoomState = async (roomId, isActive) => {
  await Room.findByIdAndUpdate(roomId, { active: isActive });
};

const assignImageToPlayer = async (roomId) => {
  const assignedImages = getUsersInRoom(roomId).map(user => user.img);
  const unusedImages = images.filter(image => !assignedImages.includes(image)); 
  return unusedImages[0];
};

const getRoomScoreboard = async (room) => {
 
  const scoreboardArr = Array.from(room.scoreboard).map(([userId, wins]) => {
    return { userId, wins };
  });
  
  const users = await User.find({ _id: { $in: Array.from(room.scoreboard.keys())  } }, 'username').exec();
  const usernameArr = users.reduce((acc, user) => {
    acc[user._id] = user.username;
    return acc;
  }, {});
  
  const scoreboard = scoreboardArr.map(entry => {
    return {
      username: usernameArr[entry.userId],
      wins: entry.wins
    };
  });

  scoreboard.sort((a, b) => b.wins - a.wins);
  return scoreboard.slice(0, 5);
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));