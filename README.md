# 日语形态练习 H5 应用

一个专注于日语动词、形容词变形练习的移动端优先 H5 应用，采用间隔重复系统（SRS）算法提高学习效率。

## 🌟 功能特点

### 📚 三大学习模块
- **动词变形**: ます形、て形、ない形、た形、可能形、意志形
- **形容词变形**: i形容词和na形容词的否定形、过去形、过去否定形、副词形、て形、连体形
- **简体形学习**: 简体现在、简体过去、简体否定、简体过去否定

### 🎯 学习模式
- **测验模式**: 输入答案，即时判分和详细解释
- **闪卡模式**: 四档反馈（Again/Hard/Good/Easy）
- **智能调度**: 优先显示到期题目，支持自定义变形形式

### 🧠 智能算法
- **SRS间隔重复**: 根据熟练度智能安排复习时间
- **个性化学习**: 自适应难度调整，个人学习偏好设置
- **学习统计**: 详细的学习进度分析和薄弱环节识别

### 🤖 AI 日语讲解（MVP）
- **聊天式体验**: 仿消息列表的 UI，可直接与 AI 互动、查看上下文
- **OCR.Space OCR**: 自动压缩大图并调用 OCR.Space 识别教材/截图文字
- **DeepSeek 讲解**: 输出原文+注音、翻译、词语拆解、语法点与练习建议
- **JWT 保护**: 仅已登录用户可调用 `/api/ai/explain`，统一错误响应结构
- **流式响应**: DeepSeek 启用 `stream=true`，前端实时显示生成过程

### 👤 用户系统
- **邮箱认证**: 基于邮箱+密码的用户注册登录系统
- **验证码验证**: 6位数字验证码，支持邮箱验证和密码重置
- **会话管理**: JWT Token 安全认证，支持多设备登录
- **数据同步**: 跨设备学习进度自动同步

### 📱 PWA 支持
- **离线使用**: Service Worker 支持离线学习
- **应用安装**: 可安装到桌面，原生应用体验
- **响应式设计**: 移动端优先，完美适配各种屏幕

## 🛠 技术栈

### 后端技术
- **运行环境**: Node.js (>=18.0.0)
- **Web框架**: Express.js 4.18.2
- **数据库**: PostgreSQL (Vercel Postgres)
- **认证系统**: JWT + bcrypt 密码加密
- **邮件服务**: Resend (邮箱验证和密码重置)
- **部署平台**: Vercel Serverless Functions

### 前端技术
- **技术栈**: 原生 HTML/CSS/JavaScript (无框架)
- **架构模式**: 单页应用 (SPA)
- **PWA功能**: 支持离线使用和应用安装
- **设计理念**: 移动端优先的响应式设计

### 开发工具
- **包管理**: npm
- **数据库迁移**: 自动化迁移系统
- **测试框架**: Mocha + Supertest
- **开发工具**: nodemon
- **版本控制**: Git

## 🚀 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <repository-url>
cd japanese_learning

# 安装依赖
npm install
```

### 2. 环境变量配置

创建 `.env` 文件并配置以下变量：

```bash
# 数据库连接
DATABASE_URL="postgresql://username:password@host:port/database"

# JWT 密钥
JWT_SECRET="your_jwt_secret_key"

# Cookie 加密密钥
COOKIE_SECRET="your_cookie_secret"

# Resend API 密钥（邮件服务）
RESEND_API_KEY="your_resend_api_key"

# 运行环境
NODE_ENV="development"

# 服务器端口
PORT=3000

# AI / OCR 配置
DEEPSEEK_API_KEY="your_deepseek_api_key"
DEEPSEEK_MODEL="deepseek-chat"              # 可选，默认 deepseek-chat
DEEPSEEK_API_BASE="https://api.deepseek.com/v1"
OCR_SPACE_API_KEY="your_ocr_space_api_key"
AI_TEXT_MAX_LENGTH=1000                     # 可选，限制文本输入长度
AI_IMAGE_MAX_BYTES=5242880                  # 可选，限制图片大小
```

### 3. 数据库初始化

```bash
# 执行数据库迁移
npm run migrate

# 导入种子数据
npm run seed
```

### 4. 启动开发服务器

```bash
# 启动开发服务器
npm run dev

# 访问应用
open http://localhost:3000
```

## 📦 部署指南

### Vercel 部署（推荐）

1. **推送代码到 GitHub**
```bash
git push origin main
```

2. **连接 Vercel**
- 在 Vercel 中导入 GitHub 仓库
- 配置环境变量（DATABASE_URL, JWT_SECRET, RESEND_API_KEY 等）

3. **自动部署**
- 推送到 main 分支自动触发部署
- 构建过程自动执行数据库迁移
- 无需手动操作

### 环境变量配置

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 数据库连接字符串 |
| `JWT_SECRET` | ✅ | JWT Token 签名密钥 |
| `RESEND_API_KEY` | ✅ | Resend 邮件服务 API 密钥 |
| `COOKIE_SECRET` | ❌ | Cookie 加密密钥 |
| `NODE_ENV` | ❌ | 运行环境 (production/development) |
| `PORT` | ❌ | 服务器端口 (默认 3000) |

## 📁 项目结构

```
japanese_learning/
├── api/
│   └── index.js              # Express 服务器主文件
├── db/
│   └── pool.js               # PostgreSQL 连接池配置
├── middleware/
│   └── authenticateUser.js   # 用户认证中间件
├── routes/
│   ├── auth.js               # 认证路由
│   └── password.js           # 密码管理路由
├── services/
│   └── emailService.js       # 邮件服务
├── migrations/
│   ├── 001_*.sql             # 数据库迁移文件
│   └── ...
├── public/
│   ├── index.html            # 主页面
│   ├── auth.html             # 认证页面
│   ├── app.js                # 前端主逻辑
│   ├── auth.js               # 认证页面逻辑
│   ├── style.css             # 主样式文件
│   ├── auth.css              # 认证页面样式
│   ├── manifest.json         # PWA 配置
│   └── sw.js                 # Service Worker
├── backups/                  # 数据备份目录
├── scripts/                  # 工具脚本
├── schema.sql                # 数据库架构文件
├── seed-*.js                 # 数据种子文件
├── migrate.js                # 数据库迁移脚本
├── package.json              # 项目配置
├── vercel.json               # Vercel 部署配置
├── DEPLOYMENT.md             # 部署文档
└── README.md                 # 项目文档
```

## 🔌 API 接口

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/verify-email` - 邮箱验证
- `POST /api/auth/resend-verification` - 重发验证邮件

