const socket = io.connect('http://localhost:3000'); 
class ChessGame {
    constructor(userId) {
        this.playerId = userId;
        this.board = this.initializeBoard();
        this.turn = "white";
        this.canvas = document.getElementById("chessboard");
        this.ctx = this.canvas.getContext("2d");
        this.tileSize = 50;
        this.boardSize = 8;
        this.pieces = {};
        this.selectedPiece = null;
        this.gameOver = false;
        this.hasMoved = {
            whiteKing: false,
            blackKing: false,
            whiteRookKingside: false,
            whiteRookQueenside: false,
            blackRookKingside: false,
            blackRookQueenside: false
        };

        this.whiteTimerDisplay = document.querySelector('#whiteTimer .timer-label');
        this.blackTimerDisplay = document.querySelector('#blackTimer .timer-label');

        
        const username = localStorage.getItem("username") || "Joueur";
        this.setPlayerNames(username, "Adversaire");
        
        this.whiteTimerElement = document.getElementById("whiteTimer");
        this.blackTimerElement = document.getElementById("blackTimer");
        this.whiteTimerDisplay = document.querySelector("#whiteTimer .timer-display");
        this.blackTimerDisplay = document.querySelector("#blackTimer .timer-display");
        
        this.gameStatusElement = document.getElementById("gameStatus");
        this.moveHistoryElement = document.getElementById("moveHistory");
        this.moveHistory = [];
        
        this.promotionChoice = document.getElementById("promotionChoice");
        this.overlay = document.getElementById("overlay");
        this.promotionInProgress = false;
        this.promotionCoords = null;
        this.promotionColor = null;

        this.timeControls = {
            white: 600,
            black: 600
        };
        this.timerInterval = null;
        this.lastUpdateTime = null;

        this.resignBtn = document.getElementById("resignBtn");
        this.setupResignButton();

        this.playerStatsBtn = document.getElementById("playerStatsBtn");
        this.statsPopup = document.getElementById("statsPopup");
        this.setupStatsButton();

        socket.on('player_stats_response', (data) => {
            if (data.userId === this.playerId) {
                this.displayPlayerStats(data.stats);
            }
        });
        
        this.loadImages();
        this.pieceMap = {
            "pion_noir": "P",
            "tour_noir": "R",
            "cavalier_noir": "N",
            "fou_noir": "B",
            "reine_noir": "Q",
            "roi_noir": "K",
            "pion_blanc": "P",
            "tour_blanc": "R",
            "cavalier_blanc": "N",
            "fou_blanc": "B",
            "reine_blanc": "Q",
            "roi_blanc": "K"
        };
        this.setupEventListeners();
        this.startGame();
        this.startTimer();
    
    }

    initializeBoard() {
        return [
            ["tour_noir", "cavalier_noir", "fou_noir", "reine_noir", "roi_noir", "fou_noir", "cavalier_noir", "tour_noir"],
            ["pion_noir", "pion_noir", "pion_noir", "pion_noir", "pion_noir", "pion_noir", "pion_noir", "pion_noir"],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ["pion_blanc", "pion_blanc", "pion_blanc", "pion_blanc", "pion_blanc", "pion_blanc", "pion_blanc", "pion_blanc"],
            ["tour_blanc", "cavalier_blanc", "fou_blanc", "reine_blanc", "roi_blanc", "fou_blanc", "cavalier_blanc", "tour_blanc"]
        ];
    }

    setPlayerNames(whiteName, blackName) {
        this.whiteTimerDisplay.textContent += ' : ' + whiteName;
        this.blackTimerDisplay.textContent += ' : ' + blackName;

    }

    setupEventListeners() {
        this.canvas.addEventListener("click", (event) => this.handleCanvasClick(event));
        
        document.querySelectorAll(".promotion-option").forEach(option => {
            option.addEventListener("click", (e) => {
                const pieceType = e.currentTarget.getAttribute("data-piece");
                this.completePromotion(pieceType);
            });
        });
    }

    setupStatsButton() {
        this.playerStatsBtn.addEventListener("click", () => {
            console.log("Fetching player stats...");
            this.fetchPlayerStats();
        });
        
        document.getElementById("closeStatsBtn").addEventListener("click", () => {
            this.statsPopup.style.display = "none";
        });
    }

    fetchPlayerStats() {
        socket.emit('fetch_player_stats', { userId: this.playerId });
    }

    displayPlayerStats(stats) {
        if (!stats) {
            console.error("No stats received");
            return;
        }
        
        document.getElementById("gamesPlayed").textContent = stats.games_played || 0;
        document.getElementById("wins").textContent = stats.wins || 0;
        document.getElementById("losses").textContent = stats.losses || 0;
        document.getElementById("draws").textContent = stats.draws || 0;
        
        const winRate = stats.games_played > 0 
            ? Math.round((stats.wins / stats.games_played) * 100) 
            : 0;
        document.getElementById("winRate").textContent = `${winRate}%`;
        
        this.statsPopup.style.display = "flex";
    }

