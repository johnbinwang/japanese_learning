/**
 * 主API入口 - 重构后版本
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const { version: APP_VERSION } = require('../package.json');
const PUBLIC_DIR = path.join(__dirname, '../public');
const INDEX_TEMPLATE = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
const SW_TEMPLATE = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf-8');

const replaceVersion = content => content.replace(/__APP_VERSION__/g, APP_VERSION);

const STATIC_MAX_AGE = process.env.NODE_ENV === 'production' ? '30d' : 0;

// 信任代理,用于正确获取客户端IP
app.set('trust proxy', true);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Service Worker with dynamic version
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(replaceVersion(SW_TEMPLATE));
});

// 静态文件服务（关闭默认 index，以便自定义注入版本）
app.use(express.static(PUBLIC_DIR, {
  index: false,
  maxAge: STATIC_MAX_AGE,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// 导入路由模块
const authRoutes = require('../routes/auth');
const passwordRoutes = require('../routes/password');
const learningRoutes = require('../routes/learning');
const userRoutes = require('../routes/user');
const insightsRoutes = require('../routes/insights');
const recommendationsRoutes = require('../routes/recommendations');
const aiRoutes = require('../routes/ai');

// 注册路由
app.use('/api/auth', authRoutes);
app.use('/api', passwordRoutes);
app.use('/api', learningRoutes);
app.use('/api', userRoutes);
app.use('/api', insightsRoutes);
app.use('/api', recommendationsRoutes);
app.use('/api', aiRoutes);

// 版本信息端点
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION || '1.0.0' });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 测试数据库连接
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'connected', time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 根路由和 index.html 注入版本号
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(replaceVersion(INDEX_TEMPLATE));
});

// SPA 路由处理 - 所有未匹配的路由返回 index.html
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(replaceVersion(INDEX_TEMPLATE));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器 (仅在直接运行时,非被导入时)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
  });
}

module.exports = app;