### 密码管理
- `POST /api/password/forgot` - 忘记密码
- `POST /api/password/reset` - 重置密码
- `POST /api/password/change` - 修改密码

### 用户相关
- `GET /api/me` - 获取用户信息
- `POST /api/me` - 更新用户信息
- `GET /api/preferences` - 获取学习偏好
- `POST /api/preferences` - 更新学习偏好

### 学习相关
- `GET /api/next` - 获取下一题
- `POST /api/submit` - 提交答案
- `GET /api/progress` - 获取学习进度
- `GET /api/today-overview` - 今日学习概览

### AI 讲解
- `POST /api/ai/explain` - 统一的 AI 日语讲解接口（multipart/form-data）
  - 字段：`text`（可选文本，≤1000 字符）、`file`（可选图片，≤AI_IMAGE_MAX_BYTES）
  - 返回：`sources`（原始文本/图片OCR）、`explain.content`（AI 生成的完整讲解文本）
  - 错误：`UNAUTHORIZED`、`NO_INPUT`、`NO_TEXT_FROM_IMAGE`、`LLM_ERROR` 等统一结构
- `POST /api/ai/explain/stream` - 流式 SSE 版本，实时返回 DeepSeek 输出（事件：`chunk` 为文本片段，`done` 包含完整 `explain.content`，`error` 用于异常提示）

### 分析相关
- `GET /api/mode-comparison` - 模式对比
- `GET /api/insights/trends` - 学习趋势
- `GET /api/insights/weaknesses` - 薄弱环节
- `GET /api/insights/suggestions` - 学习建议

## 🗄 数据库架构

### 核心数据表

#### 用户系统
- `users` - 用户基本信息
- `user_sessions` - 用户会话管理
- `email_logs` - 邮件发送记录
- `user_learning_preferences` - 用户学习偏好

#### 学习内容
- `verbs` - 动词数据 (1500+)
- `adjectives` - 形容词数据 (2000+)
- `plain` - 简体形数据

#### 学习记录
- `reviews` - 复习记录 (SRS核心表)
- `learning_sessions` - 学习会话记录
- `daily_learning_stats` - 每日学习统计

### SRS 算法
- **间隔序列**: [0, 10分钟, 1天, 3天, 7天, 14天, 30天]
- **反馈机制**: Again(重置) / Hard(降级) / Good(升级) / Easy(跳级)
- **优先级**: 到期题目 > 低熟练度题目 > 随机新题目

## 📱 使用说明

### 新用户注册
1. 访问应用，点击"注册"按钮
2. 输入邮箱和密码完成注册
3. 查收验证邮件，点击验证链接
4. 登录后开始学习之旅

### 学习流程
1. 选择学习模块（动词/形容词/简体形）
2. 选择学习模式（测验/闪卡）
3. 自定义启用的变形形式
4. 开始练习，系统智能推荐题目

### 学习建议
- 建议每天练习 20-30 分钟
- 优先复习到期题目
- 根据个人水平调整启用的变形形式
- 定期查看进度统计调整学习策略

## 🔧 开发指南

### 可用命令

```bash
npm run dev          # 启动开发服务器
npm run start        # 启动生产服务器
npm run seed         # 导入种子数据
npm run migrate      # 执行数据库迁移
npm run build        # 构建项目
npm test             # 运行测试
```

### 添加新功能

#### 添加新的变形形式
1. 在 `api/index.js` 的 `conjugationEngine` 中添加变形逻辑
2. 在 `public/app.js` 的 `FORMS` 对象中添加形式定义
3. 更新前端界面和设置选项

#### 扩展词汇数据
1. 修改相应的 `seed-*.js` 文件
2. 重新运行种子脚本导入数据

#### 数据库迁移
1. 在 `migrations/` 目录创建新的 SQL 文件
2. 使用递增编号命名（如 `013_add_feature.sql`）
3. 运行 `npm run migrate` 应用迁移

## 🔒 安全特性

- **密码加密**: 使用 bcrypt 进行密码哈希
- **JWT 认证**: 安全的 Token 认证机制
- **邮箱验证**: 防止虚假邮箱注册
- **速率限制**: 防止暴力破解和垃圾邮件
- **CORS 配置**: 跨域请求安全控制
- **输入验证**: 严格的输入参数验证

## 📊 性能优化

- **数据库连接池**: 高效的数据库连接管理
- **索引优化**: 关键查询字段建立索引
- **缓存策略**: 静态资源缓存优化
- **代码分割**: 按需加载减少初始包大小
- **Service Worker**: 离线缓存提升用户体验

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📞 支持

如果您在使用过程中遇到问题或有改进建议，欢迎：

- 提交 [Issue](../../issues)
- 发起 [Pull Request](../../pulls)
- 查看 [部署文档](DEPLOYMENT.md)

---

**开始您的日语学习之旅吧！** 🎌
