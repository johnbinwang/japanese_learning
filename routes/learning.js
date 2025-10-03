const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');
const SRSAlgorithm = require('../services/srs/algorithm');
const {
  getModuleConfig,
  parseFormsParam,
  getEnabledForms,
  generateCorrectAnswer,
  normalizeItemType,
  getItemData,
  validateAnswer,
  getExplanation,
  cleanWordText
} = require('./utils/learningUtils');

const srsAlgorithm = new SRSAlgorithm();

// 获取用户学习偏好
async function getUserLearningPreferences(userId, includeSettings = false) {
  const { rows } = await pool.query(
    'SELECT * FROM user_learning_preferences WHERE user_id = $1',
    [userId]
  );

  const p = rows[0] || {};

  if (includeSettings) {
    let enabledForms;
    try {
      enabledForms = p.enabled_forms ? JSON.parse(p.enabled_forms) : ['masu', 'te', 'nai', 'ta', 'potential', 'volitional'];
    } catch (e) {
      enabledForms = ['masu', 'te', 'nai', 'ta', 'potential', 'volitional'];
    }

    return {
      preferences: p,
      settings: {
        dueOnly: p.due_only || false,
        showExplain: p.show_explain !== false,
        enabledForms: enabledForms
      }
    };
  }

  return p || {
    daily_new_target: 10,
    daily_review_target: 50,
    preferred_mode: 'quiz',
    study_streak_days: 0,
    last_study_date: null,
    total_study_time_seconds: 0
  };
}

// 构建到期题目查询
function buildDueItemsQuery(module, tableName, itemType) {
  if (module === 'plain') {
    return {
      query: `
        WITH recent_items AS (
          SELECT DISTINCT r.item_id, r.form, r.item_type
          FROM reviews r
          WHERE r.user_id = $1 AND r.learning_mode = $2
            AND r.last_reviewed >= NOW() - INTERVAL '30 minutes'
        )
        SELECT r.*, i.kana, i.kanji, i.meaning, i.item_type,
               CASE
                 WHEN i.item_type = 'vrb' THEN i.group_type
                 WHEN i.item_type = 'adj' THEN i.adj_type
               END as type_info
        FROM reviews r
        JOIN ${tableName} i ON r.item_id = i.id
        LEFT JOIN recent_items ri ON ri.item_id = r.item_id AND ri.form = r.form AND ri.item_type = r.item_type
        WHERE r.user_id = $1 AND r.learning_mode = $2
          AND ri.item_id IS NULL`,
      paramCount: 2
    };
  }

  return {
    query: `
      WITH recent_items AS (
        SELECT DISTINCT r.item_id, r.form
        FROM reviews r
        WHERE r.user_id = $1 AND r.item_type = $2 AND r.learning_mode = $3
          AND r.last_reviewed >= NOW() - INTERVAL '30 minutes'
      )
      SELECT r.*, i.kana, i.kanji, i.meaning,
             ${itemType === 'adj' ? 'i.type' : 'i.group_type as group'}
      FROM reviews r
      JOIN ${tableName} i ON r.item_id = i.id
      LEFT JOIN recent_items ri ON ri.item_id = r.item_id AND ri.form = r.form
      WHERE r.user_id = $1 AND r.item_type = $2 AND r.learning_mode = $3
        AND ri.item_id IS NULL`,
    paramCount: 3
  };
}

