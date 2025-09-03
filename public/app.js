// 全局状态
const state = {
    currentModule: 'verb',
    currentMode: 'quiz',
    currentQuestion: null,
    selectedForms: [],
    selectedModule: 'all',
    settings: {
        dueOnly: false,
        showExplain: true,
        enabledForms: []
    },
    user: {
        anonId: null,
        accessCode: null
    },
    isFlashcardFlipped: false
};

// 变形形式定义
const FORMS = {
    verb: [
        { id: 'masu', name: 'ます形', desc: '丁宁形' },
        { id: 'te', name: 'て形', desc: '连用形' },
        { id: 'nai', name: 'ない形', desc: '否定形' },
        { id: 'ta', name: 'た形', desc: '过去形' },
        { id: 'potential', name: '可能形', desc: '可能形' },
        { id: 'volitional', name: '意志形', desc: '意志形' }
    ],
    adj: [
        { id: 'negative', name: '否定形', desc: '否定形' },
        { id: 'past', name: '过去形', desc: '过去形' },
        { id: 'past_negative', name: '过去否定', desc: '过去否定形' },
        { id: 'adverb', name: '副词形', desc: '副词形' },
        { id: 'te', name: 'て形', desc: 'て形' },
        { id: 'rentai', name: '连体形', desc: '连体形' }
    ],
    plain: [
        { id: 'plain_present', name: '简体现在', desc: '简体现在形' },
        { id: 'plain_past', name: '简体过去', desc: '简体过去形' },
        { id: 'plain_negative', name: '简体否定', desc: '简体否定形' },
        { id: 'plain_past_negative', name: '简体过去否定', desc: '简体过去否定形' }
    ]
};

// API 调用函数
class API {
    static async request(endpoint, options = {}) {
        try {
    
            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            showToast('网络错误，请稍后重试', 'error');
            throw error;
        }
    }
    
    static async getUser() {
        return this.request('/api/me');
    }
    
    static async updateSettings(settings) {
        return this.request('/api/settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        });
    }
    
    static async getNext(module, selectedForms = [], mode = 'quiz') {
        const formsParam = selectedForms.length > 0 ? `&forms=${selectedForms.join(',')}` : '';
        const modeParam = `&mode=${mode}`;
        // 添加时间戳参数防止缓存
        const timestamp = Date.now();
        return this.request(`/api/next?module=${module}${formsParam}${modeParam}&_t=${timestamp}`, {
            cache: 'no-cache'
        });
    }
    
    static async submit(data) {
        return this.request('/api/submit', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    static async getProgress(module) {
        return this.request(`/api/progress?module=${module}`);
    }
    
    static async bindDevice(accessCode) {
        return this.request('/api/me', {
            method: 'POST',
            headers: {
                'X-Access-Code': accessCode
            }
        });
    }
}

// 路由管理
class Router {
    constructor() {
        this.routes = {
            'learn': () => this.showPage('learn'),
            'progress': () => this.showPage('progress'),
            'settings': () => this.showPage('settings')
        };
        
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }
    
    handleRoute() {
        const hash = window.location.hash.slice(1) || 'learn';
        const route = this.routes[hash];
        
        if (route) {
            route();
        } else {
            this.navigate('learn');
        }
    }
    
    navigate(page) {
        window.location.hash = page;
    }
    
    showPage(pageId) {
        // 隐藏所有页面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // 显示目标页面
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNav = document.querySelector(`[data-page="${pageId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
        }
        
        // 页面特定初始化
        if (pageId === 'progress') {
            this.loadProgress();
        } else if (pageId === 'settings') {
            this.loadSettings();
        }
    }
    
    async loadProgress() {
        try {
            // 初始化进度页面
            initProgressPage();
        } catch (error) {
            console.error('Failed to load progress:', error);
        }
    }
    
    async loadSettings() {
        try {
            const userData = await API.getUser();
            updateSettingsDisplay(userData);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
}

// 学习功能
class LearningManager {
    constructor() {
        this.initializeEventListeners();
        this.updateFormChips();
    }
    
    initializeEventListeners() {
        // 模块选择
        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                this.selectModule(module);
            });
        });
        
        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.selectMode(mode);
            });
        });
        
        // 开始练习
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startPractice();
        });
        
        // 提交答案
        document.getElementById('submit-btn').addEventListener('click', () => {
            this.submitAnswer();
        });
        
        // 下一题
        document.getElementById('next-btn').addEventListener('click', () => {
            this.nextQuestion();
        });
        
        // 闪卡翻转
        document.getElementById('flip-btn').addEventListener('click', () => {
            this.flipFlashcard();
        });
        
        // 闪卡反馈
        document.querySelectorAll('.feedback-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const feedback = e.currentTarget.dataset.feedback;
                this.submitFlashcardFeedback(feedback);
            });
        });
        
        // 答案输入回车提交
        document.getElementById('answer-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitAnswer();
            }
        });
    }
    
    selectModule(module) {
        state.currentModule = module;
        
        // 更新按钮状态
        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-module="${module}"]`).classList.add('active');
        
        // 更新形态选择
        this.updateFormChips();
        
        // 从设置中恢复当前模块的已启用变形类型
        const currentModuleForms = FORMS[module].map(f => f.id);
        state.selectedForms = state.settings.enabledForms.filter(formId => 
            currentModuleForms.includes(formId)
        );
        
        // 如果当前模块没有选中任何变形形态，则默认选中所有可用的变形形态
        if (state.selectedForms.length === 0) {
            state.selectedForms = [...currentModuleForms];
        }
        
        this.updateFormSelection();
        
        // 重置练习区域
        this.resetPracticeArea();
    }
    
    selectMode(mode) {
        state.currentMode = mode;
        
        // 更新按钮状态
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
        
        // 重置练习区域
        this.resetPracticeArea();
    }
    
    updateFormChips() {
        const container = document.getElementById('form-chips');
        const forms = FORMS[state.currentModule] || [];
        
        container.innerHTML = forms.map(form => `
            <div class="form-chip" data-form="${form.id}">
                ${form.name}
            </div>
        `).join('');
        
        // 添加点击事件
        container.querySelectorAll('.form-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const formId = e.currentTarget.dataset.form;
                this.toggleForm(formId);
            });
        });
    }
    
