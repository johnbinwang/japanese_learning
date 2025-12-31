/**
 * 主应用入口 - 重构后版本
 *
 * 模块化架构:
 * - public/js/core/state.js - 全局状态管理
 * - public/js/core/api.js - API调用和数据管理
 * - public/js/core/constants.js - 常量定义
 * - public/js/components/router.js - 路由管理
 * - public/js/components/learningManager.js - 学习功能管理
 * - public/js/modules/progressManager.js - 进度页面管理
 * - public/js/modules/settingsManager.js - 设置页面管理
 * - public/js/modules/updateManager.js - 更新管理
 * - public/js/utils/common.js - 通用工具函数
 */

// 初始化应用
class App {
  constructor() {
    // 等待所有模块加载后再引用全局对象
    this.state = window.appState;
    this.API = window.APIClient;
    this.FORMS = window.FORMS;
    this.todayOverviewManager = window.todayOverviewManager;

    this.router = new window.Router();
    this.learningManager = new window.LearningManager();
    window.learningManager = this.learningManager;

    this.restoreUserState();
    this.initializeEventListeners();
    this.loadUserData();
    this.router.initialize();
  }

  restoreUserState() {
    const token = localStorage.getItem('authToken');
    if (token) {
      this.state.user.isAuthenticated = true;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.state.user.id = payload.userId;
        this.state.user.email = payload.email;
      } catch (e) {
        console.error('Invalid token:', e);
        localStorage.removeItem('authToken');
        this.state.user.isAuthenticated = false;
      }
    }
  }

  logout() {
    localStorage.removeItem('authToken');
    this.state.user.isAuthenticated = false;
    this.state.user.id = null;
    this.state.user.email = null;
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

    // 登出按钮
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', this.logout.bind(this));
    }

    // 设置开关
    const dueOnlyToggle = document.getElementById('due-only-toggle');
    if (dueOnlyToggle) {
      dueOnlyToggle.addEventListener('change', window.SettingsManager.updateSetting);
    }

    const showExplainToggle = document.getElementById('show-explain-toggle');
    if (showExplainToggle) {
      showExplainToggle.addEventListener('change', window.SettingsManager.updateSetting);
    }

    // 每日目标设置
    const dailyGoalInput = document.getElementById('daily-goal-input');
    if (dailyGoalInput) {
      dailyGoalInput.addEventListener('change', window.SettingsManager.updateDailyGoal);
    }

    const dailyReviewGoalInput = document.getElementById('daily-review-goal-input');
    if (dailyReviewGoalInput) {
      dailyReviewGoalInput.addEventListener('change', window.SettingsManager.updateDailyReviewGoal);
    }
  }

  async loadUserData() {
    try {
      if (!this.state.user.isAuthenticated) {
        window.location.href = '/auth.html';
        return;
      }

      window.showLoading(true);
      const [userData, preferences] = await Promise.all([
        this.API.getUser(),
        this.API.request('/api/preferences')
      ]);
      userData.preferences = preferences;

      if (userData.id) {
        this.state.user.id = userData.id;
        this.state.user.email = userData.email;
      }

      window.SettingsManager.updateSettingsDisplay(userData);
    } catch (error) {
      console.error('Failed to load user data:', error);
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        this.logout();
      }
    } finally {
      window.showLoading(false);
    }
  }
}

// 兼容性函数 - 保留以支持从路由调用
function initProgressPage() {
  window.ProgressManager.initProgressPage();
}

async function loadTodayOverview() {
  await window.ProgressManager.loadTodayOverview();
}

function updateSettingsDisplay(userData) {
  window.SettingsManager.updateSettingsDisplay(userData);
}

// 等待所有模块加载完成后再启动应用
function initializeApp() {
  if (window.app) {
    console.warn('[App] 已初始化,跳过重复初始化');
    return;
  }

  if (window.__appInitializing) {
    console.warn('[App] 初始化进行中,跳过重复调用');
    return;
  }

  console.log('[App] 开始初始化应用');

  // 检查所有必需的全局对象是否已加载
  const requiredGlobals = [
    'appState',
    'APIClient',
    'FORMS',
    'Router',
    'LearningManager',
    'ProgressManager',
    'SettingsManager',
    'UpdateManager',
    'showLoading',
    'showToast'
  ];

  const missing = requiredGlobals.filter(name => !window[name]);

  if (missing.length > 0) {
    console.error('[App] 缺少必需的全局对象:', missing);
    console.log('[App] 当前已加载的模块:', Object.keys(window).filter(k =>
      ['appState', 'APIClient', 'FORMS', 'Router', 'LearningManager', 'ProgressManager',
       'SettingsManager', 'UpdateManager', 'showLoading', 'showToast'].includes(k)
    ));
    window.showToast('应用加载失败，缺少模块: ' + missing.join(', '), 'error');
    return;
  }

  console.log('[App] 所有模块已加载，创建App实例');

  try {
    window.__appInitializing = true;
    window.app = new App();

    // 初始化更新管理器
    const updateManager = new window.UpdateManager();
    updateManager.init().catch(err => {
      console.error('[App] 更新管理器初始化失败:', err);
    });

    console.log('[App] 应用初始化完成');
  } catch (error) {
    console.error('[App] 应用初始化失败:', error);
    window.showToast('应用初始化失败: ' + error.message, 'error');
    window.app = null;
  } finally {
    window.__appInitializing = false;
  }
}

// 监听模块加载完成事件
if (window.modulesLoaded) {
  // 如果模块已经加载完成，直接初始化
  initializeApp();
} else {
  // 否则等待modulesLoaded事件
  document.addEventListener('modulesLoaded', initializeApp);
}

// DOMContentLoaded作为后备方案
document.addEventListener('DOMContentLoaded', () => {
  if (!window.app) {
    console.warn('[App] DOMContentLoaded触发但应用未初始化，尝试初始化');
    setTimeout(initializeApp, 100);
  }
});
