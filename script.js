// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDy6NACds1W1t-JKgII9nbeM8pvFIIiRgg",
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

function showEditor() {
    // Hide the landing screen
    document.getElementById('role-screen').classList.add('hidden');
    // Show the editor card
    document.getElementById('editor-screen').classList.remove('hidden');
}

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
            document.getElementById('opt-1-in').value,
            document.getElementById('opt-2-in').value,
            document.getElementById('opt-3-in').value
        ],
        correct: parseInt(document.getElementById('correct-opt').value)
    };

    questions.push(qObj);
    
    // Clear inputs for the next question
    document.querySelectorAll('#editor-screen input').forEach(i => i.value = "");
    
    // Show the "Start" button now that we have questions
    document.getElementById('start-session-btn').style.display = "block";
    
    alert(`Question ${questions.length} saved!`);
}

async function initSession(role) {
    if (role === 'creator' && questions.length === 0) return alert("Add questions first!");

    gameState.role = role;
    gameState.playerName = document.getElementById('player-name').value || "Anonymous";
    gameState.sessionId = (role === 'player') ? document.getElementById('join-code').value : Math.floor(1000 + Math.random() * 9000).toString();

    if (!gameState.sessionId) return alert("PIN Required");

    try {
        await firebase.auth().signInAnonymously();
        const sessionRef = db.ref('sessions/' + gameState.sessionId);

        if (role === 'creator') {
            await sessionRef.set({
                questions: questions,
                currentQuestion: 0,
                status: "active"
            });
            document.getElementById('editor-screen').classList.add('hidden');
            document.getElementById('audience-screen').classList.remove('hidden');
            document.getElementById('big-pin-display').innerText = gameState.sessionId;
            updateAudienceView();
        } else {
            document.getElementById('role-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
        }

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
    } catch (e) { alert(e.message); }
}

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
    db.ref(`sessions/${gameState.sessionId}/responses/${selectedIndex}`).transaction(c => (c || 0) + 1);
    document.getElementById('player-score-display').innerText = `Score: ${gameState.score}`;
    document.querySelectorAll('.answer-opt').forEach(btn => btn.disabled = true);
}

function nextQuestion() {
    if (gameState.currentQuestion >= questions.length - 1) {
        db.ref(`sessions/${gameState.sessionId}`).update({ status: "finished" });
        return;
    }
    db.ref(`sessions/${gameState.sessionId}/responses`).remove();
    db.ref(`sessions/${gameState.sessionId}`).update({ currentQuestion: gameState.currentQuestion + 1 });
}

function updateAudienceView() {
    db.ref(`sessions/${gameState.sessionId}/leaderboard`).orderByValue().limitToLast(5).on('value', snap => {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = "";
        snap.forEach(child => {
            list.innerHTML = `<div class="board-row"><span>${child.key}</span><span>${child.val()}</span></div>` + list.innerHTML;
        });
    });

    db.ref(`sessions/${gameState.sessionId}/responses`).on('value', snap => {
        const data = snap.val() || {};
        const currentQ = questions[gameState.currentQuestion];
        if (!currentQ) return;

        const correctCount = data[currentQ.correct] || 0;
        const countBox = document.getElementById('correct-count-box');
        
        if (Object.keys(data).length > 0) {
            countBox.classList.remove('hidden');
            document.getElementById('correct-total').innerText = correctCount;
        } else {
            countBox.classList.add('hidden');
        }

        for (let i = 0; i < 4; i++) {
            const bar = document.getElementById(`bar-${i}`);
            bar.style.height = `${(data[i] || 0) * 30}px`;
            bar.innerText = data[i] || 0;
        }
    });
}

function showResults() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('result-screen').classList.remove('hidden');
    
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