const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');

// GET /api/today-overview - 获取今日学习概览
router.get('/today-overview', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const overviewQuery = `
      SELECT * FROM today_learning_overview WHERE user_id = $1
    `;

    const dueReviewsQuery = `
      SELECT
        CASE
          WHEN q.type = 'verb' THEN 'vrb'
          WHEN q.type LIKE 'adjective_%' THEN 'adj'
          WHEN q.type = 'plain' THEN 'pln'
          WHEN q.type = 'polite' THEN 'pol'
          ELSE 'oth'
        END as module_type,
        COUNT(*) as due_count
      FROM reviews r
      LEFT JOIN questions q ON q.id = r.question_id
      WHERE r.user_id = $1 AND r.next_review_at <= NOW()
      GROUP BY 1
    `;

    const todaySessionsQuery = `
      SELECT
        learning_mode,
        module_type,
        COUNT(*) as session_count,
        SUM(total_questions) as total_questions,
        SUM(correct_answers) as correct_answers,
        SUM(session_duration_seconds) as total_time
      FROM learning_sessions
      WHERE user_id = $1 AND session_date = CURRENT_DATE
      GROUP BY learning_mode, module_type
    `;

    const [overviewResult, dueReviewsResult, sessionsResult] = await Promise.all([
      pool.query(overviewQuery, [userId]),
      pool.query(dueReviewsQuery, [userId]),
      pool.query(todaySessionsQuery, [userId])
    ]);

    let overview = overviewResult.rows[0];

    if (!overview) {
      overview = {
        daily_new_target: 0,
        daily_review_target: 0,
        study_streak_days: 0,
        quiz_new_completed: 0,
        flashcard_new_completed: 0,
        quiz_reviews_completed: 0,
        flashcard_reviews_completed: 0,
        total_study_time_today: 0,
        quiz_accuracy_today: 0,
        flashcard_accuracy_today: 0
      };
    }

    const dueReviews = dueReviewsResult.rows.reduce((acc, row) => {
      acc[row.module_type] = parseInt(row.due_count);
      return acc;
    }, { vrb: 0, adj: 0, pln: 0, pol: 0 });

    const todaySessions = sessionsResult.rows;

    res.json({
      overview: {
        daily_new_target: parseInt(overview.daily_new_target) || 0,
        daily_review_target: parseInt(overview.daily_review_target) || 0,
        study_streak_days: parseInt(overview.study_streak_days) || 0,
        quiz_new_completed: parseInt(overview.quiz_new_completed) || 0,
        flashcard_new_completed: parseInt(overview.flashcard_new_completed) || 0,
        quiz_reviews_completed: parseInt(overview.quiz_reviews_completed) || 0,
        flashcard_reviews_completed: parseInt(overview.flashcard_reviews_completed) || 0,
        total_study_time_today: parseInt(overview.total_study_time_today) || 0,
        quiz_accuracy_today: parseFloat(overview.quiz_accuracy_today) || 0,
        flashcard_accuracy_today: parseFloat(overview.flashcard_accuracy_today) || 0
      },
      dueReviews,
      todaySessions,
      progress: {
        newItemsProgress: {
          completed: (parseInt(overview.quiz_new_completed) || 0) + (parseInt(overview.flashcard_new_completed) || 0),
          target: parseInt(overview.daily_new_target) || 0
        },
        reviewsProgress: {
          completed: (parseInt(overview.quiz_reviews_completed) || 0) + (parseInt(overview.flashcard_reviews_completed) || 0),
          target: parseInt(overview.daily_review_target) || 0
        }
      }
    });
  } catch (error) {
    console.error('获取今日概览失败:', error);
    res.status(500).json({ error: '获取今日概览失败' });
  }
});

