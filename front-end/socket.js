const socket = io(); // Connect to the server

let playerColor = null;

// Listen for player role assignment (white or black)
socket.on("playerRole", (color) => {
    playerColor = color;
    document.getElementById("player-info").innerText = `You are playing as: ${color}`;
});

// Listen for game state updates
socket.on("gameState", (gameState) => {
    updateBoard(gameState.board);
    document.getElementById("turn-info").innerText = `Current Turn: ${gameState.currentPlayer}`;
});

// Listen for messages from the server
socket.on("message", (msg) => {
    alert(msg); // Show message as an alert
});

// Listen for opponent disconnecting
socket.on("playerLeft", () => {
    alert("Your opponent left the game. Waiting for a new player...");
});

// Function to send a move to the server
function sendMove(moveData) {
    if (playerColor !== moveData.player) {
        alert("Not your turn!");
        return;
    }
    socket.emit("move", moveData);
}

// Function to update the board (you can modify this)
function updateBoard(board) {
    // Your logic to update the UI based on `board`
    console.log("Board updated:", board);
}
