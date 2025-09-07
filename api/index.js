const express = require('express');
const path = require('path');
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');
const authRoutes = require('../routes/auth');
let cleanWordText;
try {
  const mod = require('../utils/cleanWordText');
  cleanWordText = typeof mod === 'function' ? mod : (text) => String(text || '').replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
} catch (e) {
  cleanWordText = (text) => String(text || '').replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
}

const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// 信任代理，用于正确获取客户端IP
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 认证相关路由
app.use('/api/auth', authRoutes);

// 动词变形引擎
const conjugationEngine = {
  conjugateVerb(verb, group) {
    // 这个函数专门处理 nai 形式
    // 参数验证：确保verb是字符串
    if (!verb || typeof verb !== 'string') {
      // console.error('conjugateVerb: 无效的动词参数:', verb);
      return verb || '';
    }
    
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しない';
    }
    
    if (group === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const aRow = { 'く': 'か', 'ぐ': 'が', 'す': 'さ', 'つ': 'た', 'ぬ': 'な', 'ぶ': 'ば', 'む': 'ま', 'る': 'ら', 'う': 'わ' };
      return stem + (aRow[lastChar] || 'わ') + 'ない';
    } else if (group === 'II') {
      return verb.slice(0, -1) + 'ない';
    }
    return verb + 'ない';
  },

  conjugateToMasu(verb, group) {
    if (verb === 'する') return 'します';
    if (verb === '来る' || verb === 'くる') return 'きます';
    
    // 处理复合动词（名词+する）
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'します';
    }
    
    // 确保group参数去除所有空格
    const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const iRow = { 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち', 'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り', 'う': 'い' };
      return stem + (iRow[lastChar] || 'い') + 'ます';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'ます';
    }
    return verb + 'ます';
  },

  conjugateToTe(verb, group) {
    // 处理复合动词（名词+する）
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'して';
    }
    
    if (verb === '来る' || verb === 'くる') return 'きて';
    
    // 确保group参数去除所有空格
    const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      if (lastChar === 'く') {
        return stem + 'いて';
      } else if (lastChar === 'ぐ') {
        return stem + 'いで';
      } else if (lastChar === 'す') {
        return stem + 'して';
      } else if (['つ', 'う', 'る'].includes(lastChar)) {
        return stem + 'って';
      } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
        return stem + 'んで';
      }
      return stem + 'って';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'て';
    } else if (normalizedGroup === 'IRR' || normalizedGroup === 'III') {
      // 不规则动词的特殊处理
      if (verb === 'する') return 'して';
      if (verb === '来る' || verb === 'くる') return 'きて';
      if (verb === '行く' || verb === 'いく') return 'いって';
      // 复合动词处理
      if (verb.endsWith('する')) {
        return verb.slice(0, -2) + 'して';
      }
    }
    return verb + 'て';
  },
  
  conjugateToTa(verb, group) {
    if (verb === 'する') return 'した';
    if (verb === '来る' || verb === 'くる') return 'きた';
    
      // 确保group参数去除所有空格
    const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    // 特殊处理：确保II类动词正确变形
    if (normalizedGroup === 'II') {
      // II类动词：去る+た
      return verb.slice(0, -1) + 'た';
    }
    
    // 其他情况使用て形转换
    const teForm = this.conjugateToTe(verb, group);
    return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
  },
  
  conjugateToNai(verb, group) {
    if (verb === 'する') return 'しない';
    if (verb === '来る' || verb === 'くる') return 'こない';
    if (verb === 'ある') return 'ない';
    
    // サ変动词（以する结尾的动词）
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しない';
    }
    
    // 确保group参数去除所有空格
    const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const aRow = { 'く': 'か', 'ぐ': 'が', 'す': 'さ', 'つ': 'た', 'ぬ': 'な', 'ぶ': 'ば', 'む': 'ま', 'る': 'ら', 'う': 'わ' };
      return stem + (aRow[lastChar] || 'わ') + 'ない';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'ない';
    }
    return verb + 'ない';
  },
  
  conjugateToPotential(verb, group) {
    if (verb === 'する') return 'できる';
    if (verb === '来る' || verb === 'くる') return 'こられる';
    
    // 处理复合动词（名词+する）
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'できる';
    }
    
    // 确保group参数去除所有空格
     const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const eRow = { 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ', 'う': 'え' };
      return stem + (eRow[lastChar] || 'え') + 'る';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'られる';
    }
    return verb + 'られる';
  },
  
  conjugateToVolitional(verb, group) {
    if (verb === 'する') return 'しよう';
    if (verb === '来る' || verb === 'くる') return 'こよう';
    
    // 处理复合动词（名词+する）
    if (verb.endsWith('する')) {
      return verb.slice(0, -2) + 'しよう';
    }
    
    // 确保group参数去除所有空格
     const normalizedGroup = (group || '').replace(/\s+/g, '');
    
    if (normalizedGroup === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const oRow = { 'く': 'こ', 'ぐ': 'ご', 'す': 'そ', 'つ': 'と', 'ぬ': 'の', 'ぶ': 'ぼ', 'む': 'も', 'る': 'ろ', 'う': 'お' };
      return stem + (oRow[lastChar] || 'お') + 'う';
    } else if (normalizedGroup === 'II') {
      return verb.slice(0, -1) + 'よう';
    }
    return verb + 'よう';
  },
  
  // 形容词变形
  conjugateAdjective(adj, form) {
    const { kana, kanji, type } = adj;
    // 从kanji或kana中提取纯净的形容词基础形，去掉数字后缀
    const rawBase = kanji || kana;
    const base = rawBase.replace(/\d+$/, ''); // 去掉末尾的数字
    
    // 兼容数据库中可能存在的尾随空格，如 'i ' 或 'na '
    const normalizedType = (type || '').trim();
    
    if (normalizedType === 'i') {
      return this.conjugateIAdjective(base, form);
    } else if (normalizedType === 'na') {
      return this.conjugateNaAdjective(base, form);
    }
    return base;
  },
  
  conjugateIAdjective(adj, form) {
    const stem = adj.slice(0, -1);
    
    switch (form) {
      case 'negative':
      case 'plain_negative':
        return adj === 'いい' ? 'よくない' : stem + 'くない';
      case 'past':
      case 'plain_past':
        return adj === 'いい' ? 'よかった' : stem + 'かった';
      case 'past_negative':
      case 'plain_past_negative':
        return adj === 'いい' ? 'よくなかった' : stem + 'くなかった';
      case 'adverb':
        return adj === 'いい' ? 'よく' : stem + 'く';
      case 'te':
        return adj === 'いい' ? 'よくて' : stem + 'くて';
      default:
        return adj;
    }
  },
  
  conjugateNaAdjective(adj, form) {
    const base = adj.replace(/な$/, '');
    
    switch (form) {
      case 'negative':
      case 'plain_negative':
        return base + 'じゃない / ' + base + 'ではない';
      case 'past':
      case 'plain_past':
        return base + 'だった';
      case 'past_negative':
      case 'plain_past_negative':
        return base + 'じゃなかった / ' + base + 'ではなかった';
      case 'adverb':
        return base + 'に';
      case 'rentai':
        return base + 'な';
      case 'te':
        return base + 'で';
      default:
        return base + 'だ';
    }
  },
  
  // 获取变形规则说明
  getExplanation(itemType, form, group = null, type = null) {
    if (itemType === 'vrb') {
      const explanations = {
        'masu': group === 'I' ? 'I类动词ます形：词尾变i段+ます（如：飲む→飲みます）' : group === 'II' ? 'II类动词ます形：去る+ます（如：食べる→食べます）' : '不规则动词ます形',
        'te': group === 'I' ? 'I类动词て形：く→いて，ぐ→いで，む/ぶ/ぬ→んで，る/う/つ→って，す→して' : group === 'II' ? 'II类动词て形：去る+て（如：食べる→食べて）' : '不规则动词て形',
        'nai': group === 'I' ? 'I类动词ない形：词尾变a段+ない（如：飲む→飲まない）' : group === 'II' ? 'II类动词ない形：去る+ない（如：食べる→食べない）' : '不规则动词ない形',
        'ta': group === 'I' ? 'I类动词た形：る/う/つ→った，ぶ/む/ぬ→んだ，く→いた，ぐ→いだ，す→した（如：つくる→作った）' : group === 'II' ? 'II类动词た形：去る+た（如：食べる→食べた）' : '不规则动词た形',
        'potential': group === 'I' ? 'I类动词可能形：词尾变e段+る（如：飲む→飲める）' : group === 'II' ? 'II类动词可能形：去る+られる（如：食べる→食べられる）' : '不规则动词可能形',
        'volitional': group === 'I' ? 'I类动词意志形：词尾变o段+う（如：飲む→飲もう）' : group === 'II' ? 'II类动词意志形：去る+よう（如：食べる→食べよう）' : '不规则动词意志形'
      };
      return explanations[form] || '基本形';
    } else if (itemType === 'pln') {
            const explanations = {
                'plain_present': '简体现在形：动词原形，不变化',
                'plain_past': '简体过去形：I类动词る/う/つ→った，ぶ/む/ぬ→んだ，く→いた，ぐ→いだ，す→した；II类动词去る+た',
                'plain_negative': '简体否定形：I类动词词尾变a段+ない，II类动词去る+ない',
                'plain_past_negative': '简体过去否定形：ない形的ない→なかった'
            };
            return explanations[form] || '简体形式';
    } else if (itemType === 'adj') {
      const explanations = {
        'negative': type === 'i' ? 'i形容词否定形：去い+くない（如：高い→高くない）' : 'na形容词否定形：+じゃない（如：きれい→きれいじゃない）',
        'past': type === 'i' ? 'i形容词过去形：去い+かった（如：高い→高かった）' : 'na形容词过去形：+だった（如：きれい→きれいだった）',
        'past_negative': type === 'i' ? 'i形容词过去否定形：去い+くなかった（如：高い→高くなかった）' : 'na形容词过去否定形：+じゃなかった（如：きれい→きれいじゃなかった）',
        'adverb': type === 'i' ? 'i形容词副词形：去い+く（如：高い→高く）' : 'na形容词副词形：+に（如：きれい→きれいに）',
        'te': type === 'i' ? 'i形容词て形：去い+くて（如：高い→高くて）' : 'na形容词て形：+で（如：きれい→きれいで）',
        'rentai': 'na形容词连体形：+な（如：きれい→きれいな）'
      };
      return explanations[form] || '基本形';
    }
    return '基本形';
  }
};

