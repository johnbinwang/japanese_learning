// 全局状态管理
window.appState = {
  currentModule: 'verb',
  currentMode: 'flashcard',
  currentQuestion: null,
  selectedForms: [],
  selectedModule: 'all',
  settings: {
    dueOnly: false,
    showExplain: true,
    enabledForms: [],
    dailyGoal: 10,
    dailyReviewGoal: 20
  },
  user: {
    id: null,
    email: null,
    isAuthenticated: false
  },
  isFlashcardFlipped: false,
  sessionStartTime: null,
  questionStartTime: null,
  totalSessionTime: 0
};