// 构建新题目查询
function buildNewItemsQuery(module, tableName, itemType) {
  if (module === 'plain') {
    return {
      query: `
        WITH recent_items AS (
          SELECT DISTINCT r.item_id, r.form, r.item_type
          FROM reviews r
          WHERE r.user_id = $1 AND r.learning_mode = $2
            AND r.last_reviewed >= NOW() - INTERVAL '30 minutes'
        ),
        candidates AS (
          SELECT i.id AS item_id, i.kana, i.kanji, i.meaning, i.item_type,
                 CASE WHEN i.item_type = 'vrb' THEN i.group_type ELSE NULL END AS group_type,
                 CASE WHEN i.item_type = 'adj' THEN i.adj_type ELSE NULL END AS adj_type,
                 f.form
          FROM ${tableName} i
          CROSS JOIN UNNEST($3::text[]) AS f(form)
        )
        SELECT c.*, 'new' AS status
        FROM candidates c
        LEFT JOIN reviews r
          ON r.user_id = $1
         AND r.item_id = c.item_id
         AND r.form = c.form
         AND r.learning_mode = $2
        LEFT JOIN recent_items ri
          ON ri.item_id = c.item_id
         AND ri.form = c.form
        WHERE r.id IS NULL AND ri.item_id IS NULL
        ORDER BY RANDOM()
        LIMIT 1`,
      paramOrder: ['userId', 'learningMode', 'enabledForms']
    };
  }

  return {
    query: `
      WITH recent_items AS (
        SELECT DISTINCT r.item_id, r.form
        FROM reviews r
        WHERE r.user_id = $1 AND r.item_type = $4 AND r.learning_mode = $3
          AND r.last_reviewed >= NOW() - INTERVAL '30 minutes'
      ),
      candidates AS (
        SELECT i.id AS item_id, i.kana, i.kanji, i.meaning,
               ${itemType === 'adj' ? 'i.type AS type' : 'i.group_type AS group_type'},
               f.form
        FROM ${tableName} i
        CROSS JOIN UNNEST($2::text[]) AS f(form)
      )
      SELECT c.*, 'new' AS status
      FROM candidates c
      LEFT JOIN reviews r
        ON r.user_id = $1
       AND r.item_type = $4
       AND r.item_id = c.item_id
       AND r.form = c.form
       AND r.learning_mode = $3
      LEFT JOIN recent_items ri
        ON ri.item_id = c.item_id
       AND ri.form = c.form
      WHERE r.id IS NULL AND ri.item_id IS NULL
      ORDER BY RANDOM()
      LIMIT 1`,
    paramOrder: ['userId', 'enabledForms', 'learningMode', 'itemType']
  };
}

// 处理项目数据
function processItemData(item, module, itemType) {
  if (module === 'plain') {
    const baseItem = {
      id: item.item_id,
      kana: item.kana,
      kanji: item.kanji,
      meaning: item.meaning,
      item_type: item.item_type
    };

    if (item.item_type === 'vrb') {
      return { ...baseItem, group: (item.group_type || '').trim() };
    } else {
      const adjType = (item.adj_type || '').trim();
      if (!adjType) {
        console.warn('形容词类型为空:', item);
      }
      return { ...baseItem, type: adjType };
    }
  }

  const baseItem = {
    id: item.item_id,
    kana: item.kana,
    kanji: item.kanji,
    meaning: item.meaning
  };

  if (itemType === 'adj') {
    return { ...baseItem, type: item.type };
  } else {
    return { ...baseItem, group: (item.group_type || '').trim() };
  }
}

// 构建响应数据
function buildResponseData(item, targetForm, module, correctAnswer, isNew = false, reviewData = null) {
  const responseData = {
    itemId: item.item_id || item.id,
    itemType: module === 'plain' ? item.item_type || reviewData?.item_type : module,
    kana: cleanWordText(item.kana),
    kanji: cleanWordText(item.kanji),
    meaning: cleanWordText(item.meaning),
    targetForm,
    correctAnswer,
    isNew
  };

  if (!isNew && reviewData) {
    responseData.streak = reviewData.streak;
    responseData.attempts = reviewData.attempts;
  }

  if (module === 'verb' && item.group) {
    responseData.group = item.group;
  } else if (module === 'adj' && item.type) {
    responseData.type = item.type;
    if (!item.type || item.type.trim() === '') {
      console.warn('形容词响应数据中type为空:', item);
    }
  } else if (module === 'plain') {
    const actualType = item.item_type || reviewData?.item_type;
    if (actualType === 'vrb' && item.group) {
      responseData.group = item.group;
    } else if (actualType === 'adj' && item.type) {
      responseData.type = item.type;
      if (!item.type || item.type.trim() === '') {
        console.warn('简体形容词响应数据中type为空:', item);
      }
    }
  }

  return responseData;
}

