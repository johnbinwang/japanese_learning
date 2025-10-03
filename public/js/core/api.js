// 今日概览数据管理器
class TodayOverviewManager {
  constructor() {
    this.cache = null;
    this.lastFetchTime = 0;
    this.cacheDuration = 30000;
    this.pendingRequest = null;
    this.subscribers = new Set();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    if (this.cache) {
      callback(this.cache);
    }
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {}
    });
  }

  async getTodayOverview(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && this.cache && (now - this.lastFetchTime) < this.cacheDuration) {
      return this.cache;
    }

    if (this.pendingRequest) {
      return this.pendingRequest;
    }

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

  async fetchTodayOverview() {
    try {
      const response = await window.APIClient.request('/api/today-overview');
      return response;
    } catch (error) {
      throw error;
    }
  }

  clearCache() {
    this.cache = null;
    this.lastFetchTime = 0;
  }

  async refresh() {
    this.clearCache();
    return this.getTodayOverview(true);
  }
}

// API调用类
class APIClient {
  static async request(endpoint, options = {}) {
    try {
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
        if (response.status === 401) {
          localStorage.removeItem('authToken');
          window.appState.user.isAuthenticated = false;
          window.location.href = '/auth.html';
          return;
        }

        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {}
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      window.showToast('网络错误,请稍后重试', 'error');
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

// 导出到全局
window.APIClient = APIClient;
window.todayOverviewManager = new TodayOverviewManager();
