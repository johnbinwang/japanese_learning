// 路由管理
class Router {
  constructor() {
    this.routes = {
      'learn': () => this.showPage('learn'),
      'ai': () => this.showPage('ai'),
      'progress': () => this.showPage('progress'),
      'settings': () => this.showPage('settings')
    };

    this.checkAuthRoutes();
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  checkAuthRoutes() {
    const path = window.location.pathname;
    const authRoutes = ['/reset-password', '/verify-email', '/login', '/register', '/forgot-password'];

    if (authRoutes.includes(path)) {
      const search = window.location.search;
      const hash = path.replace('/', '');
      window.location.href = `/auth.html#${hash}${search}`;
      return;
    }
  }

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
    const pages = document.querySelectorAll('.page');
    if (pages && pages.length > 0) {
      pages.forEach(page => {
        page.classList.remove('active');
      });
    }

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
    }

    window.scrollTo(0, 0);

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

    if (pageId === 'progress') {
      this.loadProgress();
    } else if (pageId === 'settings') {
      this.loadSettings();
    } else if (pageId === 'ai' && window.aiAssistant && typeof window.aiAssistant.onPageShown === 'function') {
      window.aiAssistant.onPageShown();
    }
  }

  async loadProgress() {
    try {
      initProgressPage();
      await loadTodayOverview();
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  }

  async loadSettings() {
    try {
      const timestamp = Date.now();
      const [userData, preferences] = await Promise.all([
        window.APIClient.request(`/api/me?_t=${timestamp}`, {
          cache: 'no-cache'
        }),
        window.APIClient.request(`/api/preferences?_t=${timestamp}`, {
          cache: 'no-cache'
        })
      ]);

      userData.preferences = preferences;
      updateSettingsDisplay(userData);
      await loadTodayOverview();
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
}

window.Router = Router;
