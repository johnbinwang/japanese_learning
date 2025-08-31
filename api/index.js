require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 数据库连接池
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}) : null;

// 初始化数据库表
async function initializeDatabase() {
  if (!pool) return;
  
  try {
    // 创建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users_anon (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        access_code VARCHAR(8) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS verbs (
        id SERIAL PRIMARY KEY,
        kana TEXT NOT NULL,
        kanji TEXT,
        group_type CHAR(3) NOT NULL CHECK (group_type IN ('I', 'II', 'IRR')),
        meaning TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS adjectives (
        id SERIAL PRIMARY KEY,
        kana TEXT NOT NULL,
        kanji TEXT,
        type CHAR(2) NOT NULL CHECK (type IN ('i', 'na')),
        meaning TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        anon_id UUID PRIMARY KEY REFERENCES users_anon(id) ON DELETE CASCADE,
        due_only BOOLEAN DEFAULT true,
        show_explain BOOLEAN DEFAULT true,
        enabled_forms TEXT[] DEFAULT ARRAY['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
      );
      
      CREATE TABLE IF NOT EXISTS reviews (
        id BIGSERIAL PRIMARY KEY,
        anon_id UUID NOT NULL REFERENCES users_anon(id) ON DELETE CASCADE,
        item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj', 'pln')),
        item_id INTEGER NOT NULL,
        form TEXT NOT NULL,
        learning_mode VARCHAR(10) DEFAULT 'quiz' CHECK (learning_mode IN ('quiz', 'flashcard')),
        attempts INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        due_at TIMESTAMPTZ DEFAULT NOW(),
        last_reviewed TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(anon_id, item_type, item_id, form, learning_mode)
      );
    `);
    
    // 插入基础数据
    await pool.query(`
      INSERT INTO verbs (kana, kanji, group_type, meaning) VALUES
      ('よむ', '読む', 'I', '读'),
      ('たべる', '食べる', 'II', '吃'),
      ('する', 'する', 'IRR', '做'),
      ('いく', '行く', 'I', '去'),
      ('みる', '見る', 'II', '看'),
      ('くる', '来る', 'IRR', '来')
      ON CONFLICT DO NOTHING;
      
      INSERT INTO adjectives (kana, kanji, type, meaning) VALUES
      ('おおきい', '大きい', 'i', '大的'),
      ('きれい', '綺麗', 'na', '美丽的'),
      ('たかい', '高い', 'i', '高的'),
      ('しずか', '静か', 'na', '安静的')
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// 启动时初始化数据库
if (pool) {
  initializeDatabase();
}

// 开发环境模拟数据库
const mockDB = {
  users: new Map(),
  verbs: [
    { id: 1, kana: 'よむ', kanji: '読む', group_type: 'I', meaning: '读' },
    { id: 2, kana: 'たべる', kanji: '食べる', group_type: 'II', meaning: '吃' },
    { id: 3, kana: 'する', kanji: 'する', group_type: 'IRR', meaning: '做' }
  ],
  adjectives: [
    { id: 1, kana: 'おおきい', kanji: '大きい', type: 'i', meaning: '大的' },
    { id: 2, kana: 'きれい', kanji: '綺麗', type: 'na', meaning: '美丽的' }
  ],
  reviews: new Map(),
  settings: new Map()
};

// 中间件
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'japanese-learning-secret'));
app.use(express.static(path.join(__dirname, '../public')));

// 生成访问码
function generateAccessCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 清理单词文本，去掉末尾的数字
function cleanWordText(text) {
  if (!text) return text;
  // 去掉末尾的数字（包括可能的空格）
  return String(text).replace(/\s*[\(（]?\d+[\)）]?\s*$/, '').trim();
}

// 用户认证中间件
async function authenticateUser(req, res, next) {
  try {
    let anonId = req.signedCookies.anonId;
    let accessCode = req.headers['x-access-code'] || req.signedCookies.accessCode;
    
    if (pool) {
      // 生产环境：使用真实数据库
      // 如果提供了访问码，尝试绑定
      if (req.headers['x-access-code']) {
        const { rows } = await pool.query(
          'SELECT id FROM users_anon WHERE access_code = $1',
          [req.headers['x-access-code']]
        );
        
        if (rows.length > 0) {
          anonId = rows[0].id;
          accessCode = req.headers['x-access-code'];
          
          // 设置cookie
          res.cookie('anonId', anonId, { 
            signed: true, 
            httpOnly: true, 
            maxAge: 365 * 24 * 60 * 60 * 1000 // 1年
          });
          res.cookie('accessCode', accessCode, { 
            signed: true, 
            httpOnly: true, 
            maxAge: 365 * 24 * 60 * 60 * 1000 // 1年
          });
        } else if (req.method === 'POST') {
          // POST 请求中访问码无效时返回错误
          return res.status(400).json({ error: '访问码无效' });
        }
      }
      
      // 如果没有用户ID，创建新用户
      if (!anonId) {
        const newAccessCode = generateAccessCode();
        const { rows } = await pool.query(
          'INSERT INTO users_anon (access_code) VALUES ($1) RETURNING id',
          [newAccessCode]
        );
        
        anonId = rows[0].id;
        accessCode = newAccessCode;
        
        // 创建默认设置
        await pool.query(
          'INSERT INTO settings (anon_id) VALUES ($1) ON CONFLICT (anon_id) DO NOTHING',
          [anonId]
        );
        
        // 设置cookie
        res.cookie('anonId', anonId, { 
          signed: true, 
          httpOnly: true, 
          maxAge: 365 * 24 * 60 * 60 * 1000 // 1年
        });
        res.cookie('accessCode', accessCode, { 
          signed: true, 
          httpOnly: true, 
          maxAge: 365 * 24 * 60 * 60 * 1000 // 1年
        });
      }
    } else {
      // 开发环境：使用模拟数据
      if (req.headers['x-access-code']) {
        const user = Array.from(mockDB.users.values()).find(u => u.accessCode === req.headers['x-access-code']);
        if (user) {
          anonId = user.id;
          accessCode = req.headers['x-access-code'];
          
          res.cookie('anonId', anonId, { 
            signed: true, 
            httpOnly: true, 
            maxAge: 365 * 24 * 60 * 60 * 1000
          });
          res.cookie('accessCode', accessCode, { 
            signed: true, 
            httpOnly: true, 
            maxAge: 365 * 24 * 60 * 60 * 1000
          });
        } else if (req.method === 'POST') {
          // POST 请求中访问码无效时返回错误
          return res.status(400).json({ error: '访问码无效' });
        }
      }
      
      if (!anonId) {
        anonId = uuidv4();
        accessCode = generateAccessCode();
        
        mockDB.users.set(anonId, {
          id: anonId,
          accessCode: accessCode,
          createdAt: new Date()
        });
        
        mockDB.settings.set(anonId, {
          anonId: anonId,
          due_only: true,
          show_explain: true,
          enabled_forms: ['masu', 'te', 'nai', 'ta']
        });
        
        res.cookie('anonId', anonId, { 
          signed: true, 
          httpOnly: true, 
          maxAge: 365 * 24 * 60 * 60 * 1000
        });
        res.cookie('accessCode', accessCode, { 
          signed: true, 
          httpOnly: true, 
          maxAge: 365 * 24 * 60 * 60 * 1000
        });
      }
    }
    
    req.user = { anonId, accessCode };
    next();
  } catch (error) {
    console.error('认证错误:', error);
    res.status(500).json({ error: '认证失败' });
  }
}

// 日语变形引擎
const conjugationEngine = {
  // 动词变形
  conjugateVerb(verb, form) {
    const { kana, kanji, group } = verb;
    // 从kanji或kana中提取纯净的动词基础形，去掉数字后缀
    const rawBase = kanji || kana;
    const base = rawBase.replace(/\d+$/, ''); // 去掉末尾的数字
    
    // 防护逻辑：如果group信息缺失或无效，根据动词词尾推断类型
    let normalizedGroup = group;
    if (!group || group.trim() === '') {
      normalizedGroup = this.inferVerbGroup(base);
      console.log(`警告: 动词 ${base} 缺少group信息，推断为 ${normalizedGroup} 类`);
    }
    
    switch (form) {
      case 'masu':
        return this.conjugateToMasu(base, normalizedGroup);
      case 'te':
        return this.conjugateToTe(base, normalizedGroup);
      case 'nai':
        return this.conjugateToNai(base, normalizedGroup);
      case 'ta':
        return this.conjugateToTa(base, normalizedGroup);
      case 'potential':
        return this.conjugateToPotential(base, normalizedGroup);
      case 'volitional':
        return this.conjugateToVolitional(base, normalizedGroup);
      // 简体形变形
      case 'plain_present':
        return base; // 简体现在形就是原形
      case 'plain_past':
        return this.conjugateToTa(base, normalizedGroup); // 简体过去形就是た形
      case 'plain_negative':
        return this.conjugateToNai(base, normalizedGroup); // 简体否定形就是ない形
      case 'plain_past_negative':
        return this.conjugateToNai(base, normalizedGroup).replace(/ない$/, 'なかった'); // 简体过去否定形
      default:
        return base;
    }
  },
  
  // 根据动词词尾推断动词类型
  inferVerbGroup(verb) {
    // 不规则动词
    if (verb === 'する' || verb === '来る' || verb === 'くる') {
      return 'irregular';
    }
    
    // 以する结尾的复合动词
    if (verb.endsWith('する') && verb !== 'する') {
      return 'irregular';
    }
    
    // 以来る结尾的复合动词
    if (verb.endsWith('来る') && verb !== '来る') {
      return 'irregular';
    }
    
    // II类动词（一段动词）：以る结尾，且倒数第二个假名是e段或i段
    if (verb.endsWith('る')) {
      const beforeRu = verb.slice(-2, -1);
      // e段：え、け、せ、て、ね、へ、め、れ、げ、ぜ、で、べ、ぺ
      // i段：い、き、し、ち、に、ひ、み、り、ぎ、じ、ぢ、び、ぴ
      const eRow = ['え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'];
      const iRow = ['い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ'];
      
      if (eRow.includes(beforeRu) || iRow.includes(beforeRu)) {
        return 'II';
      }
    }
    
    // 默认为I类动词（五段动词）
    return 'I';
  },
  
  conjugateToMasu(verb, group) {
    if (verb === 'する') return 'します';
    if (verb === '来る' || verb === 'くる') return 'きます';
    
    if (group === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const iRow = { 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち', 'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り', 'う': 'い' };
      return stem + (iRow[lastChar] || 'い') + 'ます';
    } else if (group === 'II') {
      return verb.slice(0, -1) + 'ます';
    }
    return verb + 'ます';
  },
  
  conjugateToTe(verb, group) {
    if (verb === 'する') return 'して';
    if (verb === '来る' || verb === 'くる') return 'きて';
    if (verb === '行く' || verb === 'いく') return 'いって';
    
    // 处理复合动词（以する结尾的动词）
    if (verb.endsWith('する') && verb !== 'する') {
      return verb.slice(0, -2) + 'して';
    }
    // 处理复合动词（以来る结尾的动词）
    if (verb.endsWith('来る') && verb !== '来る') {
      return verb.slice(0, -2) + 'きて';
    }
    
    if (group === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      
      if (['く', 'ぐ'].includes(lastChar)) {
        return stem + (lastChar === 'く' ? 'いて' : 'いで');
      } else if (['す'].includes(lastChar)) {
        return stem + 'して';
      } else if (['つ', 'う', 'る'].includes(lastChar)) {
        return stem + 'って';
      } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
        return stem + 'んで';
      }
    } else if (group === 'II') {
      return verb.slice(0, -1) + 'て';
    }
    return verb + 'て';
  },
  
  conjugateToNai(verb, group) {
    if (verb === 'する') return 'しない';
    if (verb === '来る' || verb === 'くる') return 'こない';
    if (verb === 'ある') return 'ない';
    
    // サ変动词（以する结尾的动词）
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
  
  conjugateToTa(verb, group) {
    // 特殊处理：确保II类动词正确变形
    if (group === 'II') {
      // II类动词：去る+た
      return verb.slice(0, -1) + 'た';
    }
    
    // 其他情况使用て形转换
    const teForm = this.conjugateToTe(verb, group);
    return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
  },
  
  conjugateToPotential(verb, group) {
    if (verb === 'する') return 'できる';
    if (verb === '来る' || verb === 'くる') return 'こられる';
    
    if (group === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const eRow = { 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ', 'う': 'え' };
      return stem + (eRow[lastChar] || 'え') + 'る';
    } else if (group === 'II') {
      return verb.slice(0, -1) + 'られる';
    }
    return verb + 'られる';
  },
  
  conjugateToVolitional(verb, group) {
    if (verb === 'する') return 'しよう';
    if (verb === '来る' || verb === 'くる') return 'こよう';
    
    if (group === 'I') {
      const stem = verb.slice(0, -1);
      const lastChar = verb.slice(-1);
      const oRow = { 'く': 'こ', 'ぐ': 'ご', 'す': 'そ', 'つ': 'と', 'ぬ': 'の', 'ぶ': 'ぼ', 'む': 'も', 'る': 'ろ', 'う': 'お' };
      return stem + (oRow[lastChar] || 'お') + 'う';
    } else if (group === 'II') {
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
        return adj === 'いい' ? 'よくない' : stem + 'くない';
      case 'past':
        return adj === 'いい' ? 'よかった' : stem + 'かった';
      case 'past_negative':
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
        return base + 'じゃない';
      case 'past':
        return base + 'だった';
      case 'past_negative':
        return base + 'じゃなかった';
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
        'te': group === 'I' ? 'I类动词て形：く→いて，ぐ→いで，む/ぶ/ぬ→んで，る/う/つ→って' : group === 'II' ? 'II类动词て形：去る+て（如：食べる→食べて）' : '不规则动词て形',
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
        'adverb': 'i形容词副词形：去い+く（如：高い→高く）',
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
    
    if (pool) {
      // 生产环境：使用真实数据库
      const { rows } = await pool.query(
        'SELECT s.* FROM settings s WHERE s.anon_id = $1',
        [req.user.anonId]
      );
      
      const s = rows[0] || {
        due_only: true,
        show_explain: true,
        enabled_forms: ['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
      };
      // 统一返回 camelCase 字段，便于前端直接使用
      settings = {
        dueOnly: s.due_only,
        showExplain: s.show_explain,
        enabledForms: s.enabled_forms || []
      };
    } else {
      // 开发环境：使用模拟数据
      const s = mockDB.settings.get(req.user.anonId) || {
        due_only: true,
        show_explain: true,
        enabled_forms: ['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
      };
      // 统一返回 camelCase 字段，便于前端直接使用
      settings = {
        dueOnly: s.due_only,
        showExplain: s.show_explain,
        enabledForms: s.enabled_forms || []
      };
    }
    
    res.json({
      anonIdMasked: req.user.anonId.slice(0, 8) + '...',
      accessCodeMasked: req.user.accessCode,
      accessCode: req.user.accessCode,
      settings
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 绑定设备
app.post('/api/me', authenticateUser, async (req, res) => {
  try {
    // authenticateUser 中间件已经处理了绑定逻辑
    // 如果到达这里，说明绑定成功或用户已存在
    let settings;
    
    if (pool) {
      // 生产环境：使用真实数据库
      const { rows } = await pool.query(
        'SELECT s.* FROM settings s WHERE s.anon_id = $1',
        [req.user.anonId]
      );
      
      const s = rows[0] || {
        due_only: true,
        show_explain: true,
        enabled_forms: ['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
      };
      settings = {
        dueOnly: s.due_only,
        showExplain: s.show_explain,
        enabledForms: s.enabled_forms || []
      };
    } else {
      // 开发环境：使用模拟数据
      const s = mockDB.settings.get(req.user.anonId) || {
        due_only: true,
        show_explain: true,
        enabled_forms: ['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
      };
      settings = {
        dueOnly: s.due_only,
        showExplain: s.show_explain,
        enabledForms: s.enabled_forms || []
      };
    }
    
    res.json({
      anonIdMasked: req.user.anonId.slice(0, 8) + '...',
      accessCodeMasked: req.user.accessCode,
      accessCode: req.user.accessCode,
      settings,
      message: '设备绑定成功'
    });
  } catch (error) {
    console.error('设备绑定错误:', error);
    res.status(500).json({ error: '设备绑定失败' });
  }
});

// 更新设置
app.post('/api/settings', authenticateUser, async (req, res) => {
  try {
    // 兼容 snake_case 与 camelCase 两种请求体字段
    const dueOnly = (req.body.due_only !== undefined) ? req.body.due_only : req.body.dueOnly;
    const showExplain = (req.body.show_explain !== undefined) ? req.body.show_explain : req.body.showExplain;
    const enabledForms = (req.body.enabled_forms !== undefined) ? req.body.enabled_forms : req.body.enabledForms;
    
    if (pool) {
      // 生产环境：使用真实数据库
      await pool.query(
        `INSERT INTO settings (anon_id, due_only, show_explain, enabled_forms) 
         VALUES ($1, COALESCE($2, (SELECT due_only FROM settings WHERE anon_id = $1)), 
                 COALESCE($3, (SELECT show_explain FROM settings WHERE anon_id = $1)), 
                 COALESCE($4, (SELECT enabled_forms FROM settings WHERE anon_id = $1))) 
         ON CONFLICT (anon_id) 
         DO UPDATE SET 
           due_only = COALESCE($2, settings.due_only), 
           show_explain = COALESCE($3, settings.show_explain), 
           enabled_forms = COALESCE($4, settings.enabled_forms)`,
        [req.user.anonId, dueOnly, showExplain, enabledForms]
      );
    } else {
      // 开发环境：使用模拟数据
      const settings = mockDB.settings.get(req.user.anonId) || {
        anonId: req.user.anonId,
        due_only: true,
        show_explain: true,
        enabled_forms: ['masu', 'te', 'nai', 'ta']
      };
      
      if (dueOnly !== undefined) settings.due_only = dueOnly;
      if (showExplain !== undefined) settings.show_explain = showExplain;
      if (enabledForms !== undefined) settings.enabled_forms = enabledForms;
      
      mockDB.settings.set(req.user.anonId, settings);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('更新设置错误:', error);
    res.status(500).json({ error: '更新设置失败' });
  }
});

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
    const learningMode = mode || 'quiz'; // 默认为quiz模式
    
    // 处理前端传递的 forms 参数
    let selectedForms = [];
    if (forms) {
      selectedForms = forms.split(',').map(f => f.trim()).filter(Boolean);
    }
    
    let settings;
    
    if (pool) {
      // 生产环境：使用真实数据库
      const { rows: settingsRows } = await pool.query(
        'SELECT * FROM settings WHERE anon_id = $1',
        [req.user.anonId]
      );
      settings = settingsRows[0] || { due_only: true, enabled_forms: ['masu', 'te', 'nai', 'ta'] };
    } else {
      // 开发环境：使用模拟数据
      settings = mockDB.settings.get(req.user.anonId) || { due_only: true, enabled_forms: ['masu', 'te', 'nai', 'ta'] };
    }

    // 如果传入了 forms 参数，覆盖设置中的 enabled_forms，保持为 TEXT 数组格式
    if (selectedForms.length > 0) {
      settings.enabled_forms = selectedForms;
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
    const enabledForms = selectedForms.length > 0 ? selectedForms : (settings.enabled_forms || defaultForms);
    
    let itemType, tableName;
    if (module === 'verb') {
      itemType = 'vrb';
      tableName = 'verbs';
    } else if (module === 'adj') {
      itemType = 'adj';
      tableName = 'adjectives';
    } else {
      itemType = 'pln';
      tableName = 'verbs'; // 简体形也用动词表
    }
    
    let rows = [];
    
    if (pool) {
      // 生产环境：使用真实数据库
      let query = `
        SELECT r.*, i.kana, i.kanji, i.meaning,
               ${itemType === 'adj' ? 'i.type' : 'i.group_type as group'}
        FROM reviews r
        JOIN ${tableName} i ON r.item_id = i.id
        WHERE r.anon_id = $1 AND r.item_type = $2 AND r.learning_mode = $3
      `;
      
      const params = [req.user.anonId, itemType, learningMode];
      
      // 按启用的形态过滤（确保只取当前启用形态的到期题目）
      query += ' AND r.form = ANY($4)';
      params.push(enabledForms);
      
      if (settings.due_only) {
        query += ' AND r.due_at <= NOW()';
      }
      
      query += ' ORDER BY r.due_at ASC, r.streak ASC LIMIT 1';
      
      console.log('SQL查询:', query, '参数:', params);
      const result = await pool.query(query, params);
      rows = result.rows;
    } else {
      // 开发环境：使用模拟数据
      const reviews = Array.from(mockDB.reviews.values())
        .filter(r => r.anonId === req.user.anonId && r.itemType === itemType && r.learningMode === learningMode && enabledForms.includes(r.form));
      
      if (reviews.length > 0) {
        const review = reviews[0];
        const items = itemType === 'adj' ? mockDB.adjectives : mockDB.verbs;
        const item = items.find(i => i.id === review.itemId);
        
        if (item) {
          rows = [{
            ...review,
            kana: cleanWordText(item.kana),
            kanji: cleanWordText(item.kanji),
            meaning: cleanWordText(item.meaning),
            type: item.type,
            group: item.group_type
          }];
        }
      }
    }
    
    // 如果没有到期项目，随机选择一个新项目
    if (rows.length === 0) {
      let item;
      
      if (pool) {
        // 生产环境：使用真实数据库
        const randomQuery = `
          SELECT i.*, 'new' as status
          FROM ${tableName} i
          WHERE i.id NOT IN (
            SELECT r.item_id FROM reviews r 
            WHERE r.anon_id = $1 AND r.item_type = $2 AND r.learning_mode = $3
          )
          ORDER BY RANDOM()
          LIMIT 1
        `;
        
        console.log('SQL查询:', randomQuery, '参数:', [req.user.anonId, itemType, learningMode]);
        const { rows: newRows } = await pool.query(randomQuery, [req.user.anonId, itemType, learningMode]);
        
        if (newRows.length === 0) {
          return res.json({ error: '没有更多题目' });
        }
        
        item = newRows[0];
        
        const forms = enabledForms;
        const targetForm = forms[Math.floor(Math.random() * forms.length)];
        
        // 创建新的复习记录
        const insertSql = `INSERT INTO reviews (anon_id, item_type, item_id, form, learning_mode, due_at) 
           VALUES ($1, $2, $3, $4, 'quiz', NOW()) 
           ON CONFLICT (anon_id, item_type, item_id, form, learning_mode) DO NOTHING`;
        const insertParams = [req.user.anonId, itemType, item.id, targetForm];
        await pool.query(insertSql, insertParams);
        
        // 确保字段名称一致性，并去除空格
        const verbItem = itemType === 'adj' ? item : { ...item, group: (item.group_type || '').trim() };
        
        const correctAnswer = itemType === 'adj' 
          ? conjugationEngine.conjugateAdjective(item, targetForm)
          : conjugationEngine.conjugateVerb(verbItem, targetForm);
        
        // 调试信息已移除
        
        const responseData = {
          itemId: item.id,
          itemType: module, // 使用原始的module参数 (verb, adj, plain)
          kana: cleanWordText(item.kana),
          kanji: cleanWordText(item.kanji),
          meaning: cleanWordText(item.meaning),
          targetForm,
          correctAnswer, // 仅用于验证，前端不应显示
          isNew: true
        };
        
        // 为动词添加group字段，为形容词添加type字段
        if (module === 'verb') {
          responseData.group = verbItem.group;
        } else if (module === 'adj') {
          responseData.type = item.type;
        }
        // console.log('/api/next 返回数据 (生产环境新题目):', responseData);
        return res.json(responseData);
      } else {
        // 开发环境：使用模拟数据
        const items = itemType === 'adj' ? mockDB.adjectives : mockDB.verbs;
        const reviewedItems = Array.from(mockDB.reviews.values())
          .filter(r => r.anonId === req.user.anonId && r.itemType === itemType && r.learningMode === learningMode)
          .map(r => r.itemId);
        
        const availableItems = items.filter(i => !reviewedItems.includes(i.id));
        
        if (availableItems.length === 0) {
          return res.json({ error: '没有更多题目' });
        }
        
        item = availableItems[Math.floor(Math.random() * availableItems.length)];
        
        const forms = enabledForms;
        const targetForm = forms[Math.floor(Math.random() * forms.length)];
        
        // 创建新的复习记录
        const reviewKey = `${req.user.anonId}-${itemType}-${item.id}-${targetForm}-${learningMode}`;
        mockDB.reviews.set(reviewKey, {
          anonId: req.user.anonId,
          itemType,
          itemId: item.id,
          form: targetForm,
          learningMode,
          dueAt: new Date(),
          streak: 0,
          attempts: 0,
          correct: 0
        });
        
        // 确保字段名称一致性，并去除空格
        const verbItem = itemType === 'adj' ? item : { ...item, group: (item.group_type || '').trim() };
        const correctAnswer = itemType === 'adj' 
          ? conjugationEngine.conjugateAdjective(item, targetForm)
          : conjugationEngine.conjugateVerb(verbItem, targetForm);
        
        const responseData = {
          itemId: item.id,
          itemType: module, // 使用原始的module参数 (verb, adj, plain)
          kana: cleanWordText(item.kana),
          kanji: cleanWordText(item.kanji),
          meaning: cleanWordText(item.meaning),
          targetForm,
          correctAnswer, // 仅用于验证，前端不应显示
          isNew: true
        };
        
        // 为动词添加group字段，为形容词添加type字段
         if (module === 'verb') {
           responseData.group = verbItem.group;
         } else if (module === 'adj') {
           responseData.type = item.type;
         }
        
        // console.log('/api/next 返回数据 (开发环境新题目):', responseData);
        return res.json(responseData);
      }
    }
    
    const review = rows[0];
    // 确保字段名称一致性 - review 对象已通过 SQL 查询重命名字段，但需要去除空格
    const reviewItem = itemType === 'adj' ? review : { ...review, group: (review.group || '').trim() };
    const correctAnswer = itemType === 'adj'
      ? conjugationEngine.conjugateAdjective(review, review.form)
      : conjugationEngine.conjugateVerb(reviewItem, review.form);
    
    console.log(`复习题目 - ${module}:`, review.kanji || review.kana, itemType === 'adj' ? '类型:' : '分组:', itemType === 'adj' ? review.type : review.group, '目标形式:', review.form, '正确答案:', correctAnswer);
    
    const responseData = {
      itemId: review.item_id || review.id, // 兼容两种情况
      itemType: module, // 使用原始的module参数 (verb, adj, plain)
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
       responseData.group = review.group;
     } else if (module === 'adj') {
       responseData.type = review.type;
     }
    //console.log('/api/next 返回数据:', responseData);
    res.json(responseData);
    
  } catch (error) {
    console.error('获取下一题错误:', error);
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
    
    if (pool) {
      // 生产环境：使用真实数据库
      const tableName = normalizedItemType === 'adj' ? 'adjectives' : 'verbs';
      const sql = `SELECT * FROM ${tableName} WHERE id = $1`;
      console.log('SQL查询:', sql, '参数:', [itemId]);
      const { rows: itemRows } = await pool.query(sql, [itemId]);
      
      if (itemRows.length === 0) {
        return res.status(404).json({ error: '题目不存在' });
      }
      
      item = itemRows[0];
    } else {
      // 开发环境：使用模拟数据
      const items = normalizedItemType === 'adj' ? mockDB.adjectives : mockDB.verbs;
      item = items.find(i => i.id === parseInt(itemId));
      
      if (!item) {
        return res.status(404).json({ error: '题目不存在' });
      }
    } 
    
    // 生成正确答案
    if (normalizedItemType === 'adj') {
      correctAnswer = conjugationEngine.conjugateAdjective(item, form);
    } else {
      // 动词处理（包括vrb, pln等）
      correctAnswer = conjugationEngine.conjugateVerb(item, form);
    }
    
    const isCorrect = userAnswer && userAnswer.trim() === correctAnswer;
    
    let currentStreak = 0;
    let attempts = 0;
    let correct = 0;
    
    if (pool) {
      // 生产环境：使用真实数据库
      const reviewSql = 'SELECT * FROM reviews WHERE anon_id = $1 AND item_type = $2 AND item_id = $3 AND form = $4 AND learning_mode = $5';
      const reviewParams = [req.user.anonId, normalizedItemType, itemId, form, learningMode];
      console.log('SQL查询:', reviewSql, '参数:', reviewParams);
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
      const updateSql = `INSERT INTO reviews (anon_id, item_type, item_id, form, learning_mode, attempts, correct, streak, due_at, last_reviewed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (anon_id, item_type, item_id, form, learning_mode)
         DO UPDATE SET attempts = $6, correct = $7, streak = $8, due_at = $9, last_reviewed = NOW()`;
      const updateParams = [req.user.anonId, normalizedItemType, itemId, form, learningMode, attempts, correct, newStreak, dueAt];
      console.log('SQL更新:', updateSql, '参数:', updateParams);
      await pool.query(updateSql, updateParams);
    } else {
      // 开发环境：使用模拟数据
      const reviewKey = `${req.user.anonId}-${normalizedItemType}-${itemId}-${form}-${learningMode}`;
      const currentReview = mockDB.reviews.get(reviewKey) || {
        attempts: 0,
        correct: 0,
        streak: 0
      };
      
      attempts = currentReview.attempts + 1;
      correct = currentReview.correct + (isCorrect ? 1 : 0);
      currentStreak = currentReview.streak;
      
      const finalFeedback = feedback || (isCorrect ? 'good' : 'again');
      const { newStreak, dueAt } = srsAlgorithm.calculateNextDue(currentStreak, finalFeedback);
      
      mockDB.reviews.set(reviewKey, {
        anonId: req.user.anonId,
        itemType: normalizedItemType,
        itemId: parseInt(itemId),
        form,
        learningMode,
        attempts,
        correct,
        streak: newStreak,
        dueAt,
        lastReviewed: new Date()
      });
    }
    
    // 获取解释
    const explanation = conjugationEngine.getExplanation(normalizedItemType, form, item.group_type, item.type);
    
    res.json({
      correct: isCorrect,
      correctAnswer,
      explanation,
      newStreak: currentStreak,
      nextDue: new Date()
    });
    
  } catch (error) {
    console.error('提交答案错误:', error);
    res.status(500).json({ error: '提交答案失败' });
  }
});

// 获取进度统计
app.get('/api/progress', authenticateUser, async (req, res) => {
  try {
    const { module, detailed, mode } = req.query;
    console.log(`🚀 /api/progress called with: module=${module}, detailed=${detailed}, mode=${mode}, anonId=${req.user.anonId}`);
    
    if (detailed === 'true') {
      console.log('📊 Calling getDetailedProgress...');
      // 返回详细的进度分析
      const progressData = await getDetailedProgress(req.user.anonId, module, mode);
      console.log('✅ getDetailedProgress completed, returning data');
      res.json(progressData);
      return;
    }
    
    let itemType;
    if (module === 'verb') itemType = 'vrb';
    else if (module === 'adj') itemType = 'adj';
    else itemType = 'pln';
    
    // 构建查询条件
    let whereClause = 'WHERE anon_id = $1 AND item_type = $2';
    let params = [req.user.anonId, itemType];
    
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
    console.error('获取进度错误:', error);
    res.status(500).json({ error: '获取进度失败' });
  }
});

// 详细进度分析函数
async function getDetailedProgress(anonId, module, mode = null) {
  console.log(`🔍 getDetailedProgress called with: anonId=${anonId}, module=${module}, mode=${mode}`);
  
  const moduleStats = await getModuleComparison(anonId, mode, module);
  console.log('📊 moduleStats:', moduleStats);
  
  const formAnalysis = await getFormAnalysis(anonId, module, mode);
  console.log('📋 formAnalysis:', formAnalysis);
  
  const errorAnalysis = await getErrorAnalysis(anonId, module, mode);
  console.log('❌ errorAnalysis:', errorAnalysis);
  
  const learningTrends = await getLearningTrends(anonId, module, mode);
  console.log('📈 learningTrends:', learningTrends);
  
  const recommendations = await getRecommendations(anonId, module);
  console.log('💡 recommendations:', recommendations);
  
  return {
    moduleComparison: moduleStats,
    formMastery: formAnalysis,
    errorPatterns: errorAnalysis,
    learningTrends: learningTrends,
    recommendations: recommendations
  };
}

// 模块对比分析
async function getModuleComparison(anonId, mode = null, module = null) {
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
     WHERE anon_id = $1`;
  
  const params = [anonId];
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
async function getFormAnalysis(anonId, module, mode = null) {
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
     WHERE anon_id = $1 AND item_type = $2`;
  
  const params = [anonId, itemType];
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
async function getErrorAnalysis(anonId, module, mode = null) {
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
     WHERE anon_id = $1 AND item_type = $2 AND attempts > correct`;
  
  const params = [anonId, itemType];
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
     WHERE anon_id = $1 AND item_type = $2 AND attempts > correct`;
  
  const errorStatsParams = [anonId, itemType];
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
async function getLearningTrends(anonId, module, mode = null) {
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
     WHERE anon_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '30 days'`;
  
  const dailyParams = [anonId, itemType];
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
     WHERE anon_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '12 weeks'`;
  
  const weeklyParams = [anonId, itemType];
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
async function getRecommendations(anonId, module) {
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
     WHERE anon_id = $1 AND item_type = $2 AND due_at <= NOW()`,
    [anonId, itemType]
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
     WHERE anon_id = $1 AND item_type = $2 AND attempts >= 3
     GROUP BY form
     HAVING AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) < 0.7
     ORDER BY accuracy`,
    [anonId, itemType]
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
     WHERE anon_id = $1 AND item_type = $2 
       AND last_reviewed >= NOW() - INTERVAL '3 days'`,
    [anonId, itemType]
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

// 静态文件服务
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
if (require.main === module) {
  app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
  });
}

module.exports = app;