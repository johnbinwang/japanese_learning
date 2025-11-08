/**
 * 设置管理模块 - 负责设置页面的显示和更新
 */

// 加载今日学习进度
async function loadTodayProgress() {
  try {
    const data = await window.todayOverviewManager.getTodayOverview();

    // 更新今日新学习进度显示
    const todayProgress = parseInt(data.progress?.newItemsProgress?.completed) || 0;
    const todayGoal = window.appState.settings.dailyGoal || parseInt(data.overview?.daily_new_target) || 10;

    const todayProgressEl = document.getElementById('today-progress');
    const todayGoalEl = document.getElementById('today-goal');
    if (todayProgressEl) todayProgressEl.textContent = todayProgress;
    if (todayGoalEl) todayGoalEl.textContent = todayGoal;

    const progressPercentage = todayGoal > 0 ? Math.min((todayProgress / todayGoal) * 100, 100) : 0;
    const settingsNewProgressFill = document.getElementById('settings-new-progress-fill');
    if (settingsNewProgressFill) {
      settingsNewProgressFill.style.width = progressPercentage + '%';
    }

    // 更新今日复习进度显示
    const todayReviewProgress = parseInt(data.progress?.reviewsProgress?.completed) || 0;
    const todayReviewGoal = window.appState.settings.dailyReviewGoal || parseInt(data.overview?.daily_review_target) || 20;

    const todayReviewProgressEl = document.getElementById('today-review-progress');
    const todayReviewGoalEl = document.getElementById('today-review-goal');
    if (todayReviewProgressEl) todayReviewProgressEl.textContent = todayReviewProgress;
    if (todayReviewGoalEl) todayReviewGoalEl.textContent = todayReviewGoal;

    const reviewProgressPercentage = todayReviewGoal > 0 ? Math.min((todayReviewProgress / todayReviewGoal) * 100, 100) : 0;
    const settingsReviewProgressFill = document.getElementById('settings-review-progress-fill');
    if (settingsReviewProgressFill) {
      settingsReviewProgressFill.style.width = reviewProgressPercentage + '%';
    }

  } catch (error) {
    console.error('Failed to load today progress:', error);
  }
}

// 更新设置显示
function updateSettingsDisplay(userData) {
  window.appState.user = {
    ...window.appState.user,
    ...userData
  };

  const userEmail = window.appState.user.email || userData.email || '未登录';
  document.getElementById('user-email-display').textContent = userEmail;

  document.getElementById('due-only-toggle').checked = userData.settings?.dueOnly === true;
  document.getElementById('show-explain-toggle').checked = userData.settings?.showExplain !== false;

  const dailyGoal = userData.preferences?.daily_new_target || userData.settings?.dailyGoal || 10;
  document.getElementById('daily-goal-input').value = dailyGoal;

  const dailyReviewGoal = userData.preferences?.daily_review_target || 20;
  document.getElementById('daily-review-goal-input').value = dailyReviewGoal;

  const enabledForms =
    Array.isArray(userData.settings?.enabledForms) ? [...userData.settings.enabledForms] : [];

  const newSettings = {
    dueOnly: userData.settings?.dueOnly === true,
    showExplain: userData.settings?.showExplain !== false,
    enabledForms,
    dailyGoal: dailyGoal,
    dailyReviewGoal: dailyReviewGoal
  };

  window.appState.settings = newSettings;

  loadTodayProgress();

  const currentModuleForms = window.FORMS[window.appState.currentModule].map(f => f.id);
  window.appState.selectedForms = window.appState.settings.enabledForms.filter(formId =>
    currentModuleForms.includes(formId)
  );

  updateFormToggles();

  if (window.learningManager) {
    window.learningManager.updateFormSelection();
  }
}

// 更新形态开关
function updateFormToggles() {
  const container = document.getElementById('form-toggles');
  const allForms = Object.keys(window.FORMS || {}).flatMap(key => window.FORMS[key]);

  container.innerHTML = allForms.map(form => `
    <div class="form-toggle">
      <span class="form-toggle-label">${form.name}</span>
      <label class="switch-label">
        <input type="checkbox" data-form="${form.id}"
               ${window.appState.settings.enabledForms.includes(form.id) ? 'checked' : ''}>
        <span class="switch"></span>
      </label>
    </div>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateFormToggle);
  });
}

// 更新形态开关状态
async function updateFormToggle(e) {
  const formId = e.target.dataset.form;
  const enabled = e.target.checked;

  if (enabled) {
    if (!window.appState.settings.enabledForms.includes(formId)) {
      window.appState.settings.enabledForms.push(formId);
    }
  } else {
    const index = window.appState.settings.enabledForms.indexOf(formId);
    if (index > -1) {
      window.appState.settings.enabledForms.splice(index, 1);
    }
  }

  try {
    await window.APIClient.updatePreferences({
      enabled_forms: JSON.stringify(window.appState.settings.enabledForms)
    });
  } catch (error) {
    console.error('Failed to update form toggle:', error);
    e.target.checked = !enabled;
  }
}

// 更新每日学习目标
async function updateDailyGoal(e) {
  const newGoal = parseInt(e.target.value) || 10;

  window.appState.settings.dailyGoal = newGoal;
  const todayGoalEl = document.getElementById('today-goal');
  if (todayGoalEl) todayGoalEl.textContent = newGoal;

  try {
    await window.APIClient.updatePreferences({ daily_new_target: newGoal });
    window.showToast('每日目标已更新', 'success');
    loadTodayProgress();
  } catch (error) {
    console.error('Failed to update daily goal:', error);
    window.showToast('目标更新失败', 'error');
  }
}

// 更新每日复习目标
async function updateDailyReviewGoal(e) {
  const newReviewGoal = parseInt(e.target.value) || 20;

  window.appState.settings.dailyReviewGoal = newReviewGoal;
  const todayReviewGoalEl = document.getElementById('today-review-goal');
  if (todayReviewGoalEl) todayReviewGoalEl.textContent = newReviewGoal;

  try {
    await window.APIClient.updatePreferences({ daily_review_target: newReviewGoal });
    window.showToast('每日复习目标已更新', 'success');
    loadTodayProgress();
  } catch (error) {
    console.error('Failed to update daily review goal:', error);
    window.showToast('复习目标更新失败', 'error');
  }
}

// 更新设置
async function updateSetting(e) {
  const setting = e.target.id.replace('-toggle', '').replace('-', '');
  const value = e.target.checked;

  const settingMap = {
    'dueonly': 'dueOnly',
    'showexplain': 'showExplain'
  };

  const settingKey = settingMap[setting.toLowerCase()];
  if (!settingKey) return;

  window.appState.settings[settingKey] = value;

  try {
    const preferencesKey = settingKey === 'dueOnly' ? 'due_only' :
                         settingKey === 'showExplain' ? 'show_explain' : settingKey;
    await window.APIClient.updatePreferences({ [preferencesKey]: value });
    window.showToast('设置已保存', 'success');
  } catch (error) {
    console.error('Failed to update setting:', error);
    window.showToast('设置保存失败', 'error');
    e.target.checked = !value;
    window.appState.settings[settingKey] = !value;
  }
}

// 导出函数
window.SettingsManager = {
  loadTodayProgress,
  updateSettingsDisplay,
  updateFormToggles,
  updateFormToggle,
  updateDailyGoal,
  updateDailyReviewGoal,
  updateSetting
};
