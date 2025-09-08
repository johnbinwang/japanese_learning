/**
 * 文件名: fix_test_data.js
 * 作者: AI Assistant
 * 创建日期: 2024-12-19
 * 描述: 修正测试数据的时间，确保在7天内有足够的学习记录
 * 版权信息: Japanese Learning App v1.0.2
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixTestData() {
  try {
    // 获取测试用户ID
    const { rows: users } = await pool.query(
      "SELECT id FROM users WHERE email = 'johnno@growlib.com'"
    );
    
    if (users.length === 0) {
      console.log('未找到测试用户');
      return;
    }
    
    const userId = users[0].id;
    console.log('=== 修正测试数据时间 ===');
    console.log('测试用户ID:', userId);
    
    // 1. 更新一些记录为最近7天内，包含不同学习模式
    console.log('\n1. 更新最近7天的学习记录...');
    
    // Quiz模式记录 - 准确率较低
    for (let i = 0; i < 10; i++) {
      await pool.query(`
        UPDATE reviews 
        SET last_reviewed = NOW() - INTERVAL '${i} hours',
            learning_mode = 'quiz',
            correct = 6,
            attempts = 10
        WHERE user_id = $1 AND item_id = $2
      `, [userId, 1000 + i]);
    }
    
    // Flashcard模式记录 - 准确率较高
    for (let i = 0; i < 15; i++) {
      await pool.query(`
        UPDATE reviews 
        SET last_reviewed = NOW() - INTERVAL '${i + 12} hours',
            learning_mode = 'flashcard',
            correct = 9,
            attempts = 10
        WHERE user_id = $1 AND item_id = $2
      `, [userId, 2000 + i]);
    }
    
    // 2. 更新一些记录为今天，模拟今日学习
    console.log('\n2. 添加今日学习记录...');
    
    for (let i = 0; i < 25; i++) {
      await pool.query(`
        UPDATE reviews 
        SET last_reviewed = CURRENT_DATE + INTERVAL '${8 + i % 12} hours',
            correct = 9,
            attempts = 10
        WHERE user_id = $1 AND item_id = $2
      `, [userId, 3000 + i]);
    }
    
    // 3. 更新一些记录为特定时间段，用于最佳学习时间分析
    console.log('\n3. 设置最佳学习时间数据...');
    
    // 上午9点 - 高准确率
    for (let i = 0; i < 8; i++) {
      await pool.query(`
        UPDATE reviews 
        SET last_reviewed = CURRENT_DATE - INTERVAL '${i} days' + INTERVAL '9 hours',
            correct = 9,
            attempts = 10
        WHERE user_id = $1 AND item_id = $2
      `, [userId, 4000 + i]);
    }
    
    // 下午2点 - 中等准确率
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        UPDATE reviews 
        SET last_reviewed = CURRENT_DATE - INTERVAL '${i} days' + INTERVAL '14 hours',
            correct = 7,
            attempts = 10
        WHERE user_id = $1 AND item_id = $2
      `, [userId, 5000 + i]);
    }
    
    console.log('\n✅ 测试数据时间修正完成！');
    
    // 验证修正结果
    console.log('\n=== 验证修正结果 ===');
    
    const { rows: modeCheck } = await pool.query(`
      SELECT 
        learning_mode,
        COUNT(*) as count,
        AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
      FROM reviews 
      WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
      GROUP BY learning_mode
    `, [userId]);
    
    console.log('7天内学习模式分布:');
    modeCheck.forEach(row => {
      console.log(`- ${row.learning_mode}: ${row.count}次, 准确率: ${(parseFloat(row.accuracy) * 100).toFixed(1)}%`);
    });
    
    const { rows: todayCheck } = await pool.query(`
      SELECT COUNT(*) as today_count
      FROM reviews 
      WHERE user_id = $1 AND DATE(last_reviewed) = CURRENT_DATE
    `, [userId]);
    
    console.log(`今日学习记录: ${todayCheck[0].today_count}条`);
    
    const { rows: timeCheck } = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM last_reviewed) as hour,
        COUNT(*) as count,
        AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
      FROM reviews 
      WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '14 days'
      GROUP BY EXTRACT(HOUR FROM last_reviewed)
      HAVING COUNT(*) >= 3
      ORDER BY accuracy DESC
    `, [userId]);
    
    console.log('最佳学习时间分析:');
    timeCheck.forEach(row => {
      console.log(`- ${row.hour}点: ${row.count}次, 准确率: ${(parseFloat(row.accuracy) * 100).toFixed(1)}%`);
    });
    
  } catch (error) {
    console.error('修正失败:', error);
  } finally {
    await pool.end();
  }
}

fixTestData();