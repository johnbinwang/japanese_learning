// 数据库更新脚本 - 添加learning_mode列
require('dotenv').config();
const { Pool } = require('pg');

// 数据库连接
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}) : null;

// 更新SQL语句
const updateQueries = [
  // 添加learning_mode列
  `ALTER TABLE reviews 
   ADD COLUMN IF NOT EXISTS learning_mode VARCHAR(20) DEFAULT 'quiz' 
   CHECK (learning_mode IN ('quiz', 'flashcard'));`,
  
  // 更新现有数据
  `UPDATE reviews 
   SET learning_mode = 'quiz' 
   WHERE learning_mode IS NULL;`,
  
  // 删除旧的唯一约束
  `ALTER TABLE reviews 
   DROP CONSTRAINT IF EXISTS reviews_anon_id_item_type_item_id_form_key;`,
  
  // 添加新的唯一约束
  `ALTER TABLE reviews 
   ADD CONSTRAINT reviews_anon_id_item_type_item_id_form_learning_mode_key 
   UNIQUE(anon_id, item_type, item_id, form, learning_mode);`,
  
  // 创建索引
  `CREATE INDEX IF NOT EXISTS idx_reviews_learning_mode ON reviews(learning_mode);`,
  
  `CREATE INDEX IF NOT EXISTS idx_reviews_anon_item_mode ON reviews(anon_id, item_type, learning_mode);`
];

async function updateDatabase() {
  if (!pool) {
    console.log('⚠️  没有配置数据库连接，使用内存数据库模式');
    console.log('✅ 内存数据库不需要schema更新');
    return;
  }
  
  console.log('🚀 开始更新数据库schema...');
  
  try {
    // 开始事务
    await pool.query('BEGIN');
    
    for (let i = 0; i < updateQueries.length; i++) {
      const query = updateQueries[i];
      console.log(`执行更新 ${i + 1}/${updateQueries.length}...`);
      
      try {
        await pool.query(query);
        console.log(`✅ 更新 ${i + 1} 完成`);
      } catch (error) {
        if (error.code === '42701') {
          // 列已存在
          console.log(`⚠️  更新 ${i + 1} 跳过（列已存在）`);
        } else if (error.code === '42P07') {
          // 索引已存在
          console.log(`⚠️  更新 ${i + 1} 跳过（索引已存在）`);
        } else if (error.code === '42P16') {
          // 约束已存在
          console.log(`⚠️  更新 ${i + 1} 跳过（约束已存在）`);
        } else {
          throw error;
        }
      }
    }
    
    // 提交事务
    await pool.query('COMMIT');
    console.log('✅ 数据库schema更新完成！');
    
    // 验证更新
    console.log('\n🔍 验证更新结果...');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'reviews' AND column_name = 'learning_mode'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ learning_mode列已成功添加:');
      console.log(result.rows[0]);
    } else {
      console.log('❌ learning_mode列未找到');
    }
    
    // 检查约束
    const constraintResult = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'reviews' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%learning_mode%'
    `);
    
    if (constraintResult.rows.length > 0) {
      console.log('✅ 唯一约束已更新:');
      constraintResult.rows.forEach(row => {
        console.log(`  - ${row.constraint_name}`);
      });
    }
    
  } catch (error) {
    // 回滚事务
    await pool.query('ROLLBACK');
    console.error('❌ 数据库更新失败:', error.message);
    console.error('错误代码:', error.code);
    throw error;
  } finally {
    await pool.end();
  }
}

// 运行更新
if (require.main === module) {
  updateDatabase()
    .then(() => {
      console.log('\n🎉 数据库更新脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 数据库更新失败:', error.message);
      process.exit(1);
    });
}

module.exports = { updateDatabase };