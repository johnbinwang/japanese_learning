/**
 * 主API入口 - 重构后版本
 */

const express = require('express');
const path = require('path');
const pool = require('../db/pool');
const { authenticateUser } = require('../middleware/authenticateUser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// 信任代理,用于正确获取客户端IP
app.set('trust proxy', true);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

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
  const packageJson = require('../package.json');
  res.json({ version: packageJson.version || '1.0.0' });
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

// SPA 路由处理 - 所有未匹配的路由返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
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