    toggleForm(formId) {
        const index = state.selectedForms.indexOf(formId);
        if (index > -1) {
            state.selectedForms.splice(index, 1);
        } else {
            state.selectedForms.push(formId);
        }
        
        this.updateFormSelection();
        
        // 重置练习区域
        this.resetPracticeArea();
    }
    
    updateFormSelection() {
        document.querySelectorAll('.form-chip').forEach(chip => {
            const formId = chip.dataset.form;
            if (state.selectedForms.includes(formId)) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }
    
    resetPracticeArea() {
        // 清空当前题目状态
        state.currentQuestion = null;
        state.isFlashcardFlipped = false;
        
        // 隐藏所有练习卡片
        document.getElementById('quiz-card').style.display = 'none';
        document.getElementById('flashcard').style.display = 'none';
        
        // 显示开始按钮
        document.querySelector('.start-section').style.display = 'block';
        
        // 重置测验卡片状态
        const resultSection = document.getElementById('result-section');
        if (resultSection) {
            resultSection.style.display = 'none';
        }
        
        const answerInput = document.getElementById('answer-input');
        if (answerInput) {
            answerInput.value = '';
            answerInput.disabled = false;
        }
        
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.style.display = 'inline-block';
        }
        
        // 重置闪卡状态
        const cardFront = document.getElementById('card-front');
        const cardBack = document.getElementById('card-back');
        if (cardFront && cardBack) {
            cardFront.style.display = 'block';
            cardBack.style.display = 'none';
        }
    }
    
    async startPractice() {
        if (state.selectedForms.length === 0) {
            showToast('请至少选择一种变形形式', 'error');
            return;
        }
        
        try {
            showLoading(true);
            
            // 将选择的变形类型同步到设置中
            state.settings.enabledForms = [...state.selectedForms];
            await API.updateSettings({
                enabledForms: state.settings.enabledForms
            });
            
            await this.loadNextQuestion();
            this.showPracticeCard();
        } catch (error) {
            console.error('Failed to start practice:', error);
        } finally {
            showLoading(false);
        }
    }
    
    async loadNextQuestion() {
        const data = await API.getNext(state.currentModule, state.selectedForms, state.currentMode);
        state.currentQuestion = data;
        
        state.isFlashcardFlipped = false;
        
        this.displayQuestion();
    }
    
    displayQuestion() {
        const q = state.currentQuestion;
        if (!q) return;
        
        // 清理单词文本，去掉末尾的数字
        const cleanKanji = this.cleanWordText(q.kanji);
        const cleanKana = this.cleanWordText(q.kana);
        const cleanMeaning = this.cleanWordText(q.meaning);
        
        // 更新测验卡片
        document.getElementById('word-main').textContent = cleanKanji || cleanKana;
        document.getElementById('word-reading').textContent = cleanKana;
        document.getElementById('word-meaning').textContent = cleanMeaning;
        document.getElementById('target-form').textContent = this.getFormName(q.targetForm);
        
        // 更新闪卡
        document.getElementById('fc-word-main').textContent = cleanKanji || cleanKana;
        document.getElementById('fc-word-reading').textContent = cleanKana;
        document.getElementById('fc-word-meaning').textContent = cleanMeaning;
        document.getElementById('fc-target-form').textContent = this.getFormName(q.targetForm);
        
        // 重置输入和结果
        document.getElementById('answer-input').value = '';
        document.getElementById('result-section').style.display = 'none';
        document.getElementById('card-back').style.display = 'none';
        document.getElementById('card-front').style.display = 'block';
    }
    
    // 清理单词文本，去掉末尾的数字
    cleanWordText(text) {
        if (!text) return text;
        // 去掉末尾的数字（包括可能的空格，以及可选的半角/全角括号）
        return String(text).replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
    }
    
    getFormName(formId) {
        const forms = FORMS[state.currentModule] || [];
        const form = forms.find(f => f.id === formId);
        return form ? form.name : formId;
    }
    
    showPracticeCard() {
        document.querySelector('.start-section').style.display = 'none';
        
        if (state.currentMode === 'quiz') {
            document.getElementById('quiz-card').style.display = 'block';
            document.getElementById('flashcard').style.display = 'none';
            document.getElementById('answer-input').focus();
        } else {
            document.getElementById('quiz-card').style.display = 'none';
            document.getElementById('flashcard').style.display = 'block';
        }
    }
    
    async submitAnswer() {
        const userAnswer = document.getElementById('answer-input').value.trim();
        if (!userAnswer) {
            showToast('请输入答案', 'error');
            return;
        }
        

        
        try {
            showLoading(true);
            
            const submitData = {
                itemType: state.currentModule === 'verb' ? 'vrb' : 
                         state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: state.currentQuestion.itemId,
                form: state.currentQuestion.targetForm,
                userAnswer: userAnswer,
                mode: state.currentMode
            };
            
            const result = await API.submit(submitData);
            
            this.showResult(result);
        } catch (error) {
            console.error('Failed to submit answer:', error);
        } finally {
            showLoading(false);
        }
    }
    
    showResult(result) {
        const resultSection = document.getElementById('result-section');
        const statusEl = document.getElementById('result-status');
        const answerEl = document.getElementById('correct-answer');
        const explanationEl = document.getElementById('explanation');
        
        statusEl.textContent = result.correct ? '正确！' : '错误';
        statusEl.className = `result-status ${result.correct ? 'correct' : 'incorrect'}`;
        
        answerEl.textContent = result.correctAnswer;
        
        if (state.settings.showExplain && result.explanation) {
            explanationEl.textContent = result.explanation;
            explanationEl.style.display = 'block';
        } else {
            explanationEl.style.display = 'none';
        }
        
        resultSection.style.display = 'block';
        
        if (result.correct) {
            showToast('回答正确！', 'success');
        }
    }
    
    flipFlashcard() {
        const front = document.getElementById('card-front');
        const back = document.getElementById('card-back');
        
        if (!state.isFlashcardFlipped) {
            // 显示答案 - 直接使用后端返回的correctAnswer
            const q = state.currentQuestion;
            // 直接使用后端返回的correctAnswer字段
            const correctAnswer = q.correctAnswer || '无答案';
            
            document.getElementById('fc-answer').textContent = correctAnswer;
            
            // 使用现有的解释方法
            let explanation = '';
            if (state.currentModule === 'verb') {
                explanation = this.getVerbExplanation(q.targetForm, q.group);
            } else if (state.currentModule === 'adj') {
                explanation = this.getAdjectiveExplanation(q.targetForm, q.type);
            } else if (state.currentModule === 'plain') {
                // 简体形模块需要根据实际题目类型来显示explanation
                if (q.itemType === 'vrb') {
                    explanation = this.getPlainFormExplanation(q.targetForm, q.group);
                } else if (q.itemType === 'adj') {
                    explanation = this.getAdjectiveExplanation(q.targetForm, q.type);
                } else {
                    explanation = '简体形式';
                }
            } else {
                explanation = '简体形式';
            }
            document.getElementById('fc-explanation').textContent = explanation || '';
            
            front.style.display = 'none';
            back.style.display = 'block';
            state.isFlashcardFlipped = true;
        }
    }
    
    generateAnswer(question) {
        if (!question) return { text: '无答案', explanation: '问题数据缺失' };
        
        const { kana, kanji, targetForm, group, type } = question;
        const base = kanji || kana;
        
        if (state.currentModule === 'verb') {
            const answer = this.conjugateVerb({ kana, kanji, group }, targetForm);
            const explanation = this.getVerbExplanation(targetForm, group);
            return { text: answer, explanation };
        } else if (state.currentModule === 'adj') {
            const answer = this.conjugateAdjective({ kana, kanji, type }, targetForm);
            const explanation = this.getAdjectiveExplanation(targetForm, type);
            return { text: answer, explanation };
        } else if (state.currentModule === 'plain') {
            // 简体形变形
            const answer = this.conjugateVerb({ kana, kanji, group }, targetForm);
            const explanation = this.getPlainFormExplanation(targetForm, group);
            return { text: answer, explanation };
        } else {
            return { text: base, explanation: '简体形式' };
        }
    }
    
    conjugateVerb(verb, form) {
        const { kana, kanji, group } = verb;
        const base = kanji || kana;
        
        // 防护逻辑：如果group信息缺失或无效，根据动词词尾推断类型
        let normalizedGroup = group;
        if (!group || group.trim() === '') {
            normalizedGroup = this.inferVerbGroup(base);
            console.log(`警告: 动词 ${base} 缺少group信息，推断为 ${normalizedGroup} 类`);
        }
        
        switch (form) {
            case 'masu':
                return this.conjugateToMasu(base, normalizedGroup);
            case 'te':
                return this.conjugateToTe(base, normalizedGroup);
            case 'nai':
                return this.conjugateToNai(base, normalizedGroup);
            case 'ta':
                return this.conjugateToTa(base, normalizedGroup);
            case 'potential':
                return this.conjugateToPotential(base, normalizedGroup);
            case 'volitional':
                return this.conjugateToVolitional(base, normalizedGroup);
            // 简体形变形
            case 'plain_present':
                return base; // 简体现在形就是原形
            case 'plain_past':
                return this.conjugateToTa(base, normalizedGroup); // 简体过去形就是た形
            case 'plain_negative':
                return this.conjugateToNai(base, normalizedGroup); // 简体否定形就是ない形
            case 'plain_past_negative':
                return this.conjugateToNai(base, normalizedGroup).replace(/ない$/, 'なかった'); // 简体过去否定形
            default:
                return base;
        }
    }
    
    // 根据动词词尾推断动词类型
    inferVerbGroup(verb) {
        // 不规则动词
        if (verb === 'する' || verb === '来る' || verb === 'くる') {
            return 'irregular';
        }
        
        // 以する结尾的复合动词
        if (verb.endsWith('する') && verb !== 'する') {
            return 'irregular';
        }
        
        // 以来る结尾的复合动词
        if (verb.endsWith('来る') && verb !== '来る') {
            return 'irregular';
        }
        
        // II类动词（一段动词）：以る结尾，且倒数第二个假名是e段或i段
        if (verb.endsWith('る')) {
            const beforeRu = verb.slice(-2, -1);
            // e段：え、け、せ、て、ね、へ、め、れ、げ、ぜ、で、べ、ぺ
            // i段：い、き、し、ち、に、ひ、み、り、ぎ、じ、ぢ、び、ぴ
            const eRow = ['え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'];
            const iRow = ['い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ'];
            
            if (eRow.includes(beforeRu) || iRow.includes(beforeRu)) {
                return 'II';
            }
        }
        
        // 默认为I类动词（五段动词）
        return 'I';
    }
    
    conjugateToMasu(verb, group) {
        if (verb === 'する') return 'します';
        if (verb === '来る' || verb === 'くる') return 'きます';
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            const iRow = { 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち', 'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り', 'う': 'い' };
            return stem + (iRow[lastChar] || 'い') + 'ます';
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'ます';
        }
        return verb + 'ます';
    }
    
    conjugateToTe(verb, group) {
        if (verb === 'する') return 'して';
        if (verb === '来る' || verb === 'くる') return 'きて';
        if (verb === '行く' || verb === 'いく') return 'いって';
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            
            if (['く', 'ぐ'].includes(lastChar)) {
                return stem + (lastChar === 'く' ? 'いて' : 'いで');
            } else if (['す'].includes(lastChar)) {
                return stem + 'して';
            } else if (['つ', 'う', 'る'].includes(lastChar)) {
                return stem + 'って';
            } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
                return stem + 'んで';
            }
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'て';
        }
        return verb + 'て';
    }
    
    conjugateToNai(verb, group) {
        if (verb === 'する') return 'しない';
        if (verb === '来る' || verb === 'くる') return 'こない';
        if (verb === 'ある') return 'ない';
        
        // サ変动词（以する结尾的动词）
        if (verb.endsWith('する')) {
            return verb.slice(0, -2) + 'しない';
        }
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            const aRow = { 'く': 'か', 'ぐ': 'が', 'す': 'さ', 'つ': 'た', 'ぬ': 'な', 'ぶ': 'ば', 'む': 'ま', 'る': 'ら', 'う': 'わ' };
            return stem + (aRow[lastChar] || 'わ') + 'ない';
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'ない';
        }
        return verb + 'ない';
    }
    
    conjugateToTa(verb, group) {
        // 特殊处理：确保II类动词正确变形
        if (group === 'II') {
            // II类动词：去る+た
            return verb.slice(0, -1) + 'た';
        }
        
        // 其他情况使用て形转换
        const teForm = this.conjugateToTe(verb, group);
        return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
    }
    
    conjugateToPotential(verb, group) {
        if (verb === 'する') return 'できる';
        if (verb === '来る' || verb === 'くる') return 'こられる';
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            const eRow = { 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ', 'う': 'え' };
            return stem + (eRow[lastChar] || 'え') + 'る';
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'られる';
        }
        return verb + 'られる';
    }
    
    conjugateToVolitional(verb, group) {
        if (verb === 'する') return 'しよう';
        if (verb === '来る' || verb === 'くる') return 'こよう';
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            const oRow = { 'く': 'こ', 'ぐ': 'ご', 'す': 'そ', 'つ': 'と', 'ぬ': 'の', 'ぶ': 'ぼ', 'む': 'も', 'る': 'ろ', 'う': 'お' };
            return stem + (oRow[lastChar] || 'お') + 'う';
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'よう';
        }
        return verb + 'よう';
    }
    
    conjugateAdjective(adj, form) {
        const { kana, kanji, type } = adj;
        const base = kanji || kana;
        
        if (type === 'i') {
            return this.conjugateIAdjective(base, form);
        } else if (type === 'na') {
            return this.conjugateNaAdjective(base, form);
        }
        return base;
    }
    
    conjugateIAdjective(adj, form) {
        const stem = adj.slice(0, -1); // 去掉い
        
        switch (form) {
            case 'negative':
                return stem + 'くない';
            case 'past':
                return stem + 'かった';
            case 'past_negative':
                return stem + 'くなかった';
            case 'adverb':
                return stem + 'く';
            case 'te':
                return stem + 'くて';
            default:
                return adj;
        }
    }
    
    conjugateNaAdjective(adj, form) {
        switch (form) {
            case 'negative':
                return adj + 'じゃない';
            case 'past':
                return adj + 'だった';
            case 'past_negative':
                return adj + 'じゃなかった';
            case 'te':
                return adj + 'で';
            case 'rentai':
                return adj + 'な';
            default:
                return adj;
        }
    }
    
    getVerbExplanation(form, group) {
        // 数据清理：去除空格并转换为标准格式
        const cleanGroup = this.normalizeVerbGroup(group);
        
        const explanations = {
            'masu': cleanGroup === 'I' ? 'I类动词ます形：词尾变i段+ます（如：飲む→飲みます）' : cleanGroup === 'II' ? 'II类动词ます形：去る+ます（如：食べる→食べます）' : '不规则动词ます形',
            'te': cleanGroup === 'I' ? 'I类动词て形：く→いて，ぐ→いで，む/ぶ/ぬ→んで，る/う/つ→って' : cleanGroup === 'II' ? 'II类动词て形：去る+て（如：食べる→食べて）' : '不规则动词て形',
            'nai': cleanGroup === 'I' ? 'I类动词ない形：词尾变a段+ない（如：飲む→飲まない）' : cleanGroup === 'II' ? 'II类动词ない形：去る+ない（如：食べる→食べない）' : '不规则动词ない形',
            'ta': cleanGroup === 'I' ? 'I类动词た形：る/う/つ→った，ぶ/む/ぬ→んだ，く→いた，ぐ→いだ，す→した（如：つくる→作った）' : cleanGroup === 'II' ? 'II类动词た形：去る+た（如：食べる→食べた）' : '不规则动词た形',
            'potential': cleanGroup === 'I' ? 'I类动词可能形：词尾变e段+る（如：飲む→飲める）' : cleanGroup === 'II' ? 'II类动词可能形：去る+られる（如：食べる→食べられる）' : '不规则动词可能形',
            'volitional': cleanGroup === 'I' ? 'I类动词意志形：词尾变o段+う（如：飲む→飲もう）' : cleanGroup === 'II' ? 'II类动词意志形：去る+よう（如：食べる→食べよう）' : '不规则动词意志形'
        };
        return explanations[form] || '基本形';
    }
    
    getAdjectiveExplanation(form, type) {
        // 数据清理：去除空格并转换为标准格式
        const cleanType = this.normalizeAdjectiveType(type);
        
        const explanations = {
            'negative': cleanType === 'i' ? 'i形容词否定形：去い+くない（如：高い→高くない）' : 'na形容词否定形：+じゃない（如：きれい→きれいじゃない）',
            'past': cleanType === 'i' ? 'i形容词过去形：去い+かった（如：高い→高かった）' : 'na形容词过去形：+だった（如：きれい→きれいだった）',
            'past_negative': cleanType === 'i' ? 'i形容词过去否定形：去い+くなかった（如：高い→高くなかった）' : 'na形容词过去否定形：+じゃなかった（如：きれい→きれいじゃなかった）',
            'plain_negative': cleanType === 'i' ? '简体否定形（i形容词）：去い+くない（如：高い→高くない）' : '简体否定形（na形容词）：+じゃない / +ではない（如：きれい→きれいじゃない）',
            'plain_past': cleanType === 'i' ? '简体过去形（i形容词）：去い+かった（如：高い→高かった）' : '简体过去形（na形容词）：+だった（如：きれい→きれいだった）',
            'plain_past_negative': cleanType === 'i' ? '简体过去否定形（i形容词）：去い+くなかった（如：高い→高くなかった）' : '简体过去否定形（na形容词）：+じゃなかった / +ではなかった（如：きれい→きれいじゃなかった）',
            'adverb': 'i形容词副词形：去い+く（如：高い→高く）',
            'te': cleanType === 'i' ? 'i形容词て形：去い+くて（如：高い→高くて）' : 'na形容词て形：+で（如：きれい→きれいで）',
            'rentai': 'na形容词连体形：+な（如：きれい→きれいな）'
        };
        return explanations[form] || '基本形';
    }
    
    getPlainFormExplanation(form, group) {
        // 数据清理：去除空格并转换为标准格式
        const cleanGroup = this.normalizeVerbGroup(group);
        
        const explanations = {
            'plain_present': '简体现在形：动词原形，不变化',
            'plain_past': cleanGroup === 'I' ? '简体过去形（I类动词）：る/う/つ→った，ぶ/む/ぬ→んだ，く→いた，ぐ→いだ，す→した（如：つくる→作った）' : cleanGroup === 'II' ? '简体过去形（II类动词）：去る+た（如：食べる→食べた）' : '简体过去形（不规则动词）',
            'plain_negative': cleanGroup === 'I' ? '简体否定形（I类动词）：词尾变a段+ない（如：飲む→飲まない）' : cleanGroup === 'II' ? '简体否定形（II类动词）：去る+ない（如：食べる→食べない）' : '简体否定形（不规则动词）',
            'plain_past_negative': '简体过去否定形：ない形的ない→なかった'
        };
        return explanations[form] || '简体形式';
    }
    
    // 标准化动词分组
    normalizeVerbGroup(group) {
        if (!group) return 'irregular';
        
        const cleaned = String(group).trim().toLowerCase();
        
        // 处理各种可能的输入格式
        if (cleaned === 'i' || cleaned === '1' || cleaned === 'group1' || cleaned === 'ichidan' || cleaned === 'godan') {
            return 'I';
        }
        if (cleaned === 'ii' || cleaned === '2' || cleaned === 'group2' || cleaned === 'nidan') {
            return 'II';
        }
        if (cleaned === 'irregular' || cleaned === 'irr' || cleaned === '不规则' || cleaned === 'fukisoku') {
            return 'irregular';
        }
        
        // 默认返回原值的大写形式
        return String(group).trim().toUpperCase();
    }
    
    // 标准化形容词类型
    normalizeAdjectiveType(type) {
        if (!type) return 'i';
        
        const cleaned = String(type).trim().toLowerCase();
        
        // 处理各种可能的输入格式
        if (cleaned === 'i' || cleaned === 'i-adj' || cleaned === 'i形容词' || cleaned === 'keiyoushi') {
            return 'i';
        }
        if (cleaned === 'na' || cleaned === 'na-adj' || cleaned === 'na形容词' || cleaned === 'keiyoudoushi') {
            return 'na';
        }
        
        // 默认返回原值的小写形式
        return String(type).trim().toLowerCase();
    }
    
    async submitFlashcardFeedback(feedback) {
        try {
            showLoading(true);
            
            const submitData = {
                itemType: state.currentModule === 'verb' ? 'vrb' : 
                         state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: state.currentQuestion.itemId,
                form: state.currentQuestion.targetForm,
                feedback: feedback,
                mode: state.currentMode
            };
            
            await API.submit(submitData);
            
            await this.nextQuestion();
        } catch (error) {
            console.error('Failed to submit feedback:', error);
        } finally {
            showLoading(false);
        }
    }
    
    async nextQuestion() {
        try {
            showLoading(true);
            await this.loadNextQuestion();
        } catch (error) {
            console.error('Failed to load next question:', error);
        } finally {
            showLoading(false);
        }
    }
}

