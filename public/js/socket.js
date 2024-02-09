const URL = "http://localhost:3001";
const socket = io(URL, { autoConnect: false });

// Development (Testing Purpose)
socket.onAny((event, ...args) => {
  console.log(event, args);
});

export default socket;