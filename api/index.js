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
    } else if (normalizedGroup === 'III' || normalizedGroup === 'IRR') {
      // 不规则动词特殊处理
      if (verb === 'する') return 'しない';
      if (verb === '来る' || verb === 'くる') return 'こない';
      if (verb === '行く' || verb === 'いく') return 'いかない';
      // 如果是其他不规则动词但没有特殊规则，尝试基本变形
      return verb + 'ない';
    }
    
    // 防护措施：检查是否是形容词被错误分类
    if (verb.endsWith('い')) {
      // 排除明确的动词形式
      const verbExceptions = ['立つ', '待つ', '持つ', '打つ', '勝つ', '死ぬ', '呼ぶ', '遊ぶ', '結ぶ', '読む', '住む', '泳ぐ', '働く', '歩く', '書く', '聞く'];
      const isDefinitelyVerb = verb.endsWith('る') || verb.endsWith('う') || verb.endsWith('く') || verb.endsWith('ぐ') || 
                              verb.endsWith('す') || verb.endsWith('つ') || verb.endsWith('ぬ') || verb.endsWith('ぶ') || 
                              verb.endsWith('む') || verbExceptions.includes(verb);
      
      if (!isDefinitelyVerb) {
        // 可能是i形容词，使用i形容词变形规则
        if (verb === 'いい') return 'よくない';
        return verb.slice(0, -1) + 'くない';
      }
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
    const base = adj.replace(/な$/, '').replace(/だ$/, '').replace(/の$/, '').replace(/である$/, '');
    
    switch (form) {
      case 'negative':
      case 'plain_negative':
        return base + 'じゃない';
      case 'past':
      case 'plain_past':
        return base + 'だった';
      case 'past_negative':
      case 'plain_past_negative':
        return base + 'じゃなかった';
      case 'adverb':
        return base + 'に';
      case 'rentai':
        return base + 'な';
      case 'te':
        return base + 'で';
      case 'plain_present':
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
/**
 * 获取模块配置信息
 * @param {string} module - 模块类型 (verb, adj, plain)
 * @returns {Object} 包含 itemType, tableName, defaultForms 的配置对象
 */
function getModuleConfig(module) {
  const configs = {
    verb: {
      itemType: 'vrb',
      tableName: 'verbs',
      defaultForms: ['masu', 'te', 'nai', 'ta']
    },
    adj: {
      itemType: 'adj',
      tableName: 'adjectives',
      defaultForms: ['negative', 'past', 'past_negative', 'adverb']
    },
    plain: {
      itemType: null,
      tableName: 'plain',
      defaultForms: ['plain_present', 'plain_past', 'plain_negative']
    }
  };
  return configs[module] || configs.plain;
}

/**
 * 解析前端传递的表单参数
 * @param {string} forms - 逗号分隔的表单字符串
 * @returns {Array} 解析后的表单数组
 */
function parseFormsParam(forms) {
  return forms ? forms.split(',').map(f => f.trim()).filter(Boolean) : [];
}

/**
 * 获取启用的表单列表
 * @param {Array} selectedForms - 前端选择的表单
 * @param {Object} settings - 用户设置
 * @param {Array} defaultForms - 默认表单
 * @returns {Array} 最终启用的表单列表
 */
function getEnabledForms(selectedForms, settings, defaultForms) {
  return selectedForms.length > 0 ? selectedForms : (settings.enabledForms || defaultForms);
}

/**
 * 构建查询到期题目的SQL
 * @param {string} module - 模块类型
 * @param {string} tableName - 表名
 * @param {string} itemType - 项目类型
 * @returns {Object} 包含 query 和 baseParams 的对象
 */
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

/**
 * 构建查询新题目的SQL
 * @param {string} module - 模块类型
 * @param {string} tableName - 表名
 * @param {string} itemType - 项目类型
 * @returns {Object} 包含 query 和 paramOrder 的对象
 */
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

/**
 * 生成正确答案
 * @param {Object} item - 题目项目
 * @param {string} targetForm - 目标形式
 * @param {string} module - 模块类型
 * @param {string} itemType - 项目类型
 * @returns {string} 正确答案
 */

/**
 * 处理项目数据结构
 * @param {Object} item - 原始项目数据
 * @param {string} module - 模块类型
 * @param {string} itemType - 项目类型
 * @returns {Object} 处理后的项目数据
 */
function processItemData(item, module, itemType) {
  if (module === 'plain') {
    const baseItem = {
      id: item.item_id,
      kana: item.kana,
      kanji: item.kanji,
      meaning: item.meaning,
      item_type: item.item_type  // 保留原始的item_type
    };
    
    if (item.item_type === 'vrb') {
      return { ...baseItem, group: (item.group_type || '').trim() };
    } else {
      return { ...baseItem, type: (item.adj_type || '').trim() };
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

/**
 * 构建响应数据
 * @param {Object} item - 处理后的项目数据
 * @param {string} targetForm - 目标形式
 * @param {string} module - 模块类型
 * @param {string} correctAnswer - 正确答案
 * @param {boolean} isNew - 是否为新题目
 * @param {Object} reviewData - 复习数据（可选）
 * @returns {Object} 响应数据
 */
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
  
  // 添加类型特定字段
  if (module === 'verb' && item.group) {
    responseData.group = item.group;
  } else if (module === 'adj' && item.type) {
    responseData.type = item.type;
  } else if (module === 'plain') {
    const actualType = item.item_type || reviewData?.item_type;
    if (actualType === 'vrb' && item.group) {
      responseData.group = item.group;
    } else if (actualType === 'adj' && item.type) {
      responseData.type = item.type;
    }
  }
  
  return responseData;
}

/**
 * 创建新的复习记录
 * @param {number} userId - 用户ID
 * @param {string} itemType - 项目类型
 * @param {number} itemId - 项目ID
 * @param {string} targetForm - 目标形式
 * @param {string} learningMode - 学习模式
 * @returns {Promise} 数据库操作Promise
 */
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

/**
 * 获取下一个学习题目的主要API端点
 */
app.get('/api/next', authenticateUser, async (req, res) => {
  try {
    // 设置缓存控制头
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const { module, forms, mode } = req.query;
    const learningMode = mode || 'flashcard';
    
    // 解析参数和获取配置
    const selectedForms = parseFormsParam(forms);
    const { settings } = await getUserLearningPreferences(req.user.id, true);
    const moduleConfig = getModuleConfig(module);
    const enabledForms = getEnabledForms(selectedForms, settings, moduleConfig.defaultForms);
    
    const internalSettings = {
      due_only: settings.dueOnly,
      enabled_forms: enabledForms
    };
    
    // 查询到期的复习题目
    const { query: dueQuery, paramCount } = buildDueItemsQuery(module, moduleConfig.tableName, moduleConfig.itemType);
    const baseParams = module === 'plain' 
      ? [req.user.id, learningMode] 
      : [req.user.id, moduleConfig.itemType, learningMode];
    
    let finalQuery = dueQuery + ` AND r.form = ANY($${paramCount + 1})`;
    let queryParams = [...baseParams, enabledForms];
    
    if (internalSettings.due_only) {
      finalQuery += ' AND r.due_at <= NOW()';
    }
    
    // 修改排序逻辑：优先到期时间为空的项目，然后完全随机选择
    finalQuery += ' ORDER BY CASE WHEN r.due_at IS NULL THEN 0 ELSE 1 END, RANDOM() LIMIT 1';
    
    //console.log('SQL查询:', finalQuery, '参数:', queryParams) ;
    const result = await pool.query(finalQuery, queryParams);
    
    // 如果有到期题目，返回复习题目
    if (result.rows.length > 0) {
      const review = result.rows[0];
      
      // 处理复习题目数据
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
    
    // 没有到期题目，查询新题目
    console.log('没有到期项目，随机选择一个新项目');
    const { query: newQuery, paramOrder } = buildNewItemsQuery(module, moduleConfig.tableName, moduleConfig.itemType);
    
    const paramMap = {
      userId: req.user.id,
      learningMode,
      enabledForms,
      itemType: moduleConfig.itemType
    };
    
    const newQueryParams = paramOrder.map(key => paramMap[key]);
    
    //console.log('SQL查询:', newQuery, '参数:', newQueryParams);
    const { rows: newRows } = await pool.query(newQuery, newQueryParams);
    
    if (newRows.length === 0) {
      return res.json({ error: '没有更多题目' });
    }
    
    const newItem = newRows[0];
    const targetForm = newItem.form;
    
    // 创建新的复习记录
    const actualItemType = module === 'plain' ? newItem.item_type : moduleConfig.itemType;
    await createReviewRecord(req.user.id, actualItemType, newItem.item_id, targetForm, learningMode);
    
    // 处理新题目数据
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

// 提交答案
// 标准化itemType
function normalizeItemType(itemType) {
  return itemType.toUpperCase() === 'VRB' || itemType.toLowerCase() === 'verb' ? 'vrb' : 
         itemType.toUpperCase() === 'ADJ' || itemType.toLowerCase() === 'adjective' ? 'adj' : 
         itemType.toUpperCase() === 'PLN' || itemType.toLowerCase() === 'plain' ? 'pln' : 
         itemType.toLowerCase();
}

// 获取学习项目数据
async function getItemData(normalizedItemType, itemId) {
  let tableName;
  if (normalizedItemType === 'pln') {
    tableName = 'plain';
  } else if (normalizedItemType === 'adj') {
    tableName = 'adjectives';
  } else {
    tableName = 'verbs';
  }
  
  const sql = `SELECT * FROM ${tableName} WHERE id = $1`;
  const { rows: itemRows } = await pool.query(sql, [itemId]);
  
  if (itemRows.length === 0) {
    throw new Error('题目不存在');
  }
  
  return itemRows[0];
}

// 生成正确答案
function generateCorrectAnswer(normalizedItemType, item, form) {
  if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      const processedItem = { ...item, type: (item.adj_type || item.type || item.type_info || '').trim() };
      return conjugationEngine.conjugateAdjective(processedItem, form);
    } else {
      const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
      switch (form) {
        case 'plain_present':
          return processedItem.kana;
        case 'plain_past':
          return conjugationEngine.conjugateToTa(processedItem.kana, processedItem.group);
        case 'plain_negative':
          return conjugationEngine.conjugateToNai(processedItem.kana, processedItem.group);
        case 'plain_past_negative':
          const naiForm = conjugationEngine.conjugateToNai(processedItem.kana, processedItem.group);
          return naiForm.replace(/ない$/, 'なかった');
        default:
          return processedItem.kana;
      }
    }
  } else if (normalizedItemType === 'adj') {
    return conjugationEngine.conjugateAdjective(item, form);
  } else {
    switch (form) {
      case 'masu':
        return conjugationEngine.conjugateToMasu(item.kana, item.group);
      case 'te':
        return conjugationEngine.conjugateToTe(item.kana, item.group);
      case 'nai':
        return conjugationEngine.conjugateToNai(item.kana, item.group);
      case 'ta':
        return conjugationEngine.conjugateToTa(item.kana, item.group);
      case 'potential':
        return conjugationEngine.conjugateToPotential(item.kana, item.group);
      case 'volitional':
        return conjugationEngine.conjugateToVolitional(item.kana, item.group);
      default:
        return item.kana;
    }
  }
}

// 生成汉字版本的正确答案
function generateKanjiAnswer(normalizedItemType, item, form) {
  if (!item.kanji) return null;
  
  if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      const processedItem = { 
        kana: item.kana, 
        kanji: item.kanji, 
        type: (item.adj_type || item.type || item.type_info || '').trim() 
      };
      return conjugationEngine.conjugateAdjective(processedItem, form);
    } else {
      const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
      switch (form) {
        case 'plain_present':
          return processedItem.kanji || processedItem.kana;
        case 'plain_past':
          return conjugationEngine.conjugateToTa(processedItem.kanji || processedItem.kana, processedItem.group);
        case 'plain_negative':
          return conjugationEngine.conjugateToNai(processedItem.kanji || processedItem.kana, processedItem.group);
        case 'plain_past_negative':
          const naiFormKanji = conjugationEngine.conjugateToNai(processedItem.kanji || processedItem.kana, processedItem.group);
          return naiFormKanji.replace(/ない$/, 'なかった');
        default:
          return processedItem.kanji || processedItem.kana;
      }
    }
  } else if (normalizedItemType === 'adj') {
    const processedItem = {
      kana: item.kana,
      kanji: item.kanji,
      type: (item.type || '').trim()
    };
    return conjugationEngine.conjugateAdjective(processedItem, form);
  } else {
    switch (form) {
      case 'masu':
        return conjugationEngine.conjugateToMasu(item.kanji || item.kana, item.group);
      case 'te':
        return conjugationEngine.conjugateToTe(item.kanji || item.kana, item.group);
      case 'nai':
        return conjugationEngine.conjugateToNai(item.kanji || item.kana, item.group);
      case 'ta':
        return conjugationEngine.conjugateToTa(item.kanji || item.kana, item.group);
      case 'potential':
        return conjugationEngine.conjugateToPotential(item.kanji || item.kana, item.group);
      case 'volitional':
        return conjugationEngine.conjugateToVolitional(item.kanji || item.kana, item.group);
      default:
        return item.kanji || item.kana;
    }
  }
}

// 验证用户答案
function validateAnswer(mode, feedback, userAnswer, correctAnswer, item, normalizedItemType, form) {
  if (mode === 'flashcard') {
    return feedback === 'good' || feedback === 'easy';
  }
  
  const trimmedUserAnswer = userAnswer ? userAnswer.trim() : '';
  
  // 基本答案匹配
  if (trimmedUserAnswer === correctAnswer) {
    return true;
  }
  
  // 检查汉字形式的答案
  const kanjiCorrectAnswer = generateKanjiAnswer(normalizedItemType, item, form);
  if (kanjiCorrectAnswer && trimmedUserAnswer === kanjiCorrectAnswer) {
    return true;
  }
  
  // 对于复合动词（如「バスにのる」），也接受只变形动词部分的答案
  if (normalizedItemType === 'pln' && item.item_type !== 'adj') {
    const kana = item.kana || '';
    const kanji = item.kanji || '';
    
    // 检查是否为复合动词（包含助词「に」、「を」、「で」等）
    const hasParticle = /[にをでへとから]/.test(kana);
    
    if (hasParticle) {
      // 提取动词部分（最后一个动词）
      const kanaVerbMatch = kana.match(/([^にをでへとから]+)$/);
      const kanjiVerbMatch = kanji.match(/([^にをでへとから]+)$/);
      
      if (kanaVerbMatch) {
        const verbKana = kanaVerbMatch[1];
        const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
        
        // 生成只变形动词部分的答案（假名形式）
        let verbOnlyAnswer = '';
        switch (form) {
          case 'plain_present':
            verbOnlyAnswer = verbKana;
            break;
          case 'plain_past':
            verbOnlyAnswer = conjugationEngine.conjugateToTa(verbKana, processedItem.group);
            break;
          case 'plain_negative':
            verbOnlyAnswer = conjugationEngine.conjugateToNai(verbKana, processedItem.group);
            break;
          case 'plain_past_negative':
            const naiForm = conjugationEngine.conjugateToNai(verbKana, processedItem.group);
            verbOnlyAnswer = naiForm.replace(/ない$/, 'なかった');
            break;
          default:
            verbOnlyAnswer = verbKana;
        }
        
        if (trimmedUserAnswer === verbOnlyAnswer) {
          return true;
        }
      }
      
      // 如果有汉字形式，也检查汉字动词部分
      if (kanjiVerbMatch) {
        const verbKanji = kanjiVerbMatch[1];
        const processedItem = { ...item, group: (item.group || item.group_type || item.type_info || '').trim() };
        
        // 生成只变形动词部分的答案（汉字形式）
        let verbOnlyKanjiAnswer = '';
        switch (form) {
          case 'plain_present':
            verbOnlyKanjiAnswer = verbKanji;
            break;
          case 'plain_past':
            verbOnlyKanjiAnswer = conjugationEngine.conjugateToTa(verbKanji, processedItem.group);
            break;
          case 'plain_negative':
            verbOnlyKanjiAnswer = conjugationEngine.conjugateToNai(verbKanji, processedItem.group);
            break;
          case 'plain_past_negative':
            const naiFormKanji = conjugationEngine.conjugateToNai(verbKanji, processedItem.group);
            verbOnlyKanjiAnswer = naiFormKanji.replace(/ない$/, 'なかった');
            break;
          default:
            verbOnlyKanjiAnswer = verbKanji;
        }
        
        if (trimmedUserAnswer === verbOnlyKanjiAnswer) {
          return true;
        }
      }
    }
  }
  
  return false;
}

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

// 更新每日学习统计
async function updateDailyStats(userId, learningMode, normalizedItemType, isNewItem, sessionDuration) {
  const todayDate = new Date().toISOString().split('T')[0];
  
  // 确保今日统计记录存在
  const ensureStatsSQL = `
    INSERT INTO daily_learning_stats (user_id, stat_date, learning_mode, module_type, new_items_target, new_items_completed, reviews_due, reviews_completed, total_study_time_seconds, accuracy_rate, streak_improvements)
    VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0.00, 0)
    ON CONFLICT (user_id, stat_date, learning_mode, module_type) DO NOTHING`;
  await pool.query(ensureStatsSQL, [userId, todayDate, learningMode, normalizedItemType]);
  
  // 更新统计数据
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

// 获取解释
function getExplanation(normalizedItemType, item, form) {
  if (normalizedItemType === 'adj') {
    return conjugationEngine.getExplanation(normalizedItemType, form, null, item.type);
  } else if (normalizedItemType === 'pln') {
    if (item.item_type === 'adj') {
      return conjugationEngine.getExplanation('adj', form, null, item.adj_type);
    } else {
      return conjugationEngine.getExplanation('pln', form, (item.group_type || '').trim(), null);
    }
  } else {
    const rawBase = item.kanji || item.kana;
    const base = rawBase.replace(/\d+$/, '');
    let groupForExplanation = item.group_type;
    if (!groupForExplanation || groupForExplanation.trim() === '') {
      groupForExplanation = conjugationEngine.inferVerbGroup(base);
    } else {
      groupForExplanation = groupForExplanation.trim();
    }
    return conjugationEngine.getExplanation(normalizedItemType, form, groupForExplanation, null);
  }
}

app.post('/api/submit', authenticateUser, async (req, res) => {
  try {
    const { itemType, itemId, form, userAnswer, feedback, mode, sessionDuration } = req.body;
    const learningMode = mode || 'quiz';
    
    const normalizedItemType = normalizeItemType(itemType);
    const item = await getItemData(normalizedItemType, itemId);
    const correctAnswer = generateCorrectAnswer(normalizedItemType, item, form);
    const isCorrect = validateAnswer(mode, feedback, userAnswer, correctAnswer, item, normalizedItemType, form);
    
    const { currentStreak, attempts, correct } = await getReviewRecord(req.user.id, normalizedItemType, itemId, form, learningMode);
    
    // 更新统计
    const newAttempts = attempts + 1;
    const newCorrect = correct + (isCorrect ? 1 : 0);
    
    // 计算新的间隔和到期时间
    const finalFeedback = feedback || (isCorrect ? 'good' : 'again');
    const { newStreak, dueAt } = srsAlgorithm.calculateNextDue(currentStreak, finalFeedback);
    
    // 更新复习记录
    await updateReviewRecord(req.user.id, normalizedItemType, itemId, form, learningMode, newAttempts, newCorrect, newStreak, dueAt);
    
    // 更新各种统计
    const isNewItem = attempts === 0;
    await updateDailyStats(req.user.id, learningMode, normalizedItemType, isNewItem, sessionDuration);
    await updateLearningSession(req.user.id, normalizedItemType, learningMode, isCorrect, sessionDuration);
    await updateUserPreferences(req.user.id, sessionDuration);
    
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
      SELECT 
        item_type as module_type,
        COUNT(*) as due_count
      FROM reviews 
      WHERE user_id = $1 AND due_at <= NOW()
      GROUP BY item_type
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
      whereClause += ' AND item_type = $2';
      params.push(module);
    }
    
    // 直接从reviews表查询，为不同模式使用不同的计算逻辑
    const comparisonQuery = `
      SELECT 
        learning_mode,
        item_type,
        COUNT(*) as total_items,
        SUM(attempts) as total_attempts,
        SUM(correct) as total_correct,
        AVG(streak) as avg_streak,
        COUNT(CASE WHEN due_at <= NOW() THEN 1 END) as due_count,
        COUNT(CASE WHEN (correct::DECIMAL / GREATEST(attempts, 1)) >= 0.75 AND streak >= 3 THEN 1 END) as mastered_count,
        -- 测验模式使用正确率，闪卡模式使用平均熟练度
        CASE 
          WHEN learning_mode = 'quiz' THEN 
            CASE WHEN SUM(attempts) > 0 THEN (SUM(correct)::DECIMAL / SUM(attempts) * 100) ELSE 0 END
          ELSE AVG(streak) * 20  -- 闪卡模式：将熟练度转换为百分比显示
        END as performance_metric
      FROM reviews 
      ${whereClause}
      GROUP BY learning_mode, item_type
      ORDER BY learning_mode, item_type
    `;
    
    const result = await pool.query(comparisonQuery, params);
    
    // 按模式分组数据
    const modeData = {
      quiz: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } },
      flashcard: { modules: {}, totals: { total_items: 0, accuracy_rate: 0, avg_streak: 0, due_count: 0, mastered_count: 0 } }
    };
    
    result.rows.forEach(row => {
      const mode = row.learning_mode;
      const moduleType = row.item_type;
      
      modeData[mode].modules[moduleType] = {
        total_items: parseInt(row.total_items),
        accuracy_rate: Math.min(parseFloat(row.performance_metric) || 0, 100),
        avg_streak: parseFloat(row.avg_streak) || 0,
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
        DATE(last_reviewed) as date,
        COUNT(*) as total_reviews,
        SUM(attempts) as total_attempts,
        SUM(correct) as correct_reviews,
        AVG(attempts) as avg_attempts,
        COUNT(DISTINCT item_id) as unique_items
      FROM reviews 
      WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(last_reviewed)
      ORDER BY date DESC
    `;
    
    const trends = await pool.query(trendsQuery, [userId]);
    
    // 计算总体统计
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
      WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '30 days'
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
    console.error('获取薄弱环节失败:', error);
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
      WHERE anon_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
      GROUP BY learning_mode
    `, [userId]);
    
    // 分析学习频率
    const frequencyAnalysis = await pool.query(`
      SELECT 
        COUNT(DISTINCT DATE(last_reviewed)) as active_days,
        COUNT(*) as total_reviews
      FROM reviews 
      WHERE anon_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
    `, [userId]);
    
    // 分析到期项目
    const dueAnalysis = await pool.query(`
      SELECT COUNT(*) as due_count
      FROM reviews 
      WHERE anon_id = $1 AND due_at <= NOW()
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
    console.error('获取智能建议失败:', error);
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
  
  // 分析学习模式偏好（基于使用频率和学习效果）
  const { rows: modeStats } = await pool.query(
    `SELECT 
       COUNT(CASE WHEN learning_mode = 'quiz' THEN 1 END) as quiz_count,
       COUNT(CASE WHEN learning_mode = 'flashcard' THEN 1 END) as flashcard_count,
       AVG(CASE WHEN learning_mode = 'quiz' AND attempts > 0 THEN correct::float / attempts ELSE NULL END) as quiz_accuracy,
       -- 闪卡模式使用学习效率指标（完成速度和复习间隔）
       AVG(CASE WHEN learning_mode = 'flashcard' THEN streak ELSE NULL END) as flashcard_avg_streak,
       AVG(CASE WHEN learning_mode = 'quiz' THEN streak ELSE NULL END) as quiz_avg_streak
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2 AND last_reviewed >= NOW() - INTERVAL '7 days'`,
    [userId, itemType]
  );
  
  const modeData = modeStats[0];
  if (modeData.quiz_count > 0 && modeData.flashcard_count > 0) {
    const quizAccuracy = parseFloat(modeData.quiz_accuracy) || 0;
    const flashcardStreak = parseFloat(modeData.flashcard_avg_streak) || 0;
    const quizStreak = parseFloat(modeData.quiz_avg_streak) || 0;
    
    // 测验模式：基于正确率
    // 闪卡模式：基于学习连击数（反映记忆效果）
    if (quizAccuracy > 0.8 && quizStreak > flashcardStreak) {
      recommendations.push({
        type: 'mode',
        priority: 'medium',
        message: `测验模式学习效果更好，建议多使用测验模式练习`,
        action: 'switch_mode',
        data: { mode: 'quiz', accuracy: Math.round(quizAccuracy * 100) }
      });
    } else if (flashcardStreak > quizStreak && flashcardStreak > 2) {
      recommendations.push({
        type: 'mode',
        priority: 'medium',
        message: `闪卡模式记忆效果更好，建议多使用闪卡模式练习`,
        action: 'switch_mode',
        data: { mode: 'flashcard', avg_streak: Math.round(flashcardStreak) }
      });
    }
  } else if (modeData.quiz_count === 0 && modeData.flashcard_count > 5) {
    // 只使用闪卡模式的用户，建议尝试测验模式
    recommendations.push({
      type: 'mode',
      priority: 'low',
      message: `建议尝试测验模式，可以更好地检验学习效果`,
      action: 'switch_mode',
      data: { mode: 'quiz' }
    });
  } else if (modeData.flashcard_count === 0 && modeData.quiz_count > 5) {
    // 只使用测验模式的用户，建议尝试闪卡模式
    recommendations.push({
      type: 'mode',
      priority: 'low',
      message: `建议尝试闪卡模式，可以更好地加强记忆`,
      action: 'switch_mode',
      data: { mode: 'flashcard' }
    });
  }
  
  // 分析最佳学习时间（转换为东8区时间）
  const { rows: timeStats } = await pool.query(
    `SELECT 
       EXTRACT(HOUR FROM (last_reviewed AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')) as hour,
       COUNT(*) as session_count,
       AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '14 days'
     GROUP BY EXTRACT(HOUR FROM (last_reviewed AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai'))
     HAVING COUNT(*) >= 3
     ORDER BY accuracy DESC
     LIMIT 1`,
    [userId, itemType]
  );
  
  if (timeStats.length > 0) {
    const bestHour = parseInt(timeStats[0].hour);
    const accuracy = parseFloat(timeStats[0].accuracy);
    
    if (accuracy > 0.8) {
      let timeRange;
      if (bestHour >= 6 && bestHour < 12) {
        timeRange = '上午';
      } else if (bestHour >= 12 && bestHour < 18) {
        timeRange = '下午';
      } else if (bestHour >= 18 && bestHour < 22) {
        timeRange = '晚上';
      } else {
        timeRange = '深夜';
      }
      
      recommendations.push({
        type: 'schedule',
        priority: 'low',
        message: `您在${timeRange}(${bestHour}点左右)学习效果最好，建议在此时间段学习`,
        action: 'set_reminder',
        data: { hour: bestHour, timeRange }
      });
    }
  }
  
  // 检查学习目标完成情况
  const { rows: goalProgress } = await pool.query(
    `SELECT 
       COUNT(CASE WHEN DATE(last_reviewed) = CURRENT_DATE THEN 1 END) as today_reviews,
       COUNT(CASE WHEN DATE(last_reviewed) = CURRENT_DATE AND correct > 0 THEN 1 END) as today_correct
     FROM reviews 
     WHERE user_id = $1 AND item_type = $2`,
    [userId, itemType]
  );
  
  const todayReviews = parseInt(goalProgress[0].today_reviews);
  const todayCorrect = parseInt(goalProgress[0].today_correct);
  
  if (todayReviews >= 20 && todayCorrect / todayReviews > 0.9) {
    recommendations.push({
      type: 'achievement',
      priority: 'low',
      message: `今日表现优秀！正确率达到${Math.round(todayCorrect / todayReviews * 100)}%，继续保持！`,
      action: 'celebrate',
      data: { accuracy: todayCorrect / todayReviews }
    });
  } else if (todayReviews < 5) {
    recommendations.push({
      type: 'goal',
      priority: 'medium',
      message: `今日还需要完成更多练习，建议至少完成10个项目`,
      action: 'continue_practice',
      data: { remaining: Math.max(0, 10 - todayReviews) }
    });
  }
  
  return recommendations;
}

// 推荐系统API
app.get('/api/recommendations', authenticateUser, async (req, res) => {
  try {
    const { module = 'verb' } = req.query;
    const recommendations = await getRecommendations(req.user.id, module);
    
    // 将推荐数据按类型分组，匹配前端期望的数据结构
    const groupedRecommendations = {
      goals: [],
      modes: [],
      schedule: [],
      focus_areas: []
    };
    
    recommendations.forEach(rec => {
      switch (rec.type) {
        case 'review':
          groupedRecommendations.goals.push({
            icon: '📚',
            title: '复习提醒',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'goal':
          groupedRecommendations.goals.push({
            icon: '🎯',
            title: '学习目标',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'achievement':
          groupedRecommendations.goals.push({
            icon: '🏆',
            title: '学习成就',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'mode':
          groupedRecommendations.modes.push({
            icon: '🎮',
            title: '学习模式建议',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: {
              ...rec.data,
              accuracy: rec.accuracy || 0,
              mode: rec.data?.mode || 'unknown'
            }
          });
          break;
        case 'schedule':
          groupedRecommendations.schedule.push({
            icon: '⏰',
            title: '最佳学习时间',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'focus':
          groupedRecommendations.focus_areas.push({
            icon: '🎯',
            title: '重点练习',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'motivation':
          groupedRecommendations.schedule.push({
            icon: '💪',
            title: '学习提醒',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        default:
          groupedRecommendations.goals.push({
            icon: '💡',
            title: '学习建议',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
      }
    });
    
    res.json(groupedRecommendations);
  } catch (error) {
    // console.error('获取推荐失败:', error);
    res.status(500).json({ error: '获取推荐失败' });
  }
});

app.post('/api/recommendations/apply', authenticateUser, async (req, res) => {
  try {
    const { action, data, type, new_target, review_target } = req.body;
    
    // 处理目标推荐应用
    if (type === 'goals' && new_target !== undefined) {
      // 更新用户学习偏好中的目标设置
      await pool.query(
        `INSERT INTO user_learning_preferences (user_id, daily_new_target, daily_review_target)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           daily_new_target = EXCLUDED.daily_new_target,
           daily_review_target = COALESCE(EXCLUDED.daily_review_target, user_learning_preferences.daily_review_target)`,
        [req.user.id, new_target, review_target || 50]
      );
      
      res.json({ success: true, message: '学习目标已更新' });
      return;
    }
    
    // 如果没有action参数，返回错误
    if (!action) {
      res.status(400).json({ error: '缺少推荐动作参数' });
      return;
    }
    
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

// 版本检查接口
app.get('/api/version', (req, res) => {
    const packageJson = require('../package.json');
    res.json({
        version: packageJson.version,
        name: packageJson.name,
        timestamp: new Date().toISOString()
    });
});

// 错误处理
app.use((err, req, res, next) => {
  // console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/`);
});