require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 创建迁移记录表
async function createMigrationsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}

// 获取已执行的迁移
async function getExecutedMigrations() {
  const result = await pool.query('SELECT filename FROM migrations ORDER BY id');
  return result.rows.map(row => row.filename);
}

// 记录迁移执行
async function recordMigration(filename) {
  await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
}

// 执行单个迁移文件
async function executeMigration(filename) {
  const filePath = path.join(__dirname, 'migrations', filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  
  console.log(`执行迁移: ${filename}`);
  await pool.query(sql);
  await recordMigration(filename);
  console.log(`✅ 迁移完成: ${filename}`);
}

// 主迁移函数
async function migrate() {
  try {
    console.log('🚀 开始数据库迁移...');
    
    // 创建迁移记录表
    await createMigrationsTable();
    
    // 获取所有迁移文件
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('❌ migrations 目录不存在');
      return;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      console.log('📝 没有找到迁移文件');
      return;
    }
    
    // 获取已执行的迁移
    const executedMigrations = await getExecutedMigrations();
    
    // 执行未执行的迁移
    const pendingMigrations = migrationFiles.filter(file => 
      !executedMigrations.includes(file)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('✅ 所有迁移都已执行，数据库是最新的');
      return;
    }
    
    console.log(`📋 发现 ${pendingMigrations.length} 个待执行的迁移:`);
    pendingMigrations.forEach(file => console.log(`  - ${file}`));
    
    // 执行迁移
    for (const file of pendingMigrations) {
      await executeMigration(file);
    }
    
    console.log('🎉 所有迁移执行完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrate();
}

module.exports = { migrate };