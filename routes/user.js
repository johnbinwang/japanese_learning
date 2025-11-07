const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');

const DEFAULT_VERB_FORMS = ['masu', 'te', 'nai', 'ta', 'potential', 'volitional', 'imperative'];

function normalizeEnabledForms(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return [...DEFAULT_VERB_FORMS];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed
          .slice(1, -1)
          .split(',')
          .map(part => part.trim().replace(/^"(.*)"$/, '$1'))
          .filter(Boolean);
      }
    }
  }

  return [...DEFAULT_VERB_FORMS];
}

// 获取用户学习偏好
async function getUserLearningPreferences(userId, includeSettings = false) {
  const { rows } = await pool.query(
    'SELECT * FROM user_learning_preferences WHERE user_id = $1',
    [userId]
  );

  const p = rows[0] || {};

  if (includeSettings) {
    let enabledForms = normalizeEnabledForms(p.enabled_forms);

    if (!enabledForms.includes('imperative')) {
      enabledForms.push('imperative');
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

// GET /api/me - 获取用户信息
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_learning_preferences WHERE user_id = $1',
      [req.user.id]
    );

    const p = rows[0] || {};
    let enabledForms = normalizeEnabledForms(p.enabled_forms);
    if (!enabledForms.includes('imperative')) {
      enabledForms.push('imperative');
    }

    const settings = {
      dueOnly: p.due_only || false,
      showExplain: p.show_explain !== false,
      enabledForms: enabledForms
    };

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        createdAt: req.user.createdAt,
        lastLoginAt: req.user.lastLoginAt
      },
      settings
    });
  } catch (error) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// POST /api/me - 更新用户信息
router.post('/me', authenticateUser, async (req, res) => {
  try {
    const { settings } = await getUserLearningPreferences(req.user.id, true);

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        createdAt: req.user.createdAt,
        lastLoginAt: req.user.lastLoginAt
      },
      settings,
      message: '用户信息更新成功'
    });
  } catch (error) {
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

// GET /api/preferences - 获取用户学习偏好
router.get('/preferences', authenticateUser, async (req, res) => {
  try {
    const preferences = await getUserLearningPreferences(req.user.id);
    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: '获取用户偏好失败' });
  }
});

// POST /api/preferences - 更新用户学习偏好
router.post('/preferences', authenticateUser, async (req, res) => {
  try {
    const dueOnly = (req.body.due_only !== undefined) ? req.body.due_only : req.body.dueOnly;
    const showExplain = (req.body.show_explain !== undefined) ? req.body.show_explain : req.body.showExplain;
    const enabledForms = (req.body.enabled_forms !== undefined) ? req.body.enabled_forms : req.body.enabledForms;
    const dailyGoal = (req.body.daily_goal !== undefined) ? req.body.daily_goal : req.body.dailyGoal;

    const {
      daily_new_target,
      daily_review_target,
      preferred_mode,
      study_streak_days,
      last_study_date,
      total_study_time_seconds
    } = req.body;

    const finalDailyNewTarget = dailyGoal !== undefined ? dailyGoal : daily_new_target;

    const updateFields = [];
    const values = [req.user.id];
    let paramIndex = 2;

    if (finalDailyNewTarget !== undefined) {
      updateFields.push(`daily_new_target = $${paramIndex}`);
      values.push(finalDailyNewTarget);
      paramIndex++;
    }

    if (dueOnly !== undefined) {
      updateFields.push(`due_only = $${paramIndex}`);
      values.push(dueOnly);
      paramIndex++;
    }

    if (showExplain !== undefined) {
      updateFields.push(`show_explain = $${paramIndex}`);
      values.push(showExplain);
      paramIndex++;
    }

    if (enabledForms !== undefined) {
      updateFields.push(`enabled_forms = $${paramIndex}`);
      let formsArray;
      if (Array.isArray(enabledForms)) {
        formsArray = enabledForms;
      } else if (typeof enabledForms === 'string') {
        try {
          formsArray = JSON.parse(enabledForms);
        } catch (e) {
          formsArray = [];
        }
      } else {
        formsArray = [];
      }
      values.push(formsArray);
      paramIndex++;
    }

    if (daily_review_target !== undefined) {
      updateFields.push(`daily_review_target = $${paramIndex}`);
      values.push(daily_review_target);
      paramIndex++;
    }

    if (preferred_mode !== undefined) {
      updateFields.push(`preferred_mode = $${paramIndex}`);
      values.push(preferred_mode);
      paramIndex++;
    }

    if (study_streak_days !== undefined) {
      updateFields.push(`study_streak_days = $${paramIndex}`);
      values.push(study_streak_days);
      paramIndex++;
    }

    if (last_study_date !== undefined) {
      updateFields.push(`last_study_date = $${paramIndex}`);
      values.push(last_study_date);
      paramIndex++;
    }

    if (total_study_time_seconds !== undefined) {
      updateFields.push(`total_study_time_seconds = $${paramIndex}`);
      values.push(total_study_time_seconds);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有提供要更新的字段' });
    }

    updateFields.push(`updated_at = NOW()`);

    const allFields = [
      'daily_new_target', 'daily_review_target', 'preferred_mode',
      'study_streak_days', 'last_study_date', 'total_study_time_seconds',
      'due_only', 'show_explain', 'enabled_forms'
    ];

    let processedEnabledForms = enabledForms;
    if (enabledForms !== undefined) {
      let formsArray;
      if (Array.isArray(enabledForms)) {
        formsArray = enabledForms;
      } else if (typeof enabledForms === 'string') {
        try {
          formsArray = JSON.parse(enabledForms);
        } catch (e) {
          formsArray = [];
        }
      } else {
        formsArray = [];
      }
      processedEnabledForms = `{${formsArray.map(item => `"${item}"`).join(',')}}`;
    }

    const allValues = [
      finalDailyNewTarget, daily_review_target, preferred_mode,
      study_streak_days, last_study_date, total_study_time_seconds,
      dueOnly, showExplain, processedEnabledForms
    ];

    const allDefaults = [
      10, 50, 'quiz', 0, null, 0, false, true,
      '{"present","past","te","potential","passive","causative","imperative","conditional","volitional"}'
    ];

    const insertParams = ['$1'];
    const insertValues = [req.user.id];

    for (let i = 0; i < allFields.length; i++) {
      insertParams.push(`$${insertValues.length + 1}`);
      let value = allValues[i] !== undefined ? allValues[i] : allDefaults[i];
      insertValues.push(value);
    }

    const updateClauses = [];
    for (let i = 0; i < allFields.length; i++) {
      if (allValues[i] !== undefined) {
        updateClauses.push(`${allFields[i]} = $${i + 2}`);
      }
    }
    updateClauses.push('updated_at = NOW()');

    const query = `
      INSERT INTO user_learning_preferences (user_id, ${allFields.join(', ')})
      VALUES (${insertParams.join(', ')})
      ON CONFLICT (user_id) DO UPDATE SET ${updateClauses.join(', ')}
      RETURNING *`;

    const { rows } = await pool.query(query, insertValues);

    res.json({
      success: true,
      preferences: rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: '更新用户偏好失败' });
  }
});

module.exports = router;
