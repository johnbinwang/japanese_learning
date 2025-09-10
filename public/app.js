// 全局状态
const state = {
    currentModule: 'verb',
    currentMode: 'flashcard',
    currentQuestion: null,
    selectedForms: [],
    selectedModule: 'all',
    settings: {
        dueOnly: false,
        showExplain: true,
        enabledForms: [],
        dailyGoal: 10
    },
    user: {
        id: null,
        email: null,
        isAuthenticated: false
    },
    isFlashcardFlipped: false,
    // 学习时间计时器
    sessionStartTime: null,
    questionStartTime: null,
    totalSessionTime: 0
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

// 今日概览数据管理器
class TodayOverviewManager {
    constructor() {
        this.cache = null;
        this.lastFetchTime = 0;
        this.cacheDuration = 30000; // 30秒缓存
        this.pendingRequest = null;
        this.subscribers = new Set();
    }

    // 订阅数据更新
    subscribe(callback) {
        this.subscribers.add(callback);
        // 如果已有缓存数据，立即调用回调
        if (this.cache) {
            callback(this.cache);
        }
        return () => this.subscribers.delete(callback);
    }

    // 通知所有订阅者
    notifySubscribers(data) {
        this.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                // console.error('Error in subscriber callback:', error);
            }
        });
    }

    // 获取今日概览数据
    async getTodayOverview(forceRefresh = false) {
        const now = Date.now();
        
        // 如果有缓存且未过期，直接返回缓存
        if (!forceRefresh && this.cache && (now - this.lastFetchTime) < this.cacheDuration) {
            // console.log('📋 使用缓存的今日概览数据');
            return this.cache;
        }

        // 如果已有请求在进行中，等待该请求完成
        if (this.pendingRequest) {
            // console.log('📋 等待进行中的今日概览请求');
            return this.pendingRequest;
        }

        // console.log('📋 发起新的今日概览API请求');
        this.pendingRequest = this.fetchTodayOverview();
        
        try {
            const data = await this.pendingRequest;
            this.cache = data;
            this.lastFetchTime = now;
            this.notifySubscribers(data);
            return data;
        } finally {
            this.pendingRequest = null;
        }
    }

    // 实际的API请求
    async fetchTodayOverview() {
        try {
            const response = await API.request('/api/today-overview');
            // console.log('📡 今日概览API请求成功');
            return response;
        } catch (error) {
            // console.error('❌ 今日概览API请求失败:', error);
            throw error;
        }
    }

    // 清除缓存
    clearCache() {
        this.cache = null;
        this.lastFetchTime = 0;
        // console.log('🗑️ 今日概览缓存已清除');
    }

    // 强制刷新数据
    async refresh() {
        this.clearCache();
        return this.getTodayOverview(true);
    }
}

// 创建全局实例
const todayOverviewManager = new TodayOverviewManager();

// API 调用函数
class API {
    static async request(endpoint, options = {}) {
        try {
            // 自动添加JWT认证头部（如果存在）
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };
            
            const token = localStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
    
            const response = await fetch(endpoint, {
                headers,
                ...options
            });
            
            if (!response.ok) {
                // 处理401未授权错误
                if (response.status === 401) {
                    localStorage.removeItem('authToken');
                    state.user.isAuthenticated = false;
                    window.location.href = '/auth.html';
                    return;
                }
                
                // 尝试解析错误响应中的具体错误信息
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    // 如果无法解析JSON，使用默认错误信息
                }
                throw new Error(errorMessage);
            }
            