// 创建复习记录
async function createReviewRecord(userId, itemType, itemId, targetForm, learningMode) {
  const insertSql = `
    INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, due_at, last_reviewed)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (user_id, item_type, item_id, form, learning_mode)
    DO UPDATE SET due_at = EXCLUDED.due_at, last_reviewed = EXCLUDED.last_reviewed
  `;

  const initialDueTime = new Date();
  const params = [userId, itemType, itemId, targetForm, learningMode, initialDueTime];

  return pool.query(insertSql, params);
}

// GET /api/next - 获取下一题
router.get('/next', authenticateUser, async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const { module, forms, mode } = req.query;
    const learningMode = mode || 'flashcard';

    const selectedForms = parseFormsParam(forms);
    const { settings } = await getUserLearningPreferences(req.user.id, true);
    const moduleConfig = getModuleConfig(module);
    const enabledForms = getEnabledForms(selectedForms, settings, moduleConfig.defaultForms);

    const internalSettings = {
      due_only: settings.dueOnly,
      enabled_forms: enabledForms
    };

    // 查询到期题目
    const { query: dueQuery, paramCount } = buildDueItemsQuery(module, moduleConfig.tableName, moduleConfig.itemType);
    const baseParams = module === 'plain'
      ? [req.user.id, learningMode]
      : [req.user.id, moduleConfig.itemType, learningMode];

    let finalQuery = dueQuery + ` AND r.form = ANY($${paramCount + 1})`;
    let queryParams = [...baseParams, enabledForms];

    if (internalSettings.due_only) {
      finalQuery += ' AND r.due_at <= NOW()';
    }

    finalQuery += ' ORDER BY CASE WHEN r.due_at IS NULL THEN 0 ELSE 1 END, RANDOM() LIMIT 1';

    const result = await pool.query(finalQuery, queryParams);

    // 如果有到期题目
    if (result.rows.length > 0) {
      const review = result.rows[0];

      let reviewItem, reviewItemType;
      if (module === 'plain') {
        reviewItemType = review.item_type;
        reviewItem = review.item_type === 'vrb'
          ? { ...review, group: (review.type_info || '').trim() }
          : { ...review, type: (review.type_info || '').trim() };
      } else {
        reviewItemType = moduleConfig.itemType;
        reviewItem = moduleConfig.itemType === 'adj'
          ? review
          : { ...review, group: (review.group || '').trim() };
      }

      const normalizedItemTypeForGeneration = module === 'plain' ? 'pln' : reviewItemType;
      const correctAnswer = generateCorrectAnswer(normalizedItemTypeForGeneration, reviewItem, review.form);
      const responseData = buildResponseData(reviewItem, review.form, module, correctAnswer, false, review);

      return res.json(responseData);
    }

    // 没有到期题目,查询新题目
    console.log('没有到期项目,随机选择一个新项目');
    const { query: newQuery, paramOrder } = buildNewItemsQuery(module, moduleConfig.tableName, moduleConfig.itemType);

    const paramMap = {
      userId: req.user.id,
      learningMode,
      enabledForms,
      itemType: moduleConfig.itemType
    };

    const newQueryParams = paramOrder.map(key => paramMap[key]);

    const { rows: newRows } = await pool.query(newQuery, newQueryParams);

    if (newRows.length === 0) {
      return res.json({ error: '没有更多题目' });
    }

    const newItem = newRows[0];
    const targetForm = newItem.form;

    const actualItemType = module === 'plain' ? newItem.item_type : moduleConfig.itemType;
    await createReviewRecord(req.user.id, actualItemType, newItem.item_id, targetForm, learningMode);

    const processedItem = processItemData(newItem, module, moduleConfig.itemType);
    const normalizedItemTypeForGeneration = module === 'plain' ? 'pln' : actualItemType;
    const correctAnswer = generateCorrectAnswer(normalizedItemTypeForGeneration, processedItem, targetForm);
    const responseData = buildResponseData(processedItem, targetForm, module, correctAnswer, true);

    res.json(responseData);

  } catch (error) {
    console.error('获取下一题错误:', error);
    res.status(500).json({ error: '获取题目失败' });
  }
});

