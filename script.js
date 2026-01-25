// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDy6NACds1W1t-JKgII9nbeM8pvFIIiRgg",
    databaseURL: "https://quizgamewebapp-default-rtdb.firebaseio.com/",
    projectId: "quizgamewebapp",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2. Global State
let questions = [];
let gameState = {
    role: null,
    sessionId: null,
    currentQuestion: -1,
    score: 0,
    timer: 10,
    timerId: null,
    isAnswered: false,
    playerName: ""
};

/**
 * UI NAVIGATION
 * Hides all elements with class 'screen' and shows the target ID
 */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove('hidden');
    }
}

// Triggered by "Create New Quiz" button
function showEditor() {
    showScreen('editor-screen');
}

/**
 * QUIZ CREATION LOGIC
 */
function saveQuestion() {
    const qValue = document.getElementById('q-input').value;
    const opt0 = document.getElementById('opt-0-in').value;
    
    if(!qValue || !opt0) {
        alert("Please fill in the question and at least the first option.");
        return;
    }

    const qObj = {
        q: qValue,
        a: [
            opt0,
            document.getElementById('opt-1-in').value || "---",
            document.getElementById('opt-2-in').value || "---",
            document.getElementById('opt-3-in').value || "---"
        ],
        correct: parseInt(document.getElementById('correct-opt').value)
    };

    questions.push(qObj);
    
    // Reset inputs for next question
    document.querySelectorAll('#editor-screen input').forEach(i => i.value = "");
    
    // Show the "Finish" button now that we have at least one question
    document.getElementById('start-session-btn').style.display = "block";
    
    alert(`Question ${questions.length} saved!`);
}

/**
 * SESSION INITIALIZATION (Join or Host)
 */
async function initSession(role) {
    if (role === 'creator' && questions.length === 0) return alert("Add questions first!");

    gameState.role = role;
    gameState.playerName = document.getElementById('player-name').value || "Anonymous";
    
    // Generate PIN for creator or get PIN from input for player
    gameState.sessionId = (role === 'player') 
        ? document.getElementById('join-code').value 
        : Math.floor(1000 + Math.random() * 9000).toString();

    if (!gameState.sessionId) return alert("PIN Required");

    try {
        await firebase.auth().signInAnonymously();
        const sessionRef = db.ref('sessions/' + gameState.sessionId);

        if (role === 'creator') {
            // Setup Database for new session
            await sessionRef.set({
                questions: questions,
                currentQuestion: 0,
                status: "active"
            });
            
            // Switch to Audience View
            showScreen('audience-screen');
            document.getElementById('big-pin-display').innerText = gameState.sessionId;
            updateAudienceView();
        } else {
            // Switch to Game View
            showScreen('game-screen');
        }

        // Listen for live updates
        sessionRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            if (data.status === "finished") {
                showResults();
                return;
            }

            if (data.questions) {
                questions = data.questions; 
                if (data.currentQuestion !== gameState.currentQuestion) {
                    gameState.currentQuestion = data.currentQuestion;
                    if (questions[gameState.currentQuestion]) loadQuestion();
                }
            }
        });

        document.getElementById('session-info').innerText = `PIN: ${gameState.sessionId}`;
    } catch (e) { 
        alert("Error connecting: " + e.message); 
    }
}

/**
 * GAMEPLAY LOGIC
 */
function loadQuestion() {
    gameState.isAnswered = false;
    clearInterval(gameState.timerId);
    
    const qData = questions[gameState.currentQuestion];
    document.getElementById('question-text').innerText = qData.q;
    const grid = document.getElementById('answer-grid');
    grid.innerHTML = '';
    
    qData.a.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = `answer-opt opt-${index}`;
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(index);
        grid.appendChild(btn);
    });
    startTimer();
}

function startTimer() {
    gameState.timer = 10;
    document.getElementById('timer-circle').innerText = gameState.timer;
    gameState.timerId = setInterval(() => {
        gameState.timer--;
        document.getElementById('timer-circle').innerText = gameState.timer;
        if (gameState.timer <= 0) {
            clearInterval(gameState.timerId);
            document.querySelectorAll('.answer-opt').forEach(btn => btn.disabled = true);
        }
    }, 1000);
}

function handleAnswer(selectedIndex) {
    if (gameState.isAnswered) return;
    gameState.isAnswered = true;
    
    const correct = questions[gameState.currentQuestion].correct;
    if (selectedIndex === correct) {
        gameState.score += (gameState.timer * 100) + 100;
        db.ref(`sessions/${gameState.sessionId}/leaderboard/${gameState.playerName}`).set(gameState.score);
    }
    
    // Log response for the bar chart
    db.ref(`sessions/${gameState.sessionId}/responses/${selectedIndex}`).transaction(c => (c || 0) + 1);
    
    document.getElementById('player-score-display').innerText = `Score: ${gameState.score}`;
    document.querySelectorAll('.answer-opt').forEach(btn => btn.disabled = true);
}

/**
 * CREATOR CONTROLS
 */
function nextQuestion() {
    if (gameState.currentQuestion >= questions.length - 1) {
        db.ref(`sessions/${gameState.sessionId}`).update({ status: "finished" });
        return;
    }
    db.ref(`sessions/${gameState.sessionId}/responses`).remove();
    db.ref(`sessions/${gameState.sessionId}`).update({ currentQuestion: gameState.currentQuestion + 1 });
}

function updateAudienceView() {
    // Sync Leaderboard
    db.ref(`sessions/${gameState.sessionId}/leaderboard`).orderByValue().limitToLast(5).on('value', snap => {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = "";
        snap.forEach(child => {
            list.innerHTML = `<div class="board-row"><span>${child.key}</span><span>${child.val()}</span></div>` + list.innerHTML;
        });
    });

    // Sync Response Chart
    db.ref(`sessions/${gameState.sessionId}/responses`).on('value', snap => {
        const data = snap.val() || {};
        const currentQ = questions[gameState.currentQuestion];
        if (!currentQ) return;

        const countBox = document.getElementById('correct-count-box');
        if (Object.keys(data).length > 0) {
            countBox.classList.remove('hidden');
            document.getElementById('correct-total').innerText = data[currentQ.correct] || 0;
        }

        for (let i = 0; i < 4; i++) {
            const bar = document.getElementById(`bar-${i}`);
            bar.style.height = `${(data[i] || 0) * 20}px`;
            bar.innerText = data[i] || "";
        }
    });
}

/**
 * END GAME
 */
function showResults() {
    showScreen('result-screen');
    
    db.ref(`sessions/${gameState.sessionId}/leaderboard`).orderByValue().limitToLast(1).once('value', snap => {
        let winner = "No one!";
        let highScore = 0;
        snap.forEach(c => { winner = c.key; highScore = c.val(); });
        
        document.getElementById('winner-podium').innerHTML = `
            <h1 style="font-size:4rem">👑</h1>
            <h3>Winner: ${winner}</h3>
            <p>Score: ${highScore}</p>
            <hr>
            <p>Your Final Score: ${gameState.score}</p>
        `;
    });
}