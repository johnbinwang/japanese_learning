const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');

// GET /api/recommendations - 获取智能推荐
router.get('/recommendations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const [goalsRecs, modesRecs, scheduleRecs, focusRecs] = await Promise.all([
      generateGoalRecommendations(userId),
      generateModeRecommendations(userId),
      generateScheduleRecommendations(userId),
      generateFocusRecommendations(userId)
    ]);

    res.json({
      goals: goalsRecs,
      modes: modesRecs,
      schedule: scheduleRecs,
      focus_areas: focusRecs
    });
  } catch (error) {
    res.status(500).json({ error: '获取推荐失败' });
  }
});

// 生成目标推荐
async function generateGoalRecommendations(userId) {
  const recommendations = [];

  const prefsQuery = await pool.query(
    'SELECT daily_new_target, daily_review_target FROM user_learning_preferences WHERE user_id = $1',
    [userId]
  );

  const prefs = prefsQuery.rows[0] || { daily_new_target: 10, daily_review_target: 50 };

  const todayStatsQuery = `
    SELECT
      SUM(new_items_completed) as today_new,
      SUM(reviews_completed) as today_reviews
    FROM daily_learning_stats
    WHERE user_id = $1 AND stat_date = CURRENT_DATE
  `;

  const todayStats = await pool.query(todayStatsQuery, [userId]);
  const stats = todayStats.rows[0] || { today_new: 0, today_reviews: 0 };

  const todayNew = parseInt(stats.today_new) || 0;
  const todayReviews = parseInt(stats.today_reviews) || 0;
  const dailyNewTarget = parseInt(prefs.daily_new_target) || 10;
  const dailyReviewTarget = parseInt(prefs.daily_review_target) || 50;

  if (todayNew >= dailyNewTarget) {
    recommendations.push({
      title: '今日新学目标已完成',
      description: `您已完成今日 ${todayNew}/${dailyNewTarget} 个新学项目,表现优秀!`,
      data: { current: todayNew, target: dailyNewTarget }
    });
  } else {
    const remaining = dailyNewTarget - todayNew;
    recommendations.push({
      title: '继续完成今日新学目标',
      description: `还需学习 ${remaining} 个新项目即可完成今日目标。`,
      data: { current: todayNew, target: dailyNewTarget, remaining }
    });
  }

  if (todayReviews >= dailyReviewTarget) {
    recommendations.push({
      title: '今日复习目标已完成',
      description: `您已完成今日 ${todayReviews}/${dailyReviewTarget} 个复习项目,做得很棒!`,
      data: { current: todayReviews, target: dailyReviewTarget }
    });
  } else {
    const remaining = dailyReviewTarget - todayReviews;
    recommendations.push({
      title: '继续完成今日复习目标',
      description: `还需复习 ${remaining} 个项目即可完成今日目标。`,
      data: { current: todayReviews, target: dailyReviewTarget, remaining }
    });
  }

  return recommendations;
}

// 生成模式推荐
async function generateModeRecommendations(userId) {
  const recommendations = [];

  const modeStatsQuery = `
    SELECT
      learning_mode,
      COUNT(*) as total_items,
      SUM(attempts) as total_attempts,
      SUM(correct) as total_correct,
      AVG(streak) as avg_streak
    FROM reviews
    WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
    GROUP BY learning_mode
  `;

  const modeStats = await pool.query(modeStatsQuery, [userId]);

  if (modeStats.rows.length === 0) {
    recommendations.push({
      title: '开始学习',
      description: '选择一个学习模式开始您的日语学习之旅!',
      data: { mode: 'quiz' }
    });
    return recommendations;
  }

  const quizData = modeStats.rows.find(r => r.learning_mode === 'quiz');
  const flashcardData = modeStats.rows.find(r => r.learning_mode === 'flashcard');

  if (quizData) {
    const accuracy = (quizData.total_correct / quizData.total_attempts * 100).toFixed(1);
    if (parseFloat(accuracy) >= 80) {
      recommendations.push({
        title: '测验模式表现优秀',
        description: `您的测验模式正确率达到 ${accuracy}%,继续保持!`,
        data: { mode: 'quiz', accuracy: parseFloat(accuracy) }
      });
    } else if (parseFloat(accuracy) < 60) {
      recommendations.push({
        title: '建议使用闪卡模式巩固基础',
        description: `测验模式正确率较低(${accuracy}%),建议先用闪卡模式熟悉内容。`,
        data: { mode: 'flashcard', current_accuracy: parseFloat(accuracy) }
      });
    }
  }

  if (flashcardData) {
    const avgStreak = parseFloat(flashcardData.avg_streak).toFixed(1);
    if (parseFloat(avgStreak) >= 3) {
      recommendations.push({
        title: '可以尝试测验模式',
        description: `您的闪卡平均连击达到 ${avgStreak},可以尝试测验模式进一步挑战。`,
        data: { mode: 'quiz', avg_streak: parseFloat(avgStreak) }
      });
    }
  }

  return recommendations;
}

