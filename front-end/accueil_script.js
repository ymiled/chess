const socket1 = io();  
  
const validatePseudo = (pseudo) => {
const pseudoRegex = /^[a-zA-Z0-9_]{3,16}$/;
return pseudoRegex.test(pseudo.trim());
};

const validatePassword = (password) => {
return password.length >= 6;
};

const storeUserData = (userData) => {
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('username', userData.username);
};

// Form validation with improved feedback
const validateForm = (formId) => {
const form = document.getElementById(formId);
const pseudoInput = form.querySelector('input[name="pseudo"]') || form.querySelector('input[name="newPseudo"]');
const passwordInput = form.querySelector('input[name="mdp"]') || form.querySelector('input[name="newMdp"]');

// Reset previous errors
form.querySelectorAll('.error-message').forEach(el => el.textContent = '');

let isValid = true;

  // Pseudo validation
if (!validatePseudo(pseudoInput.value)) {
const errorEl = pseudoInput.nextElementSibling;
if (errorEl && errorEl.classList.contains('error-message')) {
    errorEl.textContent = 'Le pseudo doit contenir 3-16 caractères (lettres, chiffres, _)';
}
isValid = false;
}

// Password validation
if (!validatePassword(passwordInput.value)) {
const errorEl = passwordInput.nextElementSibling;
if (errorEl && errorEl.classList.contains('error-message')) {
    errorEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
}
isValid = false;
}

return isValid;
};

// Enhanced UI feedback functions
const showError = (message) => {
const errorDiv = document.getElementById('serverError');
if (!errorDiv) return;

errorDiv.textContent = message;
errorDiv.style.display = 'block';
errorDiv.style.color = 'red';

setTimeout(() => {
    errorDiv.style.display = 'none';
}, 5000);
};

const showSuccess = (message) => {
    const successDiv = document.getElementById('responseMessage');
    if (!successDiv) return;
    console.log('Success div:', successDiv); // Debugging line

    successDiv.textContent = message;
    successDiv.style.display = 'block';
    successDiv.style.color = 'green';

    setTimeout(() => {
        successDiv.style.display = 'block';
    }, 2000);
};

// Password visibility toggle
const setupPasswordToggle = () => {
const togglePassword = document.getElementById('toggle-password');
const passwordField = document.getElementById('mdp');

if (!togglePassword || !passwordField) return;

togglePassword.addEventListener('click', () => {
    const type = passwordField.type === 'password' ? 'text' : 'password';
    passwordField.type = type;
    togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
});
};

// Instructions handling
const setupInstructions = () => {
const instructionBtn = document.getElementById('instruction_button');
const tooltip = document.getElementById('tooltip');

if (!instructionBtn || !tooltip) return;

instructionBtn.addEventListener('click', () => {
    tooltip.innerHTML = `
        <div class="instructions-content">
            <h3>Mise en place</h3>
            <p> Tu peux te connecter avec un pseudo et un mot de passe.</p>
            <p> Ensuite, tu peux lancer une partie que tu peux jouer contre un autre joueur. Vous devez jouer tous les deux sur la même fenêtre.</p>
            <p> Le résultat de la partie sera enregistrée dans les statistiques du joueur connecté.</p>
            <p>Chaque joueur commence avec 16 pièces.</p>
            
            <h3>Déplacements</h3>
            <ul>
                <li>Roi : 1 case dans toutes les directions</li>
                <li>Dame : lignes droites (horizontales, verticales et diagonales)</li>
                <li>Tour : horizontale et verticale</li>
                <li>Fou : diagonales</li>
                <li>Cavalier : en forme de L</li>
                <li>Pion : avance d'une case, capture en diagonale</li>
            </ul>
            
            <h3>Objectif</h3>
            <p>Mettre le Roi adverse en échec et mat !</p>
            
            <button id="closeInstructionsBtn" class="btn-primary" type="button">Fermer</button>
        </div>
    `;
    tooltip.style.display = "block";
    
    document.getElementById('closeInstructionsBtn')?.addEventListener('click', () => {
        tooltip.style.display = "none";
    });
});
};


// Form submission handlers
const setupFormHandlers = () => {
// Login form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!validateForm('loginForm')) return;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pseudo: document.getElementById('pseudo').value,
                    mdp: document.getElementById('mdp').value
                })
            });
            
            if (response.ok) {
                socket1.emit('login', { username, password }, (response) => {
                    document.getElementById('loginMessage').textContent = response.message;
                    }
                );
                //window.location.href = '/waiting.html';
            } else {
                const error = await response.text();
                showError(error);
            }
        } catch (err) {
            showError('Waiting for another player to join...');
        }
    });
}

// Registration form
const subscribeForm = document.getElementById('subscribeForm');
if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!validateForm('subscribeForm')) return;
        
        try {
            const response = await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pseudo: document.getElementById('newPseudo').value,
                    mdp: document.getElementById('newMdp').value
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }
            
            
        } catch (error) {
            showError(error.message || 'Erreur d\'inscription');
        }
    });
}
};


const setupSubsription = () => {
const subscribeBtn = document.getElementById('subscribeBtn');
const closeSubscribeModal = document.getElementById('closeSubscribeModal');

subscribeBtn.addEventListener('click', () => {
    subscribeModal.style.display = 'flex';
}
);
closeSubscribeModal.addEventListener('click', () => {
    subscribeModal.style.display = 'none';
});
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - initializing');

    // Initialize other components
    setupPasswordToggle(); 
    setupInstructions();
    setupSubsription();

    // Setup login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateForm('loginForm')) return;
            
            const pseudo = document.getElementById('pseudo').value;
            const mdp = document.getElementById('mdp').value;
            
            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pseudo, mdp })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Store user data
                    localStorage.setItem('userId', data.user.id);
                    localStorage.setItem('username', data.user.username);
                    
                    // Notify server via socket
                    socket1.emit('game_start', { 
                        userId: data.user.id, 
                        username: data.user.username 
                    });
                    
                    // Redirect to game
                    window.location.href = '/game.html';
                } else {
                    showError(data.error || 'Login failed');
                }
            } catch (error) {
                showError('Erreur de connexion au serveur');
            }
        });
    }

    // Setup registration form
    const subscribeForm = document.getElementById('subscribeForm');
    if (subscribeForm) {
        subscribeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateForm('subscribeForm')) return;
            
            try {
                const response = await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pseudo: document.getElementById('newPseudo').value,
                        mdp: document.getElementById('newMdp').value
                    })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Registration failed');
                }
                
                if (data.success && data.user) {
                    localStorage.setItem('userId', data.user.id);
                    console.log('User ID:', data.user.id);
                    localStorage.setItem('username', data.user.username);
                    showSuccess('Inscription effectuée! Redirection en cours...');
                    // wait for 3 seconds before redirecting
                    setTimeout(() => {
                        // show success message for 3 seconds
                        const successDiv = document.getElementById('responseMessage');
                        successDiv.textContent = 'Inscription réussie! Redirection en cours...';
                        successDiv.style.display = 'block';
                        window.location.href = '/accueil.html';
                    }, 3500);
           
                }
            } catch (error) {
                showError(error.message || 'Erreur d\'inscription');
            }
        });
    }

    // Modal close handler
    window.addEventListener('click', (e) => {
        if (e.target === subscribeModal) {
            subscribeModal.style.display = 'none';
        }
    });
});

