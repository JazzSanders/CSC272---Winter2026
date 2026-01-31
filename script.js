// 1. Firebase Config (Using provided keys)
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
    role: null, // 'creator' or 'player'
    sessionId: null,
    currentQuestionIndex: -1,
    score: 0,
    timer: 10,
    timerId: null,
    playerName: "",
    gameStage: "question" // 'question' or 'reveal'
};

/** UI NAVIGATION */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

function setupJoinView() {
    showScreen('join-screen');
}

/** CREATOR: QUESTION MANAGEMENT */
function saveQuestion() {
    const qText = document.getElementById('q-input').value;
    const opts = [
        document.getElementById('opt-0-in').value,
        document.getElementById('opt-1-in').value,
        document.getElementById('opt-2-in').value,
        document.getElementById('opt-3-in').value
    ];
    
    if(!qText || !opts[0] || !opts[1]) {
        alert("Enter a question and at least two options.");
        return;
    }

    questions.push({
        q: qText,
        a: opts,
        correct: parseInt(document.getElementById('correct-opt').value)
    });

    // Reset UI
    document.getElementById('q-input').value = "";
    document.querySelectorAll('.editor-grid input').forEach(i => i.value = "");
    document.getElementById('start-session-btn').style.display = "block";
    alert(`Saved! Total questions: ${questions.length}`);
}

/** SESSION INITIALIZATION */
async function initSession(role) {
    gameState.role = role;
    
    // Auth Check
    await firebase.auth().signInAnonymously();

    if (role === 'creator') {
        if(questions.length === 0) return alert("Create questions first!");
        
        // Generate a random 4-digit PIN
        gameState.sessionId = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Create Session in DB
        await db.ref(`sessions/${gameState.sessionId}`).set({
            status: "lobby", // Lobby
            questions: questions,
            currentQuestion: -1,
            timestamp: Date.now()
        });

        // Show Lobby
        showScreen('host-lobby-screen');
        document.getElementById('lobby-pin-display').innerText = gameState.sessionId;
        
        // Listen for players joining in real-time
        listenForPlayers();

    } else {
        // PLAYER FLOW
        gameState.playerName = document.getElementById('player-name').value;
        gameState.sessionId = document.getElementById('join-code').value;

        if(!gameState.playerName || !gameState.sessionId) return alert("Name and PIN required.");

        // Check if session exists
        const sessionRef = db.ref(`sessions/${gameState.sessionId}`);
        const snapshot = await sessionRef.once('value');
        
        if(!snapshot.exists()) return alert("Invalid PIN");

        // Add player to lobby
        await db.ref(`sessions/${gameState.sessionId}/players/${gameState.playerName}`).set({
            score: 0
        });

        showScreen('player-game-screen');
        document.getElementById('answer-grid').innerHTML = "<h3>Waiting for host to start...</h3>";
        
        // Start listening to game state
        listenToGame();
    }
}

/** HOST: LOBBY LOGIC */
function listenForPlayers() {
    db.ref(`sessions/${gameState.sessionId}/players`).on('value', snapshot => {
        const list = document.getElementById('lobby-players');
        list.innerHTML = "";
        snapshot.forEach(child => {
            list.innerHTML += `<span class="player-chip">${child.key}</span>`;
        });
    });
}

function startActualGame() {
    // Transition from Lobby to Active Game
    gameState.gameStage = "question";
    db.ref(`sessions/${gameState.sessionId}`).update({
        status: "active",
        currentQuestion: 0, // Start Q1
        stage: "question" // Sync stage to Database
    });
    showScreen('host-game-screen');
    listenForHostLiveUpdates();
    loadHostQuestion(0);
}

/** HOST: LIVE GAME CONTROL */
// Button Handler
function handleHostAction() {
    const btnGame = document.getElementById('host-action-btn'); // Button on Game Screen
    
    if (gameState.gameStage === "question") {
        // Step 1: Reveal Answer -> Graph
        revealAnswer();
        btnGame.innerText = "Show Leaderboard >";
        gameState.gameStage = "reveal";
    } 
    else if (gameState.gameStage === "reveal") {
        // Step 2: Show Leaderboard -> Rankings
        showLeaderboard();
        gameState.gameStage = "leaderboard";
    }
    else if (gameState.gameStage === "leaderboard") {
        // Step 3: Next Question -> Loop back
        nextQuestion();
        gameState.gameStage = "question";
    }
}