// 进度显示
function updateProgressDisplay(data) {
    document.getElementById('total-reviews').textContent = data.totalReviews || 0;
    document.getElementById('accuracy').textContent = `${Math.round(data.accuracy || 0)}%`;
    document.getElementById('due-count').textContent = data.dueCount || 0;
    document.getElementById('avg-streak').textContent = Math.round(data.avgStreak || 0);
}

// 初始化进度页面
function initProgressPage() {
    // 设置默认选中的模块为动词
    state.selectedModule = 'verb';
    
    // 确保UI状态正确
    const progressModuleButtons = document.querySelectorAll('#progress .module-btn');
    progressModuleButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.module === 'verb') {
            btn.classList.add('active');
        }
    });
    
    initModuleSelector();
    initProgressTabs();
    updateProgressDisplayWithModule();
}

// 初始化模块选择器
function initModuleSelector() {
    // 只选择进度页面的模块按钮，避免与学习页面的按钮冲突
    const progressModuleButtons = document.querySelectorAll('#progress .module-btn');
    progressModuleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除其他按钮的active类
            progressModuleButtons.forEach(b => b.classList.remove('active'));
            // 添加当前按钮的active类
            btn.classList.add('active');
            // 更新选中的模块
            state.selectedModule = btn.dataset.module;
            // 重新加载数据
            updateProgressDisplayWithModule();
        });
    });
}

