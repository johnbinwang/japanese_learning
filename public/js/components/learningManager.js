// 学习功能
class LearningManager {
    constructor() {
        // 在构造函数中引用全局对象
        this.state = window.appState;
        this.FORMS = window.FORMS;
        this.API = window.APIClient;

        this.initializeEventListeners();
        this.updateFormChips();
        this.initializeModeButtons();
    }

    initializeModeButtons() {
        // 初始化模式按钮状态,确保闪卡模式默认激活
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === this.state.currentMode) {
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
        this.state.currentModule = module;

        // 更新按钮状态
        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-module="${module}"]`).classList.add('active');

        // 更新形态选择
        this.updateFormChips();

        // 从设置中恢复当前模块的已启用变形类型
        const currentModuleForms = this.FORMS[module].map(f => f.id);
        this.state.selectedForms = this.state.settings.enabledForms.filter(formId =>
            currentModuleForms.includes(formId)
        );

        // 如果当前模块没有选中任何变形形态,则默认选中所有可用的变形形态
        if (this.state.selectedForms.length === 0) {
            this.state.selectedForms = [...currentModuleForms];
        }

        this.updateFormSelection();

        // 重置练习区域
        this.resetPracticeArea();
    }

    selectMode(mode) {
        this.state.currentMode = mode;

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
        const forms = this.FORMS[this.state.currentModule] || [];

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
        const index = this.state.selectedForms.indexOf(formId);
        if (index > -1) {
            this.state.selectedForms.splice(index, 1);
        } else {
            this.state.selectedForms.push(formId);
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
                if (this.state.selectedForms.includes(formId)) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        }
    }

    resetPracticeArea() {
        // 清空当前题目状态
        this.state.currentQuestion = null;
        this.state.isFlashcardFlipped = false;

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
        if (this.state.selectedForms.length === 0) {
            showToast('请至少选择一种变形形式', 'error');
            return;
        }

        try {
            showLoading(true);

            // 记录学习会话开始时间
            this.state.sessionStartTime = new Date();
            this.state.questionStartTime = null; // 将在displayQuestion中设置
            this.state.totalSessionTime = 0;

            // 将选择的变形类型同步到设置中
            this.state.settings.enabledForms = [...this.state.selectedForms];
            await this.API.updatePreferences({
                enabled_forms: JSON.stringify(this.state.settings.enabledForms)
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
        const data = await this.API.getNext(this.state.currentModule, this.state.selectedForms, this.state.currentMode);
        this.state.currentQuestion = data;

        this.state.isFlashcardFlipped = false;

        this.displayQuestion();
    }

    displayQuestion() {
        const q = this.state.currentQuestion;
        if (!q) return;

        // 记录当前题目开始时间
        this.state.questionStartTime = new Date();

        // **先**重置显示状态，避免显示旧内容导致闪烁
        document.getElementById('card-back').style.display = 'none';
        document.getElementById('card-front').style.display = 'block';
        document.getElementById('result-section').style.display = 'none';
        this.state.isFlashcardFlipped = false;

        // 清理单词文本,去掉末尾的数字
        const cleanKanji = this.cleanWordText(q.kanji);
        const cleanKana = this.cleanWordText(q.kana);
        const cleanMeaning = this.cleanWordText(q.meaning);

        // **再**更新测验卡片内容
        document.getElementById('word-main').textContent = cleanKanji || cleanKana;
        document.getElementById('word-reading').textContent = cleanKana;
        document.getElementById('word-meaning').textContent = cleanMeaning;
        document.getElementById('target-form').textContent = this.getFormName(q.targetForm);

        // 更新闪卡内容
        document.getElementById('fc-word-main').textContent = cleanKanji || cleanKana;
        document.getElementById('fc-word-reading').textContent = cleanKana;
        document.getElementById('fc-word-meaning').textContent = cleanMeaning;
        document.getElementById('fc-target-form').textContent = this.getFormName(q.targetForm);

        // 重置输入
        document.getElementById('answer-input').value = '';
    }

    // 清理单词文本,去掉末尾的数字
    cleanWordText(text) {
        if (!text) return text;
        // 去掉末尾的数字(包括可能的空格,以及可选的半角/全角括号)
        return String(text).replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
    }

    getFormName(formId) {
        const forms = this.FORMS[this.state.currentModule] || [];
        const form = forms.find(f => f.id === formId);
        return form ? form.name : formId;
    }

    showPracticeCard() {
        document.querySelector('.start-section').style.display = 'none';

        if (this.state.currentMode === 'quiz') {
            document.getElementById('quiz-card').style.display = 'block';
            document.getElementById('flashcard').style.display = 'none';
            document.getElementById('answer-input').focus();
        } else {
            document.getElementById('quiz-card').style.display = 'none';
            document.getElementById('flashcard').style.display = 'block';
        }
    }

    // 计算学习时长的通用方法
    calculateSessionDuration() {
        let sessionDuration = 0;
        if (this.state.questionStartTime) {
            const currentTime = new Date();
            const rawDuration = Math.floor((currentTime - this.state.questionStartTime) / 1000); // 转换为秒

            // 验证时间计算是否合理
            if (rawDuration < 0) {
                console.warn('时间计算异常:负数时间差', rawDuration);
                sessionDuration = 1; // 默认最小值
            } else if (rawDuration > 3600) { // 1小时
                console.warn('时间计算异常:超过1小时', rawDuration);
                sessionDuration = 300; // 使用最大值
            } else {
                // 限制单题时间在合理范围内(最少1秒,最多300秒)
                sessionDuration = Math.max(1, Math.min(rawDuration, 300));
            }

            // 添加调试日志
            if (rawDuration > 300) {
                console.log(`单题时间超过5分钟: ${rawDuration}秒,限制为${sessionDuration}秒`);
            }
        }
        return sessionDuration;
    }

    async submitAnswer() {
        const userAnswer = document.getElementById('answer-input').value.trim();
        if (!userAnswer) {
            showToast('请输入答案', 'error');
            return;
        }

        // 计算单题学习时长
        const sessionDuration = this.calculateSessionDuration();

        try {
            showLoading(true);

            const submitData = {
                itemType: this.state.currentModule === 'verb' ? 'vrb' :
                         this.state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: this.state.currentQuestion.itemId,
                form: this.state.currentQuestion.targetForm,
                userAnswer: userAnswer,
                mode: this.state.currentMode,
                sessionDuration: sessionDuration // 添加学习时长
            };

            const result = await this.API.submit(submitData);

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

        statusEl.textContent = result.correct ? '正确!' : '错误';
        statusEl.className = `result-status ${result.correct ? 'correct' : 'incorrect'}`;

        answerEl.textContent = result.correctAnswer;

        if (this.state.settings.showExplain && result.explanation) {
            explanationEl.textContent = result.explanation;
            explanationEl.style.display = 'block';
        } else {
            explanationEl.style.display = 'none';
        }

        resultSection.style.display = 'block';

        if (result.correct) {
            showToast('回答正确!', 'success');
        }
    }

    flipFlashcard() {
        const front = document.getElementById('card-front');
        const back = document.getElementById('card-back');

        if (!this.state.isFlashcardFlipped) {
            // 显示答案 - 直接使用后端返回的correctAnswer
            const q = this.state.currentQuestion;
            // 直接使用后端返回的correctAnswer字段
            const correctAnswer = q.correctAnswer || '无答案';

            document.getElementById('fc-answer').textContent = correctAnswer;

            // 使用现有的解释方法
            let explanation = '';
            if (this.state.currentModule === 'verb') {
                explanation = this.getVerbExplanation(q.targetForm, q.group);
            } else if (this.state.currentModule === 'adj') {
                explanation = this.getAdjectiveExplanation(q.targetForm, q.type);
            } else if (this.state.currentModule === 'plain') {
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
            this.state.isFlashcardFlipped = true;
        }
    }

    generateAnswer(question) {
        if (!question) return { text: '无答案', explanation: '问题数据缺失' };

        const { kana, kanji, targetForm, group, type } = question;
        const base = kanji || kana;

        if (this.state.currentModule === 'verb') {
            const answer = this.conjugateVerb({ kana, kanji, group }, targetForm);
            const explanation = this.getVerbExplanation(targetForm, group);
            return { text: answer, explanation };
        } else if (this.state.currentModule === 'adj') {
            const answer = this.conjugateAdjective({ kana, kanji, type }, targetForm);
            const explanation = this.getAdjectiveExplanation(targetForm, type);
            return { text: answer, explanation };
        } else if (this.state.currentModule === 'plain') {
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

        // 防护逻辑:如果group信息缺失或无效,根据动词词尾推断类型
        let normalizedGroup = group;
        if (!group || group.trim() === '') {
            normalizedGroup = this.inferVerbGroup(base);
            // console.log(`警告: 动词 ${base} 缺少group信息,推断为 ${normalizedGroup} 类`);
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

        // II类动词(一段动词):以る结尾,且倒数第二个假名是e段或i段
        if (verb.endsWith('る')) {
            const beforeRu = verb.slice(-2, -1);
            // e段:え、け、せ、て、ね、へ、め、れ、げ、ぜ、で、べ、ぺ
            // i段:い、き、し、ち、に、ひ、み、り、ぎ、じ、ぢ、び、ぴ
            const eRow = ['え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'];
            const iRow = ['い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ'];

            if (eRow.includes(beforeRu) || iRow.includes(beforeRu)) {
                return 'II';
            }
        }

        // 默认为I类动词(五段动词)
        return 'I';
    }

    conjugateToMasu(verb, group) {
        if (verb === 'する') return 'します';
        if (verb === '来る' || verb === 'くる') return 'きます';

        // 复合动词处理:以「する」结尾的动词
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

        // 复合动词处理:以「する」结尾的动词
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

        // サ変动词(以する结尾的动词)
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
        // 特殊处理:确保II类动词正确变形
        if (group === 'II') {
            // II类动词:去る+た
            return verb.slice(0, -1) + 'た';
        }

        // 其他情况使用て形转换
        const teForm = this.conjugateToTe(verb, group);
        return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
    }

    conjugateToPotential(verb, group) {
        if (verb === 'する') return 'できる';
        if (verb === '来る' || verb === 'くる') return 'こられる';

        // 复合动词处理:以「する」结尾的动词
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

        // 复合动词处理:以「する」结尾的动词
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
        // 数据清理:去除空格并转换为标准格式
        const cleanGroup = this.normalizeVerbGroup(group);

        const explanations = {
            'masu': cleanGroup === 'I' ? 'I类动词ます形:词尾变i段+ます(如:飲む→飲みます)' : cleanGroup === 'II' ? 'II类动词ます形:去る+ます(如:食べる→食べます)' : '不规则动词ます形',
            'te': cleanGroup === 'I' ? 'I类动词て形:く→いて,ぐ→いで,む/ぶ/ぬ→んで,る/う/つ→って,す→して' : cleanGroup === 'II' ? 'II类动词て形:去る+て(如:食べる→食べて)' : '不规则动词て形',
            'nai': cleanGroup === 'I' ? 'I类动词ない形:词尾变a段+ない(如:飲む→飲まない)' : cleanGroup === 'II' ? 'II类动词ない形:去る+ない(如:食べる→食べない)' : '不规则动词ない形',
            'ta': cleanGroup === 'I' ? 'I类动词た形:る/う/つ→った,ぶ/む/ぬ→んだ,く→いた,ぐ→いだ,す→した(如:つくる→作った)' : cleanGroup === 'II' ? 'II类动词た形:去る+た(如:食べる→食べた)' : '不规则动词た形',
            'potential': cleanGroup === 'I' ? 'I类动词可能形:词尾变e段+る(如:飲む→飲める)' : cleanGroup === 'II' ? 'II类动词可能形:去る+られる(如:食べる→食べられる)' : '不规则动词可能形',
            'volitional': cleanGroup === 'I' ? 'I类动词意志形:词尾变o段+う(如:飲む→飲もう)' : cleanGroup === 'II' ? 'II类动词意志形:去る+よう(如:食べる→食べよう)' : '不规则动词意志形'
        };
        return explanations[form] || '基本形';
    }

    getAdjectiveExplanation(form, type) {
        // 数据清理:去除空格并转换为标准格式
        const cleanType = this.normalizeAdjectiveType(type);

        // 如果无法确定形容词类型,返回通用解释
        if (cleanType === null) {
            console.error('无法确定形容词类型,type:', type);
            return '形容词变形(类型未知)';
        }

        const explanations = {
            'negative': cleanType === 'i' ? 'i形容词否定形:去い+くない(如:高い→高くない)' : 'na形容词否定形:+じゃない(如:きれい→きれいじゃない)',
            'past': cleanType === 'i' ? 'i形容词过去形:去い+かった(如:高い→高かった)' : 'na形容词过去形:+だった(如:きれい→きれいだった)',
            'past_negative': cleanType === 'i' ? 'i形容词过去否定形:去い+くなかった(如:高い→高くなかった)' : 'na形容词过去否定形:+じゃなかった(如:きれい→きれいじゃなかった)',
            'plain_negative': cleanType === 'i' ? '简体否定形(i形容词):去い+くない(如:高い→高くない)' : '简体否定形(na形容词):+じゃない / +ではない(如:きれい→きれいじゃない)',
            'plain_past': cleanType === 'i' ? '简体过去形(i形容词):去い+かった(如:高い→高かった)' : '简体过去形(na形容词):+だった(如:きれい→きれいだった)',
            'plain_past_negative': cleanType === 'i' ? '简体过去否定形(i形容词):去い+くなかった(如:高い→高くなかった)' : '简体过去否定形(na形容词):+じゃなかった / +ではなかった(如:きれい→きれいじゃなかった)',
            'adverb': cleanType === 'i' ? 'i形容词副词形:去い+く(如:高い→高く)' : 'na形容词副词形:+に(如:きれい→きれいに)',
            'te': cleanType === 'i' ? 'i形容词て形:去い+くて(如:高い→高くて)' : 'na形容词て形:+で(如:きれい→きれいで)',
            'rentai': 'na形容词连体形:+な(如:きれい→きれいな)'
        };
        return explanations[form] || '基本形';
    }

    getPlainFormExplanation(form, group) {
        // 数据清理:去除空格并转换为标准格式
        const cleanGroup = this.normalizeVerbGroup(group);

        const explanations = {
            'plain_present': '简体现在形:动词原形,不变化',
            'plain_past': cleanGroup === 'I' ? '简体过去形(I类动词):る/う/つ→った,ぶ/む/ぬ→んだ,く→いた,ぐ→いだ,す→した(如:つくる→作った)' : cleanGroup === 'II' ? '简体过去形(II类动词):去る+た(如:食べる→食べた)' : '简体过去形(不规则动词)',
            'plain_negative': cleanGroup === 'I' ? '简体否定形(I类动词):词尾变a段+ない(如:飲む→飲まない)' : cleanGroup === 'II' ? '简体否定形(II类动词):去る+ない(如:食べる→食べない)' : '简体否定形(不规则动词)',
            'plain_past_negative': '简体过去否定形:ない形的ない→なかった'
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
        if (!type || type === '' || type === null || type === undefined) {
            console.warn('Form normalizeAdjectiveType: type为空或未定义,无法确定形容词类型:', type);
            return null; // 返回null而不是默认值,让调用者处理
        }

        const cleaned = String(type).trim().toLowerCase();

        // 处理各种可能的输入格式
        if (cleaned === 'i' || cleaned === 'i-adj' || cleaned === 'i形容词' || cleaned === 'keiyoushi') {
            return 'i';
        }
        if (cleaned === 'na' || cleaned === 'na-adj' || cleaned === 'na形容词' || cleaned === 'keiyoudoushi') {
            return 'na';
        }

        console.warn('Form normalizeAdjectiveType: 无法识别的形容词类型:', type, '清理后:', cleaned);
        // 对于无法识别的类型,尝试根据字符串内容推断
        if (cleaned.includes('i') || cleaned.includes('1')) {
            return 'i';
        }
        if (cleaned.includes('na') || cleaned.includes('2')) {
            return 'na';
        }

        // 最后的fallback,返回原值
        return cleaned;
    }

    async submitFlashcardFeedback(feedback) {
        // 计算单题学习时长
        const sessionDuration = this.calculateSessionDuration();

        // **立即隐藏整个闪卡容器，避免看到旧内容**
        const cardBack = document.getElementById('card-back');
        const cardFront = document.getElementById('card-front');
        if (cardBack) cardBack.style.display = 'none';
        if (cardFront) cardFront.style.display = 'none';
        this.state.isFlashcardFlipped = false;

        try {
            showLoading(true);

            const submitData = {
                itemType: this.state.currentModule === 'verb' ? 'vrb' :
                         this.state.currentModule === 'adj' ? 'adj' : 'pln',
                itemId: this.state.currentQuestion.itemId,
                form: this.state.currentQuestion.targetForm,
                feedback: feedback,
                mode: this.state.currentMode,
                sessionDuration: sessionDuration // 添加学习时长
            };

            await this.API.submit(submitData);

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

// 导出到全局
window.LearningManager = LearningManager;