// 生成时间推荐
async function generateScheduleRecommendations(userId) {
  const recommendations = [];

  const hourlyStatsQuery = `
    SELECT
      EXTRACT(HOUR FROM last_reviewed) as hour,
      COUNT(*) as total_reviews,
      SUM(correct) as correct_reviews,
      SUM(attempts) as total_attempts
    FROM reviews
    WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '30 days'
    GROUP BY EXTRACT(HOUR FROM last_reviewed)
    ORDER BY (SUM(correct)::decimal / NULLIF(SUM(attempts), 0)) DESC
    LIMIT 3
  `;

  const hourlyStats = await pool.query(hourlyStatsQuery, [userId]);

  if (hourlyStats.rows.length > 0) {
    const bestHour = hourlyStats.rows[0];
    const hour = parseInt(bestHour.hour);
    const accuracy = bestHour.total_attempts > 0
      ? (bestHour.correct_reviews / bestHour.total_attempts)
      : 0;

    let timeRange = '上午';
    if (hour >= 12 && hour < 18) timeRange = '下午';
    else if (hour >= 18 && hour < 22) timeRange = '晚上';
    else if (hour >= 22 || hour < 6) timeRange = '深夜';

    recommendations.push({
      title: `您的黄金学习时段是${timeRange}`,
      description: `数据显示您在 ${hour}:00 左右学习效果最佳,正确率达到 ${(accuracy * 100).toFixed(1)}%。`,
      data: {
        hour,
        timeRange,
        accuracy
      }
    });
  }

  return recommendations;
}

// 生成重点关注推荐
async function generateFocusRecommendations(userId) {
  const recommendations = [];

  const weakFormsQuery = `
    SELECT
      form,
      COUNT(*) as total_attempts,
      SUM(correct) as correct_attempts,
      (COUNT(*) - SUM(correct))::decimal / COUNT(*) as error_rate
    FROM reviews
    WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '30 days'
    GROUP BY form
    HAVING COUNT(*) >= 5
    ORDER BY (COUNT(*) - SUM(correct))::decimal / COUNT(*) DESC
    LIMIT 3
  `;

  const weakForms = await pool.query(weakFormsQuery, [userId]);

  weakForms.rows.forEach(row => {
    const errorRate = (parseFloat(row.error_rate) * 100).toFixed(1);

    let formName = row.form;
    const formNameMap = {
      'masu': 'ます形',
      'te': 'て形',
      'nai': 'ない形',
      'ta': 'た形',
      'potential': '可能形',
      'volitional': '意志形',
      'plain_present': '简体现在形',
      'plain_past': '简体过去形',
      'plain_negative': '简体否定形',
      'plain_past_negative': '简体过去否定形'
    };
    formName = formNameMap[row.form] || row.form;

    recommendations.push({
      title: `重点练习${formName}`,
      description: `该变形错误率较高(${errorRate}%),建议加强练习。`,
      data: {
        form: row.form,
        error_rate: parseFloat(errorRate),
        practice_count: parseInt(row.total_attempts)
      }
    });
  });

  if (recommendations.length === 0) {
    recommendations.push({
      title: '各项变形掌握良好',
      description: '继续保持当前学习状态,均衡提升各项能力。',
      data: {}
    });
  }

  return recommendations;
}

module.exports = router;