// 初始化标签页
function initProgressTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // 移除所有active类
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // 添加当前的active类
            btn.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // 重新加载数据
            updateProgressDisplayWithModule();
        });
    });
}

// 更新进度显示（带模块选择）
function updateProgressDisplayWithModule() {
    const selectedModule = state.selectedModule || 'all';
    const isDetailed = document.querySelector('.tab-btn.active')?.dataset.tab !== 'overview';
    const currentMode = state.currentMode;
    
    let url = `/api/progress?module=${selectedModule}`;
    if (isDetailed) {
        url += '&detailed=true';
    }
    if (currentMode) {
        url += `&mode=${currentMode}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (isDetailed && data.detailed) {
                updateDetailedProgress(data.detailed);
            } else {
                updateProgressDisplay(data);
            }
        })
        .catch(error => {
            console.error('获取进度数据失败:', error);
        });
}

// 更新详细进度数据
function updateDetailedProgress(detailedData) {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    
    switch (activeTab) {
        case 'analysis':
            updateAnalysisTab(detailedData);
            break;
        case 'trends':
            updateTrendsTab(detailedData);
            break;
        case 'recommendations':
            updateRecommendationsTab(detailedData);
            break;
    }
}

// 更新分析标签页
function updateAnalysisTab(data) {
    // 更新模块对比
    if (data.moduleComparison) {
        updateModuleComparison(data.moduleComparison);
    }
    
    // 更新变形掌握度
    if (data.formMastery) {
        updateFormMastery(data.formMastery);
    }
    
    // 更新错误分析
    if (data.errorPatterns) {
        updateErrorAnalysis(data.errorPatterns);
    }
}

// 更新模块对比
function updateModuleComparison(moduleData) {
    const container = document.getElementById('module-comparison');
    if (!container) return;
    
    container.innerHTML = '';
    
    moduleData.forEach(module => {
        const moduleDiv = document.createElement('div');
        moduleDiv.className = 'module-item';
        moduleDiv.innerHTML = `
            <div class="module-name">${module.name}</div>
            <div class="module-stats">
                <span>准确率: ${module.accuracy}%</span>
                <span>熟练度: ${module.proficiency}</span>
                <span>复习数: ${module.reviews}</span>
            </div>
        `;
        container.appendChild(moduleDiv);
    });
}

// 更新变形掌握度
function updateFormMastery(formData) {
    const container = document.getElementById('form-mastery');
    if (!container) return;
    
    container.innerHTML = '';
    
    formData.forEach(form => {
        const formDiv = document.createElement('div');
        formDiv.className = 'form-item';
        formDiv.innerHTML = `
            <div class="form-name">${form.form}</div>
            <div class="form-stats">
                <span>准确率: ${form.accuracy}%</span>
                <div class="mastery-bar">
                    <div class="mastery-fill" style="width: ${form.mastery}%"></div>
                </div>
            </div>
        `;
        container.appendChild(formDiv);
    });
}

// 更新错误分析
function updateErrorAnalysis(errorData) {
    // 更新错误统计
    const errorStatsContainer = document.getElementById('error-stats');
    if (errorStatsContainer && errorData.stats) {
        errorStatsContainer.innerHTML = `
            <div class="error-stat-card">
                <div class="error-stat-number">${errorData.stats.totalErrors}</div>
                <div class="error-stat-label">总错误数</div>
            </div>
            <div class="error-stat-card">
                <div class="error-stat-number">${errorData.stats.errorRate}%</div>
                <div class="error-stat-label">错误率</div>
            </div>
            <div class="error-stat-card">
                <div class="error-stat-number">${errorData.stats.commonErrors}</div>
                <div class="error-stat-label">常见错误</div>
            </div>
        `;
    }
    
    // 更新问题列表
    const problemListContainer = document.getElementById('problem-list');
    if (problemListContainer && errorData.problems) {
        problemListContainer.innerHTML = '';
        
        errorData.problems.forEach(problem => {
            const problemDiv = document.createElement('div');
            problemDiv.className = 'problem-item';
            problemDiv.innerHTML = `
                <div class="problem-form">${problem.form}</div>
                <div class="problem-stats">错误 ${problem.errors} 次 / 总计 ${problem.total} 次</div>
            `;
            problemListContainer.appendChild(problemDiv);
        });
    }
}

// 更新趋势标签页
function updateTrendsTab(data) {
    if (data.learningTrends) {
        updateTrendCharts(data.learningTrends);
    }
}

// 更新趋势图表
function updateTrendCharts(trendsData) {
    // 更新日趋势图表
    if (trendsData.daily) {
        updateDailyTrendChart(trendsData.daily);
    }
    
    // 更新周趋势图表
    if (trendsData.weekly) {
        updateWeeklyTrendChart(trendsData.weekly);
    }
}

// 更新日趋势图表
function updateDailyTrendChart(dailyData) {
    const svg = document.getElementById('daily-trend-chart');
    if (!svg || !dailyData) return;
    
    // 简单的SVG图表实现
    svg.innerHTML = '';
    const width = 400;
    const height = 200;
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // 绘制趋势线
    const maxValue = Math.max(...dailyData.map(d => d.value));
    const points = dailyData.map((d, i) => {
        const x = (i / (dailyData.length - 1)) * (width - 40) + 20;
        const y = height - 40 - (d.value / maxValue) * (height - 80);
        return `${x},${y}`;
    }).join(' ');
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#4a90e2');
    polyline.setAttribute('stroke-width', '2');
    svg.appendChild(polyline);
}

// 更新周趋势图表
function updateWeeklyTrendChart(weeklyData) {
    const svg = document.getElementById('weekly-trend-chart');
    if (!svg || !weeklyData) return;
    
    // 简单的SVG柱状图实现
    svg.innerHTML = '';
    const width = 400;
    const height = 200;
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    const maxValue = Math.max(...weeklyData.map(d => d.value));
    const barWidth = (width - 40) / weeklyData.length - 5;
    
    weeklyData.forEach((d, i) => {
        const x = 20 + i * (barWidth + 5);
        const barHeight = (d.value / maxValue) * (height - 80);
        const y = height - 40 - barHeight;
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', barWidth);
        rect.setAttribute('height', barHeight);
        rect.setAttribute('fill', '#4a90e2');
        svg.appendChild(rect);
    });
}

// 更新建议标签页
function updateRecommendationsTab(data) {
    if (data.recommendations) {
        updateRecommendations(data.recommendations);
    }
}

// 更新学习建议
function updateRecommendations(recommendations) {
    const container = document.getElementById('recommendations-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    recommendations.forEach(rec => {
        const recDiv = document.createElement('div');
        recDiv.className = `recommendation-item ${rec.priority}`;
        recDiv.innerHTML = `
            <div class="recommendation-message">${rec.message}</div>
            <div class="recommendation-action">${rec.action}</div>
        `;
        container.appendChild(recDiv);
    });
}

// 保存学习目标
function saveStudyGoals() {
    const dailyGoalEl = document.getElementById('daily-goal');
    const weeklyGoalEl = document.getElementById('weekly-goal');
    const accuracyGoalEl = document.getElementById('accuracy-goal');
    
    const goals = {
        daily: dailyGoalEl ? parseInt(dailyGoalEl.value) || 10 : 10,
        weekly: weeklyGoalEl ? parseInt(weeklyGoalEl.value) || 50 : 50,
        accuracy: accuracyGoalEl ? parseInt(accuracyGoalEl.value) || 80 : 80
    };
    
    // 保存到localStorage
    localStorage.setItem('studyGoals', JSON.stringify(goals));
    
    // 显示保存成功消息
    showToast('学习目标已保存', 'success');
}



// 设置页面
function updateSettingsDisplay(userData) {
    state.user = userData;
    
    // 显示访问码（明文显示）
    const accessCode = userData.accessCode || '000000';
    document.getElementById('access-code-display').value = accessCode;
    
    // 更新设置开关
    document.getElementById('due-only-toggle').checked = userData.settings?.dueOnly || false;
    document.getElementById('show-explain-toggle').checked = userData.settings?.showExplain !== false;
    
    // 更新全局设置
    state.settings = {
        dueOnly: userData.settings?.dueOnly || false,
        showExplain: userData.settings?.showExplain !== false,
        enabledForms: userData.settings?.enabledForms || []
    };
    
    // 同步当前模块的selectedForms
    const currentModuleForms = FORMS[state.currentModule].map(f => f.id);
    state.selectedForms = state.settings.enabledForms.filter(formId => 
        currentModuleForms.includes(formId)
    );
    
    // 更新形态开关
    updateFormToggles();
    
    // 更新练习页面的选择状态
    if (window.learningManager) {
        window.learningManager.updateFormSelection();
    }
}

function updateFormToggles() {
    const container = document.getElementById('form-toggles');
    const allForms = [...FORMS.verb, ...FORMS.adj, ...FORMS.plain];
    
    container.innerHTML = allForms.map(form => `
        <div class="form-toggle">
            <span class="form-toggle-label">${form.name}</span>
            <label class="switch-label">
                <input type="checkbox" data-form="${form.id}" 
                       ${state.settings.enabledForms.includes(form.id) ? 'checked' : ''}>
                <span class="switch"></span>
            </label>
        </div>
    `).join('');
    
    // 添加事件监听
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateFormToggle);
    });
}

async function updateFormToggle(e) {
    const formId = e.target.dataset.form;
    const enabled = e.target.checked;
    
    if (enabled) {
        if (!state.settings.enabledForms.includes(formId)) {
            state.settings.enabledForms.push(formId);
        }
    } else {
        const index = state.settings.enabledForms.indexOf(formId);
        if (index > -1) {
            state.settings.enabledForms.splice(index, 1);
        }
    }
    
    try {
        await API.updateSettings({
            enabledForms: state.settings.enabledForms
        });
    } catch (error) {
        console.error('Failed to update form toggle:', error);
        // 回滚状态
        e.target.checked = !enabled;
    }
}

// 工具函数
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 初始化应用
class App {
    constructor() {
        this.router = new Router();
        this.learningManager = new LearningManager();
        window.learningManager = this.learningManager; // 设置为全局变量
        this.initializeEventListeners();
        this.loadUserData();
    }
    
    initializeEventListeners() {
        // 底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                this.router.navigate(page);
            });
        });
        
        // 设置页面事件
        document.getElementById('copy-code-btn').addEventListener('click', this.copyAccessCode.bind(this));
        document.getElementById('bind-btn').addEventListener('click', this.bindDevice.bind(this));
        
        // 设置开关
        document.getElementById('due-only-toggle').addEventListener('change', this.updateSetting.bind(this));
        document.getElementById('show-explain-toggle').addEventListener('change', this.updateSetting.bind(this));
        
        // 进度页面事件
        const saveGoalsBtn = document.getElementById('save-goals-btn');
        if (saveGoalsBtn) {
            saveGoalsBtn.addEventListener('click', () => {
                saveStudyGoals();
            });
        }
    }
    
    async loadUserData() {
        try {
            showLoading(true);
            const userData = await API.getUser();
            updateSettingsDisplay(userData);
        } catch (error) {
            console.error('Failed to load user data:', error);
        } finally {
            showLoading(false);
        }
    }
    
    async copyAccessCode() {
        try {
            const userData = await API.getUser();
            
            // 尝试使用现代剪贴板API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(userData.accessCode);
                showToast('访问码已复制到剪贴板', 'success');
            } else {
                // 降级方案：选择文本
                const accessCodeInput = document.getElementById('access-code-display');
                accessCodeInput.select();
                accessCodeInput.setSelectionRange(0, 99999); // 移动端兼容
                
                // 尝试使用传统的execCommand
                try {
                    document.execCommand('copy');
                    showToast('访问码已复制到剪贴板', 'success');
                } catch (execError) {
                    showToast('请手动复制访问码', 'info');
                }
            }
        } catch (error) {
            console.error('Failed to copy access code:', error);
            showToast('请手动复制访问码', 'info');
        }
    }
    
    async bindDevice() {
        const input = document.getElementById('bind-code-input');
        const accessCode = input.value.trim();
        
        if (!accessCode) {
            showToast('请输入访问码', 'error');
            return;
        }
        
        if (accessCode.length !== 6 || !/^\d{6}$/.test(accessCode)) {
            showToast('访问码应为6位数字', 'error');
            return;
        }
        
        try {
            showLoading(true);
            await API.bindDevice(accessCode);
            showToast('设备绑定成功', 'success');
            input.value = '';
            
            // 重新加载用户数据
            await this.loadUserData();
        } catch (error) {
            console.error('Failed to bind device:', error);
            showToast('绑定失败，请检查访问码', 'error');
        } finally {
            showLoading(false);
        }
    }
    
    async updateSetting(e) {
        const setting = e.target.id.replace('-toggle', '').replace('-', '');
        const value = e.target.checked;
        
        const settingMap = {
            'dueonly': 'dueOnly',
            'showexplain': 'showExplain'
        };
        
        const settingKey = settingMap[setting.toLowerCase()];
        if (!settingKey) return;
        
        state.settings[settingKey] = value;
        
        try {
            await API.updateSettings({ [settingKey]: value });
            showToast('设置已保存', 'success');
        } catch (error) {
            console.error('Failed to update setting:', error);
            showToast('设置保存失败', 'error');
            // 回滚状态
            e.target.checked = !value;
            state.settings[settingKey] = !value;
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

// PWA 支持
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}