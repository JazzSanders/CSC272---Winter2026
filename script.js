// 1. Firebase Config
const firebaseConfig = {
    apiKey: "223114775986",
    databaseURL: "https://quizgamewebapp-default-rtdb.firebaseio.com/",
    projectId: "quizgamewebapp",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

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

// --- SECTION 1: EDITOR LOGIC ---
function showEditor() {
    document.getElementById('role-screen').classList.add('hidden');
    document.getElementById('editor-screen').classList.remove('hidden');
}

function saveQuestion() {
    const qObj = {
        q: document.getElementById('q-input').value,
        a: [
            document.getElementById('opt-0-in').value,
            document.getElementById('opt-1-in').value,
            document.getElementById('opt-2-in').value,
            document.getElementById('opt-3-in').value
        ],
        correct: parseInt(document.getElementById('correct-opt').value)
    };
    questions.push(qObj);
    document.querySelectorAll('#editor-screen input').forEach(i => i.value = "");
    alert("Question Added!");
}

// --- SECTION 2: SESSION MGMT ---
async function initSession(role) {
    gameState.role = role;
    gameState.playerName = document.getElementById('player-name').value || "Anonymous";
    
    if (role === 'player') {
        gameState.sessionId = document.getElementById('join-code').value;
    } else {
        gameState.sessionId = Math.floor(1000 + Math.random() * 9000).toString();
    }

    if (!gameState.sessionId) return alert("PIN Required");

    // Anonymous Auth for Security Rules
    const userCredential = await firebase.auth().signInAnonymously();
    const uid = userCredential.user.uid;

    const sessionRef = db.ref('sessions/' + gameState.sessionId);

    if (role === 'creator') {
        sessionRef.set({
            creatorId: uid,
            questions: questions,
            currentQuestion: 0,
            status: "active"
        });
        document.getElementById('editor-screen').classList.add('hidden');
        document.getElementById('audience-screen').classList.remove('hidden');
        updateAudienceView();
    } else {
        document.getElementById('role-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    }

    // Listen for Game Sync
    sessionRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (role === 'player') questions = data.questions;
            if (data.currentQuestion !== gameState.currentQuestion) {
                gameState.currentQuestion = data.currentQuestion;
                if (gameState.currentQuestion < questions.length) {
                    loadQuestion();
                } else {
                    showResults();
                }
            }
        }
    });

    document.getElementById('session-info').innerText = `PIN: ${gameState.sessionId}`;
}

// --- SECTION 3: GAMEPLAY ---
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
        if (gameState.timer <= 0) clearInterval(gameState.timerId);
    }, 1000);
}

function handleAnswer(selectedIndex) {
    if (gameState.isAnswered) return;
    gameState.isAnswered = true;
    
    const correct = questions[gameState.currentQuestion].correct;
    if (selectedIndex === correct) {
        gameState.score += (gameState.timer * 100);
        db.ref(`sessions/${gameState.sessionId}/leaderboard/${gameState.playerName}`).set(gameState.score);
    }
    
    // Response chart
    db.ref(`sessions/${gameState.sessionId}/responses/${selectedIndex}`).transaction(c => (c || 0) + 1);
    
    document.getElementById('player-score-display').innerText = `Score: ${gameState.score}`;
    document.querySelectorAll('.answer-opt').forEach(btn => btn.disabled = true);
}

// --- SECTION 4: CREATOR CONTROLS ---
function nextQuestion() {
    // Responses for the next round
    db.ref(`sessions/${gameState.sessionId}/responses`).remove();
    db.ref(`sessions/${gameState.sessionId}`).update({
        currentQuestion: gameState.currentQuestion + 1
    });
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

    // Sync Chart
    db.ref(`sessions/${gameState.sessionId}/responses`).on('value', snap => {
        const data = snap.val() || {};
        for (let i = 0; i < 4; i++) {
            const count = data[i] || 0;
            document.getElementById(`bar-${i}`).style.height = `${count * 20}px`;
            document.getElementById(`bar-${i}`).innerText = count;
        }
    });
}

function showResults() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('audience-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('winner-podium').innerText = `Final Score: ${gameState.score}`;
}