// 获取复习记录
async function getReviewRecord(userId, normalizedItemType, itemId, form, learningMode) {
  const reviewSql = 'SELECT * FROM reviews WHERE user_id = $1 AND item_type = $2 AND item_id = $3 AND form = $4 AND learning_mode = $5';
  const reviewParams = [userId, normalizedItemType, itemId, form, learningMode];
  const { rows: reviewRows } = await pool.query(reviewSql, reviewParams);

  if (reviewRows.length > 0) {
    const review = reviewRows[0];
    return {
      currentStreak: review.streak,
      attempts: review.attempts,
      correct: review.correct
    };
  }

  return {
    currentStreak: 0,
    attempts: 0,
    correct: 0
  };
}

// 更新复习记录
async function updateReviewRecord(userId, normalizedItemType, itemId, form, learningMode, attempts, correct, newStreak, dueAt) {
  const updateSql = `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, attempts, correct, streak, due_at, last_reviewed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id, item_type, item_id, form, learning_mode)
     DO UPDATE SET attempts = $6, correct = $7, streak = $8, due_at = $9, last_reviewed = NOW()`;
  const updateParams = [userId, normalizedItemType, itemId, form, learningMode, attempts, correct, newStreak, dueAt];
  await pool.query(updateSql, updateParams);
}

// 更新每日统计
async function updateDailyStats(userId, learningMode, normalizedItemType, isNewItem, sessionDuration) {
  const todayDate = new Date().toISOString().split('T')[0];

  const ensureStatsSQL = `
    INSERT INTO daily_learning_stats (user_id, stat_date, learning_mode, module_type, new_items_target, new_items_completed, reviews_due, reviews_completed, total_study_time_seconds, accuracy_rate, streak_improvements)
    VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0.00, 0)
    ON CONFLICT (user_id, stat_date, learning_mode, module_type) DO NOTHING`;
  await pool.query(ensureStatsSQL, [userId, todayDate, learningMode, normalizedItemType]);

  if (isNewItem) {
    const updateNewSQL = `
      UPDATE daily_learning_stats
      SET new_items_completed = new_items_completed + 1,
          total_study_time_seconds = total_study_time_seconds + $5,
          updated_at = NOW()
      WHERE user_id = $1 AND stat_date = $2 AND learning_mode = $3 AND module_type = $4`;
    await pool.query(updateNewSQL, [userId, todayDate, learningMode, normalizedItemType, sessionDuration || 0]);
  } else {
    const updateReviewSQL = `
      UPDATE daily_learning_stats
      SET reviews_completed = reviews_completed + 1,
          total_study_time_seconds = total_study_time_seconds + $5,
          updated_at = NOW()
      WHERE user_id = $1 AND stat_date = $2 AND learning_mode = $3 AND module_type = $4`;
    await pool.query(updateReviewSQL, [userId, todayDate, learningMode, normalizedItemType, sessionDuration || 0]);
  }
}

// 更新学习会话
async function updateLearningSession(userId, normalizedItemType, learningMode, isCorrect, sessionDuration) {
  const sessionSQL = `
    INSERT INTO learning_sessions (user_id, module_type, learning_mode, session_date, total_questions, correct_answers, session_duration_seconds)
    VALUES ($1, $2, $3, CURRENT_DATE, 1, $4, $5)
    ON CONFLICT (user_id, session_date, learning_mode, module_type)
    DO UPDATE SET
      total_questions = learning_sessions.total_questions + 1,
      correct_answers = learning_sessions.correct_answers + $4,
      session_duration_seconds = learning_sessions.session_duration_seconds + $5,
      ended_at = NOW()`;
  await pool.query(sessionSQL, [userId, normalizedItemType, learningMode, isCorrect ? 1 : 0, sessionDuration || 0]);
}