function revealAnswer() {
    clearInterval(gameState.timerId); 
    const currentQ = questions[gameState.currentQuestionIndex];
    
    // Update Graph UI
    for(let i=0; i<4; i++) {
        const bar = document.getElementById(`bar-${i}`);
        if(i === currentQ.correct) {
            bar.classList.add('bar-correct');
            bar.classList.remove('bar-dimmed');
        } else {
            bar.classList.add('bar-dimmed');
            bar.classList.remove('bar-correct');
        }
    }

    // Notify Players
    db.ref(`sessions/${gameState.sessionId}`).update({ stage: "reveal" });
}

// Leaderboard Logic
async function showLeaderboard() {
    // Switch Screen
    showScreen('host-leaderboard-screen');
    
    // Update DB status so players know to look at host screen
    db.ref(`sessions/${gameState.sessionId}`).update({ stage: "leaderboard" });

    // Fetch Players and Sort
    const snapshot = await db.ref(`sessions/${gameState.sessionId}/players`).once('value');
    const playersData = snapshot.val() || {};
    
    // Convert Object to Array: [{name: 'Bob', score: 100}, ...]
    let sortedPlayers = Object.keys(playersData).map(key => ({
        name: key,
        score: playersData[key].score || 0
    }));

    // Sort Descending (High to Low)
    sortedPlayers.sort((a, b) => b.score - a.score);

    // Render Top 5
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = "";
    
    sortedPlayers.slice(0, 5).forEach((p, index) => {
        const rankClass = index < 3 ? `rank-${index + 1}` : '';
        list.innerHTML += `
            <div class="leaderboard-row ${rankClass}">
                <span>#${index + 1} ${p.name}</span>
                <span>${p.score} pts</span>
            </div>
        `;
    });
}

function loadHostQuestion(index) {
    if(!questions[index]) return finishGame();

    gameState.currentQuestionIndex = index;
    gameState.gameStage = "question"; 
    
    // Ensure we are on the Game Screen (in case coming from Leaderboard)
    showScreen('host-game-screen');
    document.getElementById('host-action-btn').innerText = "Show Answer";

    const q = questions[index];
    document.getElementById('host-question-text').innerText = q.q;
    document.getElementById('host-q-counter').innerText = `Q: ${index + 1}/${questions.length}`;
    
    // Reset Chart Visuals
    [0,1,2,3].forEach(i => {
        const bar = document.getElementById(`bar-${i}`);
        bar.style.height = '0%';
        bar.innerText = '0';
        bar.classList.remove('bar-dimmed', 'bar-correct');
    });

    // Reset DB for new question
    db.ref(`sessions/${gameState.sessionId}/responses`).remove();
    db.ref(`sessions/${gameState.sessionId}`).update({
        stage: "question",
        currentQuestion: index
    });

    runTimer('host-timer');
}

function nextQuestion() {
    const nextIdx = gameState.currentQuestionIndex + 1;
    if(nextIdx >= questions.length) {
        finishGame();
    } else {
        db.ref(`sessions/${gameState.sessionId}`).update({ currentQuestion: nextIdx });
        loadHostQuestion(nextIdx);
    }
}

function listenForHostLiveUpdates() {
    // Listen for responses to update Bar Chart
    db.ref(`sessions/${gameState.sessionId}/responses`).on('value', snapshot => {
        const data = snapshot.val() || {};
        const total = Object.values(data).reduce((a,b) => a+b, 0); // Total votes

        for(let i=0; i<4; i++) {
            const count = data[i] || 0;
            const bar = document.getElementById(`bar-${i}`);
            // Calculate percentage for height (Max 100%)
            const pct = total > 0 ? (count / total) * 100 : 0;
            
            bar.style.height = `${pct}%`;
            bar.innerText = count;
        }
    });
}

function loadHostQuestion(index) {
    if(!questions[index]) return finishGame();

    gameState.currentQuestionIndex = index;
    const q = questions[index];
    
    document.getElementById('host-question-text').innerText = q.q;
    document.getElementById('host-q-counter').innerText = `Q: ${index + 1}/${questions.length}`;
    
    // Reset Chart
    [0,1,2,3].forEach(i => {
        document.getElementById(`bar-${i}`).style.height = '0%';
        document.getElementById(`bar-${i}`).innerText = '0';
    });

    // Reset DB responses for this question
    db.ref(`sessions/${gameState.sessionId}/responses`).remove();

    runTimer('host-timer', () => {
        // Optional: Reveal answer on host screen automatically
    });
}

function nextQuestion() {
    const nextIdx = gameState.currentQuestionIndex + 1;
    if(nextIdx >= questions.length) {
        finishGame();
    } else {
        db.ref(`sessions/${gameState.sessionId}`).update({ currentQuestion: nextIdx });
        loadHostQuestion(nextIdx);
    }
}

