const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const sanitizeHtml = require('sanitize-html');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

// Configuration du serveur
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});



// Structure pour stocker l'état du jeu
const activeGames = new Map();

// Configuration de la base de données SQLite
const db = new sqlite3.Database('./jeu_echecs.db', 
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('Erreur de connexion à la base de données:', err);
            process.exit(1);
        }
        console.log('Connecté à la base de données SQLite');
    });

// Middleware de sécurité
app.use(helmet());
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limité à 100 requêtes par fenêtre
});
app.use('/api/', limiter);

// Middleware Express
app.use(express.static(path.join(__dirname, '..', 'front-end')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuration des sessions
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-temporaire',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 heures
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
}));

// Initialisation de la base de données
function initializeDatabase(callback) {
    setupDatabase((err) => {
        if (err) {
            console.error('Erreur d\'initialisation:', err);
            process.exit(1);
        }
        console.log('Base de données initialisée');
        if (callback) callback();
    });    
}

function setupDatabase(callback) {
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL,
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0, 
            draws INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER,
            moves TEXT,
            result TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            player1_time_left INTEGER DEFAULT 30000,  -- 30 seconds in milliseconds
            player2_time_left INTEGER DEFAULT 30000,
            FOREIGN KEY (player1_id) REFERENCES users (id)
        );
    `;

    db.exec(sql, (err) => {
        if (err) {
            if (callback) callback(err);
            return;
        }
        if (callback) callback(null);
    });
}




// Middleware d'authentification
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: 'Non authentifié'
        });
    }
    next();
}

// Routes de base
app.get('/', (req, res) => {
    res.send('Server is running!');
});

// Route de connexion
app.post('/login', (req, res) => {
    const { pseudo, mdp } = req.body;

    // Validate inputs
    if (!pseudo || !mdp) {
        return res.status(400).json({ error: 'Pseudo and password are required' });
    }

    // Find user in database
    db.get(
        'SELECT * FROM users WHERE username = ?',
        [pseudo],
        (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Pseudo ou mot de passe invalide' });
            }

            // Verify both password and hash exist before comparing
            if (!mdp || !user.password_hash) {
                return res.status(500).json({ error: 'Missing password data' });
            }

            bcrypt.compare(mdp, user.password_hash, (compareErr, isMatch) => {
                if (compareErr) {
                    console.error('Password comparison error:', compareErr);
                    return res.status(500).json({ error: 'Authentication error' });
                }

                if (!isMatch) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Update last login
                db.run(
                    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                    [user.id],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating last login:', updateErr);
                            return res.status(500).json({ error: 'Database error' });
                        }

                        // Set session
                        req.session.user = {
                            id: user.id,
                            username: user.username
                        };

                        res.json({ 
                            success: true,
                            message: 'Login successful',
                            user: req.session.user
                        });
                    }
                );
            });
        }
    );
});

// Route d'inscription
app.post('/subscribe', (req, res) => {
    const { pseudo, mdp } = req.body;

    // Validation des entrées
    if (!pseudo || !mdp) {
        return res.status(400).json({
            error: 'Veuillez remplir tous les champs'
        });
    }

    // Nettoyage des entrées
    const cleanPseudo = sanitizeHtml(pseudo);
    const cleanMdp = sanitizeHtml(mdp);

    if (cleanPseudo.length < 3 || cleanPseudo.length > 16) {
        return res.status(400).json({
            error: 'Le pseudo doit contenir entre 3 et 16 caractères'
        });
    }

    if (cleanMdp.length < 6) {
        return res.status(400).json({
            error: 'Le mot de passe doit contenir au moins 6 caractères'
        });
    }

    // Vérification si le pseudo existe déjà
    db.get(
        'SELECT * FROM users WHERE username = ?',
        [cleanPseudo],
        (err, existingUser) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    error: 'Erreur interne du serveur'
                });
            }

            if (existingUser) {
                return res.status(409).json({
                    error: 'Ce pseudo est déjà utilisé! Veuillez vous connecter!'
                });
            }

            // Hashage du mot de passe
            bcrypt.hash(cleanMdp, 10, (hashErr, hashedPassword) => {
                if (hashErr) {
                    console.error('Error hashing password:', hashErr);
                    return res.status(500).json({
                        error: 'Erreur interne du serveur'
                    });
                }

                // Insertion dans la base de données
                db.run(
                    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                    [cleanPseudo, hashedPassword],
                    function(insertErr) {
                        if (insertErr) {
                            console.error('Error inserting user:', insertErr);
                            return res.status(500).json({
                                error: 'Erreur interne du serveur'
                            });
                        }

                        req.session.user = {
                            id: this.lastID,
                            username: cleanPseudo
                        };

                        res.json({ 
                            success: true,
                            message: 'Inscription réussie',
                            user: req.session.user
                        });
                    }
                );
            });
        }
    );
});

// Route protégée
app.get('/game', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'front-end', 'game.html'));
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Gestion des connexions Socket.IO
io.on("connection", (socket) => {
    // Gestion des parties en attente
    socket.on('game_start', (data) => {
        console.log(`Demande de démarrage de partie pour l'utilisateur ${data.userId}`);
        
    });

    socket.on('update_database', (data) => {
        console.log(`Mise à jour de la base de données pour l'utilisateur ${data.userId}`);
        db.run(
            'UPDATE users SET games_played = games_played + 1 WHERE id = ?',
            [data.userId],
            (err) => {
                if (err) {
                    console.error('Erreur de mise à jour de la base de données:', err);
                } else {
                    console.log('Base de données mise à jour avec succès');
                }
            }
        );
        console.log(data.result);
        if (data.result === 'win') {
            db.run(
                'UPDATE users SET wins = wins + 1 WHERE id = ?',
                [data.userId],
                (err) => {
                    if (err) {
                        console.error('Erreur de mise à jour des victoires:', err);
                    } else {
                        console.log('Victoire enregistrée avec succès');
                    }
                }
            );
            console.log('Victoire enregistrée avec succès');
        }
        else if (data.result === 'loss') {
            db.run(
                'UPDATE users SET losses = losses + 1 WHERE id = ?',
                [data.userId],
                (err) => {
                    if (err) {
                        console.error('Erreur de mise à jour des défaites:', err);
                    } else {
                        console.log('Défaite enregistrée avec succès');
                    }
                }
            );
            console.log('Défaite enregistrée avec succès');
        }
        else if (data.result === 'draw') {
            db.run(
                'UPDATE users SET draws = draws + 1 WHERE id = ?',
                [data.userId],
                (err) => {
                    if (err) {
                        console.error('Erreur de mise à jour des défaites:', err);
                    } else {
                        console.log('Défaite enregistrée avec succès');
                    }
                }
            );
            console.log('Défaite enregistrée avec succès');
        }
    });
    
    socket.on('fetch_player_stats', (data) => {
        console.log(`Demande de statistiques pour l'utilisateur ${data.userId}`);
        const { userId } = data;
        
        db.get(
            'SELECT username, wins, losses, draws, games_played FROM users WHERE id = ?',
            [userId],
            (err, user) => {
                if (err) {
                    console.error('Database error:', err);
                    return;
                }
                
                socket.emit('player_stats_response', {
                    userId: userId,
                    stats: {
                        username: user?.username,
                        wins: user?.wins || 0,
                        losses: user?.losses || 0,
                        games_played: user?.games_played || 0,
                        draws: user?.draws || 0
                    }
                });
            }
        );
    });
    
});


// Gestion de la fermeture propre
process.on('SIGINT', () => {
    console.log('Fermeture du serveur...');
    io.close();
    server.close(() => {
        db.close();
        console.log('Serveur fermé');
        process.exit(0);
    });
});


// Démarrage du serveur
const PORT = process.env.PORT || 3000;
initializeDatabase(() => {
    server.listen(PORT, () => {
        console.log(`Serveur en écoute sur le port ${PORT}`);
    });
});