// 更新用户学习偏好
async function updateUserPreferences(userId, sessionDuration) {
  const todayDate = new Date().toISOString().split('T')[0];
  const updatePreferencesSQL = `
    INSERT INTO user_learning_preferences (user_id, last_study_date, study_streak_days, total_study_time_seconds)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      study_streak_days = CASE
        WHEN user_learning_preferences.last_study_date = $2 THEN user_learning_preferences.study_streak_days
        WHEN user_learning_preferences.last_study_date = ($2::date - interval '1 day')::date THEN user_learning_preferences.study_streak_days + 1
        ELSE 1
      END,
      last_study_date = $2,
      total_study_time_seconds = user_learning_preferences.total_study_time_seconds + $3`;
  await pool.query(updatePreferencesSQL, [userId, todayDate, sessionDuration || 0]);
}

// POST /api/submit - 提交答案
router.post('/submit', authenticateUser, async (req, res) => {
  try {
    const { itemType, itemId, form, userAnswer, feedback, mode, sessionDuration } = req.body;
    const learningMode = mode || 'quiz';

    let validatedSessionDuration = parseInt(sessionDuration) || 0;
    if (validatedSessionDuration < 0) {
      validatedSessionDuration = 0;
    } else if (validatedSessionDuration > 300) {
      console.warn(`异常的sessionDuration值: ${sessionDuration}秒,限制为300秒`);
      validatedSessionDuration = 300;
    }

    const normalizedItemType = normalizeItemType(itemType);
    const item = await getItemData(normalizedItemType, itemId);
    const correctAnswer = generateCorrectAnswer(normalizedItemType, item, form);
    const isCorrect = validateAnswer(mode, feedback, userAnswer, correctAnswer, item, normalizedItemType, form);

    const { currentStreak, attempts, correct } = await getReviewRecord(req.user.id, normalizedItemType, itemId, form, learningMode);

    const newAttempts = attempts + 1;
    const newCorrect = correct + (isCorrect ? 1 : 0);

    const finalFeedback = feedback || (isCorrect ? 'good' : 'again');
    const { newStreak, dueAt } = srsAlgorithm.calculateNextDue(currentStreak, finalFeedback);

    await updateReviewRecord(req.user.id, normalizedItemType, itemId, form, learningMode, newAttempts, newCorrect, newStreak, dueAt);

    const isNewItem = attempts === 0;
    await updateDailyStats(req.user.id, learningMode, normalizedItemType, isNewItem, validatedSessionDuration);
    await updateLearningSession(req.user.id, normalizedItemType, learningMode, isCorrect, validatedSessionDuration);
    await updateUserPreferences(req.user.id, validatedSessionDuration);

    const explanation = getExplanation(normalizedItemType, item, form);

    res.json({
      correct: isCorrect,
      correctAnswer,
      explanation,
      newStreak: currentStreak,
      nextDue: new Date()
    });

  } catch (error) {
    if (error.message === '题目不存在') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: '提交答案失败' });
  }
});