// SRS算法
const srsAlgorithm = {
  intervals: [0, 10 * 60 * 1000, 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000, 
             7 * 24 * 60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000], // 毫秒
  
  calculateNextDue(streak, feedback = 'good') {
    let newStreak = streak;
    
    switch (feedback) {
      case 'again':
        newStreak = 0;
        break;
      case 'hard':
        newStreak = Math.max(0, streak - 1);
        break;
      case 'good':
        newStreak = streak + 1;
        break;
      case 'easy':
        newStreak = streak + 2;
        break;
    }
    
    const intervalIndex = Math.min(newStreak, this.intervals.length - 1);
    const interval = this.intervals[intervalIndex];
    const dueAt = new Date(Date.now() + interval);
    
    return { newStreak, dueAt };
  }
};

// API路由

// 获取用户信息
app.get('/api/me', authenticateUser, async (req, res) => {
  try {
    let settings;
    
    const { rows } = await pool.query(
      'SELECT * FROM user_learning_preferences WHERE user_id = $1',
      [req.user.id]
    );
    
    const p = rows[0] || {};
    // 统一返回 camelCase 字段，便于前端直接使用
    // enabled_forms 是 PostgreSQL 数组类型，直接使用即可
    const enabledForms = p.enabled_forms || ['masu', 'te', 'nai', 'ta', 'potential', 'volitional'];
    
    settings = {
      dueOnly: p.due_only || false,
      showExplain: p.show_explain !== false, // 默认为true
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
    // console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新用户信息
app.post('/api/me', authenticateUser, async (req, res) => {
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
    // console.error('更新用户信息错误:', error);
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

// 获取用户学习偏好的公共函数
async function getUserLearningPreferences(userId, includeSettings = false) {
  const { rows } = await pool.query(
    'SELECT * FROM user_learning_preferences WHERE user_id = $1',
    [userId]
  );
  
  const p = rows[0] || {};
  
  if (includeSettings) {
    // 解析enabled_forms
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

// 获取用户学习偏好
app.get('/api/preferences', authenticateUser, async (req, res) => {
  try {
    const preferences = await getUserLearningPreferences(req.user.id);
    res.json(preferences);
  } catch (error) {
    // console.error('获取用户偏好错误:', error);
    res.status(500).json({ error: '获取用户偏好失败' });
  }
});

// 更新用户学习偏好
app.post('/api/preferences', authenticateUser, async (req, res) => {
  try {
    // 支持settings字段的兼容性
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
    
    // 如果提供了dailyGoal，同步到daily_new_target
    const finalDailyNewTarget = dailyGoal !== undefined ? dailyGoal : daily_new_target;
    
    // 构建更新字段
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
      // 确保enabledForms是数组格式，pg库会自动处理PostgreSQL数组类型
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
    
    // 构建动态的 UPSERT 查询
    const allFields = [
      'daily_new_target', 'daily_review_target', 'preferred_mode', 
      'study_streak_days', 'last_study_date', 'total_study_time_seconds',
      'due_only', 'show_explain', 'enabled_forms'
    ];
    
    // 处理enabledForms为PostgreSQL数组格式
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
    
    // 构建INSERT VALUES子句
    const insertParams = ['$1']; // user_id
    const insertValues = [req.user.id];
    
    for (let i = 0; i < allFields.length; i++) {
      insertParams.push(`$${insertValues.length + 1}`);
      let value = allValues[i] !== undefined ? allValues[i] : allDefaults[i];
      insertValues.push(value);
    }
    
    // 构建UPDATE SET子句
    const updateClauses = [];
    for (let i = 0; i < allFields.length; i++) {
      if (allValues[i] !== undefined) {
        updateClauses.push(`${allFields[i]} = $${i + 2}`); // +2 because $1 is user_id
      }
    }
    updateClauses.push('updated_at = NOW()');
    
    const query = `
      INSERT INTO user_learning_preferences (user_id, ${allFields.join(', ')})
      VALUES (${insertParams.join(', ')})
      ON CONFLICT (user_id) DO UPDATE SET ${updateClauses.join(', ')}
      RETURNING *`;
    
    // console.log('UPSERT Query:', query);
    // console.log('UPSERT Values:', insertValues);
    const { rows } = await pool.query(query, insertValues);
    
    res.json({
      success: true,
      preferences: rows[0]
    });
  } catch (error) {
    // console.error('更新用户偏好错误:', error);
    res.status(500).json({ error: '更新用户偏好失败' });
  }
});

// 更新设置 - 重定向到preferences接口以保持向后兼容
// settings接口已合并到preferences接口中

// 获取下一题
app.get('/api/next', authenticateUser, async (req, res) => {
  try {
    // 禁用缓存，确保每次请求都返回新的随机题目
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const { module, forms, mode } = req.query; // verb, adj, plain
    const learningMode = mode || 'flashcard'; // 默认改为闪卡模式
    
    // 处理前端传递的 forms 参数
    let selectedForms = [];
    if (forms) {
      selectedForms = forms.split(',').map(f => f.trim()).filter(Boolean);
    }
    
    // 获取用户学习偏好设置
    const { settings } = await getUserLearningPreferences(req.user.id, true);
    
    // 转换为API内部使用的格式
    const internalSettings = {
      due_only: settings.dueOnly,
      enabled_forms: settings.enabledForms
    };

    // 如果传入了 forms 参数，覆盖设置中的 enabled_forms
    if (selectedForms.length > 0) {
      internalSettings.enabled_forms = selectedForms;
    }
    
    // 根据模块类型设置默认形态
    let defaultForms;
    if (module === 'verb') {
      defaultForms = ['masu', 'te', 'nai', 'ta'];
    } else if (module === 'adj') {
      defaultForms = ['negative', 'past', 'past_negative', 'adverb'];
    } else {
      defaultForms = ['plain_present', 'plain_past', 'plain_negative'];
    }
    
    // 优先使用前端传递的 forms 参数，如果没有则使用设置中的 enabled_forms，最后使用默认值
    const enabledForms = selectedForms.length > 0 ? selectedForms : (internalSettings.enabled_forms || defaultForms);
    
    let itemType, tableName;
    if (module === 'verb') {
      itemType = 'vrb';
      tableName = 'verbs';
    } else if (module === 'adj') {
      itemType = 'adj';
      tableName = 'adjectives';
    } else {
      // 简体形模块使用专门的 plain 表，包含动词和形容词数据
      itemType = 'vrb';//默认改为动词vrb
      tableName = 'plain';
    }
    
    let rows = [];
    
    let query;
    if (module === 'plain') {
      // plain 表的查询，根据 item_type 动态选择字段，避免最近30分钟内出现的题目
      query = `
        WITH recent_items AS (
          SELECT DISTINCT r.item_id, r.form, r.item_type
          FROM reviews r
          WHERE r.user_id = $1 AND r.learning_mode = $3
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
        WHERE r.user_id = $1 AND r.item_type = $2 AND r.learning_mode = $3
          AND ri.item_id IS NULL
      `;
    } else {
      // 原有的 verbs 和 adjectives 表查询，避免最近30分钟内出现的题目
      query = `
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
          AND ri.item_id IS NULL
      `;
    }
    
    const params = [req.user.id, itemType, learningMode];
    
    // 按启用的形态过滤（确保只取当前启用形态的到期题目）
    query += ' AND r.form = ANY($4)';
    params.push(enabledForms);
    
    if (internalSettings.due_only) {
      query += ' AND r.due_at <= NOW()';
    }
    
    query += ' ORDER BY r.due_at ASC, r.streak ASC, RANDOM() LIMIT 1';
    
    // console.log('SQL查询:', query, '参数:', params);
    const result = await pool.query(query, params);
    rows = result.rows;
    
    // 如果没有到期项目，随机选择一个新项目（避免最近出现的题目）
    if (rows.length === 0) {
      // console.log('没有到期项目，随机选择一个新项目');
      let item;
      
      let randomQuery;
      let randomParams;
      if (module === 'plain') {
        randomQuery = `
          WITH recent_items AS (
            SELECT DISTINCT r.item_id, r.form, r.item_type
            FROM reviews r
            WHERE r.user_id = $1 AND r.learning_mode = $3
              AND r.last_reviewed >= NOW() - INTERVAL '30 minutes'
          ),
          candidates AS (
            SELECT i.id AS item_id, i.kana, i.kanji, i.meaning, i.item_type,
                   CASE WHEN i.item_type = 'vrb' THEN i.group_type ELSE NULL END AS group_type,
                   CASE WHEN i.item_type = 'adj' THEN i.adj_type ELSE NULL END AS adj_type,
                   f.form
            FROM ${tableName} i
            CROSS JOIN UNNEST($2::text[]) AS f(form)
          )
          SELECT c.*, 'new' AS status
          FROM candidates c
          LEFT JOIN reviews r
            ON r.user_id = $1
           AND r.item_type = c.item_type
           AND r.item_id = c.item_id
           AND r.form = c.form
           AND r.learning_mode = $3
          LEFT JOIN recent_items ri
            ON ri.item_id = c.item_id
           And ri.form = c.form
           AND ri.item_type = c.item_type
          WHERE r.id IS NULL AND ri.item_id IS NULL
          ORDER BY RANDOM()
          LIMIT 1
        `;
        randomParams = [req.user.id, enabledForms, learningMode];
      } else {
        randomQuery = `
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
          LIMIT 1
        `;
        randomParams = [req.user.id, enabledForms, learningMode, itemType];
      }
      
      // console.log('SQL查询:', randomQuery, '参数:', randomParams);
      const { rows: newRows } = await pool.query(randomQuery, randomParams);
      
      if (newRows.length === 0) {
        return res.json({ error: '没有更多题目' });
      }
      
      item = newRows[0];
      const targetForm = item.form; // 已按item+form粒度选择
      
      // 创建新的复习记录
      const insertSql = `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, due_at) 
         VALUES ($1, $2, $3, $4, $5, NOW()) 
         ON CONFLICT (user_id, item_type, item_id, form, learning_mode) 
         DO UPDATE SET due_at = EXCLUDED.due_at`;
      const actualItemType = module === 'plain' ? item.item_type : itemType;
      const insertParams = [req.user.id, actualItemType, item.item_id, targetForm, learningMode];
      await pool.query(insertSql, insertParams);
      
      // 处理 plain 表和其他表的数据结构差异
      let processedItem;
      if (module === 'plain') {
        if (item.item_type === 'vrb') {
          processedItem = { id: item.item_id, kana: item.kana, kanji: item.kanji, meaning: item.meaning, group: (item.group_type || '').trim() };
        } else {
          processedItem = { id: item.item_id, kana: item.kana, kanji: item.kanji, meaning: item.meaning, type: (item.adj_type || '').trim() };
        }
      } else {
        processedItem = itemType === 'adj'
          ? { id: item.item_id, kana: item.kana, kanji: item.kanji, meaning: item.meaning, type: item.type }
          : { id: item.item_id, kana: item.kana, kanji: item.kanji, meaning: item.meaning, group: (item.group_type || '').trim() };
      }
      
      let correctAnswer;
      if ((module === 'plain' && item.item_type === 'adj') || itemType === 'adj') {
        correctAnswer = conjugationEngine.conjugateAdjective(processedItem, targetForm);
      } else {
        // 根据 targetForm 调用相应的动词变形方法
        switch (targetForm) {
          case 'masu':
            correctAnswer = conjugationEngine.conjugateToMasu ? conjugationEngine.conjugateToMasu(processedItem.kana, processedItem.group) : processedItem.kana;
            break;
          case 'te':
            correctAnswer = conjugationEngine.conjugateToTe ? conjugationEngine.conjugateToTe(processedItem.kana, processedItem.group) : processedItem.kana;
            break;
          case 'nai':
            correctAnswer = conjugationEngine.conjugateToNai(processedItem.kana, processedItem.group);
            break;
          case 'ta':
            correctAnswer = conjugationEngine.conjugateToTa(processedItem.kana, processedItem.group);
            break;
          case 'potential':
            correctAnswer = conjugationEngine.conjugateToPotential(processedItem.kana, processedItem.group);
            break;
          case 'volitional':
            correctAnswer = conjugationEngine.conjugateToVolitional(processedItem.kana, processedItem.group);
            break;
          default:
            correctAnswer = processedItem.kana;
        }
      }
      
      const responseData = {
        itemId: processedItem.id,
        itemType: module === 'plain' ? item.item_type : module,
        kana: cleanWordText(processedItem.kana),
        kanji: cleanWordText(processedItem.kanji),
        meaning: cleanWordText(processedItem.meaning),
        targetForm,
        correctAnswer, // 仅用于验证，前端不应显示
        isNew: true
      };
      
      // 为动词添加group字段，为形容词添加type字段
      if (module === 'verb') {
        if (processedItem.group) responseData.group = processedItem.group;
      } else if (module === 'adj') {
        if (processedItem.type) responseData.type = processedItem.type;
      } else if (module === 'plain') {
        if (item.item_type === 'vrb' && processedItem.group) responseData.group = processedItem.group;
        if (item.item_type === 'adj' && processedItem.type) responseData.type = processedItem.type;
      }
      return res.json(responseData);
    }
    
    const review = rows[0];
    // 处理复习题目的数据结构
    let reviewItem, reviewItemType;
    if (module === 'plain') {
      reviewItemType = review.item_type; // 从 plain 表获取实际类型
      if (review.item_type === 'vrb') {
        reviewItem = { ...review, group: (review.type_info || '').trim() };
      } else {
        reviewItem = { ...review, type: (review.type_info || '').trim() };
      }
    } else {
      reviewItemType = itemType;
      reviewItem = itemType === 'adj' ? review : { ...review, group: (review.group || '').trim() };
    }
    
    let correctAnswer;
    if ((module === 'plain' && review.item_type === 'adj') || itemType === 'adj') {
      correctAnswer = conjugationEngine.conjugateAdjective(reviewItem, review.form);
    } else {
      // 根据 targetForm 调用相应的动词变形方法
      switch (review.form) {
        case 'masu':
          correctAnswer = conjugationEngine.conjugateToMasu(reviewItem.kana, reviewItem.group);
          break;
        case 'te':
          correctAnswer = conjugationEngine.conjugateToTe(reviewItem.kana, reviewItem.group);
          break;
        case 'nai':
          correctAnswer = conjugationEngine.conjugateToNai(reviewItem.kana, reviewItem.group);
          break;
        case 'ta':
          correctAnswer = conjugationEngine.conjugateToTa(reviewItem.kana, reviewItem.group);
          break;
        case 'potential':
          correctAnswer = conjugationEngine.conjugateToPotential(reviewItem.kana, reviewItem.group);
          break;
        case 'volitional':
          correctAnswer = conjugationEngine.conjugateToVolitional(reviewItem.kana, reviewItem.group);
          break;
        case 'plain_present':
          correctAnswer = reviewItem.kana;
          break;
        case 'plain_past':
          correctAnswer = conjugationEngine.conjugateToTa(reviewItem.kana, reviewItem.group);
          break;
        case 'plain_negative':
          correctAnswer = conjugationEngine.conjugateToNai(reviewItem.kana, reviewItem.group);
          break;
        case 'plain_past_negative':
          const naiForm = conjugationEngine.conjugateToNai(reviewItem.kana, reviewItem.group);
          correctAnswer = naiForm.replace(/ない$/, 'なかった');
          break;
        default:
          correctAnswer = reviewItem.kana;
      }
    }
    
    // console.log(`复习题目 - ${module}:`, review.kanji || review.kana, itemType === 'adj' ? '类型:' : '分组:', itemType === 'adj' ? review.type : review.group, '目标形式:', review.form, '正确答案:', correctAnswer);
    
    const responseData = {
      itemId: review.item_id || review.id, // 兼容两种情况
      itemType: module === 'plain' ? reviewItemType : module, // 修复：plain 模块使用实际的项目类型，其他模块使用模块名
      kana: cleanWordText(review.kana),
      kanji: cleanWordText(review.kanji),
      meaning: cleanWordText(review.meaning),
      targetForm: review.form,
      correctAnswer, // 仅用于验证，前端不应显示
      streak: review.streak,
      attempts: review.attempts
    };
    
    // 为动词添加group字段，为形容词添加type字段
     if (module === 'verb') {
       responseData.group = reviewItem.group;
     } else if (module === 'adj') {
       responseData.type = reviewItem.type;
     } else if (module === 'plain') {
       // plain 模块根据实际类型添加相应字段
       if (reviewItemType === 'vrb') {
         responseData.group = reviewItem.group;
       } else if (reviewItemType === 'adj') {
         responseData.type = reviewItem.type;
       }
     }
    // console.log('/api/next 返回数据:', responseData);
    res.json(responseData);
    
  } catch (error) {
    // console.error('获取下一题错误:', error);
    res.status(500).json({ error: '获取题目失败' });
  }
});

// 提交答案
app.post('/api/submit', authenticateUser, async (req, res) => {
  try {
    const { itemType, itemId, form, userAnswer, feedback, mode } = req.body;
    const learningMode = mode || 'quiz'; // 默认为quiz模式
    // console.log('/api/submit 收到的数据:', { itemType, itemId, form, userAnswer, feedback, mode });
    
    // 标准化itemType - 处理大小写不匹配问题
    const normalizedItemType = itemType.toUpperCase() === 'VRB' || itemType.toLowerCase() === 'verb' ? 'vrb' : 
                               itemType.toUpperCase() === 'ADJ' || itemType.toLowerCase() === 'adjective' ? 'adj' : 
                               itemType.toUpperCase() === 'PLN' || itemType.toLowerCase() === 'plain' ? 'pln' : 
                               itemType.toLowerCase();
    
    let item, correctAnswer;
    
    // 根据 itemType 确定查询的表和逻辑
    let tableName, sql;
    if (normalizedItemType === 'pln') {
      // plain 模块从 plain 表查询
      tableName = 'plain';
      sql = `SELECT * FROM ${tableName} WHERE id = $1`;
    } else if (normalizedItemType === 'adj') {
      tableName = 'adjectives';
      sql = `SELECT * FROM ${tableName} WHERE id = $1`;
    } else {
      tableName = 'verbs';
      sql = `SELECT * FROM ${tableName} WHERE id = $1`;
    }
    
    // console.log('SQL查询:', sql, '参数:', [itemId]);
    const { rows: itemRows } = await pool.query(sql, [itemId]);
    
    if (itemRows.length === 0) {
      return res.status(404).json({ error: '题目不存在' });
    }
    
    item = itemRows[0]; 
    
    // 生成正确答案
    if (normalizedItemType === 'pln') {
      // plain 模块根据实际的 item_type 决定变位方式
      if (item.item_type === 'adj') {
        // 处理形容词数据结构
        const processedItem = { ...item, type: (item.adj_type || '').trim() };
        correctAnswer = conjugationEngine.conjugateAdjective(processedItem, form);
      } else {
        // 处理动词数据结构
        const processedItem = { ...item, group: (item.group_type || '').trim() };
        // 根据form调用相应的动词变形方法
        switch (form) {
          case 'plain_present':
            correctAnswer = processedItem.kana;
            break;
          case 'plain_past':
            correctAnswer = conjugationEngine.conjugateToTa(processedItem.kana, processedItem.group);
            break;
          case 'plain_negative':
            correctAnswer = conjugationEngine.conjugateToNai(processedItem.kana, processedItem.group);
            break;
          case 'plain_past_negative':
            const naiForm = conjugationEngine.conjugateToNai(processedItem.kana, processedItem.group);
            correctAnswer = naiForm.replace(/ない$/, 'なかった');
            break;
          default:
            correctAnswer = processedItem.kana;
        }
      }
    } else if (normalizedItemType === 'adj') {
      correctAnswer = conjugationEngine.conjugateAdjective(item, form);
    } else {
      // 动词处理 - 根据form调用相应的变形方法
      switch (form) {
        case 'masu':
          correctAnswer = conjugationEngine.conjugateToMasu(item.kana, item.group);
          break;
        case 'te':
          correctAnswer = conjugationEngine.conjugateToTe(item.kana, item.group);
          break;
        case 'nai':
          correctAnswer = conjugationEngine.conjugateToNai(item.kana, item.group);
          break;
        case 'ta':
          correctAnswer = conjugationEngine.conjugateToTa(item.kana, item.group);
          break;
        case 'potential':
          correctAnswer = conjugationEngine.conjugateToPotential(item.kana, item.group);
          break;
        case 'volitional':
          correctAnswer = conjugationEngine.conjugateToVolitional(item.kana, item.group);
          break;
        default:
          correctAnswer = item.kana;
      }
    }
    
    // 闪卡模式不需要userAnswer，直接根据feedback判断
    let isCorrect;
    if (mode === 'flashcard') {
      // 闪卡模式根据用户反馈判断
      isCorrect = feedback === 'good' || feedback === 'easy';
    } else {
      // 测验模式根据答案判断 - 支持汉字和平假名两种形式
      const trimmedUserAnswer = userAnswer ? userAnswer.trim() : '';
      
      // 基本答案匹配
      isCorrect = trimmedUserAnswer === correctAnswer;
      
      // 如果基本匹配失败，检查是否有汉字形式的答案
      if (!isCorrect && item && item.kanji) {
        // 生成汉字版本的正确答案
        let kanjiCorrectAnswer;
        
        if (normalizedItemType === 'pln') {
          if (item.item_type === 'adj') {
            // 形容词的汉字变形 - 确保传递汉字信息
            const processedItem = { 
              kana: item.kana, 
              kanji: item.kanji, 
              type: (item.adj_type || '').trim() 
            };
            kanjiCorrectAnswer = conjugationEngine.conjugateAdjective(processedItem, form);
          } else {
            // 动词的汉字变形
            const processedItem = { ...item, group: (item.group_type || '').trim() };
            switch (form) {
              case 'plain_present':
                kanjiCorrectAnswer = processedItem.kanji || processedItem.kana;
                break;
              case 'plain_past':
                kanjiCorrectAnswer = conjugationEngine.conjugateToTa(processedItem.kanji || processedItem.kana, processedItem.group);
                break;
              case 'plain_negative':
                kanjiCorrectAnswer = conjugationEngine.conjugateToNai(processedItem.kanji || processedItem.kana, processedItem.group);
                break;
              case 'plain_past_negative':
                const naiFormKanji = conjugationEngine.conjugateToNai(processedItem.kanji || processedItem.kana, processedItem.group);
                kanjiCorrectAnswer = naiFormKanji.replace(/ない$/, 'なかった');
                break;
              default:
                kanjiCorrectAnswer = processedItem.kanji || processedItem.kana;
            }
          }
        } else if (normalizedItemType === 'adj') {
          // 普通形容词的汉字变形 - 确保传递汉字信息
          const processedItem = {
            kana: item.kana,
            kanji: item.kanji,
            type: (item.type || '').trim()
          };
          kanjiCorrectAnswer = conjugationEngine.conjugateAdjective(processedItem, form);
        } else {
          // 动词处理 - 使用汉字形式
          switch (form) {
            case 'masu':
              kanjiCorrectAnswer = conjugationEngine.conjugateToMasu(item.kanji || item.kana, item.group);
              break;
            case 'te':
              kanjiCorrectAnswer = conjugationEngine.conjugateToTe(item.kanji || item.kana, item.group);
              break;
            case 'nai':
              kanjiCorrectAnswer = conjugationEngine.conjugateToNai(item.kanji || item.kana, item.group);
              break;
            case 'ta':
              kanjiCorrectAnswer = conjugationEngine.conjugateToTa(item.kanji || item.kana, item.group);
              break;
            case 'potential':
              kanjiCorrectAnswer = conjugationEngine.conjugateToPotential(item.kanji || item.kana, item.group);
              break;
            case 'volitional':
              kanjiCorrectAnswer = conjugationEngine.conjugateToVolitional(item.kanji || item.kana, item.group);
              break;
            default:
              kanjiCorrectAnswer = item.kanji || item.kana;
          }
        }
        
        // 检查用户答案是否匹配汉字版本
        if (kanjiCorrectAnswer && trimmedUserAnswer === kanjiCorrectAnswer) {
          isCorrect = true;
        }
      }
    }
    
    let currentStreak = 0;
    let attempts = 0;
    let correct = 0;
    
    const reviewSql = 'SELECT * FROM reviews WHERE user_id = $1 AND item_type = $2 AND item_id = $3 AND form = $4 AND learning_mode = $5';
    const reviewParams = [req.user.id, normalizedItemType, itemId, form, learningMode];
    // console.log('SQL查询:', reviewSql, '参数:', reviewParams);
    const { rows: reviewRows } = await pool.query(reviewSql, reviewParams);
    
    if (reviewRows.length > 0) {
      const review = reviewRows[0];
      currentStreak = review.streak;
      attempts = review.attempts;
      correct = review.correct;
    }
    
    // 更新统计
    attempts++;
    if (isCorrect) correct++;
    
    // 计算新的间隔和到期时间
    const finalFeedback = feedback || (isCorrect ? 'good' : 'again');
    const { newStreak, dueAt } = srsAlgorithm.calculateNextDue(currentStreak, finalFeedback);
    
    // 更新复习记录
    const updateSql = `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, attempts, correct, streak, due_at, last_reviewed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id, item_type, item_id, form, learning_mode)
       DO UPDATE SET attempts = $6, correct = $7, streak = $8, due_at = $9, last_reviewed = NOW()`;
    const updateParams = [req.user.id, normalizedItemType, itemId, form, learningMode, attempts, correct, newStreak, dueAt];
    // console.log('SQL更新:', updateSql, '参数:', updateParams);
    await pool.query(updateSql, updateParams);
    
    // 更新每日学习统计
    const isNewItem = attempts === 1; // 如果是第一次尝试，则为新学习项目
    const today = new Date().toISOString().split('T')[0];
    
    // 确保今日统计记录存在
    const ensureStatsSQL = `
      INSERT INTO daily_learning_stats (user_id, stat_date, learning_mode, module_type, new_items_target, new_items_completed, reviews_due, reviews_completed, total_study_time_seconds, accuracy_rate, streak_improvements)
      VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0.00, 0)
      ON CONFLICT (user_id, stat_date, learning_mode, module_type) DO NOTHING`;
    await pool.query(ensureStatsSQL, [req.user.id, today, learningMode, normalizedItemType]);
    
    // 更新统计数据
    if (isNewItem) {
      // 新学习项目（无论对错都要记录）
      const updateNewSQL = `
        UPDATE daily_learning_stats 
        SET new_items_completed = new_items_completed + 1,
            updated_at = NOW()
        WHERE user_id = $1 AND stat_date = $2 AND learning_mode = $3 AND module_type = $4`;
      await pool.query(updateNewSQL, [req.user.id, today, learningMode, normalizedItemType]);
    } else {
      // 复习项目
      const updateReviewSQL = `
        UPDATE daily_learning_stats 
        SET reviews_completed = reviews_completed + 1,
            updated_at = NOW()
        WHERE user_id = $1 AND stat_date = $2 AND learning_mode = $3 AND module_type = $4`;
      await pool.query(updateReviewSQL, [req.user.id, today, learningMode, normalizedItemType]);
    }
    
    // 记录学习会话 - 使用正确的表结构
    const sessionSQL = `
      INSERT INTO learning_sessions (user_id, module_type, learning_mode, session_date, total_questions, correct_answers)
      VALUES ($1, $2, $3, CURRENT_DATE, 1, $4)
      ON CONFLICT (user_id, session_date, learning_mode, module_type) 
      DO UPDATE SET 
        total_questions = learning_sessions.total_questions + 1,
        correct_answers = learning_sessions.correct_answers + $4,
        ended_at = NOW()`;
    await pool.query(sessionSQL, [req.user.id, normalizedItemType, learningMode, isCorrect ? 1 : 0]);
    
    // 获取解释
    let explanation;
    if (normalizedItemType === 'adj') {
      explanation = conjugationEngine.getExplanation(normalizedItemType, form, null, item.type);
    } else if (normalizedItemType === 'pln') {
      // plain模块根据实际item_type决定解释
      if (item.item_type === 'adj') {
        explanation = conjugationEngine.getExplanation('adj', form, null, item.adj_type);
      } else {
        explanation = conjugationEngine.getExplanation('pln', form, (item.group_type || '').trim(), null);
      }
    } else {
      // 动词 - 如果group_type缺失，使用推断的类型
      const rawBase = item.kanji || item.kana;
      const base = rawBase.replace(/\d+$/, ''); // 去掉末尾的数字
      let groupForExplanation = item.group_type;
      if (!groupForExplanation || groupForExplanation.trim() === '') {
        groupForExplanation = conjugationEngine.inferVerbGroup(base);
      } else {
        groupForExplanation = groupForExplanation.trim(); // 修复：去除多余空格
      }
      explanation = conjugationEngine.getExplanation(normalizedItemType, form, groupForExplanation, null);
    }
    
    res.json({
      correct: isCorrect,
      correctAnswer,
      explanation,
      newStreak: currentStreak,
      nextDue: new Date()
    });
    
  } catch (error) {
    // console.error('提交答案错误:', error);
    res.status(500).json({ error: '提交答案失败' });
  }
});

// 获取今日学习概览
app.get('/api/today-overview', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取今日概览数据
    const overviewQuery = `
      SELECT * FROM today_learning_overview WHERE user_id = $1
    `;
    
    // 获取今日到期复习数量
    const dueReviewsQuery = `
      SELECT * FROM get_today_due_reviews($1)
    `;
    
    // 获取今日已完成的学习会话
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
    
    // 如果没有找到overview数据，提供默认值
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
    
    // console.log('overview', overview);
    const dueReviews = dueReviewsResult.rows.reduce((acc, row) => {
      acc[row.module_type] = parseInt(row.due_count);
      return acc;
    }, { vrb: 0, adj: 0, pln: 0 });
    
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
    // console.error('获取今日概览失败:', error);
    res.status(500).json({ error: '获取今日概览失败' });
  }
});

// 获取模式对比分析
app.get('/api/mode-comparison', authenticateUser, async (req, res) => {
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
      SELECT * FROM mode_comparison_analysis ${whereClause}
      ORDER BY learning_mode, module_type
    `;
    
    const result = await pool.query(comparisonQuery, params);
    
    // 按模式分组数据
    const modeData = {
      quiz: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } },
      flashcard: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } }
    };
    
    result.rows.forEach(row => {
      const mode = row.learning_mode;
      const moduleType = row.module_type;
      
      modeData[mode].modules[moduleType] = {
        total_items: parseInt(row.total_items),
        accuracy_rate: parseFloat(row.accuracy_rate),
        avg_streak: parseFloat(row.avg_streak),
        due_count: parseInt(row.due_count),
        mastered_count: parseInt(row.mastered_count)
      };
      
      // 累计总数
      modeData[mode].totals.total_items += parseInt(row.total_items);
      modeData[mode].totals.due_count += parseInt(row.due_count);
      modeData[mode].totals.mastered_count += parseInt(row.mastered_count);
    });
    
    // 计算平均值
    ['quiz', 'flashcard'].forEach(mode => {
      const modules = Object.values(modeData[mode].modules);
      if (modules.length > 0) {
        modeData[mode].totals.accuracy_rate = modules.reduce((sum, m) => sum + m.accuracy_rate, 0) / modules.length;
        modeData[mode].totals.avg_streak = modules.reduce((sum, m) => sum + m.avg_streak, 0) / modules.length;
      }
    });
    
    res.json(modeData);
  } catch (error) {
    // console.error('获取模式对比失败:', error);
    res.status(500).json({ error: '获取模式对比失败' });
  }
});

// 获取学习进度
// 7天趋势分析API
app.get('/api/insights/trends', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取最近7天的学习数据
    const trendsQuery = `
      SELECT 
        DATE(updated_at) as date,
        COUNT(*) as total_reviews,
        SUM(correct) as correct_reviews,
        AVG(attempts) as avg_attempts,
        COUNT(DISTINCT item_id) as unique_items
      FROM reviews 
      WHERE user_id = $1 AND updated_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(updated_at)
      ORDER BY date DESC
    `;
    
    const trends = await pool.query(trendsQuery, [userId]);
    
    // 计算总体统计
    const totalReviews = trends.rows.reduce((sum, row) => sum + parseInt(row.total_reviews), 0);
    const totalCorrect = trends.rows.reduce((sum, row) => sum + parseInt(row.correct_reviews), 0);
    const avgAccuracy = totalReviews > 0 ? (totalCorrect / totalReviews * 100).toFixed(1) : '0.0';
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
        correct: parseInt(row.correct_reviews),
        accuracy: row.total_reviews > 0 ? (row.correct_reviews / row.total_reviews * 100).toFixed(1) : '0.0',
        avgAttempts: parseFloat(row.avg_attempts || 0).toFixed(1),
        uniqueItems: parseInt(row.unique_items)
      }))
    });
  } catch (error) {
    // console.error('获取趋势数据失败:', error);
    res.status(500).json({ error: '获取趋势数据失败' });
  }
});

// 薄弱环节分析API
app.get('/api/insights/weaknesses', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取错误率较高的变形
    const weaknessQuery = `
      SELECT 
        form,
        COUNT(*) as total_attempts,
        SUM(correct) as correct_attempts,
        (COUNT(*) - SUM(correct)) as error_count,
        ROUND((COUNT(*) - SUM(correct))::numeric / COUNT(*)::numeric * 100, 1) as error_rate
      FROM reviews 
      WHERE user_id = $1 AND updated_at >= NOW() - INTERVAL '30 days'
      GROUP BY form
      HAVING COUNT(*) >= 5 AND (COUNT(*) - SUM(correct))::numeric / COUNT(*)::numeric > 0.3
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
    // console.error('获取薄弱环节失败:', error);
    res.status(500).json({ error: '获取薄弱环节失败' });
  }
});

// 智能建议API
app.get('/api/insights/suggestions', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const suggestions = [];
    
    // 分析学习模式
    const modeAnalysis = await pool.query(`
      SELECT 
        learning_mode as mode,
        COUNT(*) as count,
        AVG(CASE WHEN correct > 0 THEN 1.0 ELSE 0.0 END) as accuracy
      FROM reviews 
      WHERE user_id = $1 AND updated_at >= NOW() - INTERVAL '7 days'
      GROUP BY learning_mode
    `, [userId]);
    
    // 分析学习频率
    const frequencyAnalysis = await pool.query(`
      SELECT 
        COUNT(DISTINCT DATE(updated_at)) as active_days,
        COUNT(*) as total_reviews
      FROM reviews 
      WHERE user_id = $1 AND updated_at >= NOW() - INTERVAL '7 days'
    `, [userId]);
    
    // 分析到期项目
    const dueAnalysis = await pool.query(`
      SELECT COUNT(*) as due_count
      FROM reviews 
      WHERE user_id = $1 AND next_due <= NOW()
    `, [userId]);
    
    const freq = frequencyAnalysis.rows[0];
    const due = dueAnalysis.rows[0];
    
    // 生成建议
    if (parseInt(freq.active_days) < 3) {
      suggestions.push({
        type: 'frequency',
        icon: '📅',
        title: '保持学习频率',
        description: '建议每天至少学习一次，保持知识的连续性和记忆的巩固。',
        action: '设置学习提醒'
      });
    }
    
    if (parseInt(due.due_count) > 20) {
      suggestions.push({
        type: 'review',
        icon: '⏰',
        title: '及时复习到期项目',
        description: `您有 ${due.due_count} 个项目需要复习，及时复习有助于巩固记忆。`,
        action: '开始复习'
      });
    }
    
    // 模式建议
    if (modeAnalysis.rows.length > 1) {
      const bestMode = modeAnalysis.rows.reduce((best, current) => 
        parseFloat(current.accuracy) > parseFloat(best.accuracy) ? current : best
      );
      
      if (parseFloat(bestMode.accuracy) > 0.8) {
        suggestions.push({
          type: 'mode',
          icon: '🎯',
          title: `推荐使用${bestMode.mode === 'quiz' ? '测验' : '闪卡'}模式`,
          description: `您在${bestMode.mode === 'quiz' ? '测验' : '闪卡'}模式下的正确率达到 ${(parseFloat(bestMode.accuracy) * 100).toFixed(1)}%，表现优秀。`,
          action: '切换模式'
        });
      }
    }
    
    // 如果没有特殊建议，提供通用建议
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'general',
        icon: '🌟',
        title: '学习状态良好',
        description: '继续保持当前的学习节奏，稳步提升日语水平。',
        action: '继续学习'
      });
    }
    
    res.json({ suggestions });
  } catch (error) {
    // console.error('获取智能建议失败:', error);
    res.status(500).json({ error: '获取智能建议失败' });
  }
});

