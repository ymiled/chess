const socket = io();

// Gérer l'envoi et la réception des messages de chat
document.addEventListener("DOMContentLoaded", () => {
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");
    const messagesDiv = document.getElementById("messages");

    if (sendButton) {
        sendButton.addEventListener("click", () => {
            const message = messageInput.value.trim();
            if (message) {
                socket.emit("message", message);
                messageInput.value = "";
            }
        });
    }

    socket.on("message", (msg) => {
        const messageElement = document.createElement("p");
        messageElement.textContent = msg;
        messagesDiv.appendChild(messageElement);
    });
});


let waitingTimer;
let waitingStartTime;

function showWaitingRoom() {
    const waitingRoom = document.getElementById('waitingRoom');
    waitingRoom.style.display = 'block';
    waitingStartTime = Date.now();
    startWaitingTimer();
}

function hideWaitingRoom() {
    const waitingRoom = document.getElementById('waitingRoom');
    waitingRoom.style.display = 'none';
    if (waitingTimer) {
        clearInterval(waitingTimer);
    }
}

function startWaitingTimer() {
    const waitingTimeElement = document.getElementById('waitingTime');
    waitingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - waitingStartTime) / 1000);
        waitingTimeElement.textContent = elapsed;
    }, 1000);
}

socket.on('timer_update', (data) => {
    const minutes = Math.floor(data.timeLeft / 60000);
    const seconds = Math.floor((data.timeLeft % 60000) / 1000);
    document.getElementById('timer').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

socket.on('game_over', (data) => {
    if (data.winner === userId) {
        alert('Vous avez gagné!');
    } else {
        alert('Vous avez perdu!');
    }
});

// Ajouter ces événements dans la configuration Socket.IO
socket.on('waiting_for_opponent', () => {
    showWaitingRoom();
});

socket.on('game_started', () => {
    hideWaitingRoom();
});