// GET /api/mode-comparison - 获取模式对比
router.get('/mode-comparison', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { module = 'all' } = req.query;

    let whereClause = 'WHERE user_id = $1';
    let params = [userId];

    if (module !== 'all') {
      whereClause += ' AND module_type = $2';
      params.push(module);
    }

    const comparisonQuery = `
      SELECT
        learning_mode,
        module_type,
        SUM(new_items_completed + reviews_completed) as total_items,
        AVG(accuracy_rate) as accuracy_rate,
        SUM(reviews_completed) as due_count,
        0 as mastered_count
      FROM daily_learning_stats
      ${whereClause}
      GROUP BY learning_mode, module_type
      ORDER BY learning_mode, module_type
    `;

    const result = await pool.query(comparisonQuery, params);

    const modeData = {
      quiz: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } },
      flashcard: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } }
    };

    result.rows.forEach(row => {
      const mode = row.learning_mode;
      const moduleType = row.module_type;

      modeData[mode].modules[moduleType] = {
        total_items: parseInt(row.total_items),
        accuracy_rate: Math.min(parseFloat(row.accuracy_rate) || 0, 100),
        avg_streak: 0,
        due_count: parseInt(row.due_count),
        mastered_count: parseInt(row.mastered_count)
      };

      modeData[mode].totals.total_items += parseInt(row.total_items);
      modeData[mode].totals.due_count += parseInt(row.due_count);
      modeData[mode].totals.mastered_count += parseInt(row.mastered_count);
    });

    ['quiz', 'flashcard'].forEach(mode => {
      const modules = Object.values(modeData[mode].modules);
      if (modules.length > 0) {
        modeData[mode].totals.accuracy_rate = modules.reduce((sum, m) => sum + m.accuracy_rate, 0) / modules.length;
        modeData[mode].totals.avg_streak = modules.reduce((sum, m) => sum + m.avg_streak, 0) / modules.length;
      }
    });

    res.json(modeData);
  } catch (error) {
    res.status(500).json({ error: '获取模式对比失败' });
  }
});

// GET /api/insights/trends - 7天趋势分析
router.get('/insights/trends', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const trendsQuery = `
      SELECT
        DATE(last_review_at) as date,
        COUNT(*) as total_reviews,
        SUM(total_count) as total_attempts,
        SUM(correct_count) as correct_reviews,
        AVG(total_count) as avg_attempts,
        COUNT(DISTINCT question_id) as unique_items
      FROM reviews
      WHERE user_id = $1 AND last_review_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(last_review_at)
      ORDER BY date DESC
    `;

    const trends = await pool.query(trendsQuery, [userId]);

    const totalReviews = trends.rows.reduce((sum, row) => sum + parseInt(row.total_reviews), 0);
    const totalAttempts = trends.rows.reduce((sum, row) => sum + parseInt(row.total_attempts), 0);
    const totalCorrect = trends.rows.reduce((sum, row) => sum + parseInt(row.correct_reviews), 0);
    const avgAccuracy = totalAttempts > 0 ? Math.min((totalCorrect / totalAttempts * 100), 100).toFixed(1) : '0.0';
    const avgDailyReviews = trends.rows.length > 0 ? (totalReviews / trends.rows.length).toFixed(1) : '0.0';

    res.json({
      summary: {
        totalReviews,
        avgAccuracy: parseFloat(avgAccuracy),
        avgDailyReviews: parseFloat(avgDailyReviews),
        activeDays: trends.rows.length
      },
      dailyData: trends.rows.map(row => ({
        date: row.date,
        reviews: parseInt(row.total_reviews),
        attempts: parseInt(row.total_attempts),
        correct: parseInt(row.correct_reviews),
        accuracy: row.total_attempts > 0 ? Math.min((row.correct_reviews / row.total_attempts * 100), 100).toFixed(1) : '0.0',
        avgAttempts: parseFloat(row.avg_attempts || 0).toFixed(1),
        uniqueItems: parseInt(row.unique_items)
      }))
    });
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    res.status(500).json({ error: '获取趋势数据失败' });
  }
});

// GET /api/insights/weaknesses - 薄弱环节分析
router.get('/insights/weaknesses', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const weaknessQuery = `
      SELECT
        q.form_name as form,
        SUM(r.total_count) as total_attempts,
        SUM(r.correct_count) as correct_attempts,
        SUM(r.total_count - r.correct_count) as error_count,
        ROUND(SUM(r.total_count - r.correct_count)::numeric / GREATEST(SUM(r.total_count), 1)::numeric * 100, 1) as error_rate
      FROM reviews r
      LEFT JOIN questions q ON q.id = r.question_id
      WHERE r.user_id = $1 AND r.last_review_at >= NOW() - INTERVAL '30 days'
      GROUP BY q.form_name
      HAVING SUM(r.total_count) >= 5 AND SUM(r.total_count - r.correct_count)::numeric / GREATEST(SUM(r.total_count), 1)::numeric > 0.3
      ORDER BY error_rate DESC, total_attempts DESC
      LIMIT 10
    `;

    const weaknesses = await pool.query(weaknessQuery, [userId]);

    res.json({
      weaknesses: weaknesses.rows.map(row => ({
        form: row.form,
        totalAttempts: parseInt(row.total_attempts),
        errorCount: parseInt(row.error_count),
        errorRate: parseFloat(row.error_rate),
        suggestion: getWeaknessSuggestion(row.form, parseFloat(row.error_rate))
      }))
    });
  } catch (error) {
    console.error('获取薄弱环节失败:', error);
    res.status(500).json({ error: '获取薄弱环节失败' });
  }
});