// GET /api/progress - 获取进度
router.get('/progress', authenticateUser, async (req, res) => {
  try {
    const { module, detailed, mode } = req.query;

    if (detailed === 'true') {
      const progressData = await getDetailedProgress(req.user.id, module, mode);
      res.json(progressData);
      return;
    }

    let itemType;
    if (module === 'verb') itemType = 'vrb';
    else if (module === 'adj') itemType = 'adj';
    else itemType = 'pln';

    let whereClause = 'WHERE user_id = $1 AND item_type = $2';
    let params = [req.user.id, itemType];

    if (mode) {
      whereClause += ' AND learning_mode = $3';
      params.push(mode);
    }

    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*) as total_reviews,
         SUM(attempts) as total_attempts,
         SUM(correct) as total_correct,
         AVG(streak) as avg_streak,
         COUNT(CASE WHEN due_at <= NOW() THEN 1 END) as due_count
       FROM reviews
       ${whereClause}`,
      params
    );

    const { rows: streakRows } = await pool.query(
      `SELECT
         CASE
           WHEN streak = 0 THEN 'new'
           WHEN streak <= 2 THEN 'learning'
           WHEN streak <= 4 THEN 'familiar'
           ELSE 'mastered'
         END as level,
         COUNT(*) as count
       FROM reviews
       ${whereClause}
       GROUP BY
         CASE
           WHEN streak = 0 THEN 'new'
           WHEN streak <= 2 THEN 'learning'
           WHEN streak <= 4 THEN 'familiar'
           ELSE 'mastered'
         END`,
      params
    );

    let recentWhereClause = whereClause + ' AND last_reviewed >= NOW() - INTERVAL \'7 days\'';
    const { rows: recentRows } = await pool.query(
      `SELECT
         DATE(last_reviewed) as date,
         COUNT(*) as reviews,
         SUM(CASE WHEN correct > 0 THEN 1 ELSE 0 END) as correct_reviews
       FROM reviews
       ${recentWhereClause}
       GROUP BY DATE(last_reviewed)
       ORDER BY date`,
      params
    );

    const stats = statsRows[0];
    const accuracy = stats.total_attempts > 0 ? parseFloat((stats.total_correct / stats.total_attempts * 100).toFixed(1)) : 0;

    res.json({
      totalReviews: parseInt(stats.total_reviews) || 0,
      totalAttempts: parseInt(stats.total_attempts) || 0,
      totalCorrect: parseInt(stats.total_correct) || 0,
      accuracy: Math.min(accuracy, 100),
      avgStreak: parseFloat(stats.avg_streak) || 0,
      dueCount: parseInt(stats.due_count) || 0,
      levelDistribution: streakRows.reduce((acc, row) => {
        acc[row.level] = parseInt(row.count);
        return acc;
      }, {}),
      recentActivity: recentRows
    });

  } catch (error) {
    res.status(500).json({ error: '获取进度失败' });
  }
});

// 详细进度分析 (简化版,完整版在insights路由)
async function getDetailedProgress(userId, module, mode = null) {
  const moduleStats = await getModuleComparison(userId, mode, module);
  const formAnalysis = await getFormAnalysis(userId, module, mode);
  const errorAnalysis = await getErrorAnalysis(userId, module, mode);

  return {
    moduleComparison: moduleStats,
    formMastery: formAnalysis,
    errorPatterns: errorAnalysis
  };
}

async function getModuleComparison(userId, mode = null, module = null) {
  if (!pool) return [];

  let sql = `SELECT
       item_type,
       learning_mode,
       COUNT(*) as total_items,
       SUM(attempts) as total_attempts,
       SUM(correct) as total_correct,
       AVG(streak) as avg_streak,
       COUNT(CASE WHEN due_at <= NOW() THEN 1 END) as due_count,
       CASE WHEN SUM(attempts) > 0 THEN SUM(correct)::float / SUM(attempts) ELSE 0 END as accuracy
     FROM reviews
     WHERE user_id = $1`;

  const params = [userId];
  let paramIndex = 2;

  if (module) {
    let itemType;
    if (module === 'verb') itemType = 'vrb';
    else if (module === 'adj') itemType = 'adj';
    else itemType = 'pln';

    sql += ` AND item_type = $${paramIndex}`;
    params.push(itemType);
    paramIndex++;
  }

  if (mode) {
    sql += ` AND learning_mode = $${paramIndex}`;
    params.push(mode);
  }

  sql += ` GROUP BY item_type, learning_mode`;

  const { rows } = await pool.query(sql, params);

  return rows.map(row => ({
    module: row.item_type === 'vrb' ? 'verb' : row.item_type === 'adj' ? 'adjective' : 'plain',
    mode: row.learning_mode,
    totalItems: parseInt(row.total_items),
    totalAttempts: parseInt(row.total_attempts) || 0,
    totalCorrect: parseInt(row.total_correct) || 0,
    avgStreak: parseFloat(row.avg_streak) || 0,
    dueCount: parseInt(row.due_count) || 0,
    accuracy: Math.min(parseFloat(row.accuracy) * 100 || 0, 100).toFixed(1)
  }));
}

async function getFormAnalysis(userId, module, mode = null) {
  if (!pool) return [];

  let itemType;
  if (module === 'verb') itemType = 'vrb';
  else if (module === 'adj') itemType = 'adj';
  else itemType = 'pln';

  let sql = `SELECT
       form,
       learning_mode,
       COUNT(*) as total_items,
       SUM(attempts) as total_attempts,
       SUM(correct) as total_correct,
       AVG(streak) as avg_streak,
       COUNT(CASE WHEN streak >= 5 THEN 1 END) as mastered_count
     FROM reviews
     WHERE user_id = $1 AND item_type = $2`;

  const params = [userId, itemType];
  if (mode) {
    sql += ` AND learning_mode = $3`;
    params.push(mode);
  }

  sql += ` GROUP BY form, learning_mode ORDER BY avg_streak DESC`;

  const { rows } = await pool.query(sql, params);

  return rows.map(row => ({
    form: row.form,
    mode: row.learning_mode,
    totalItems: parseInt(row.total_items),
    totalAttempts: parseInt(row.total_attempts) || 0,
    totalCorrect: parseInt(row.total_correct) || 0,
    avgStreak: parseFloat(row.avg_streak) || 0,
    masteredCount: parseInt(row.mastered_count) || 0,
    accuracy: row.total_attempts > 0 ? Math.min((row.total_correct / row.total_attempts * 100), 100).toFixed(1) : '0.0',
    masteryRate: row.total_items > 0 ? (row.mastered_count / row.total_items * 100).toFixed(1) : '0.0'
  }));
}

async function getErrorAnalysis(userId, module, mode = null) {
  if (!pool) return { errorItems: [], errorStats: [] };

  let itemType;
  if (module === 'verb') itemType = 'vrb';
  else if (module === 'adj') itemType = 'adj';
  else itemType = 'pln';

  let sql = `SELECT
       form,
       item_id,
       learning_mode,
       attempts,
       correct,
       streak,
       (attempts - correct) as errors
     FROM reviews
     WHERE user_id = $1 AND item_type = $2 AND attempts > correct`;

  const params = [userId, itemType];
  if (mode) {
    sql += ` AND learning_mode = $3`;
    params.push(mode);
  }

  sql += ` ORDER BY (attempts - correct) DESC, attempts DESC LIMIT 20`;

  const { rows } = await pool.query(sql, params);

  let errorStatsSql = `SELECT
       form,
       learning_mode,
       COUNT(*) as error_items,
       SUM(attempts - correct) as total_errors,
       AVG(attempts - correct) as avg_errors_per_item
     FROM reviews
     WHERE user_id = $1 AND item_type = $2 AND attempts > correct`;

  const errorStatsParams = [userId, itemType];
  if (mode) {
    errorStatsSql += ` AND learning_mode = $3`;
    errorStatsParams.push(mode);
  }

  errorStatsSql += ` GROUP BY form, learning_mode ORDER BY total_errors DESC`;

  const errorStats = await pool.query(errorStatsSql, errorStatsParams);

  return {
    problems: rows.map(row => ({
      form: row.form,
      itemId: row.item_id,
      attempts: parseInt(row.attempts),
      correct: parseInt(row.correct),
      errors: parseInt(row.errors),
      streak: parseInt(row.streak)
    })),
    errorByForm: errorStats.rows.map(row => ({
      form: row.form,
      errorItems: parseInt(row.error_items),
      totalErrors: parseInt(row.total_errors),
      avgErrorsPerItem: parseFloat(row.avg_errors_per_item)
    }))
  };
}

module.exports = router;
