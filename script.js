const questions = [
    { q: "Which language runs in a web browser?", a: ["Java", "C", "Python", "JavaScript"], correct: 3 },
    { q: "What does CSS stand for?", a: ["Color Style Sheets", "Cascading Style Sheets", "Creative Style System", "Computer Style Sheets"], correct: 1 }
];

let gameState = {
    role: null,
    currentQuestion: 0,
    score: 0,
    timer: 10,
    timerId: null,
    isAnswered: false
};

function initSession(role) {
    gameState.role = role;
    if (role === 'player' && !document.getElementById('join-code').value) {
        alert("Enter a PIN!"); return;
    }
    document.getElementById('role-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    loadQuestion();
}

function loadQuestion() {
    gameState.isAnswered = false;
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
    updateTimerUI();
    gameState.timerId = setInterval(() => {
        gameState.timer--;
        updateTimerUI();
        if (gameState.timer <= 0) {
            clearInterval(gameState.timerId);
            nextStep();
        }
    }, 1000);
}

function updateTimerUI() {
    document.getElementById('timer-circle').innerText = gameState.timer;
}

function handleAnswer(selectedIndex) {
    if (gameState.isAnswered) return;
    gameState.isAnswered = true;
    
    const correct = questions[gameState.currentQuestion].correct;
    if (selectedIndex === correct) {
        gameState.score += (gameState.timer * 100); // Speed-based scoring
        document.getElementById('player-score-display').innerText = `Score: ${gameState.score}`;
    }
    
    // Visual feedback
    document.querySelectorAll('.answer-opt').forEach(btn => btn.disabled = true);
}

function nextStep() {
    gameState.currentQuestion++;
    if (gameState.currentQuestion < questions.length) {
        loadQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('winner-podium').innerHTML = `
        <h3>Final Score: ${gameState.score}</h3>
        <p>${gameState.score > 0 ? "🏆 High Score!" : "Better luck next time!"}</p>
    `;
}