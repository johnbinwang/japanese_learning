/**
 * 创建测试数据脚本
 * 为测试用户添加多样化的学习数据以触发各种智能建议
 * 作者: AI Assistant
 * 创建日期: 2024-12-19
 * 版本: 1.0.0
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const testUserId = 'e72baaa7-977a-4ff5-92d0-aa13d4855aa3';

async function createTestData() {
  try {
    console.log('=== 创建测试数据 ===');
    console.log('测试用户ID:', testUserId);
    
    // 1. 添加不同模式的学习记录（用于模式建议）
    console.log('\n1. 添加不同模式的学习记录...');
    
    // Quiz模式记录 - 高准确率
    for (let i = 0; i < 10; i++) {
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'present', 'quiz', 9, 10, NOW() - INTERVAL '${i} hours', NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = EXCLUDED.last_reviewed`,
         [testUserId, 1000 + i]
      );
    }
    
    // Flashcard模式记录 - 较低准确率
    for (let i = 0; i < 10; i++) {
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'past', 'flashcard', 6, 10, NOW() - INTERVAL '${i} hours', NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = EXCLUDED.last_reviewed`,
         [testUserId, 2000 + i]
      );
    }
    
    // 2. 添加不同时间段的学习记录（用于时间建议）
    console.log('\n2. 添加不同时间段的学习记录...');
    
    // 上午学习记录 - 高准确率
    for (let i = 0; i < 5; i++) {
      const morningTime = new Date();
      morningTime.setHours(9, 0, 0, 0);
      morningTime.setDate(morningTime.getDate() - i);
      
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'te_form', 'quiz', 9, 10, $3, NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = EXCLUDED.last_reviewed`,
         [testUserId, 3000 + i, morningTime]
      );
    }
    
    // 下午学习记录 - 中等准确率
    for (let i = 0; i < 3; i++) {
      const afternoonTime = new Date();
      afternoonTime.setHours(15, 0, 0, 0);
      afternoonTime.setDate(afternoonTime.getDate() - i);
      
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'ta_form', 'flashcard', 7, 10, $3, NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = EXCLUDED.last_reviewed`,
         [testUserId, 4000 + i, afternoonTime]
      );
    }
    
    // 3. 添加错误率高的变形记录（用于重点练习建议）
    console.log('\n3. 添加错误率高的变形记录...');
    
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'potential', 'quiz', 2, 10, NOW() - INTERVAL '${i} hours', NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = EXCLUDED.last_reviewed`,
         [testUserId, 5000 + i]
      );
    }
    
    // 4. 添加今日学习记录（用于目标建议）
    console.log('\n4. 添加今日学习记录...');
    
    // 少量今日学习记录，触发目标建议
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO reviews (user_id, item_type, item_id, form, learning_mode, correct, attempts, last_reviewed, due_at)
          VALUES ($1, 'vrb', $2, 'negative', 'quiz', 2, 3, NOW(), NOW() + INTERVAL '1 day')
          ON CONFLICT (user_id, item_type, item_id, form, learning_mode) DO UPDATE SET
            correct = EXCLUDED.correct,
            attempts = EXCLUDED.attempts,
            last_reviewed = NOW()`,
         [testUserId, 6000 + i]
      );
    }
    
    console.log('\n✅ 测试数据创建完成！');
    console.log('\n现在可以测试以下类型的智能建议:');
    console.log('- 学习模式建议: Quiz模式效果更好');
    console.log('- 最佳学习时间: 上午学习效果最好');
    console.log('- 重点关注: potential变形需要重点练习');
    console.log('- 学习目标: 今日练习量不足');
    
  } catch (error) {
    console.error('创建测试数据失败:', error);
  } finally {
    await pool.end();
  }
}

createTestData();