app.get('/api/progress', authenticateUser, async (req, res) => {
  try {
    const { module, detailed, mode } = req.query;
    // console.log(`🚀 /api/progress called with: module=${module}, detailed=${detailed}, mode=${mode}, userId=${req.user.id}`);
    
    if (detailed === 'true') {
      // console.log('📊 Calling getDetailedProgress...');
      // 返回详细的进度分析
      const progressData = await getDetailedProgress(req.user.id, module, mode);
      // console.log('✅ getDetailedProgress completed, returning data');
      res.json(progressData);
      return;
    }
    
    let itemType;
    if (module === 'verb') itemType = 'vrb';
    else if (module === 'adj') itemType = 'adj';
    else itemType = 'pln';
    
    // 构建查询条件
    let whereClause = 'WHERE user_id = $1 AND item_type = $2';
    let params = [req.user.id, itemType];
    
    if (mode) {
      whereClause += ' AND learning_mode = $3';
      params.push(mode);
    }
    
    // 总体统计
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
    
    // 按熟练度分组
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
    
    // 最近7天的学习记录
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
      accuracy: Math.min(accuracy, 100), // 确保正确率不超过100%
      avgStreak: parseFloat(stats.avg_streak) || 0,
      dueCount: parseInt(stats.due_count) || 0,
      levelDistribution: streakRows.reduce((acc, row) => {
        acc[row.level] = parseInt(row.count);
        return acc;
      }, {}),
      recentActivity: recentRows
    });
    
  } catch (error) {
    // console.error('获取进度错误:', error);
    res.status(500).json({ error: '获取进度失败' });
  }
});

