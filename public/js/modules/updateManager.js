/**
 * 版本检查和更新管理器
 */

class UpdateManager {
  constructor() {
    this.currentVersion = null;
    this.checkInterval = 30 * 60 * 1000; // 30分钟检查一次
    this.lastCheckTime = 0;
    this.updateModal = null;
  }

  async init() {
    this.updateModal = document.getElementById('updateModal');
    this.setupEventListeners();

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

        this.updateVersionDisplay(this.currentVersion);
      } else {
        console.warn('无法获取版本信息,使用默认版本');
        this.currentVersion = '1.0.0';
        this.updateVersionDisplay(this.currentVersion);
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
      this.currentVersion = '1.0.0';
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

    if (updateModal) {
      updateModal.addEventListener('click', (e) => {
        if (e.target.id === 'updateModal') {
          this.hideUpdateModal();
        }
      });
    }
  }

  startVersionCheck() {
    this.checkForUpdates();

    setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const now = Date.now();
        if (now - this.lastCheckTime > 5 * 60 * 1000) {
          this.checkForUpdates();
        }
      }
    });
  }

  async checkForUpdates() {
    try {
      if (!this.currentVersion) {
        console.log('版本号尚未加载,跳过版本检查');
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
      const versionText = this.updateModal.querySelector('p');
      if (versionText) {
        versionText.textContent = `发现新版本 ${newVersion},建议立即更新以获得最佳体验。`;
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
      const updateBtn = document.getElementById('updateNow');
      if (updateBtn) {
        updateBtn.textContent = '更新中...';
        updateBtn.disabled = true;
      }

      console.log('开始执行应用更新...');

      await this.clearAllCaches();

      await this.forceClearAllStorage();

      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('准备刷新页面...');

      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const currentUrl = window.location.href.split('?')[0];
      const newUrl = `${currentUrl}?_refresh=${timestamp}&_nocache=${randomId}&_force=1`;

      window.location.href = newUrl;

    } catch (error) {
      console.error('更新失败:', error);
      window.showToast('更新失败,请手动刷新页面', 'error');

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

      const preserveKeys = ['authToken', 'user_id'];
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!preserveKeys.includes(key)) {
          console.log('强制删除 localStorage 键:', key);
          localStorage.removeItem(key);
        }
      });

      sessionStorage.clear();

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

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          console.log('注销 Service Worker:', registration);
          await registration.unregister();
        }
        console.log('已注销所有 Service Worker');
      }

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

      sessionStorage.clear();
      console.log('已清除 sessionStorage');

      console.log('缓存清理完成');
    } catch (error) {
      console.error('清除缓存时出错:', error);
      throw error;
    }
  }
}

// PWA支持
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        registration.addEventListener('updatefound', () => {
          console.log('发现 Service Worker 更新');
        });
      })
      .catch(registrationError => {
        console.log('SW registration failed:', registrationError);
      });
  });
}

window.UpdateManager = UpdateManager;
