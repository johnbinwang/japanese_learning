const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3100;
const host = process.env.HOST || '127.0.0.1';

// 简单静态服用 public 目录
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Fallback 到 index.html（前端路由）
app.get('*', (req, res) => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  res.send(html);
});

app.listen(port, host, () => {
  console.log(`Mock server running at http://${host}:${port}`);
});
