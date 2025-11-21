/**
 * 模块加载器 - 负责按顺序加载所有必需的模块
 */

(function() {
  const modules = [
    // 核心模块 - 必须最先加载
    'js/utils/common.js',
    'js/core/constants.js',
    'js/core/state.js',
    'js/core/api.js',

    // 组件模块
    'js/components/router.js',
    'js/components/learningManager.js',

    // 功能模块
    'js/modules/progressManager.js',
    'js/modules/settingsManager.js',
    'js/modules/aiAssistant.js',
    'js/modules/updateManager.js'
  ];

  let loadedCount = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loadedCount++;
        console.log(`[模块加载] ${loadedCount}/${modules.length} - ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`[模块加载失败] ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  async function loadModules() {
    console.log(`[模块加载] 开始加载 ${modules.length} 个模块`);

    for (const module of modules) {
      await loadScript(module);
    }

    console.log('[模块加载] 所有模块加载完成');
    window.modulesLoaded = true;
    document.dispatchEvent(new Event('modulesLoaded'));
  }

  loadModules().catch(error => {
    console.error('[模块加载] 加载失败:', error);
    alert('应用加载失败,请刷新页面重试');
  });
})();