// 详细进度分析函数
async function getDetailedProgress(userId, module, mode = null) {
  // console.log(`🔍 getDetailedProgress called with: userId=${userId}, module=${module}, mode=${mode}`);
  
  const moduleStats = await getModuleComparison(userId, mode, module);
  // console.log('📊 moduleStats:', moduleStats);
  
  const formAnalysis = await getFormAnalysis(userId, module, mode);
  // console.log('📋 formAnalysis:', formAnalysis);
  
  const errorAnalysis = await getErrorAnalysis(userId, module, mode);
  // console.log('❌ errorAnalysis:', errorAnalysis);
  
  const learningTrends = await getLearningTrends(userId, module, mode);
  // console.log('📈 learningTrends:', learningTrends);
  
  const recommendations = await getRecommendations(userId, module);
  // console.log('💡 recommendations:', recommendations);
  
  return {
    moduleComparison: moduleStats,
    formMastery: formAnalysis,
    errorPatterns: errorAnalysis,
    learningTrends: learningTrends,
    recommendations: recommendations
  };
}

// 模块对比分析
async function getModuleComparison(userId, mode = null, module = null) {
  if (!pool) {
    return [];
  }
  
  let sql = `SELECT 
       item_type,
       learning_mode,
       COUNT(*) as total_items,
       SUM(attempts) as total_attempts,
       SUM(correct) as total_correct,
       AVG(streak) as avg_streak,
       COUNT(CASE WHEN due_at <= NOW() THEN 1 END) as due_count,
       AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
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

// 变形掌握度分析
async function getFormAnalysis(userId, module, mode = null) {
  if (!pool) {
    return [];
  }
  
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

// 错误模式分析
async function getErrorAnalysis(userId, module, mode = null) {
  if (!pool) {
    return { errorItems: [], errorStats: [] };
  }
  
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
    problemItems: rows.map(row => ({
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

// 学习趋势分析
async function getLearningTrends(userId, module, mode = null) {
  if (!pool) {
    return { dailyTrends: [], weeklyTrends: [] };
  }
  
  let itemType;
  if (module === 'verb') itemType = 'vrb';
  else if (module === 'adj') itemType = 'adj';
  else itemType = 'pln';
  
  // 最近30天的学习趋势
  let dailySql = `SELECT 
       DATE(last_reviewed) as date,
       COUNT(*) as reviews,
       SUM(CASE WHEN correct > 0 THEN 1 ELSE 0 END) as correct_reviews,
       AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as daily_accuracy
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '30 days'`;
  
  const dailyParams = [userId, itemType];
  if (mode) {
    dailySql += ` AND learning_mode = $3`;
    dailyParams.push(mode);
  }
  
  dailySql += ` GROUP BY DATE(last_reviewed) ORDER BY date`;
  
  const { rows: dailyTrends } = await pool.query(dailySql, dailyParams);
  
  // 每周学习统计
  let weeklySql = `SELECT 
       DATE_TRUNC('week', last_reviewed) as week,
       COUNT(*) as reviews,
       SUM(CASE WHEN correct > 0 THEN 1 ELSE 0 END) as correct_reviews,
       AVG(streak) as avg_streak
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '12 weeks'`;
  
  const weeklyParams = [userId, itemType];
  if (mode) {
    weeklySql += ` AND learning_mode = $3`;
    weeklyParams.push(mode);
  }
  
  weeklySql += ` GROUP BY DATE_TRUNC('week', last_reviewed) ORDER BY week`;
  
  const { rows: weeklyTrends } = await pool.query(weeklySql, weeklyParams);
  
  return {
    daily: dailyTrends.map(row => ({
      date: row.date,
      reviews: parseInt(row.reviews),
      correctReviews: parseInt(row.correct_reviews),
      accuracy: parseFloat(row.daily_accuracy) || 0
    })),
    weekly: weeklyTrends.map(row => ({
      week: row.week,
      reviews: parseInt(row.reviews),
      correctReviews: parseInt(row.correct_reviews),
      avgStreak: parseFloat(row.avg_streak) || 0
    }))
  };
}

// 学习建议生成
// 薄弱环节建议函数
function getWeaknessSuggestion(form, errorRate) {
  const suggestions = {
    'masu': '建议重点练习ます形变位规则，特别注意动词分类',
    'te': 'て形变位较复杂，建议分组记忆：う段动词、る动词、不规则动词',
    'nai': 'ない形变位需要注意动词词尾变化，建议多做练习',
    'ta': 'た形变位与て形类似，可以对比学习',
    'potential': '可能形变位规则较多，建议按动词类型分别练习',
    'volitional': '意志形变位需要区分动词类型，建议重点记忆',
    'plain_present': '简resents形即动词原形，注意与敬语形区别',
    'plain_past': '简体过去形即た形，建议与敬语过去形对比学习',
    'plain_negative': '简体否定形即ない形，注意语境使用',
    'plain_past_negative': '简体过去否定形变位复杂，建议多练习'
  };
  
  const baseMessage = suggestions[form] || '建议加强此变形的练习';
  
  if (errorRate > 70) {
    return `${baseMessage}。错误率较高，建议从基础规则开始复习。`;
  } else if (errorRate > 50) {
    return `${baseMessage}。建议重点练习易错点。`;
  } else {
    return `${baseMessage}。稍加练习即可掌握。`;
  }
}

async function getRecommendations(userId, module) {
  if (!pool) {
    return [];
  }
  
  let itemType;
  if (module === 'verb') itemType = 'vrb';
  else if (module === 'adj') itemType = 'adj';
  else itemType = 'pln';
  
  const recommendations = [];
  
  // 检查待复习项目
  const { rows: dueItems } = await pool.query(
    `SELECT COUNT(*) as due_count FROM reviews 
     WHERE user_id = $1 AND item_type = $2 AND due_at <= NOW()`,
    [userId, itemType]
  );
  
  if (dueItems[0].due_count > 0) {
    recommendations.push({
      type: 'review',
      priority: 'high',
      message: `您有 ${dueItems[0].due_count} 个项目需要复习`,
      action: 'start_review'
    });
  }
  
  // 检查错误率高的变形
  const { rows: problemForms } = await pool.query(
    `SELECT form, 
       AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2 AND attempts >= 3
     GROUP BY form
     HAVING AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) < 0.7
     ORDER BY accuracy`,
    [userId, itemType]
  );
  
  if (problemForms.length > 0) {
    recommendations.push({
      type: 'focus',
      priority: 'medium',
      message: `建议重点练习 ${problemForms[0].form} 变形，当前准确率较低`,
      action: 'focus_form',
      data: { form: problemForms[0].form }
    });
  }
  
  // 检查学习频率
  const { rows: recentActivity } = await pool.query(
    `SELECT COUNT(*) as recent_reviews FROM reviews 
     WHERE user_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '3 days'`,
    [userId, itemType]
  );
  
  if (recentActivity[0].recent_reviews === 0) {
    recommendations.push({
      type: 'motivation',
      priority: 'low',
      message: '已经3天没有学习了，保持学习习惯很重要哦！',
      action: 'start_practice'
    });
  }
  
  return recommendations;
}

// 推荐系统API
app.get('/api/recommendations', authenticateUser, async (req, res) => {
  try {
    const { module = 'verb' } = req.query;
    const recommendations = await getRecommendations(req.user.id, module);
    res.json({ recommendations });
  } catch (error) {
    // console.error('获取推荐失败:', error);
    res.status(500).json({ error: '获取推荐失败' });
  }
});

app.post('/api/recommendations/apply', authenticateUser, async (req, res) => {
  try {
    const { action, data } = req.body;
    
    // 根据推荐动作执行相应操作
    switch (action) {
      case 'start_review':
        res.json({ success: true, redirect: '/index.html?mode=quiz&focus=review' });
        break;
      case 'focus_form':
        const form = data?.form || '';
        res.json({ success: true, redirect: `/index.html?mode=quiz&focus=form&form=${encodeURIComponent(form)}` });
        break;
      case 'start_practice':
        res.json({ success: true, redirect: '/index.html?mode=quiz' });
        break;
      default:
        res.status(400).json({ error: '未知的推荐动作' });
    }
  } catch (error) {
    // console.error('应用推荐失败:', error);
    res.status(500).json({ error: '应用推荐失败' });
  }
});

// 静态文件服务
// 处理认证相关的前端路由重定向
app.get('/reset-password', (req, res) => {
  const token = req.query.token;
  if (token) {
    res.redirect(`/auth.html#reset-password?token=${token}`);
  } else {
    res.redirect('/auth.html#reset-password');
  }
});

app.get('/verify-email', (req, res) => {
  const token = req.query.token;
  if (token) {
    res.redirect(`/auth.html#verify-email?token=${token}`);
  } else {
    res.redirect('/auth.html#verify-email');
  }
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  // console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/`);
});