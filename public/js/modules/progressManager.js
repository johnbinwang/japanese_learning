/**
 * 进度管理模块 - 负责进度页面的显示和数据加载
 */

// 初始化进度页面
function initProgressPage() {
  initModeComparisonModuleSelector();
  initInsightTabs();
  updateProgressDisplayWithModule();
}

// 初始化模式对比的模块选择器
function initModeComparisonModuleSelector() {
  const moduleButtons = document.querySelectorAll('.mode-comparison-section .module-btn');

  moduleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      moduleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.appState.selectedModule = btn.dataset.module;
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

      insightTabButtons.forEach(b => b.classList.remove('active'));
      insightContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${targetTab}-insight`).classList.add('active');

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

// 更新进度显示
function updateProgressDisplayWithModule() {
  loadTodayOverview();
  loadModeComparison();
  loadLearningInsights();
}

// 加载今日概览数据
async function loadTodayOverview() {
  try {
    const data = await window.todayOverviewManager.getTodayOverview();
    updateTodayOverview(data);
  } catch (error) {
    console.error('获取今日概览数据失败:', error);
  }
}

// 更新今日概览显示
function updateTodayOverview(data) {
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
  const selectedModule = window.appState.selectedModule || 'all';
  const timestamp = Date.now();
  window.APIClient.request(`/api/mode-comparison?module=${selectedModule}&_t=${timestamp}`, {
    cache: 'no-cache'
  })
  .then(data => {
    updateModeComparison(data);
  })
  .catch(error => {
    console.error('获取模式对比数据失败:', error);
  });
}

// 更新模式对比显示
function updateModeComparison(data) {
  const quizData = data.quiz && data.quiz.totals ? data.quiz.totals : {};
  document.getElementById('quiz-total').textContent = quizData.total_items || 0;
  document.getElementById('quiz-accuracy').textContent = `${(quizData.accuracy_rate || 0).toFixed(1)}%`;
  document.getElementById('quiz-streak').textContent = (quizData.avg_streak || 0).toFixed(1);
  document.getElementById('quiz-mastered').textContent = quizData.mastered_count || 0;

  const flashcardData = data.flashcard && data.flashcard.totals ? data.flashcard.totals : {};
  document.getElementById('flashcard-total').textContent = flashcardData.total_items || 0;
  document.getElementById('flashcard-accuracy').textContent = `${(flashcardData.accuracy_rate || 0).toFixed(1)}%`;
  document.getElementById('flashcard-streak').textContent = (flashcardData.avg_streak || 0).toFixed(1);
  document.getElementById('flashcard-mastered').textContent = flashcardData.mastered_count || 0;

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
        <p>${recommendation.message || '继续保持良好的学习习惯!'}</p>
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
  window.APIClient.request(`/api/insights/trends?_t=${timestamp}`, {
    cache: 'no-cache'
  })
  .then(data => {
    if (data.dailyData) {
      updateWeeklyTrendChart(data.dailyData);
      updateTrendSummary(data);
    }
  })
  .catch(error => {
    console.error('获取趋势数据失败:', error);
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
  window.APIClient.request(`/api/progress?detailed=true&_t=${timestamp}`)
  .then(data => {
    if (data && data.errorPatterns && data.errorPatterns.problems) {
      updateWeaknessList(data.errorPatterns.problems);
    } else {
      updateWeaknessList([]);
    }
  })
  .catch(error => {
    console.error('获取薄弱环节数据失败:', error);
    updateWeaknessList([]);
  });
}

// 更新薄弱环节列表
function updateWeaknessList(weaknesses) {
  const container = document.getElementById('weakness-list');
  if (!container) return;

  if (!weaknesses || weaknesses.length === 0) {
    container.innerHTML = '<div class="no-weaknesses">🎉 暂无明显薄弱环节,继续保持!</div>';
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
  window.APIClient.request(`/api/recommendations?_t=${timestamp}`)
  .then(data => {
    updateRecommendationCards(data);
  })
  .catch(error => {
    console.error('获取智能推荐失败:', error);
  });
}

// 更新推荐卡片
function updateRecommendationCards(recommendations) {
  updateRecommendationSection('goals', recommendations.goals, {
    emptyMessage: '暂无目标建议',
    cardClass: 'goals'
  });

  updateRecommendationSection('modes', recommendations.modes, {
    emptyMessage: '暂无模式建议',
    cardClass: 'modes'
  });

  updateRecommendationSection('schedule', recommendations.schedule, {
    emptyMessage: '暂无时间建议',
    cardClass: 'schedule'
  });

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

  const iconMap = {
    'goals': '🎯',
    'modes': '📚',
    'schedule': '⏰',
    'focus': '🔍'
  };

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = `recommendation-card ${options.cardClass}`;

    let metaHtml = '';

    if (sectionId === 'modes') {
      const mode = item.data?.mode || item.mode || '闪卡模式';
      const accuracy = item.data?.accuracy || item.accuracy;
      const avgStreak = item.data?.avg_streak || item.avg_streak;

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
      }
    } else if (sectionId === 'schedule') {
      const hour = item.data?.hour || item.hour;
      const timeRange = item.data?.timeRange || item.timeRange || '深夜';
      const accuracy = item.data?.accuracy || item.accuracy;

      const timeDisplay = (hour !== undefined && hour !== null) ? `${hour}:00` : '未知时间';
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
    `;

    container.appendChild(card);
  });
}