    handleCanvasClick(event) {
        if (this.gameOver || this.promotionInProgress) return;
        
        const col = Math.floor(event.offsetX / this.tileSize);
        const row = Math.floor(event.offsetY / this.tileSize);
        const piece = this.getPieceAt(row, col).piece;
        const pieceColor = piece ? (piece.includes("blanc") ? "white" : "black") : null;

        if (this.selectedPiece) {
            const moveSuccess = this.movePiece(this.selectedPiece.row, this.selectedPiece.col, row, col);
            
            this.clearBoard();
            this.drawBoard();
            this.drawPieces();
            
            if (moveSuccess) {
                this.selectedPiece = null;
            } else if (piece && pieceColor === this.turn) {
                this.selectedPiece = { row, col };
                this.displayPossibleMoves(piece, row, col);
            } else {
                this.selectedPiece = null;
            }
        } 
        else if (piece && pieceColor === this.turn) {
            this.selectedPiece = { row, col };
            this.clearBoard();
            this.drawBoard();
            this.drawPieces();
            this.displayPossibleMoves(piece, row, col);
        }
    }

    getPieceAt(row, col) {
        return { piece: this.board[row][col], color: this.board[row][col] ? (this.board[row][col].includes("blanc") ? "white" : "black") : null };
    }

    movePiece(startRow, startCol, endRow, endCol) {
        if (this.gameOver || this.promotionInProgress) return false;

        const piece = this.getPieceAt(startRow, startCol).piece;
        const targetPiece = thifetch_player_statss.getPieceAt(endRow, endCol).piece;

        if (!piece) return false;

        const pieceColor = piece.includes("blanc") ? "white" : "black";
        const targetColor = targetPiece ? (targetPiece.includes("blanc") ? "white" : "black") : null;

        if (piece.includes("roi") && Math.abs(startCol - endCol) === 2 && startRow === endRow) {
            if (!this.canCastle(pieceColor, endCol > startCol ? "kingside" : "queenside")) {
                return false;
            }
            const success = this.performCastle(pieceColor, endCol > startCol ? "kingside" : "queenside");
            if (success) {
                this.switchTimer();
                this.addMoveToHistory(piece, startRow, startCol, endRow, endCol, "O-O" + (endCol > startCol ? "" : "-O"));
                this.checkGameOver();
            }
            return success;
        }

        if (!this.isValidMove(piece, startRow, startCol, endRow, endCol)) {
            return false;
        }

        if (this.wouldBeInCheck(piece, startRow, startCol, endRow, endCol)) {
            return false;
        }

        if (piece.includes("pion") && (endRow === 0 || endRow === 7)) {
            this.promotionInProgress = true;
            this.promotionCoords = { startRow, startCol, endRow, endCol, targetPiece };
            this.promotionColor = pieceColor;
            this.showPromotionDialog(pieceColor);
            
            this.board[startRow][startCol] = null;
            this.clearBoard();
            this.drawBoard();
            this.drawPieces();
            return true;
        }

        if (piece.includes("roi")) {
            if (pieceColor === "white") this.hasMoved.whiteKing = true;
            else this.hasMoved.blackKing = true;
        }
        if (piece.includes("tour")) {
            if (pieceColor === "white") {
                if (startRow === 7 && startCol === 0) this.hasMoved.whiteRookQueenside = true;
                if (startRow === 7 && startCol === 7) this.hasMoved.whiteRookKingside = true;
            } else {
                if (startRow === 0 && startCol === 0) this.hasMoved.blackRookQueenside = true;
                if (startRow === 0 && startCol === 7) this.hasMoved.blackRookKingside = true;
            }
        }

        this.board[endRow][endCol] = piece;
        this.board[startRow][startCol] = null;

        this.turn = this.turn === "white" ? "black" : "white";
        this.switchTimer();
        
        this.addMoveToHistory(piece, startRow, startCol, endRow, endCol, targetPiece ? "x" : "");
        
        this.checkGameOver();
        return true;
    }

    completePromotion(pieceType) {
        if (!this.promotionInProgress) return;
        
        const { startRow, startCol, endRow, endCol, targetPiece } = this.promotionCoords;
        
        let newPiece;
        const color = this.promotionColor === "white" ? "blanc" : "noir";
        
        switch (pieceType) {
            case "queen": newPiece = `reine_${color}`; break;
            case "rook": newPiece = `tour_${color}`; break;
            case "bishop": newPiece = `fou_${color}`; break;
            case "knight": newPiece = `cavalier_${color}`; break;
            default: newPiece = `reine_${color}`;
        }
        
        this.board[endRow][endCol] = newPiece;
        
        const pawnPiece = this.promotionColor === "white" ? "pion_blanc" : "pion_noir";
        let notation = targetPiece ? "x" : "";
        notation += "=" + this.pieceMap[newPiece].toUpperCase();
        this.addMoveToHistory(pawnPiece, startRow, startCol, endRow, endCol, notation);
        
        this.promotionInProgress = false;
        this.promotionCoords = null;
        this.promotionColor = null;
        
        this.overlay.style.display = "none";
        this.promotionChoice.style.display = "none";
        
        this.turn = this.turn === "white" ? "black" : "white";
        this.switchTimer();
        
        this.selectedPiece = null;
        this.clearBoard();
        this.drawBoard();
        this.drawPieces();
        
        this.checkGameOver();
    }

