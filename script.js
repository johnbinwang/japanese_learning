// 日语动词练习数据
const verbQuestions = [
    {
        verb: "食べる (taberu)",
        question: "过去式是？",
        options: ["食べた", "食べました", "食べて", "食べない"],
        correct: 1,
        explanation: "食べました是食べる的丁寧语过去式"
    },
    {
        verb: "行く (iku)",
        question: "否定形是？",
        options: ["行かない", "行きません", "行った", "行って"],
        correct: 0,
        explanation: "行かない是行く的否定形"
    },
    {
        verb: "見る (miru)",
        question: "て形是？",
        options: ["見た", "見て", "見ない", "見ます"],
        correct: 1,
        explanation: "見て是見る的て形"
    },
    {
        verb: "書く (kaku)",
        question: "丁寧语现在式是？",
        options: ["書いた", "書かない", "書きます", "書いて"],
        correct: 2,
        explanation: "書きます是書く的丁寧语现在式"
    },
    {
        verb: "読む (yomu)",
        question: "过去式是？",
        options: ["読んだ", "読みます", "読まない", "読んで"],
        correct: 0,
        explanation: "読んだ是読む的过去式"
    }
];

// 游戏状态
let currentQuestionIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let totalCount = 0;
let answered = false;

// DOM元素
const verbBase = document.querySelector('.verb-base');
const questionText = document.querySelector('.question-text');
const optionBtns = document.querySelectorAll('.option-btn');
const result = document.getElementById('result');
const nextBtn = document.getElementById('nextBtn');
const correctCountEl = document.getElementById('correct-count');
const wrongCountEl = document.getElementById('wrong-count');
const totalCountEl = document.getElementById('total-count');
const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

// 初始化
function init() {
    loadQuestion();
    updateScore();
    setupNavigation();
}

// 加载题目
function loadQuestion() {
    if (currentQuestionIndex >= verbQuestions.length) {
        currentQuestionIndex = 0;
    }
    
    const question = verbQuestions[currentQuestionIndex];
    verbBase.textContent = question.verb;
    questionText.textContent = question.question;
    
    optionBtns.forEach((btn, index) => {
        btn.textContent = question.options[index];
        btn.className = 'option-btn';
        btn.disabled = false;
    });
    
    result.textContent = '';
    result.className = 'result';
    nextBtn.style.display = 'none';
    answered = false;
}

// 检查答案
function checkAnswer(selectedIndex) {
    if (answered) return;
    
    answered = true;
    totalCount++;
    
    const question = verbQuestions[currentQuestionIndex];
    const isCorrect = selectedIndex === question.correct;
    
    if (isCorrect) {
        correctCount++;
        result.textContent = `正确！${question.explanation}`;
        result.className = 'result correct';
        optionBtns[selectedIndex].classList.add('correct');
    } else {
        wrongCount++;
        result.textContent = `错误！正确答案是：${question.options[question.correct]}。${question.explanation}`;
        result.className = 'result wrong';
        optionBtns[selectedIndex].classList.add('wrong');
        optionBtns[question.correct].classList.add('correct');
    }
    
    // 禁用所有按钮
    optionBtns.forEach(btn => btn.disabled = true);
    
    // 显示下一题按钮
    nextBtn.style.display = 'block';
    
    updateScore();
}

// 下一题
function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

// 更新分数
function updateScore() {
    correctCountEl.textContent = correctCount;
    wrongCountEl.textContent = wrongCount;
    totalCountEl.textContent = totalCount;
}

// 设置导航
function setupNavigation() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSection = btn.dataset.section;
            
            // 更新导航按钮状态
            navBtns.forEach(navBtn => navBtn.classList.remove('active'));
            btn.classList.add('active');
            
            // 显示对应区域
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetSection) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// 事件监听器
optionBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => checkAnswer(index));
});

nextBtn.addEventListener('click', nextQuestion);

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '4') {
        const index = parseInt(e.key) - 1;
        if (!answered && optionBtns[index]) {
            checkAnswer(index);
        }
    } else if (e.key === 'Enter' && nextBtn.style.display === 'block') {
        nextQuestion();
    }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 重置游戏
function resetGame() {
    currentQuestionIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    totalCount = 0;
    loadQuestion();
    updateScore();
}

// 添加重置按钮功能（如果需要的话）
window.resetGame = resetGame;