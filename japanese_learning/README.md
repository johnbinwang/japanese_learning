# 日语形态练习 H5 应用

一个专注于日语动词、形容词变形练习的移动端优先 H5 应用，采用间隔重复系统（SRS）算法提高学习效率。

## 功能特点

### 三大学习模块
- **动词变形**: ます形、て形、ない形、た形、可能形、意志形
- **形容词变形**: i形容词和na形容词的各种变形
- **简体形学习**: 动词和形容词的简体形变化

### 学习模式
- **测验模式**: 输入答案，即时判分和解释
- **闪卡模式**: 四档反馈（Again/Hard/Good/Easy）

### 智能算法
- **SRS间隔重复**: 根据熟练度智能安排复习时间
- **个性化学习**: 优先显示到期题目，支持自定义变形形式

### 跨设备同步
- **无需登录**: 基于访问码的匿名用户系统
- **数据同步**: 8位访问码实现跨设备学习进度同步

## 技术栈

- **后端**: Node.js + Express (Vercel Serverless)
- **数据库**: Vercel Postgres
- **前端**: 原生 HTML/CSS/JavaScript
- **部署**: Vercel
- **PWA**: 支持离线使用和应用安装

## 部署步骤

### 1. 环境准备

```bash
# 克隆项目
git clone <repository-url>
cd japanese_learning

# 安装依赖
npm install
```

### 2. 数据库设置

在 Vercel 中创建 Postgres 数据库，获取 `DATABASE_URL`。

```bash
# 设置环境变量
export DATABASE_URL="your_postgres_connection_string"
export COOKIE_SECRET="your_random_secret_key"

# 初始化数据库
psql $DATABASE_URL < schema.sql

# 导入种子数据
node seed-verbs.js
node seed-adjs.js
```

### 3. 本地开发

```bash
# 启动开发服务器
npm run dev

# 访问应用
open http://localhost:3000
```

### 4. Vercel 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录并部署
vercel login
vercel

# 设置环境变量
vercel env add DATABASE_URL
vercel env add COOKIE_SECRET

# 重新部署
vercel --prod
```

### 5. 数据库初始化（生产环境）

```bash
# 连接到生产数据库
psql "your_production_database_url"

# 执行初始化脚本
\i schema.sql
\q

# 导入种子数据
DATABASE_URL="your_production_database_url" node seed-verbs.js
DATABASE_URL="your_production_database_url" node seed-adjs.js
```

## 项目结构

```
japanese_learning/
├── api/
│   └── index.js          # Express API 服务器
├── public/
│   ├── index.html        # 主页面
│   ├── style.css         # 样式文件
│   ├── app.js           # 前端应用逻辑
│   ├── manifest.json    # PWA 清单
│   └── sw.js           # Service Worker
├── schema.sql           # 数据库架构
├── seed-verbs.js        # 动词种子数据
├── seed-adjs.js         # 形容词种子数据
├── package.json         # 项目配置
├── vercel.json          # Vercel 部署配置
└── README.md           # 项目说明
```

## API 接口

### 用户管理
- `GET /api/me` - 获取用户信息
- `POST /api/me` - 绑定设备（通过 X-Access-Code 头）

### 学习功能
- `GET /api/next?module=verb|adj|plain` - 获取下一题
- `POST /api/submit` - 提交答案或反馈
- `GET /api/progress?module=verb|adj|plain` - 获取学习进度

### 设置管理
- `POST /api/settings` - 更新用户设置

## 数据库架构

### 核心表
- `users_anon` - 匿名用户
- `verbs` - 动词数据（1500+）
- `adjectives` - 形容词数据（2000+）
- `settings` - 用户设置
- `reviews` - 学习记录和SRS数据

### SRS 算法
- 间隔序列: [0分钟, 10分钟, 1天, 3天, 7天, 14天, 30天]
- 反馈机制: Again(重置) / Hard(降级) / Good(升级) / Easy(跳级)
- 优先级: 到期题目 > 低熟练度题目 > 随机新题目

## 使用说明

### 首次使用
1. 访问应用，系统自动生成8位访问码
2. 选择学习模块和变形形式
3. 选择测验模式或闪卡模式开始练习

### 跨设备同步
1. 在设置页面查看访问码
2. 在新设备上输入访问码完成绑定
3. 学习进度自动同步

### 学习建议
- 建议每天练习20-30分钟
- 优先复习到期题目
- 根据个人水平调整启用的变形形式
- 定期查看进度统计调整学习策略

## 开发说明

### 添加新的变形形式
1. 在 `api/index.js` 的 `conjugationEngine` 中添加变形逻辑
2. 在 `public/app.js` 的 `FORMS` 对象中添加形式定义
3. 更新前端界面和设置选项

### 扩展词汇数据
1. 修改 `seed-verbs.js` 或 `seed-adjs.js`
2. 重新运行种子脚本导入数据

### 自定义SRS算法
1. 修改 `api/index.js` 中的 `srsAlgorithm` 函数
2. 调整间隔序列和反馈逻辑

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目。