    findKing(color) {
        const king = color === "white" ? "roi_blanc" : "roi_noir";
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === king) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    isSquareUnderAttack(row, col, attackingColor) {
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                const piece = this.board[i][j];
                if (piece && (piece.includes("blanc") ? "white" : "black") === attackingColor) {
                    if (this.isValidMove(piece, i, j, row, col, true)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    isInCheck(color) {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;
        return this.isSquareUnderAttack(kingPos.row, kingPos.col, color === "white" ? "black" : "white");
    }

    hasLegalMoves(color) {
        for (let startRow = 0; startRow < this.boardSize; startRow++) {
            for (let startCol = 0; startCol < this.boardSize; startCol++) {
                const piece = this.board[startRow][startCol];
                if (piece && (piece.includes("blanc") ? "white" : "black") === color) {
                    for (let endRow = 0; endRow < this.boardSize; endRow++) {
                        for (let endCol = 0; endCol < this.boardSize; endCol++) {
                            if (this.isValidMove(piece, startRow, startCol, endRow, endCol)) {
                                const originalPiece = this.board[endRow][endCol];
                                this.board[endRow][endCol] = piece;
                                this.board[startRow][startCol] = null;
                                
                                const stillInCheck = this.isInCheck(color);
                                
                                this.board[startRow][startCol] = piece;
                                this.board[endRow][endCol] = originalPiece;
                                
                                if (!stillInCheck) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    isCheckmate(color) {
        return this.isInCheck(color) && !this.hasLegalMoves(color);
    }

    isStalemate(color) {
        return !this.isInCheck(color) && !this.hasLegalMoves(color);
    }

    // Replace or modify your checkGameOver method
    checkGameOver() {
        if (this.isCheckmate("white")) {
            this.handleGameResult("black", "white", "Les Noirs gagnent par échec et mat !");
            return true;
        }
        if (this.isCheckmate("black")) {
            this.handleGameResult("white", "black", "Les Blancs gagnent par échec et mat !");
            return true;
        }
        if (this.isStalemate(this.turn)) {
            this.handleGameResult("draw", null, "Pat ! La partie se termine par une égalité.");
            return true;
        }
        return false;
    }

    handleGameResult(winner, loser, message) {
        this.gameOver = true;
        this.stopTimer();
        this.showGameOverPopup(message);        
        
        socket.emit('update_database', {
            userId: this.playerId,
            result: winner === "white" ? "win" : winner === "black" ? "loss" : "draw",
        });

    }

    handleResignation() {
        const loserColor = this.turn === "white" ? "white" : "black";
        const winnerColor = this.turn === "white" ? "black" : "white";
        
        this.gameOver = true;
        this.stopTimer();
        
        const winners =  winnerColor ===  "white" ? "Les Blancs" : "Les Noirs";
        this.showVictoryPopup(`${winners} gagnent par abandon !`);
        
        // Emit resignation to server
        socket.emit('update_database', {
            userId: this.playerId,
            result: winnerColor === "white" ? "win" : winnerColor === "black" ? "loss" : "draw",
        });

        console.log(`Les ${winnerColor} gagnent par abandon !`);

        
        this.updateGameStatus(`${winners} gagnent par abandon`);
        //this.addMoveToHistory(null, null, null, null, `[Abandon des ${loserColor}]`);
        
        this.selectedPiece = null;
        this.clearBoard();
        this.drawBoard();
        this.drawPieces();
    }

    showGameOverPopup(message) {
        this.stopTimer();
        
        const popup = document.createElement("div");
        popup.id = "gameOverPopup";
        popup.style.position = "fixed";
        popup.style.top = "50%";
        popup.style.left = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.style.backgroundColor = "white";
        popup.style.padding = "20px";
        popup.style.border = "2px solid black";
        popup.style.borderRadius = "10px";
        popup.style.zIndex = "1000";
        popup.style.textAlign = "center";
        popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
        
        const text = document.createElement("p");
        text.textContent = message;
        text.style.fontSize = "24px";
        text.style.margin = "0 0 20px 0";
        text.style.fontWeight = "bold";
        
        const button = document.createElement("button");
        button.textContent = "Nouvelle partie";
        button.style.padding = "10px 20px";
        button.style.fontSize = "18px";
        button.style.cursor = "pointer";
        button.style.backgroundColor = "#4CAF50";
        button.style.color = "white";
        button.style.border = "none";
        button.style.borderRadius = "5px";
        
        button.addEventListener("click", () => {
            document.body.removeChild(popup);
            this.resetGame();
        });
        
        popup.appendChild(text);
        popup.appendChild(button);
        document.body.appendChild(popup);
    }

    resetGame() {
        this.board = this.initializeBoard();
        this.turn = "white";
        this.gameOver = false;
        this.hasMoved = {
            whiteKing: false,
            blackKing: false,
            whiteRookKingside: false,
            whiteRookQueenside: false,
            blackRookKingside: false,
            blackRookQueenside: false
        };
        
        // Reset chronomètre
        this.timeControls.white = 600;
        this.timeControls.black = 600;
        this.lastUpdateTime = Date.now();
        if (!this.timerInterval) {
            this.startTimer();
        }
        
        this.clearBoard();
        this.drawBoard();
        this.drawPieces();
    }

    wouldBeInCheck(piece, startRow, startCol, endRow, endCol) {
        const originalPiece = this.board[endRow][endCol];
        this.board[endRow][endCol] = piece;
        this.board[startRow][startCol] = null;
        
        const pieceColor = piece.includes("blanc") ? "white" : "black";
        const result = this.isInCheck(pieceColor);
        
        this.board[startRow][startCol] = piece;
        this.board[endRow][endCol] = originalPiece;
        
        return result;
    }

    
    movePiece(startRow, startCol, endRow, endCol) {
        if (this.gameOver || this.promotionInProgress) return false;
    
        const piece = this.getPieceAt(startRow, startCol).piece;
        const targetPiece = this.getPieceAt(endRow, endCol).piece;
    
        if (!piece) return false;
    
        const pieceColor = piece.includes("blanc") ? "white" : "black";
        const targetColor = targetPiece ? (targetPiece.includes("blanc") ? "white" : "black") : null;
    
        if (piece.includes("roi") && Math.abs(startCol - endCol) === 2 && startRow === endRow) {
            if (!this.canCastle(pieceColor, endCol > startCol ? "kingside" : "queenside")) {
                return false;
            }
            const success = this.performCastle(pieceColor, endCol > startCol ? "kingside" : "queenside");
            if (success) {
                this.switchTimer();
                this.addMoveToHistory(piece, startRow, startCol, endRow, endCol, "O-O" + (endCol > startCol ? "" : "-O"));
                this.checkGameOver();
            }
            return success;
        }
    
        if (!this.isValidMove(piece, startRow, startCol, endRow, endCol)) {
            return false;
        }
    
        if (this.wouldBeInCheck(piece, startRow, startCol, endRow, endCol)) {
            return false;
        }
    
        if (piece.includes("pion") && (endRow === 0 || endRow === 7)) {
            this.promotionInProgress = true;
            this.promotionCoords = { startRow, startCol, endRow, endCol, targetPiece };
            this.promotionColor = pieceColor;
            this.showPromotionDialog(pieceColor);
            
            this.board[startRow][startCol] = null;
            return true;
        }
    
        if (piece.includes("roi")) {
            if (pieceColor === "white") this.hasMoved.whiteKing = true;
            else this.hasMoved.blackKing = true;
        }
        if (piece.includes("tour")) {
            if (pieceColor === "white") {
                if (startRow === 7 && startCol === 0) this.hasMoved.whiteRookQueenside = true;
                if (startRow === 7 && startCol === 7) this.hasMoved.whiteRookKingside = true;
            } else {
                if (startRow === 0 && startCol === 0) this.hasMoved.blackRookQueenside = true;
                if (startRow === 0 && startCol === 7) this.hasMoved.blackRookKingside = true;
            }
        }
    
        this.board[endRow][endCol] = piece;
        this.board[startRow][startCol] = null;
    
        this.turn = this.turn === "white" ? "black" : "white";
        this.switchTimer();
        
        this.addMoveToHistory(piece, startRow, startCol, endRow, endCol, targetPiece ? "x" : "");
        
        this.checkGameOver();
        return true;
    }
    
    completePromotion(pieceType) {
        if (!this.promotionInProgress) return;
        
        const { startRow, startCol, endRow, endCol, targetPiece } = this.promotionCoords;
        
        let newPiece;
        const color = this.promotionColor === "white" ? "blanc" : "noir";
        
        switch (pieceType) {
            case "queen": newPiece = `reine_${color}`; break;
            case "rook": newPiece = `tour_${color}`; break;
            case "bishop": newPiece = `fou_${color}`; break;
            case "knight": newPiece = `cavalier_${color}`; break;
            default: newPiece = `reine_${color}`; 
        }
        
        this.board[endRow][endCol] = newPiece;
        
        // Add the promotion to move history
        const pawnPiece = this.promotionColor === "white" ? "pion_blanc" : "pion_noir";
        let notation = targetPiece ? "x" : "";
        notation += "=" + this.pieceMap[newPiece].toUpperCase();
        this.addMoveToHistory(pawnPiece, startRow, startCol, endRow, endCol, notation);
        
        this.promotionInProgress = false;
        this.promotionCoords = null;
        this.promotionColor = null;
        
        this.overlay.style.display = "none";
        this.promotionChoice.style.display = "none";
        
        this.turn = this.turn === "white" ? "black" : "white";
        this.switchTimer();
        
        this.selectedPiece = null;
        this.clearBoard();
        this.drawBoard();
        this.drawPieces();
        
        this.checkGameOver();
    }

    canCastle(color, side) {
        const row = color === "white" ? 7 : 0;
        const kingCol = 4;
        const rookCol = side === "kingside" ? 7 : 0;
        
        const kingPiece = this.board[row][kingCol];
        const rookPiece = this.board[row][rookCol];
        
        if (!kingPiece || !kingPiece.includes("roi") || !rookPiece || !rookPiece.includes("tour")) {
            return false;
        }
        
        if (color === "white") {
            if (this.hasMoved.whiteKing || 
                (side === "kingside" && this.hasMoved.whiteRookKingside) || 
                (side === "queenside" && this.hasMoved.whiteRookQueenside)) {
                return false;
            }
        } else {
            if (this.hasMoved.blackKing || 
                (side === "kingside" && this.hasMoved.blackRookKingside) || 
                (side === "queenside" && this.hasMoved.blackRookQueenside)) {
                return false;
            }
        }
        
        const start = Math.min(kingCol, rookCol) + 1;
        const end = Math.max(kingCol, rookCol);
        for (let col = start; col < end; col++) {
            if (this.board[row][col] !== null) {
                return false;
            }
        }
        
        if (this.isInCheck(color)) {
            return false;
        }
        
        const kingPassCol1 = side === "kingside" ? 5 : 3;
        const kingPassCol2 = side === "kingside" ? 6 : 2;
        
        if (this.isSquareUnderAttack(row, kingPassCol1, color === "white" ? "black" : "white") || 
            this.isSquareUnderAttack(row, kingPassCol2, color === "white" ? "black" : "white")) {
            return false;
        }
        
        return true;
    }

    performCastle(color, side) {
        const row = color === "white" ? 7 : 0;
        const kingCol = 4;
        const rookCol = side === "kingside" ? 7 : 0;
        
        const newKingCol = side === "kingside" ? 6 : 2;
        this.board[row][newKingCol] = this.board[row][kingCol];
        this.board[row][kingCol] = null;
        
        const newRookCol = side === "kingside" ? 5 : 3;
        this.board[row][newRookCol] = this.board[row][rookCol];
        this.board[row][rookCol] = null;
        
        if (color === "white") {
            this.hasMoved.whiteKing = true;
            if (side === "kingside") this.hasMoved.whiteRookKingside = true;
            else this.hasMoved.whiteRookQueenside = true;
        } else {
            this.hasMoved.blackKing = true;
            if (side === "kingside") this.hasMoved.blackRookKingside = true;
            else this.hasMoved.blackRookQueenside = true;
        }
        
        this.turn = this.turn === "white" ? "black" : "white";
        return true;
    }

    isValidMove(piece, startRow, startCol, endRow, endCol, ignoreCheck = false) {
        if (startRow === endRow && startCol === endCol) return false;

        const type = this.pieceMap[piece];
        const deltaRow = Math.abs(endRow - startRow);
        const deltaCol = Math.abs(endCol - startCol);
        const targetPiece = this.board[endRow][endCol];

        const pieceColor = piece.includes("blanc") ? "white" : "black";
        const targetColor = targetPiece ? (targetPiece.includes("blanc") ? "white" : "black") : null;

        if (targetPiece && pieceColor === targetColor) return false;

        if (type === "K" && deltaRow === 0 && deltaCol === 2) {
            return false;
        }

        const isPathClear = (startRow, startCol, endRow, endCol) => {
            const rowStep = endRow > startRow ? 1 : (endRow < startRow ? -1 : 0);
            const colStep = endCol > startCol ? 1 : (endCol < startCol ? -1 : 0);

            let row = startRow + rowStep;
            let col = startCol + colStep;

            while (row !== endRow || col !== endCol) {
                if (this.board[row][col] !== null) return false;
                row += rowStep;
                col += colStep;
            }
            return true;
        };

        switch (type) {
            case "P":
                if (pieceColor === "white") {
                    if (deltaCol === 0 && !targetPiece) {
                        if (endRow === startRow - 1) return true;
                        if (startRow === 6 && endRow === 4 && isPathClear(startRow, startCol, endRow, endCol)) return true;
                    }
                    if (deltaCol === 1 && endRow === startRow - 1 && targetPiece && targetColor !== pieceColor) return true;
                } else {
                    if (deltaCol === 0 && !targetPiece) {
                        if (endRow === startRow + 1) return true;
                        if (startRow === 1 && endRow === 3 && isPathClear(startRow, startCol, endRow, endCol)) return true;
                    }
                    if (deltaCol === 1 && endRow === startRow + 1 && targetPiece && targetColor !== pieceColor) return true;
                }
                return false;

            case "R":
                return (startRow === endRow || startCol === endCol) && isPathClear(startRow, startCol, endRow, endCol);

            case "N":
                return (deltaRow === 2 && deltaCol === 1) || (deltaRow === 1 && deltaCol === 2);

            case "B":
                return deltaRow === deltaCol && isPathClear(startRow, startCol, endRow, endCol);

            case "Q":
                return (startRow === endRow || startCol === endCol || deltaRow === deltaCol) && isPathClear(startRow, startCol, endRow, endCol);

            case "K":
                return deltaRow <= 1 && deltaCol <= 1;

            default:
                return false;
        }
    }

    loadImages() {
        const pieceNames = ["pion", "tour", "cavalier", "fou", "reine", "roi"];
        const colors = ["blanc", "noir"];

        colors.forEach(color => {
            pieceNames.forEach(piece => {
                const key = `${piece}_${color}`;
                this.pieces[key] = new Image();
                this.pieces[key].src = `images/pieces/${key}.png`;
            });
        });
    }

    drawBoard() {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                this.ctx.fillStyle = (row + col) % 2 === 0 ? "#EEE" : "#333";
                this.ctx.fillRect(col * this.tileSize, row * this.tileSize, this.tileSize, this.tileSize);
            }
        }

        if (this.isInCheck("white")) {
            const whiteKingPos = this.findKing("white");
            if (whiteKingPos) {
                this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                this.ctx.fillRect(whiteKingPos.col * this.tileSize, whiteKingPos.row * this.tileSize, this.tileSize, this.tileSize);
            }
        }
        if (this.isInCheck("black")) {
            const blackKingPos = this.findKing("black");
            if (blackKingPos) {
                this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                this.ctx.fillRect(blackKingPos.col * this.tileSize, blackKingPos.row * this.tileSize, this.tileSize, this.tileSize);
            }
        }
    }

    drawPieces() {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    const img = this.pieces[piece];
                    if (img.complete) {
                        this.ctx.drawImage(img, col * this.tileSize + 5, row * this.tileSize + 5, this.tileSize - 10, this.tileSize - 10);
                    } else {
                        img.onload = () => {
                            this.ctx.drawImage(img, col * this.tileSize + 5, row * this.tileSize + 5, this.tileSize - 10, this.tileSize - 10);
                        };
                    }
                }
            }
        }
    }

    startGame() {
        setTimeout(() => {
            this.drawBoard();
            this.drawPieces();
        }, 500);
    }

    clearBoard() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    displayPossibleMoves(piece, row, col) {
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.isValidMove(piece, row, col, i, j)) {
                    if (!this.wouldBeInCheck(piece, row, col, i, j)) {
                        this.ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
                        this.ctx.fillRect(j * this.tileSize, i * this.tileSize, this.tileSize, this.tileSize);
                    }
                }
            }
        }
        
        if (piece.includes("roi")) {
            const color = piece.includes("blanc") ? "white" : "black";
            const kingRow = color === "white" ? 7 : 0;
            
            if (row === kingRow && col === 4) {
                if (this.canCastle(color, "kingside")) {
                    this.ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
                    this.ctx.fillRect(6 * this.tileSize, row * this.tileSize, this.tileSize, this.tileSize);
                }
                if (this.canCastle(color, "queenside")) {
                    this.ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
                    this.ctx.fillRect(2 * this.tileSize, row * this.tileSize, this.tileSize, this.tileSize);
                }
            }
        }
    }

    addClickListener() {
        this.canvas.addEventListener("click", (event) => {
            const col = Math.floor(event.offsetX / this.tileSize);
            const row = Math.floor(event.offsetY / this.tileSize);

            const piece = this.getPieceAt(row, col).piece;
            const pieceColor = piece ? (piece.includes("blanc") ? "white" : "black") : null;

            if (this.selectedPiece) {
                if (this.movePiece(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
                    this.selectedPiece = null;
                    this.clearBoard();
                    this.drawBoard();
                    this.drawPieces();
                } else {
                    this.selectedPiece = null;
                    this.clearBoard();
                    this.drawBoard();
                    this.drawPieces();
                }
            } else if (piece && pieceColor === this.turn) {
                this.selectedPiece = { row, col };
                this.clearBoard();
                this.drawBoard();
                this.drawPieces();
                this.displayPossibleMoves(piece, row, col);
            }
        });
    }

    handleCanvasClick(event) {
        if (this.gameOver || this.promotionInProgress) return;
        
        const col = Math.floor(event.offsetX / this.tileSize);
        const row = Math.floor(event.offsetY / this.tileSize);

        const piece = this.getPieceAt(row, col).piece;
        const pieceColor = piece ? (piece.includes("blanc") ? "white" : "black") : null;

        if (this.selectedPiece) {
            if (this.movePiece(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
                this.selectedPiece = null;
                this.clearBoard();
                this.drawBoard();
                this.drawPieces();
            } else {
                this.selectedPiece = null;
                this.clearBoard();
                this.drawBoard();
                this.drawPieces();
            }
        } else if (piece && pieceColor === this.turn) {
            this.selectedPiece = { row, col };
            this.clearBoard();
            this.drawBoard();
            this.drawPieces();
            this.displayPossibleMoves(piece, row, col);
        }
    }
    addMoveToHistory(piece, startRow, startCol, endRow, endCol, extraNotation = "") {
        const pieceType = this.pieceMap[piece];
        const pieceColor = piece.includes("blanc") ? "white" : "black";
        

        const moveNumber = Math.floor(this.moveHistory.length / 2) + 1;
        
        const startFile = String.fromCharCode(97 + startCol);
        const endFile = String.fromCharCode(97 + endCol);
        const endRank = 8 - endRow;
        
        let moveNotation = "";
        
        // Notation pour les pions
        if (pieceType === "P") {
            if (extraNotation.includes("x")) {
                moveNotation = `${startFile}${extraNotation}${endFile}${endRank}`;
            } else {
                moveNotation = `${endFile}${endRank}`;
            }
        } 
        // Notation pour le roque
        else if (extraNotation.includes("O-O")) {
            moveNotation = extraNotation;
        } 
        // Notation pour les autres pièces
        else {
            moveNotation = `${pieceType}${extraNotation}${endFile}${endRank}`;
        }
        
        if (this.isInCheck(pieceColor === "white" ? "black" : "white")) {
            if (this.isCheckmate(pieceColor === "white" ? "black" : "white")) {
                moveNotation += "#";
            } else {
                moveNotation += "+";
            }
        }
        
        // Pour les blancs: création d'une nouvelle entrée avec le numéro du coup
        if (pieceColor === "white") {
            this.moveHistory.push(`${moveNumber}. ${moveNotation}`);
        } 
        else {
            if (this.moveHistory.length > 0) {
                this.moveHistory[this.moveHistory.length - 1] += ` ${moveNotation}`;
            } else {
                this.moveHistory.push(`${moveNumber}... ${moveNotation}`);
            }
        }
        
        this.updateMoveHistoryDisplay();
    }
    
    updateMoveHistoryDisplay() {
        this.moveHistoryElement.innerHTML = this.moveHistory.join("<br>");
        
        this.moveHistoryElement.scrollTop = this.moveHistoryElement.scrollHeight;
    }
    
    updateGameStatus(status) {
        this.gameStatusElement.textContent = status;
    }

    startTimer() {
        this.lastUpdateTime = Date.now();
        this.updateTimerDisplay(); 
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsedSeconds = (now - this.lastUpdateTime) / 1000;
            
            if (this.turn === "white") {
                this.timeControls.white = Math.max(0, this.timeControls.white - elapsedSeconds);
            } else {
                this.timeControls.black = Math.max(0, this.timeControls.black - elapsedSeconds);
            }
            
            this.lastUpdateTime = now;
            this.updateTimerDisplay();
            
            if (this.timeControls.white <= 0) {
                this.handleTimeout("white");
            } else if (this.timeControls.black <= 0) {
                this.handleTimeout("black");
            }
        }, 100); // Update toutes les 100ms
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    switchTimer() {
        const now = Date.now();
        const elapsedSeconds = (now - this.lastUpdateTime) / 1000;        
        if (this.turn === "white") {
            this.timeControls.white = Math.max(0, this.timeControls.white - elapsedSeconds);
        } else {
            this.timeControls.black = Math.max(0, this.timeControls.black - elapsedSeconds);
        }
        
        this.lastUpdateTime = now;
        
        if (this.turn === "white") {
            this.whiteTimerElement.classList.remove("active");
            this.blackTimerElement.classList.add("active");
            this.updateGameStatus("Tour actuel : Blanc");
        } else {
            this.blackTimerElement.classList.remove("active");
            this.whiteTimerElement.classList.add("active");
            this.updateGameStatus("Tour actuel : Noir");
        }
        
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const whiteMins = Math.floor(this.timeControls.white / 60);
        const whiteSecs = Math.floor(this.timeControls.white % 60);
        this.whiteTimerDisplay.textContent = `${whiteMins}:${whiteSecs < 10 ? '0' : ''}${whiteSecs}`;
        
        const blackMins = Math.floor(this.timeControls.black / 60);
        const blackSecs = Math.floor(this.timeControls.black % 60);
        this.blackTimerDisplay.textContent = `${blackMins}:${blackSecs < 10 ? '0' : ''}${blackSecs}`;
        
        if (this.timeControls.white <= 30) {
            this.whiteTimerDisplay.style.color = "red";
            this.whiteTimerDisplay.style.animation = "flash 1s infinite";
        } else {
            this.whiteTimerDisplay.style.color = "";
            this.whiteTimerDisplay.style.animation = "";
        }
        
        if (this.timeControls.black <= 30) {
            this.blackTimerDisplay.style.color = "red";
            this.blackTimerDisplay.style.animation = "flash 1s infinite";
        } else {
            this.blackTimerDisplay.style.color = "";
            this.blackTimerDisplay.style.animation = "";
        }
    }

    handleTimeout(color) {
        this.stopTimer();
        this.gameOver = true;
        const winners = "white" ? "Les Noirs" : "Les Blancs";
        socket.emit('update_database', {
            userId: this.playerId,
            result: color === "white" ? "loss" : color === "black" ? "win" : "draw",
        });
        this.showGameOverPopup(`${winners} gagnent par timeout !`);
        this.updateGameStatus(`${winners} gagnent par timeout`);
    }

    showPromotionDialog(color) {
        const options = this.promotionChoice.querySelectorAll(".promotion-option img");
        
        const colorSuffix = color === "white" ? "blanc" : "noir";
        options[0].src = `images/pieces/reine_${colorSuffix}.png`;
        options[1].src = `images/pieces/tour_${colorSuffix}.png`;
        options[2].src = `images/pieces/fou_${colorSuffix}.png`;
        options[3].src = `images/pieces/cavalier_${colorSuffix}.png`;
        
        this.overlay.style.display = "block";
        this.promotionChoice.style.display = "block";
    }

    setupResignButton() {
        this.resignBtn.addEventListener("click", () => {
            this.showResignConfirmation();
        });
    }

    showResignConfirmation() {
        const overlay = document.createElement("div");
        overlay.id = "resignOverlay"; 
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        overlay.style.zIndex = "999";
        
        const popup = document.createElement("div");
        popup.id = "resignPopup";
        popup.style.position = "fixed";
        popup.style.top = "50%";
        popup.style.left = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.style.backgroundColor = "white";
        popup.style.padding = "25px";
        popup.style.borderRadius = "10px";
        popup.style.zIndex = "1000";
        popup.style.textAlign = "center";
        popup.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
        popup.style.width = "300px";
        popup.style.maxWidth = "90%";
    
        popup.innerHTML = `
            <h3 style="margin-top: 0; color: #333;">Confirmer l'abandon</h3>
            <p style="font-size: 16px; margin: 0 0 20px 0; color: #666;">
                Êtes-vous sûr de vouloir abandonner la partie ?
            </p>
            <div style="display: flex; justify-content: center; gap: 15px;">
                <button id="confirmResignBtn" style="padding: 10px 20px; background-color: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Oui, abandonner
                </button>
                <button id="cancelResignBtn" style="padding: 10px 20px; background-color: #ecf0f1; color: #333; border: none; border-radius: 5px; cursor: pointer;">
                    Annuler
                </button>
            </div>
        `;
    
        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    
        const removeElements = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(popup);
        };

    
        document.getElementById("confirmResignBtn").addEventListener("click", () => {
            console.log("Abandon confirmé");
            removeElements();
            this.handleResignation();
        });
    
        document.getElementById("cancelResignBtn").addEventListener("click", removeElements);
    
        overlay.addEventListener("click", removeElements);
    }


    showVictoryPopup(message) {
        const overlay = document.createElement("div");
        overlay.id = "victoryOverlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        overlay.style.zIndex = "1001";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";

        const popup = document.createElement("div");
        popup.style.backgroundColor = "#fff";
        popup.style.padding = "30px";
        popup.style.borderRadius = "10px";
        popup.style.textAlign = "center";
        popup.style.boxShadow = "0 5px 25px rgba(0,0,0,0.3)";
        popup.style.maxWidth = "80%";
        popup.style.animation = "fadeIn 0.4s ease-out";

        const style = document.createElement("style");
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);

        const crownIcon = document.createElement("div");
        crownIcon.innerHTML = '👑';
        crownIcon.style.fontSize = "50px";
        crownIcon.style.marginBottom = "15px";

        const messageElement = document.createElement("h2");
        messageElement.textContent = message;
        messageElement.style.color = "#2c3e50";
        messageElement.style.margin = "0 0 20px 0";

        const newGameBtn = document.createElement("button");
        newGameBtn.textContent = "Nouvelle partie";
        newGameBtn.style.padding = "12px 25px";
        newGameBtn.style.fontSize = "16px";
        newGameBtn.style.backgroundColor = "#2ecc71";
        newGameBtn.style.color = "white";
        newGameBtn.style.border = "none";
        newGameBtn.style.borderRadius = "5px";
        newGameBtn.style.cursor = "pointer";
        newGameBtn.style.transition = "all 0.3s";

        newGameBtn.onmouseenter = () => {
            newGameBtn.style.backgroundColor = "#27ae60";
            newGameBtn.style.transform = "scale(1.05)";
        };
        newGameBtn.onmouseleave = () => {
            newGameBtn.style.backgroundColor = "#2ecc71";
            newGameBtn.style.transform = "scale(1)";
        };

        newGameBtn.addEventListener("click", () => {
            document.body.removeChild(overlay);
            this.resetGame();
        });

        popup.appendChild(crownIcon);
        popup.appendChild(messageElement);
        popup.appendChild(newGameBtn);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
    }

}

window.onload = function () {
    userId = localStorage.getItem("userId");
    const game = new ChessGame(userId);
    game.startGame();
};
