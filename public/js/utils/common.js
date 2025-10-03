/**
 * 通用工具函数模块
 */

// 显示加载状态
function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

// 显示提示消息
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 获取认证Token
function getToken() {
  return localStorage.getItem('authToken');
}

// 设置认证Token
function setToken(token) {
  localStorage.setItem('authToken', token);
}

// 移除认证Token
function removeToken() {
  localStorage.removeItem('authToken');
}

// DOM操作工具
const DOMUtils = {
  // 获取元素
  get(selector) {
    return document.querySelector(selector);
  },

  // 获取所有元素
  getAll(selector) {
    return document.querySelectorAll(selector);
  },

  // 显示元素
  show(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    if (element) {
      element.style.display = '';
    }
  },

  // 隐藏元素
  hide(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    if (element) {
      element.style.display = 'none';
    }
  },

  // 切换显示
  toggle(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    if (element) {
      element.style.display = element.style.display === 'none' ? '' : 'none';
    }
  }
};

// 本地存储工具
const Storage = {
  // 设置数据
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage.set error:', e);
      return false;
    }
  },

  // 获取数据
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.error('Storage.get error:', e);
      return defaultValue;
    }
  },

  // 移除数据
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Storage.remove error:', e);
      return false;
    }
  },

  // 清空所有数据
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.error('Storage.clear error:', e);
      return false;
    }
  }
};

// 日期格式化工具
const DateUtils = {
  // 格式化为 YYYY-MM-DD
  formatDate(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化为 YYYY-MM-DD HH:mm:ss
  formatDateTime(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    const dateStr = this.formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
  },

  // 获取今天的日期字符串
  getToday() {
    return this.formatDate(new Date());
  },

  // 计算两个日期之间的天数差
  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};

// 导出到全局
window.showLoading = showLoading;
window.showToast = showToast;
window.getToken = getToken;
window.setToken = setToken;
window.removeToken = removeToken;
window.DOMUtils = DOMUtils;
window.Storage = Storage;
window.DateUtils = DateUtils;
