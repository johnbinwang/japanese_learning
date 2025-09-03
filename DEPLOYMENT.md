# 数据库迁移和部署指南

## 概述

本项目使用数据库迁移系统来管理数据库结构变更，确保从开发环境到生产环境的平滑部署。

## 迁移系统

### 迁移文件

所有数据库迁移文件存放在 `migrations/` 目录中，按照以下命名规范：

```
001_create_plain_table.sql
002_add_new_feature.sql
003_update_indexes.sql
```

### 迁移脚本

- `migrate.js` - 主迁移脚本
- `npm run migrate` - 执行迁移命令

## 部署流程

### 1. 开发环境 → 生产环境

当你从 dev 分支推送到 main 分支时，按照以下步骤操作：

#### 步骤 1: 推送代码
```bash
git push origin main
```

#### 步骤 2: 在生产环境执行迁移
```bash
# 在生产服务器上
npm run migrate
```

### 2. 自动化部署（推荐）

如果使用 CI/CD 系统（如 GitHub Actions、Vercel 等），可以在部署脚本中添加：

```yaml
# .github/workflows/deploy.yml 示例
- name: Run Database Migrations
  run: npm run migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 3. Vercel 部署

如果使用 Vercel 部署，可以在 `vercel.json` 中添加构建命令：

```json
{
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    }
  ],
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

然后在部署后手动执行迁移，或者创建一个部署钩子。

## 迁移管理

### 创建新迁移

1. 在 `migrations/` 目录中创建新的 SQL 文件
2. 使用递增的编号命名（如 `002_add_feature.sql`）
3. 编写 SQL 语句
4. 测试迁移

### 迁移最佳实践

1. **向后兼容**: 尽量编写向后兼容的迁移
2. **幂等性**: 使用 `IF NOT EXISTS` 等语句确保迁移可以重复执行
3. **测试**: 在开发环境充分测试迁移
4. **备份**: 在生产环境执行迁移前备份数据库

### 回滚策略

如果迁移出现问题，可以：

1. 从数据库备份恢复
2. 手动执行回滚 SQL
3. 创建新的迁移文件来修复问题

## 环境变量

确保在所有环境中正确设置：

```bash
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=production  # 生产环境
COOKIE_SECRET=your-secret-key
```

## 故障排除

### 常见问题

1. **迁移失败**: 检查数据库连接和 SQL 语法
2. **重复执行**: 迁移系统会自动跳过已执行的迁移
3. **权限问题**: 确保数据库用户有足够的权限

### 检查迁移状态

```sql
SELECT * FROM migrations ORDER BY executed_at;
```

## 总结

**回答你的问题**: 不需要手动执行 SQL 语句。使用迁移系统后，只需要在推送代码到 main 分支后，在生产环境执行 `npm run migrate` 即可自动同步所有数据库变更。

迁移系统会：
- 自动检测哪些迁移尚未执行
- 按顺序执行新的迁移
- 记录执行历史，避免重复执行
- 提供清晰的执行日志