            return await response.json();
        } catch (error) {
            // console.error('API Error:', error);
            showToast('网络错误，请稍后重试', 'error');
            throw error;
        }
    }
    
    static async getUser() {
        return this.request('/api/me');
    }
    
    static async updateSettings(settings) {
    return this.request('/api/preferences', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }
    
    static async updatePreferences(preferences) {
        return this.request('/api/preferences', {
            method: 'POST',
            body: JSON.stringify(preferences)
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
    

}

// 路由管理
class Router {
    constructor() {
        this.routes = {
            'learn': () => this.showPage('learn'),
            'progress': () => this.showPage('progress'),
            'settings': () => this.showPage('settings')
        };
        
        // 检查是否是认证相关的路由
        this.checkAuthRoutes();
        
        window.addEventListener('hashchange', () => this.handleRoute());
        // 不在构造函数中立即处理路由，等待App初始化完成
    }
    
    // 检查认证相关路由
    checkAuthRoutes() {
        const path = window.location.pathname;
        const authRoutes = ['/reset-password', '/verify-email', '/login', '/register', '/forgot-password'];
        
        if (authRoutes.includes(path)) {
            // 重定向到认证页面，保留查询参数
            const search = window.location.search;
            const hash = path.replace('/', '');
            window.location.href = `/auth.html#${hash}${search}`;
            return;
        }
    }
    
    // 新增方法：App初始化完成后调用
    initialize() {
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
        // console.log('🔄 Router.showPage 被调用，目标页面:', pageId);
        
        // 隐藏所有页面
        const pages = document.querySelectorAll('.page');
        if (pages && pages.length > 0) {
            pages.forEach(page => {
                page.classList.remove('active');
            });
        }
        
        // 显示目标页面
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // 重置页面滚动位置到顶部
        window.scrollTo(0, 0);
        
        // 更新导航状态
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems && navItems.length > 0) {
            navItems.forEach(item => {
                item.classList.remove('active');
            });
        }
        
        const activeNav = document.querySelector(`[data-page="${pageId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
        }
        
        // 页面特定初始化和数据刷新
        if (pageId === 'progress') {
            // console.log('📊 切换到进度页面，调用 loadProgress');
            this.loadProgress();
        } else if (pageId === 'settings') {
            // console.log('⚙️ 切换到设置页面，调用 loadSettings');
            this.loadSettings();
        }
    }
    
    async loadProgress() {
        try {
            // console.log('📊 loadProgress 开始执行');
            // 初始化进度页面结构（仅在首次需要时）
            initProgressPage();
            // 使用统一的数据管理器加载今日概览数据
            await loadTodayOverview();
            // console.log('✅ loadProgress 执行完成');
        } catch (error) {
            // console.error('❌ Failed to load progress:', error);
        }
    }

    async loadSettings() {
        try {
            // console.log('🔧 loadSettings 开始执行');
            
            // 确保在API调用前先恢复用户状态
            if (!state.user.accessCode) {
                // console.log('🔄 检测到访问码为空，尝试恢复用户状态');
                // 使用App实例的restoreUserState方法
                if (window.app) {
                    window.app.restoreUserState();
                }
            }
            
            // 添加时间戳参数防止缓存，确保获取最新数据
            const timestamp = Date.now();
            // console.log('📡 发送API请求获取用户数据和偏好设置，时间戳:', timestamp);
            // console.log('🔑 当前访问码:', state.user.accessCode);
            
            // 同时获取用户数据和偏好设置
            const [userData, preferences] = await Promise.all([
                API.request(`/api/me?_t=${timestamp}`, {
                    cache: 'no-cache'
                }),
                API.request(`/api/preferences?_t=${timestamp}`, {
                    cache: 'no-cache'
                })
            ]);
            
            // 将preferences数据合并到userData中
            userData.preferences = preferences;
            
            // console.log('📥 收到用户数据:', userData);
            // console.log('📥 收到偏好设置:', preferences);
            // console.log('📋 调用 updateSettingsDisplay 更新设置显示');
            updateSettingsDisplay(userData);
            
            // 使用统一的数据管理器加载今日进度，避免重复调用
            // console.log('📈 调用 loadTodayOverview 加载今日进度');
            await loadTodayOverview();
            
            // console.log('✅ loadSettings 执行完成');
        } catch (error) {
            // console.error('❌ Failed to load settings:', error);
            
            // 如果是访问码无效错误，清除本地存储并重新加载用户数据
            if (error.message && error.message.includes('访问码无效')) {
                // console.log('Access code invalid, clearing and reloading user data');
                localStorage.removeItem('accessCode');
                state.user.accessCode = null;
                
                // 重新加载用户数据以获取新的访问码
                if (window.app) {
                    await window.app.loadUserData();
                    // 重新尝试加载设置
                    await this.loadSettings();
                }
            }
        }
    }
}

// 学习功能
class LearningManager {
    constructor() {
        this.initializeEventListeners();
        this.updateFormChips();
        this.initializeModeButtons();
    }
    
    initializeModeButtons() {
        // 初始化模式按钮状态，确保闪卡模式默认激活
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === state.currentMode) {
                btn.classList.add('active');
            }
        });
    }
    
    initializeEventListeners() {
        // 模块选择
        const moduleButtons = document.querySelectorAll('.module-btn');
        if (moduleButtons && moduleButtons.length > 0) {
            moduleButtons.forEach(btn => {
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        const module = e.currentTarget.dataset.module;
                        this.selectModule(module);
                    });
                }
            });
        }
        
        // 模式切换
        const modeButtons = document.querySelectorAll('.mode-btn');
        if (modeButtons && modeButtons.length > 0) {
            modeButtons.forEach(btn => {
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        const mode = e.currentTarget.dataset.mode;
                        this.selectMode(mode);
                    });
                }
            });
        }
        
        // 开始练习
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startPractice();
            });
        }
        
        // 提交答案
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.submitAnswer();
            });
        }
        
        // 下一题
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.nextQuestion();
            });
        }
        
        // 闪卡翻转
        const flipBtn = document.getElementById('flip-btn');
        if (flipBtn) {
            flipBtn.addEventListener('click', () => {
                this.flipFlashcard();
            });
        }
        
        // 闪卡反馈
        const feedbackButtons = document.querySelectorAll('.feedback-btn');
        if (feedbackButtons && feedbackButtons.length > 0) {
            feedbackButtons.forEach(btn => {
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        const feedback = e.currentTarget.dataset.feedback;
                        this.submitFlashcardFeedback(feedback);
                    });
                }
            });
        }
        
        // 答案输入回车提交
        const answerInput = document.getElementById('answer-input');
        if (answerInput) {
            answerInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.submitAnswer();
                }
            });
        }
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
        const formChips = document.querySelectorAll('.form-chip');
        if (formChips && formChips.length > 0) {
            formChips.forEach(chip => {
                const formId = chip.dataset.form;
                if (state.selectedForms.includes(formId)) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        }
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
            
            // 记录学习会话开始时间
            state.sessionStartTime = new Date();
            state.questionStartTime = null; // 将在displayQuestion中设置
            state.totalSessionTime = 0;
            
            // 将选择的变形类型同步到设置中
            state.settings.enabledForms = [...state.selectedForms];
            await API.updatePreferences({
                enabled_forms: JSON.stringify(state.settings.enabledForms)
            });
            
            await this.loadNextQuestion();
            this.showPracticeCard();
        } catch (error) {
            // console.error('Failed to start practice:', error);
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
        
        // 记录当前题目开始时间
        state.questionStartTime = new Date();
        
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
        
        // 重置闪卡翻转状态
        state.isFlashcardFlipped = false;
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
        
        // 计算单题学习时长
        let sessionDuration = 0;
        if (state.questionStartTime) {
            const currentTime = new Date();
            sessionDuration = Math.floor((currentTime - state.questionStartTime) / 1000); // 转换为秒
            // 限制单题时间在合理范围内（最少1秒，最多300秒）
            sessionDuration = Math.max(1, Math.min(sessionDuration, 300));
        }
        
        try {
            showLoading(true);
            
            const submitData = {
                itemType: state.currentModule === 'verb' ? 'vrb' : 
                         state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: state.currentQuestion.itemId,
                form: state.currentQuestion.targetForm,
                userAnswer: userAnswer,
                mode: state.currentMode,
                sessionDuration: sessionDuration // 添加学习时长
            };
            
            const result = await API.submit(submitData);
            
            this.showResult(result);
        } catch (error) {
            // console.error('Failed to submit answer:', error);
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
                // 简体形模块统一使用简体形解释
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
            const answer = this.conjugatePlainForm({ kana, kanji, group }, targetForm);
            const explanation = this.getPlainFormExplanation(targetForm, group);
            return { text: answer, explanation };
        } else {
            return { text: base, explanation: '简体形式' };
        }
    }
    
    conjugatePlainForm(verb, form) {
        const { kana, kanji, group } = verb;
        const base = kanji || kana;
        const cleanGroup = this.normalizeVerbGroup(group);
        
        switch (form) {
            case 'plain_present':
                return base; // 简体现在形就是动词原形
            case 'plain_past':
                return this.conjugateToTa(base, cleanGroup);
            case 'plain_negative':
                return this.conjugateToNai(base, cleanGroup);
            case 'plain_past_negative':
                const naiForm = this.conjugateToNai(base, cleanGroup);
                return naiForm.replace(/ない$/, 'なかった');
            default:
                return base;
        }
    }
    
    conjugateVerb(verb, form) {
        const { kana, kanji, group } = verb;
        const base = kanji || kana;
        
        // 防护逻辑：如果group信息缺失或无效，根据动词词尾推断类型
        let normalizedGroup = group;
        if (!group || group.trim() === '') {
            normalizedGroup = this.inferVerbGroup(base);
            // console.log(`警告: 动词 ${base} 缺少group信息，推断为 ${normalizedGroup} 类`);
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
        
        // 复合动词处理：以「する」结尾的动词
        if (verb.endsWith('する')) {
            return verb.slice(0, -2) + 'します';
        }
        
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
        
        // 复合动词处理：以「する」结尾的动词
        if (verb.endsWith('する')) {
            return verb.slice(0, -2) + 'して';
        }
        
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
        
        // 复合动词处理：以「する」结尾的动词
        if (verb.endsWith('する')) {
            return verb.slice(0, -2) + 'できる';
        }
        
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
        
        // 复合动词处理：以「する」结尾的动词
        if (verb.endsWith('する')) {
            return verb.slice(0, -2) + 'しよう';
        }
        
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
            case 'adverb':
                return adj + 'に';
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
            'te': cleanGroup === 'I' ? 'I类动词て形：く→いて，ぐ→いで，む/ぶ/ぬ→んで，る/う/つ→って，す→して' : cleanGroup === 'II' ? 'II类动词て形：去る+て（如：食べる→食べて）' : '不规则动词て形',
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
            'adverb': cleanType === 'i' ? 'i形容词副词形：去い+く（如：高い→高く）' : 'na形容词副词形：+に（如：きれい→きれいに）',
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
        // 计算单题学习时长
        let sessionDuration = 0;
        if (state.questionStartTime) {
            const currentTime = new Date();
            sessionDuration = Math.floor((currentTime - state.questionStartTime) / 1000); // 转换为秒
            // 限制单题时间在合理范围内（最少1秒，最多300秒）
            sessionDuration = Math.max(1, Math.min(sessionDuration, 300));
        }
        
        try {
            showLoading(true);
            
            const submitData = {
                itemType: state.currentModule === 'verb' ? 'vrb' : 
                         state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: state.currentQuestion.itemId,
                form: state.currentQuestion.targetForm,
                feedback: feedback,
                mode: state.currentMode,
                sessionDuration: sessionDuration // 添加学习时长
            };
            
            await API.submit(submitData);
            
            await this.nextQuestion();
        } catch (error) {
            // console.error('Failed to submit feedback:', error);
        } finally {
            showLoading(false);
        }
    }
    
    async nextQuestion() {
        try {
            showLoading(true);
            await this.loadNextQuestion();
        } catch (error) {
            // console.error('Failed to load next question:', error);
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
    // 设置默认选中的模块为全部
    state.selectedModule = 'all';
    
    // 初始化模式对比的模块选择器
    initModeComparisonModuleSelector();
    
    // 初始化洞察标签页
    initInsightTabs();
    
    // 加载初始数据
    updateProgressDisplayWithModule();
}

// 初始化模式对比的模块选择器
function initModeComparisonModuleSelector() {
    const moduleButtons = document.querySelectorAll('.mode-comparison-section .module-btn');
    
    moduleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除其他按钮的active类
            moduleButtons.forEach(b => b.classList.remove('active'));
            // 添加当前按钮的active类
            btn.classList.add('active');
            
            // 更新选中的模块
            state.selectedModule = btn.dataset.module;
            
            // 重新加载模式对比数据
            loadModeComparison();
        });
    });
}

// 初始化洞察标签页
function initInsightTabs() {
    const insightTabButtons = document.querySelectorAll('.insight-tab-btn');
    const insightContents = document.querySelectorAll('.insight-content');
    
    insightTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // 移除所有active类
            insightTabButtons.forEach(b => b.classList.remove('active'));
            insightContents.forEach(c => c.classList.remove('active'));
            
            // 添加当前标签的active类
            btn.classList.add('active');
            document.getElementById(`${targetTab}-insight`).classList.add('active');
            
            // 加载对应的数据
            switch (targetTab) {
                case 'trends':
                    loadWeeklyTrends();
                    break;
                case 'weaknesses':
                    loadWeaknesses();
                    break;
                case 'suggestions':
                    loadSuggestions();
                    break;
            }
        });
    });
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
            // 同时更新今日进度数据，确保设置页面数据同步
            loadTodayProgress();
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

// 更新进度显示（新的三层结构）
function updateProgressDisplayWithModule() {
    // 加载今日概览数据
    loadTodayOverview();
    
    // 加载模式对比数据
    loadModeComparison();
    
    // 加载学习洞察数据
    loadLearningInsights();
}

// 加载今日概览数据
async function loadTodayOverview() {
    try {
        // console.log('📋 loadTodayOverview 开始执行');
        const data = await todayOverviewManager.getTodayOverview();
        updateTodayOverview(data);
        // console.log('✅ loadTodayOverview 执行完成');
    } catch (error) {
        // console.error('❌ 获取今日概览数据失败:', error);
    }
}

// 更新今日概览显示
function updateTodayOverview(data) {
    // console.log('更新今日概览数据:', data);
    
    // 从API返回的嵌套结构中提取数据
    const overview = data.overview || {};
    const progress = data.progress || {};
    const dueReviews = data.dueReviews || {};
    
    // 更新新学进度
    const newProgress = parseInt(progress.newItemsProgress?.completed) || 0;
    const newTarget = parseInt(progress.newItemsProgress?.target) || 10;
    const newProgressEl = document.getElementById('new-progress');
    if (newProgressEl) {
        newProgressEl.textContent = `${newProgress}/${newTarget}`;
    }
    const newProgressPercentage = newTarget > 0 ? (newProgress / newTarget) * 100 : 0;
    const newProgressFillEl = document.getElementById('new-progress-fill');
    if (newProgressFillEl) {
        newProgressFillEl.style.width = `${newProgressPercentage}%`;
    }
    
    // 更新复习进度
    const reviewProgress = parseInt(progress.reviewsProgress?.completed) || 0;
    const reviewTarget = parseInt(progress.reviewsProgress?.target) || 50;
    const reviewProgressEl = document.getElementById('review-progress');
    if (reviewProgressEl) {
        reviewProgressEl.textContent = `${reviewProgress}/${reviewTarget}`;
    }
    const reviewProgressPercentage = reviewTarget > 0 ? (reviewProgress / reviewTarget) * 100 : 0;
    const reviewProgressFillEl = document.getElementById('review-progress-fill');
    if (reviewProgressFillEl) {
        reviewProgressFillEl.style.width = `${reviewProgressPercentage}%`;
    }
    
    // 更新统计卡片
    const totalDueCount = Object.values(dueReviews).reduce((sum, count) => sum + count, 0);
    const studyTimeTodayEl = document.getElementById('study-time-today');
    if (studyTimeTodayEl) {
        const totalSeconds = overview.total_study_time_today || 0;
        if (totalSeconds < 60) {
            studyTimeTodayEl.textContent = `${totalSeconds}秒`;
        } else {
            studyTimeTodayEl.textContent = `${Math.round(totalSeconds / 60)}分钟`;
        }
    }
    const studyStreakEl = document.getElementById('study-streak');
    if (studyStreakEl) {
        studyStreakEl.textContent = `${overview.study_streak_days || 0}天`;
    }
    const dueTotalEl = document.getElementById('due-total');
    if (dueTotalEl) {
        dueTotalEl.textContent = totalDueCount;
    }
}

// 加载模式对比数据
function loadModeComparison() {
    const selectedModule = state.selectedModule || 'all';
    // 添加时间戳参数防止缓存
    const timestamp = Date.now();
    API.request(`/api/mode-comparison?module=${selectedModule}&_t=${timestamp}`, {
        cache: 'no-cache'
    })
        .then(data => {
            updateModeComparison(data);
        })
        .catch(error => {
            // console.error('获取模式对比数据失败:', error);
        });
}

// 更新模式对比显示
function updateModeComparison(data) {
    // 更新测验模式统计
    const quizData = data.quiz && data.quiz.totals ? data.quiz.totals : {};
    document.getElementById('quiz-total').textContent = quizData.total_items || 0;
    document.getElementById('quiz-accuracy').textContent = `${(quizData.accuracy_rate || 0).toFixed(1)}%`;
    document.getElementById('quiz-streak').textContent = (quizData.avg_streak || 0).toFixed(1);
    document.getElementById('quiz-mastered').textContent = quizData.mastered_count || 0;
    
    // 更新闪卡模式统计
    const flashcardData = data.flashcard && data.flashcard.totals ? data.flashcard.totals : {};
    document.getElementById('flashcard-total').textContent = flashcardData.total_items || 0;
    // 闪卡模式显示平均熟练度而不是正确率
    document.getElementById('flashcard-accuracy').textContent = `${(flashcardData.accuracy_rate || 0).toFixed(1)}%`;
    document.getElementById('flashcard-streak').textContent = (flashcardData.avg_streak || 0).toFixed(1);
    document.getElementById('flashcard-mastered').textContent = flashcardData.mastered_count || 0;
    
    // 更新模式推荐
    updateModeRecommendation(data.recommendation);
}

// 更新模式推荐
function updateModeRecommendation(recommendation) {
    const container = document.getElementById('mode-recommendation');
    if (!container || !recommendation) return;
    
    container.innerHTML = `
        <div class="recommendation-card">
            <div class="recommendation-icon">${recommendation.icon || '💡'}</div>
            <div class="recommendation-content">
                <h4>${recommendation.title || '学习建议'}</h4>
                <p>${recommendation.message || '继续保持良好的学习习惯！'}</p>
            </div>
        </div>
    `;
}

// 加载学习洞察数据
function loadLearningInsights() {
    const activeInsightTab = document.querySelector('.insight-tab-btn.active')?.dataset.tab || 'trends';
    
    switch (activeInsightTab) {
        case 'trends':
            loadWeeklyTrends();
            break;
        case 'weaknesses':
            loadWeaknesses();
            break;
        case 'suggestions':
            loadSuggestions();
            break;
    }
}

// 加载7天趋势数据
function loadWeeklyTrends() {
    const timestamp = Date.now();
    API.request(`/api/insights/trends?_t=${timestamp}`, {
        cache: 'no-cache'
    })
        .then(data => {
            if (data.dailyData) {
                // 使用 dailyData 更新趋势图表
                updateWeeklyTrendChart(data.dailyData);
                updateTrendSummary(data);
            }
        })
        .catch(error => {
            // console.error('获取趋势数据失败:', error);
        });
}

// 更新趋势总结
function updateTrendSummary(trendsData) {
    const container = document.getElementById('trend-summary');
    if (!container || !trendsData) return;
    
    const summary = trendsData.summary || {};
    container.innerHTML = `
        <div class="trend-summary-cards">
            <div class="summary-card">
                <span class="summary-label">活跃天数</span>
                <span class="summary-value">${summary.activeDays || 0}天</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">平均正确率</span>
                <span class="summary-value">${summary.avgAccuracy || 0}%</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">总复习数</span>
                <span class="summary-value">${summary.totalReviews || 0}</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">日均复习</span>
                <span class="summary-value">${summary.avgDailyReviews || 0}</span>
            </div>
        </div>
    `;
}

// 加载薄弱环节数据
function loadWeaknesses() {
    const timestamp = Date.now();
    API.request(`/api/progress?detailed=true&_t=${timestamp}`)
        .then(data => {
            if (data && data.errorPatterns && data.errorPatterns.problems) {
                updateWeaknessList(data.errorPatterns.problems);
            } else {
                // 如果没有薄弱环节数据，显示空状态
                updateWeaknessList([]);
            }
        })
        .catch(error => {
            console.error('获取薄弱环节数据失败:', error);
            // 出错时也显示空状态
            updateWeaknessList([]);
        });
}

// 更新薄弱环节列表
function updateWeaknessList(weaknesses) {
    const container = document.getElementById('weakness-list');
    if (!container) return;
    
    if (!weaknesses || weaknesses.length === 0) {
        container.innerHTML = '<div class="no-weaknesses">🎉 暂无明显薄弱环节，继续保持！</div>';
        return;
    }
    
    container.innerHTML = '';
    weaknesses.forEach(weakness => {
        const weaknessDiv = document.createElement('div');
        weaknessDiv.className = 'weakness-item';
        weaknessDiv.innerHTML = `
            <div class="weakness-form">${weakness.form}</div>
            <div class="weakness-stats">
                <span class="error-rate">错误率: ${Math.round((weakness.errors / weakness.attempts) * 100)}%</span>
                <span class="error-count">${weakness.errors}/${weakness.attempts}</span>
            </div>
            <div class="weakness-suggestion">建议加强练习</div>
        `;
        container.appendChild(weaknessDiv);
    });
}

// 加载智能推荐数据
function loadSuggestions() {
    const timestamp = Date.now();
    API.request(`/api/recommendations?_t=${timestamp}`)
        .then(data => {
            updateRecommendationCards(data);
        })
        .catch(error => {
            // console.error('获取智能推荐失败:', error);
        });
}

// 更新推荐卡片
function updateRecommendationCards(recommendations) {
    // 更新目标推荐
    updateRecommendationSection('goals', recommendations.goals, {
        emptyMessage: '暂无目标建议',
        cardClass: 'goals'
    });
    
    // 更新模式推荐
    updateRecommendationSection('modes', recommendations.modes, {
        emptyMessage: '暂无模式建议',
        cardClass: 'modes'
    });
    
    // 更新时间推荐
    updateRecommendationSection('schedule', recommendations.schedule, {
        emptyMessage: '暂无时间建议',
        cardClass: 'schedule'
    });
    
    // 更新重点关注推荐
    updateRecommendationSection('focus', recommendations.focus_areas, {
        emptyMessage: '暂无重点关注建议',
        cardClass: 'focus'
    });
}

// 更新推荐区域
function updateRecommendationSection(sectionId, items, options) {
    const container = document.getElementById(`${sectionId}-cards`);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!items || items.length === 0) {
        container.innerHTML = `<div class="no-recommendations">${options.emptyMessage}</div>`;
        return;
    }
    
    // 定义图标映射
    const iconMap = {
        'goals': '🎯',
        'modes': '📚',
        'schedule': '⏰',
        'focus': '🔍'
    };
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `recommendation-card ${options.cardClass}`;
        
        let actionsHtml = '';
        let metaHtml = '';
        
        // 根据推荐类型生成不同的操作按钮和元数据
        if (sectionId === 'goals') {
            actionsHtml = `
                <div class="recommendation-actions">
                    <button class="apply-recommendation-btn" onclick="applyGoalRecommendation(${item.suggested_new_target}, ${item.suggested_review_target})">
                        应用建议
                    </button>
                </div>
            `;
        } else if (sectionId === 'modes') {
            const mode = item.data?.mode || item.mode || '闪卡模式';
            const accuracy = item.data?.accuracy || item.accuracy;
            const avgStreak = item.data?.avg_streak || item.avg_streak;
            
            // 根据模式类型显示不同的指标
            if (mode === 'flashcard' || mode === '闪卡模式') {
                if (avgStreak) {
                    metaHtml = `
                        <div class="recommendation-meta">
                            <span>推荐模式: ${mode}</span>
                            <span>平均连击: ${avgStreak}次</span>
                        </div>
                    `;
                } else {
                    metaHtml = `
                        <div class="recommendation-meta">
                            <span>推荐模式: ${mode}</span>
                        </div>
                    `;
                }
            } else if (mode === 'quiz' || mode === '测验模式') {
                if (accuracy) {
                    metaHtml = `
                        <div class="recommendation-meta">
                            <span>推荐模式: ${mode}</span>
                            <span>正确率: ${accuracy}%</span>
                        </div>
                    `;
                } else {
                    metaHtml = `
                        <div class="recommendation-meta">
                            <span>推荐模式: ${mode}</span>
                        </div>
                    `;
                }
            } else {
                metaHtml = `
                    <div class="recommendation-meta">
                        <span>推荐模式: ${mode}</span>
                    </div>
                `;
            }
        } else if (sectionId === 'schedule') {
            const hour = item.data?.hour || item.hour;
            const timeRange = item.data?.timeRange || item.timeRange || '深夜';
            const accuracy = item.data?.accuracy || item.accuracy;
            
            // 确保时间显示正确
            const timeDisplay = (hour !== undefined && hour !== null) ? `${hour}:00` : '未知时间';
            // 确保正确率显示正确
            const accuracyDisplay = (accuracy !== undefined && accuracy !== null && !isNaN(accuracy)) 
                ? `${Math.round(accuracy * 100)}%` : '数据不足';
            
            metaHtml = `
                <div class="recommendation-meta">
                    <span>时间段: ${timeRange}</span>
                    <span>最佳时间: ${timeDisplay}</span>
                    <span>正确率: ${accuracyDisplay}</span>
                </div>
            `;
        } else if (sectionId === 'focus') {
            const form = item.data?.form || item.form || 'present';
            const errorRate = item.data?.error_rate || item.error_rate || 0;
            const practiceCount = item.data?.practice_count || item.practice_count || 0;
            metaHtml = `
                <div class="recommendation-meta">
                    <span>重点变形: ${form}</span>
                    <span>错误率: ${errorRate}%</span>
                    <span>练习次数: ${practiceCount}</span>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="recommendation-title" data-icon="${iconMap[sectionId] || '💡'}">${item.title || item.message}</div>
            <div class="recommendation-description">${item.description || item.message}</div>
            ${metaHtml}
            ${actionsHtml}
        `;
        
        container.appendChild(card);
    });
}

// 应用目标推荐
function applyGoalRecommendation(newTarget, reviewTarget) {
    API.request('/api/recommendations/apply', {
        method: 'POST',
        body: JSON.stringify({
            type: 'goals',
            new_target: newTarget,
            review_target: reviewTarget
        })
    })
    .then(data => {
        if (data.success) {
            showNotification('学习目标已更新！', 'success');
            // 更新设置页面的目标显示
            const dailyGoalInput = document.getElementById('daily-goal-input');
            if (dailyGoalInput) {
                dailyGoalInput.value = newTarget;
            }
            // 重新加载推荐
            loadSuggestions();
        } else {
            showNotification('更新失败: ' + (data.error || '未知错误'), 'error');
        }
    })
    .catch(error => {
        // console.error('应用推荐失败:', error);
        showNotification('应用推荐失败', 'error');
    });
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 500;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
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
    // 只更新周趋势图表，因为HTML中只有一个canvas元素
    if (trendsData.weekly) {
        updateWeeklyTrendChart(trendsData.weekly);
    }
    
    console.log('updateTrendCharts: Updated with weekly data only');
}

// 更新日趋势图表
function updateDailyTrendChart(dailyData) {
    const canvas = document.getElementById('weekly-trend-chart');
    if (!canvas || !dailyData || dailyData.length === 0) {
        console.log('updateDailyTrendChart: canvas not found or no data');
        return;
    }
    
    console.log('updateDailyTrendChart called with data:', dailyData);
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width || 400;
    const height = canvas.height || 200;
    
    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 处理数据
    const values = dailyData.map(d => d.reviews || d.value || 0);
    const maxValue = Math.max(...values, 1);
    
    console.log('Daily chart values:', values, 'maxValue:', maxValue);
    
    // 设置样式
    ctx.strokeStyle = '#4a90e2';
    ctx.fillStyle = '#4a90e2';
    ctx.lineWidth = 2;
    
    if (dailyData.length === 1) {
        // 只有一个数据点时，绘制一个圆点
        const x = width / 2;
        const y = height - 40 - (values[0] / maxValue) * (height - 80);
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    } else {
        // 多个数据点时，绘制折线
        ctx.beginPath();
        
        dailyData.forEach((d, i) => {
            const value = d.reviews || d.value || 0;
            const x = (i / (dailyData.length - 1)) * (width - 40) + 20;
            const y = height - 40 - (value / maxValue) * (height - 80);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // 添加数据点
        dailyData.forEach((d, i) => {
            const value = d.reviews || d.value || 0;
            const x = (i / (dailyData.length - 1)) * (width - 40) + 20;
            const y = height - 40 - (value / maxValue) * (height - 80);
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    console.log('updateDailyTrendChart: Canvas drawing completed');
}

// 更新周趋势图表
function updateWeeklyTrendChart(weeklyData) {
    console.log('updateWeeklyTrendChart called with:', weeklyData);
    
    const canvas = document.getElementById('weekly-trend-chart');
    if (!canvas || !weeklyData || weeklyData.length === 0) {
        console.log('Canvas not found or no data:', { canvas: !!canvas, dataLength: weeklyData?.length });
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 设置图表边距
    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // 反转数据顺序，让最新日期显示在右侧
    const reversedData = [...weeklyData].reverse();
    
    // 处理 dailyData 格式的数据
    const maxValue = Math.max(...reversedData.map(d => {
        const val = d.reviews || d.value || 0;
        return isNaN(val) ? 0 : Number(val);
    }));
    
    console.log('Chart data processed:', { maxValue, dataCount: reversedData.length });
    
    if (maxValue === 0 || isNaN(maxValue)) {
        // 如果没有数据，显示提示文本
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无学习数据', width / 2, height / 2);
        return;
    }
    
    // 绘制图表标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('7天学习趋势', width / 2, 25);
    
    // 绘制Y轴标签
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('复习次数', 0, 0);
    ctx.restore();
    
    // 绘制网格线和Y轴刻度
    const ySteps = 5;
    const stepValue = Math.ceil(maxValue / ySteps);
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#888';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= ySteps; i++) {
        const yValue = i * stepValue;
        const y = margin.top + chartHeight - (yValue / maxValue) * chartHeight;
        
        // 绘制网格线
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + chartWidth, y);
        ctx.stroke();
        
        // 绘制Y轴刻度标签
        ctx.fillText(yValue.toString(), margin.left - 5, y + 3);
    }
    
    // 绘制X轴
    ctx.strokeStyle = '#3a3a4e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartHeight);
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();
    
    // 绘制Y轴
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    ctx.stroke();
    
    // 计算柱状图参数
    const barWidth = Math.max(15, chartWidth / reversedData.length * 0.7);
    const barSpacing = chartWidth / reversedData.length;
    
    reversedData.forEach((d, i) => {
        const value = d.reviews || d.value || 0;
        const numValue = isNaN(value) ? 0 : Number(value);
        
        const x = margin.left + i * barSpacing + (barSpacing - barWidth) / 2;
        const barHeight = Math.max(0, (numValue / maxValue) * chartHeight);
        const y = margin.top + chartHeight - barHeight;
        
        // 确保所有值都是有效数字
        if (isNaN(x) || isNaN(y) || isNaN(barWidth) || isNaN(barHeight)) {
            console.error('Invalid canvas coordinates:', { x, y, barWidth, barHeight, value: numValue, maxValue });
            return;
        }
        
        // 绘制柱状图渐变效果（绿色主题）
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#4ade80');
        gradient.addColorStop(1, '#16a34a');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // 添加柱状图边框
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
        
        // 添加数值标签
        if (numValue > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            
            // 如果柱子太短，将数值显示在柱子上方
            const labelY = barHeight < 20 ? y - 8 : y + barHeight / 2 + 4;
            ctx.fillText(numValue.toString(), x + barWidth / 2, labelY);
        }
        
        // 添加日期标签
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        
        let dateStr;
        if (d.date) {
            dateStr = new Date(d.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        } else {
            // 如果没有日期，生成最近7天的日期（因为数据已反转，需要调整索引计算）
            const date = new Date();
            date.setDate(date.getDate() - (reversedData.length - 1 - i));
            dateStr = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        }
        
        ctx.fillText(dateStr, x + barWidth / 2, margin.top + chartHeight + 20);
    });
    
    // 添加图例
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('最近7天复习数据统计', width - 10, height - 10);
    
    console.log('Chart rendered successfully with enhanced styling');
}

// 更新建议标签页




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

// 加载今日学习进度
async function loadTodayProgress() {
    try {
        // console.log('📈 loadTodayProgress 开始执行');
        // console.log('🔍 当前 state.settings:', state.settings);
        
        const data = await todayOverviewManager.getTodayOverview();
        
        // console.log('📡 收到今日概览数据:', data);
        
        // 更新今日新学习进度显示
        const todayProgress = parseInt(data.progress?.newItemsProgress?.completed) || 0;
        // 优先使用state.settings中的目标值，确保与输入框一致
        const todayGoal = state.settings.dailyGoal || parseInt(data.overview?.daily_new_target) || 10;
        
        // console.log('🎯 学习进度数据 - 完成:', todayProgress, '目标:', todayGoal);
        // console.log('📊 目标值来源 - state.settings.dailyGoal:', state.settings.dailyGoal, 'API daily_new_target:', data.overview?.daily_new_target);
        
        const todayProgressEl = document.getElementById('today-progress');
        const todayGoalEl = document.getElementById('today-goal');
        if (todayProgressEl) todayProgressEl.textContent = todayProgress;
        if (todayGoalEl) todayGoalEl.textContent = todayGoal;
        
        // 更新新学习进度条
        const progressPercentage = todayGoal > 0 ? Math.min((todayProgress / todayGoal) * 100, 100) : 0;
        const settingsNewProgressFill = document.getElementById('settings-new-progress-fill');
        // console.log('📊 新学习进度条 - 百分比:', progressPercentage + '%', '元素:', settingsNewProgressFill);
        if (settingsNewProgressFill) {
            settingsNewProgressFill.style.width = progressPercentage + '%';
            // console.log('✅ 新学习进度条宽度已设置为:', progressPercentage + '%');
        }
        
        // 更新今日复习进度显示
        const todayReviewProgress = parseInt(data.progress?.reviewsProgress?.completed) || 0;
        // 优先使用state.settings中的目标值，确保与输入框一致
        const todayReviewGoal = state.settings.dailyReviewGoal || parseInt(data.overview?.daily_review_target) || 20;
        
        // console.log('🔄 复习进度数据 - 完成:', todayReviewProgress, '目标:', todayReviewGoal);
        // console.log('📊 复习目标值来源 - state.settings.dailyReviewGoal:', state.settings.dailyReviewGoal, 'API daily_review_target:', data.overview?.daily_review_target);
        
        // 确保更新所有复习相关的显示元素
        const todayReviewProgressEl = document.getElementById('today-review-progress');
        const todayReviewGoalEl = document.getElementById('today-review-goal');
        if (todayReviewProgressEl) todayReviewProgressEl.textContent = todayReviewProgress;
        if (todayReviewGoalEl) todayReviewGoalEl.textContent = todayReviewGoal;
        
        // 更新复习进度条
        const reviewProgressPercentage = todayReviewGoal > 0 ? Math.min((todayReviewProgress / todayReviewGoal) * 100, 100) : 0;
        const settingsReviewProgressFill = document.getElementById('settings-review-progress-fill');
        // console.log('📊 复习进度条 - 百分比:', reviewProgressPercentage + '%', '元素:', settingsReviewProgressFill);
        if (settingsReviewProgressFill) {
            settingsReviewProgressFill.style.width = reviewProgressPercentage + '%';
            // console.log('✅ 复习进度条宽度已设置为:', reviewProgressPercentage + '%');
        }
        
        // console.log('📋 设置页面进度更新完成:', { 
        //     todayProgress, todayGoal, progressPercentage,
        //     todayReviewProgress, todayReviewGoal, reviewProgressPercentage
        // });
        
    } catch (error) {
        // console.error('❌ Failed to load today progress:', error);
    }
}



// 设置页面
function updateSettingsDisplay(userData) {
    // console.log('🎛️ updateSettingsDisplay 开始执行，接收到的用户数据:', userData);
    
    // 更新用户状态
    state.user = {
        ...state.user,
        ...userData
    };
    
    // 显示用户邮箱
    const userEmail = state.user.email || userData.email || '未登录';
    document.getElementById('user-email-display').textContent = userEmail;
    // console.log('📧 设置用户邮箱:', userEmail);
    
    // 更新设置开关 - 将dueOnly默认设为false
    document.getElementById('due-only-toggle').checked = userData.settings?.dueOnly === true;
    document.getElementById('show-explain-toggle').checked = userData.settings?.showExplain !== false;
    // console.log('🔧 更新设置开关 - dueOnly:', userData.settings?.dueOnly, 'showExplain:', userData.settings?.showExplain);
    
    // 更新每日学习目标 - 从preferences获取最新值
    const dailyGoal = userData.preferences?.daily_new_target || userData.settings?.dailyGoal || 10;
    document.getElementById('daily-goal-input').value = dailyGoal;
    // console.log('🎯 设置每日学习目标:', dailyGoal, '(来源: preferences =', userData.preferences?.daily_new_target, ', settings =', userData.settings?.dailyGoal, ')');
    
    // 更新每日复习目标
    const dailyReviewGoal = userData.preferences?.daily_review_target || 20;
    document.getElementById('daily-review-goal-input').value = dailyReviewGoal;
    // console.log('🔄 设置每日复习目标:', dailyReviewGoal, '(来源: preferences =', userData.preferences?.daily_review_target, ')');
    
    // 更新全局设置
    const newSettings = {
        dueOnly: userData.settings?.dueOnly === true,
        showExplain: userData.settings?.showExplain !== false,
        enabledForms: userData.settings?.enabledForms || [],
        dailyGoal: dailyGoal,
        dailyReviewGoal: dailyReviewGoal
    };
    
    // console.log('🌐 更新全局state.settings:', newSettings);
    state.settings = newSettings;
    
    // 加载今日学习进度
    // console.log('📊 从 updateSettingsDisplay 调用 loadTodayProgress');
    loadTodayProgress();
    
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
        await API.updatePreferences({
            enabled_forms: JSON.stringify(state.settings.enabledForms)
        });
    } catch (error) {
        // console.error('Failed to update form toggle:', error);
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
        this.restoreUserState(); // 从本地存储恢复用户状态
        this.initializeEventListeners();
        // 确保用户状态恢复后再加载用户数据
        this.loadUserData();
        // 用户状态恢复完成后，初始化路由处理
        this.router.initialize();
    }
    
    restoreUserState() {
        // 从本地存储恢复用户状态
        const token = localStorage.getItem('authToken');
        if (token) {
            state.user.isAuthenticated = true;
            // 从token中解析用户信息（简单解析，生产环境应该验证token）
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                state.user.id = payload.userId;
                state.user.email = payload.email;
                // console.log('恢复用户状态 - 用户ID:', payload.userId);
            } catch (e) {
                // console.error('Invalid token:', e);
                localStorage.removeItem('authToken');
                state.user.isAuthenticated = false;
            }
        }
    }
    
    saveUserState() {
        // JWT token已经保存在localStorage中，这里不需要额外操作
    }
    
    // 登出功能
    logout() {
        localStorage.removeItem('authToken');
        state.user.isAuthenticated = false;
        state.user.id = null;
        state.user.email = null;
        window.location.href = '/auth.html';
    }
    
    initializeEventListeners() {
        // 底部导航
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems && navItems.length > 0) {
            navItems.forEach(item => {
                if (item) {
                    item.addEventListener('click', (e) => {
                        const page = e.currentTarget.dataset.page;
                        this.router.navigate(page);
                    });
                }
            });
        }
        
        // 设置页面事件 - 只在元素存在时添加监听器
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }
        
        // 设置开关 - 只在元素存在时添加监听器
        const dueOnlyToggle = document.getElementById('due-only-toggle');
        if (dueOnlyToggle) {
            dueOnlyToggle.addEventListener('change', this.updateSetting.bind(this));
        }
        
        const showExplainToggle = document.getElementById('show-explain-toggle');
        if (showExplainToggle) {
            showExplainToggle.addEventListener('change', this.updateSetting.bind(this));
        }
        
        // 每日目标设置 - 只在元素存在时添加监听器
        const dailyGoalInput = document.getElementById('daily-goal-input');
        if (dailyGoalInput) {
            dailyGoalInput.addEventListener('change', this.updateDailyGoal.bind(this));
        }
        
        const dailyReviewGoalInput = document.getElementById('daily-review-goal-input');
        if (dailyReviewGoalInput) {
            dailyReviewGoalInput.addEventListener('change', this.updateDailyReviewGoal.bind(this));
        }
        
        // 进度页面事件 - 只在元素存在时添加监听器
        const saveGoalsBtn = document.getElementById('save-goals-btn');
        if (saveGoalsBtn) {
            saveGoalsBtn.addEventListener('click', () => {
                saveStudyGoals();
            });
        }
    }
    
    async loadUserData() {
        try {
            // 检查是否已认证
            if (!state.user.isAuthenticated) {
                window.location.href = '/auth.html';
                return;
            }

            showLoading(true);
            const [userData, preferences] = await Promise.all([
                API.getUser(),
                API.request('/api/preferences')
            ]);
            userData.preferences = preferences;
            
            // 更新用户状态
            if (userData.id) {
                state.user.id = userData.id;
                state.user.email = userData.email;
            }
            
            updateSettingsDisplay(userData);
        } catch (error) {
            // console.error('Failed to load user data:', error);
            // 如果加载失败，可能是token过期，跳转到登录页
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                this.logout();
            }
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
            // 将设置键转换为preferences表的字段名
            const preferencesKey = settingKey === 'dueOnly' ? 'due_only' : 
                                 settingKey === 'showExplain' ? 'show_explain' : settingKey;
            await API.updatePreferences({ [preferencesKey]: value });
            showToast('设置已保存', 'success');
        } catch (error) {
            // console.error('Failed to update setting:', error);
            showToast('设置保存失败', 'error');
            // 回滚状态
            e.target.checked = !value;
            state.settings[settingKey] = !value;
        }
    }
    
    async updateDailyGoal(e) {
        const newGoal = parseInt(e.target.value) || 10;
        
        state.settings.dailyGoal = newGoal;
        const todayGoalEl = document.getElementById('today-goal');
        if (todayGoalEl) todayGoalEl.textContent = newGoal;
        
        try {
            // 只需要调用preferences接口，因为settings已经重定向到preferences
            await API.updatePreferences({ daily_new_target: newGoal });
            showToast('每日目标已更新', 'success');
            
            // 重新加载今日进度以更新进度条
            loadTodayProgress();
        } catch (error) {
            // console.error('Failed to update daily goal:', error);
            showToast('目标更新失败', 'error');
        }
    }
    
    async updateDailyReviewGoal(e) {
        const newReviewGoal = parseInt(e.target.value) || 20;
        
        state.settings.dailyReviewGoal = newReviewGoal;
        const todayReviewGoalEl = document.getElementById('today-review-goal');
        if (todayReviewGoalEl) todayReviewGoalEl.textContent = newReviewGoal;
        
        try {
            await API.updatePreferences({ daily_review_target: newReviewGoal });
            showToast('每日复习目标已更新', 'success');
            
            // 重新加载今日进度以更新进度条
            loadTodayProgress();
        } catch (error) {
            // console.error('Failed to update daily review goal:', error);
            showToast('复习目标更新失败', 'error');
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// 版本检查和更新管理
class UpdateManager {
    constructor() {
        this.currentVersion = null; // 当前本地版本，将通过API动态获取
        this.checkInterval = 30 * 60 * 1000; // 30分钟检查一次
        this.lastCheckTime = 0;
        this.updateModal = null;
    }

    async init() {
        this.updateModal = document.getElementById('updateModal');
        this.setupEventListeners();
        
        // 动态获取当前版本号
        await this.loadCurrentVersion();
        
        this.startVersionCheck();
    }

    async loadCurrentVersion() {
        try {
            const response = await fetch('/api/version');
            if (response.ok) {
                const data = await response.json();
                this.currentVersion = data.version;
                console.log('当前版本:', this.currentVersion);
                
                // 更新版权声明中的版本号显示
                this.updateVersionDisplay(this.currentVersion);
            } else {
                console.warn('无法获取版本信息，使用默认版本');
                this.currentVersion = '1.0.0'; // 降级方案
                this.updateVersionDisplay(this.currentVersion);
            }
        } catch (error) {
            console.error('获取版本信息失败:', error);
            this.currentVersion = '1.0.0'; // 降级方案
            this.updateVersionDisplay(this.currentVersion);
        }
    }
    
    updateVersionDisplay(version) {
        const versionElement = document.getElementById('app-version');
        if (versionElement) {
            versionElement.textContent = version;
        }
    }

    setupEventListeners() {
        const updateNowBtn = document.getElementById('updateNow');
        const updateLaterBtn = document.getElementById('updateLater');
        const updateCloseBtn = document.getElementById('updateClose');
        const updateModal = document.getElementById('updateModal');

        if (updateNowBtn) {
            updateNowBtn.addEventListener('click', () => this.performUpdate());
        }

        if (updateLaterBtn) {
            updateLaterBtn.addEventListener('click', () => this.hideUpdateModal());
        }
        
        if (updateCloseBtn) {
            updateCloseBtn.addEventListener('click', () => this.hideUpdateModal());
        }
        
        // 点击模态框背景关闭
        if (updateModal) {
            updateModal.addEventListener('click', (e) => {
                if (e.target.id === 'updateModal') {
                    this.hideUpdateModal();
                }
            });
        }
    }

    startVersionCheck() {
        // 立即检查一次
        this.checkForUpdates();
        
        // 定期检查
        setInterval(() => {
            this.checkForUpdates();
        }, this.checkInterval);

        // 页面获得焦点时检查
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                const now = Date.now();
                if (now - this.lastCheckTime > 5 * 60 * 1000) { // 5分钟内不重复检查
                    this.checkForUpdates();
                }
            }
        });
    }

    async checkForUpdates() {
        try {
            // 如果当前版本号还未加载完成，跳过检查
            if (!this.currentVersion) {
                console.log('版本号尚未加载，跳过版本检查');
                return;
            }
            
            this.lastCheckTime = Date.now();
            const response = await fetch('/api/version', {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                console.warn('版本检查失败:', response.status);
                return;
            }

            const versionData = await response.json();
            const serverVersion = versionData.version;

            console.log('版本检查:', {
                current: this.currentVersion,
                server: serverVersion
            });

            if (this.isNewerVersion(serverVersion, this.currentVersion)) {
                this.showUpdateModal(serverVersion);
            }
        } catch (error) {
            console.warn('版本检查出错:', error);
        }
    }

    isNewerVersion(serverVersion, currentVersion) {
        // 简单的版本比较，支持 x.y.z 格式
        const parseVersion = (version) => {
            return version.split('.').map(num => parseInt(num, 10));
        };

        const server = parseVersion(serverVersion);
        const current = parseVersion(currentVersion);

        for (let i = 0; i < Math.max(server.length, current.length); i++) {
            const s = server[i] || 0;
            const c = current[i] || 0;
            
            if (s > c) return true;
            if (s < c) return false;
        }
        
        return false;
    }

    showUpdateModal(newVersion) {
        if (this.updateModal) {
            // 更新版本信息
            const versionText = this.updateModal.querySelector('p');
            if (versionText) {
                versionText.textContent = `发现新版本 ${newVersion}，建议立即更新以获得最佳体验。`;
            }
            
            this.updateModal.classList.add('show');
        }
    }

    hideUpdateModal() {
        if (this.updateModal) {
            this.updateModal.classList.remove('show');
        }
    }

    async performUpdate() {
        try {
            // 显示更新中状态
            const updateBtn = document.getElementById('updateNow');
            if (updateBtn) {
                updateBtn.textContent = '更新中...';
                updateBtn.disabled = true;
            }

            console.log('开始执行应用更新...');
            
            // 清除所有缓存
            await this.clearAllCaches();
            
            // 强制清除所有存储
            await this.forceClearAllStorage();
            
            // 等待更长时间确保缓存清理完成
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log('准备刷新页面...');
            
            // 使用最强制的刷新方式
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(7);
            const currentUrl = window.location.href.split('?')[0]; // 移除现有查询参数
            const newUrl = `${currentUrl}?_refresh=${timestamp}&_nocache=${randomId}&_force=1`;
            
            // 立即跳转到新URL
            window.location.href = newUrl;
            
        } catch (error) {
            console.error('更新失败:', error);
            showToast('更新失败，请手动刷新页面', 'error');
            
            // 恢复按钮状态
            const updateBtn = document.getElementById('updateNow');
            if (updateBtn) {
                updateBtn.textContent = '立即更新';
                updateBtn.disabled = false;
            }
        }
    }

    async forceClearAllStorage() {
        try {
            console.log('开始强制清除所有存储...');
            
            // 清除所有localStorage（除了用户认证相关）
            const preserveKeys = ['access_code', 'user_id', 'anon_id'];
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (!preserveKeys.includes(key)) {
                    console.log('强制删除 localStorage 键:', key);
                    localStorage.removeItem(key);
                }
            });
            
            // 清除所有sessionStorage
            sessionStorage.clear();
            
            // 清除IndexedDB（如果存在）
            if ('indexedDB' in window) {
                try {
                    const databases = await indexedDB.databases();
                    for (const db of databases) {
                        if (db.name) {
                            console.log('删除 IndexedDB:', db.name);
                            indexedDB.deleteDatabase(db.name);
                        }
                    }
                } catch (e) {
                    console.log('IndexedDB 清理失败:', e);
                }
            }
            
            // 清除应用版本信息
            localStorage.removeItem('app_version');
            localStorage.removeItem('last_version_check');
            
            console.log('强制存储清理完成');
        } catch (error) {
            console.error('强制清除存储时出错:', error);
        }
    }

    async clearAllCaches() {
        try {
            console.log('开始清除所有缓存...');
            
            // 1. 清除所有 Service Worker 缓存
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                console.log('发现缓存:', cacheNames);
                await Promise.all(
                    cacheNames.map(async cacheName => {
                        console.log('删除缓存:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
                console.log('已清除所有 Service Worker 缓存');
            }

            // 2. 强制更新 Service Worker
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    console.log('注销 Service Worker:', registration);
                    await registration.unregister();
                }
                console.log('已注销所有 Service Worker');
            }

            // 3. 清除 localStorage 中的缓存数据（保留用户数据）
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('cache') || key.includes('version'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => {
                console.log('删除 localStorage 键:', key);
                localStorage.removeItem(key);
            });

            // 4. 清除 sessionStorage
            sessionStorage.clear();
            console.log('已清除 sessionStorage');

            console.log('缓存清理完成');
        } catch (error) {
            console.error('清除缓存时出错:', error);
            throw error;
        }
    }
}

// PWA 支持
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                // console.log('SW registered: ', registration);
                
                // 监听 Service Worker 更新
                registration.addEventListener('updatefound', () => {
                    console.log('发现 Service Worker 更新');
                });
            })
            .catch(registrationError => {
                // console.log('SW registration failed: ', registrationError);
            });
    });
}

// 初始化更新管理器
let updateManager;
document.addEventListener('DOMContentLoaded', async () => {
    updateManager = new UpdateManager();
    // 等待初始化完成
    await updateManager.init();
});