/** PLAYER: GAME LOGIC */
function listenToGame() {
    db.ref(`sessions/${gameState.sessionId}`).on('value', snapshot => {
        const data = snapshot.val();
        if(!data) return;

        if(data.status === "finished") {
            showResults(data.winner);
            return;
        }

        // HANDLE STAGES
        if (data.stage === "reveal") {
            const currentQ = data.questions[data.currentQuestion];
            const correctText = currentQ.a[currentQ.correct];
            
            document.getElementById('reveal-overlay').classList.remove('hidden');
            document.getElementById('correct-answer-text').innerText = correctText;
        } 
        else if (data.stage === "leaderboard") {
            // Handle Leaderboard State
            document.getElementById('reveal-overlay').classList.add('hidden');
            document.getElementById('answer-grid').innerHTML = 
                `<h3 style="text-align:center; margin-top:50px;">
                    👀 Eyes on the Host Screen!<br>Checking scores...
                 </h3>`;
        }
        else if (data.currentQuestion !== gameState.currentQuestionIndex || data.stage === "question") {
            // Load New Question
            gameState.currentQuestionIndex = data.currentQuestion;
            questions = data.questions; 
            document.getElementById('reveal-overlay').classList.add('hidden');
            renderPlayerQuestion(data.questions[data.currentQuestion]);
        }
    });
}

function renderPlayerQuestion(qData) {
    const grid = document.getElementById('answer-grid');
    grid.innerHTML = '';
    document.getElementById('feedback-msg').innerText = "";
    
    // Show waiting animation logic could go here if using "Show Question" vs "Show Answers" states
    
    qData.a.forEach((opt, idx) => {
        if(opt !== "---") { // Filter empty options
            const btn = document.createElement('button');
            btn.className = `answer-opt opt-${idx}`;
            btn.innerText = opt; // In Kahoot usually shapes, but here text
            btn.onclick = () => submitAnswer(idx, qData.correct);
            grid.appendChild(btn);
        }
    });

    runTimer('player-timer-circle', () => {
        document.querySelectorAll('.answer-opt').forEach(b => b.disabled = true);
    });
}

function submitAnswer(idx, correctIdx) {
    // Disable buttons
    document.querySelectorAll('.answer-opt').forEach(b => b.disabled = true);

    const isCorrect = (idx === correctIdx);
    const feedback = document.getElementById('feedback-msg');
    
    if(isCorrect) {
        // Calculate Score: (Time remaining * 100)
        const points = (gameState.timer * 100) + 50; 
        gameState.score += points;
        feedback.innerText = "Correct! +" + points;
        feedback.style.color = "var(--green)";
        
        // Update Score in DB
        db.ref(`sessions/${gameState.sessionId}/players/${gameState.playerName}/score`).set(gameState.score);
    } else {
        feedback.innerText = "Incorrect!";
        feedback.style.color = "var(--red)";
    }

    document.getElementById('player-score-display').innerText = `Score: ${gameState.score}`;

    // Record response count for Host Graph
    db.ref(`sessions/${gameState.sessionId}/responses/${idx}`).transaction(val => (val || 0) + 1);
}

/** SHARED UTILS */
function runTimer(elemId, onFinish) {
    gameState.timer = 10;
    const el = document.getElementById(elemId);
    if(el) el.innerText = 10;
    
    if(gameState.timerId) clearInterval(gameState.timerId);
    
    gameState.timerId = setInterval(() => {
        gameState.timer--;
        if(el) el.innerText = gameState.timer;
        
        if(gameState.timer <= 0) {
            clearInterval(gameState.timerId);
            if(onFinish) onFinish();
        }
    }, 1000);
}

/** END GAME */
async function finishGame() {
    // HOST calculates winner to ensure single source of truth
    const playersRef = db.ref(`sessions/${gameState.sessionId}/players`);
    const snap = await playersRef.once('value');
    let bestPlayer = "No One";
    let maxScore = -1;

    snap.forEach(p => {
        if(p.val().score > maxScore) {
            maxScore = p.val().score;
            bestPlayer = p.key;
        }
    });

    // Write winner to DB so all players see it
    await db.ref(`sessions/${gameState.sessionId}`).update({
        status: "finished",
        winner: { name: bestPlayer, score: maxScore }
    });
    
    showResults({ name: bestPlayer, score: maxScore });
}

function showResults(winnerObj) {
    showScreen('result-screen');
    const container = document.getElementById('winner-display');
    
    // If passed directly or waiting for DB update
    if(!winnerObj) return; 

    container.innerHTML = `
        <div style="font-size: 5rem">👑</div>
        <h1 style="font-size: 3rem">${winnerObj.name || winnerObj}</h1>
        <h3>Score: ${winnerObj.score || 0}</h3>
    `;
}