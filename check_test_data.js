/**
 * 文件名: check_test_data.js
 * 作者: AI Assistant
 * 创建日期: 2024-12-19
 * 描述: 检查测试用户的学习数据情况
 * 版权信息: Japanese Learning App v1.0.2
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkTestData() {
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
    console.log('测试用户ID:', userId);
    
    // 检查今日复习数
    const { rows: todayData } = await pool.query(
      `SELECT 
         COUNT(CASE WHEN DATE(last_reviewed) = CURRENT_DATE THEN 1 END) as today_reviews,
         COUNT(CASE WHEN DATE(last_reviewed) = CURRENT_DATE AND correct > 0 THEN 1 END) as today_correct
       FROM reviews WHERE user_id = $1`,
      [userId]
    );
    
    console.log('\n今日学习数据:');
    console.log('- 今日复习数:', todayData[0].today_reviews);
    console.log('- 今日正确数:', todayData[0].today_correct);
    
    // 检查学习模式分布
    const { rows: modeData } = await pool.query(
      `SELECT 
         learning_mode, 
         COUNT(*) as count,
         AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
       FROM reviews 
       WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'
       GROUP BY learning_mode`,
      [userId]
    );
    
    console.log('\n7天内学习模式分布:');
    modeData.forEach(row => {
      console.log(`- ${row.learning_mode}: ${row.count}次, 准确率: ${(parseFloat(row.accuracy) * 100).toFixed(1)}%`);
    });
    
    // 检查最佳学习时间
    const { rows: timeData } = await pool.query(
      `SELECT 
         EXTRACT(HOUR FROM last_reviewed) as hour,
         COUNT(*) as session_count,
         AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy
       FROM reviews 
       WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '14 days'
       GROUP BY EXTRACT(HOUR FROM last_reviewed)
       HAVING COUNT(*) >= 3
       ORDER BY accuracy DESC`,
      [userId]
    );
    
    console.log('\n最佳学习时间分析:');
    if (timeData.length === 0) {
      console.log('- 数据不足，无法分析最佳学习时间');
    } else {
      timeData.forEach(row => {
        console.log(`- ${row.hour}点: ${row.session_count}次学习, 准确率: ${(parseFloat(row.accuracy) * 100).toFixed(1)}%`);
      });
    }
    
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    await pool.end();
  }
}

checkTestData();