// 更新周趋势图表
function updateWeeklyTrendChart(weeklyData) {
  const canvas = document.getElementById('weekly-trend-chart');
  if (!canvas || !weeklyData || weeklyData.length === 0) {
    return;
  }

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const margin = { top: 40, right: 30, bottom: 50, left: 50 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const reversedData = [...weeklyData].reverse();

  const maxValue = Math.max(...reversedData.map(d => {
    const val = d.reviews || d.value || 0;
    return isNaN(val) ? 0 : Number(val);
  }));

  if (maxValue === 0 || isNaN(maxValue)) {
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无学习数据', width / 2, height / 2);
    return;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('7天学习趋势', width / 2, 25);

  ctx.fillStyle = '#a0a0a0';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('复习次数', 0, 0);
  ctx.restore();

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

    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();

    ctx.fillText(yValue.toString(), margin.left - 5, y + 3);
  }

  ctx.strokeStyle = '#3a3a4e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top + chartHeight);
  ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartHeight);
  ctx.stroke();

  const barWidth = Math.max(15, chartWidth / reversedData.length * 0.7);
  const barSpacing = chartWidth / reversedData.length;

  reversedData.forEach((d, i) => {
    const value = d.reviews || d.value || 0;
    const numValue = isNaN(value) ? 0 : Number(value);

    const x = margin.left + i * barSpacing + (barSpacing - barWidth) / 2;
    const barHeight = Math.max(0, (numValue / maxValue) * chartHeight);
    const y = margin.top + chartHeight - barHeight;

    if (isNaN(x) || isNaN(y) || isNaN(barWidth) || isNaN(barHeight)) {
      return;
    }

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#4ade80');
    gradient.addColorStop(1, '#16a34a');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);

    if (numValue > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';

      const labelY = barHeight < 20 ? y - 8 : y + barHeight / 2 + 4;
      ctx.fillText(numValue.toString(), x + barWidth / 2, labelY);
    }

    ctx.fillStyle = '#a0a0a0';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';

    let dateStr;
    if (d.date) {
      dateStr = new Date(d.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    } else {
      const date = new Date();
      date.setDate(date.getDate() - (reversedData.length - 1 - i));
      dateStr = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    }

    ctx.fillText(dateStr, x + barWidth / 2, margin.top + chartHeight + 20);
  });

  ctx.fillStyle = '#a0a0a0';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('最近7天复习数据统计', width - 10, height - 10);
}

// 导出函数
window.ProgressManager = {
  initProgressPage,
  loadTodayOverview,
  loadModeComparison,
  loadWeeklyTrends,
  loadWeaknesses,
  loadSuggestions
};