// 薄弱环节建议
function getWeaknessSuggestion(form, errorRate) {
  const suggestions = {
    'masu': '建议重点练习ます形变位规则,特别注意动词分类',
    'te': 'て形变位较复杂,建议分组记忆:う段动词、る动词、不规则动词',
    'nai': 'ない形变位需要注意动词词尾变化,建议多做练习',
    'ta': 'た形变位与て形类似,可以对比学习',
    'potential': '可能形变位规则较多,建议按动词类型分别练习',
    'volitional': '意志形变位需要区分动词类型,建议重点记忆',
    'imperative': '命令形使用语境较强,建议熟悉一段/五段的变位差异',
    'plain_present': '简体现在形即动词原形,注意与敬语形区别',
    'plain_past': '简体过去形即た形,建议与敬语过去形对比学习',
    'plain_negative': '简体否定形即ない形,注意语境使用',
    'plain_past_negative': '简体过去否定形变位复杂,建议多练习'
  };

  const baseMessage = suggestions[form] || '建议加强此变形的练习';

  if (errorRate > 70) {
    return `${baseMessage}。错误率较高,建议从基础规则开始复习。`;
  } else if (errorRate > 50) {
    return `${baseMessage}。建议重点练习易错点。`;
  } else {
    return `${baseMessage}。稍加练习即可掌握。`;
  }
}

// GET /api/insights/suggestions - 智能建议
router.get('/insights/suggestions', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const suggestions = [];

    const modeAnalysis = await pool.query(`
      SELECT
        learning_mode as mode,
        COUNT(*) as count,
        AVG(accuracy_rate) / 100.0 as accuracy
      FROM daily_learning_stats
      WHERE user_id = $1 AND stat_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY learning_mode
    `, [userId]);

    const frequencyAnalysis = await pool.query(`
      SELECT
        COUNT(DISTINCT stat_date) as active_days,
        COALESCE(SUM(reviews_completed), 0) as total_reviews
      FROM daily_learning_stats
      WHERE user_id = $1 AND stat_date >= CURRENT_DATE - INTERVAL '7 days'
    `, [userId]);

    const dueAnalysis = await pool.query(`
      SELECT COUNT(*) as due_count
      FROM reviews
      WHERE user_id = $1 AND next_review_at <= NOW()
    `, [userId]);

    const freq = frequencyAnalysis.rows[0];
    const due = dueAnalysis.rows[0];

    if (parseInt(freq.active_days) < 3) {
      suggestions.push({
        type: 'frequency',
        icon: '📅',
        title: '保持学习频率',
        description: '建议每天至少学习一次,保持知识的连续性和记忆的巩固。',
        action: '设置学习提醒'
      });
    }

    if (parseInt(due.due_count) > 20) {
      suggestions.push({
        type: 'review',
        icon: '⏰',
        title: '及时复习到期项目',
        description: `您有 ${due.due_count} 个项目需要复习,及时复习有助于巩固记忆。`,
        action: '开始复习'
      });
    }

    if (modeAnalysis.rows.length > 1) {
      const bestMode = modeAnalysis.rows.reduce((best, current) =>
        parseFloat(current.accuracy) > parseFloat(best.accuracy) ? current : best
      );

      if (parseFloat(bestMode.accuracy) > 0.8) {
        suggestions.push({
          type: 'mode',
          icon: '🎯',
          title: `推荐使用${bestMode.mode === 'quiz' ? '测验' : '闪卡'}模式`,
          description: `您在${bestMode.mode === 'quiz' ? '测验' : '闪卡'}模式下的正确率达到 ${(parseFloat(bestMode.accuracy) * 100).toFixed(1)}%,表现优秀。`,
          action: '切换模式'
        });
      }
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: 'general',
        icon: '🌟',
        title: '学习状态良好',
        description: '继续保持当前的学习节奏,稳步提升日语水平。',
        action: '继续学习'
      });
    }

    res.json({ suggestions });
  } catch (error) {
    console.error('获取智能建议失败:', error);
    res.status(500).json({ error: '获取智能建议失败' });
  }
});

module.exports = router;
