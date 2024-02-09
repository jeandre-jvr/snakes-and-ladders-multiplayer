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

// Players array
let users = [];

io.on("connection", (socket) => {
  console.log("Made socket connection", socket.id);

  socket.on("join", (data) => {
    users.push(data);
    io.sockets.emit("join", data);
  });

  socket.on("joined", () => {
    socket.emit("joined", users);
  });

  socket.on("rollDice", (data) => {
    users[data.id].pos = data.pos;
    const turn = data.num != 6 ? (data.id + 1) % users.length : data.id;
    io.sockets.emit("rollDice", data, turn);
  });

  socket.on("restart", () => {
    users = [];
    io.sockets.emit("restart");
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));