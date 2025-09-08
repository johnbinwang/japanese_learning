/**
 * 调试脚本：检查"已掌握"数据的计算逻辑
 * 文件名：debug_mastered.js
 * 作者：AI Assistant
 * 创建日期：2025-01-07
 * 版本：1.0.0
 * 描述：分析模式对比模块中"已掌握"数据为0的原因
 */

const pool = require('./db/pool');

// 调试"已掌握"数据计算
async function debugMasteredData() {
  try {
    console.log('🔍 开始调试"已掌握"数据计算逻辑...');
    
    // 1. 检查是否有用户数据
    const userCheck = await pool.query('SELECT COUNT(*) as user_count FROM users WHERE email_verified = true');
    console.log(`\n📊 已验证用户数量: ${userCheck.rows[0].user_count}`);
    
    // 2. 检查reviews表是否有数据
    const reviewsCheck = await pool.query('SELECT COUNT(*) as review_count FROM reviews');
    console.log(`📊 总复习记录数: ${reviewsCheck.rows[0].review_count}`);
    
    if (reviewsCheck.rows[0].review_count === '0') {
      console.log('\n❌ 问题发现：reviews表中没有任何学习记录！');
      console.log('💡 这就是为什么"已掌握"数据显示为0的原因。');
      console.log('\n🔧 解决方案：');
      console.log('1. 用户需要先进行学习练习，生成学习记录');
      console.log('2. 只有当streak >= 5时，题目才被认为是"已掌握"');
      return;
    }
    
    // 3. 检查streak分布情况
    const streakDistribution = await pool.query(`
      SELECT 
        learning_mode,
        item_type,
        COUNT(*) as total_items,
        COUNT(CASE WHEN streak >= 5 THEN 1 END) as mastered_items,
        MIN(streak) as min_streak,
        MAX(streak) as max_streak,
        AVG(streak) as avg_streak
      FROM reviews 
      GROUP BY learning_mode, item_type
      ORDER BY learning_mode, item_type
    `);
    
    console.log('\n📈 Streak分布情况:');
    streakDistribution.rows.forEach(row => {
      console.log(`${row.learning_mode} - ${row.item_type}:`);
      console.log(`  总题目: ${row.total_items}`);
      console.log(`  已掌握(streak>=5): ${row.mastered_items}`);
      console.log(`  Streak范围: ${row.min_streak} - ${row.max_streak}`);
      console.log(`  平均Streak: ${parseFloat(row.avg_streak).toFixed(2)}`);
      console.log('');
    });
    
    // 4. 检查具体的模式对比查询结果
    const modeComparisonQuery = `
      SELECT 
        learning_mode,
        item_type,
        COUNT(*) as total_items,
        SUM(attempts) as total_attempts,
        SUM(correct) as total_correct,
        AVG(streak) as avg_streak,
        COUNT(CASE WHEN due_at <= NOW() THEN 1 END) as due_count,
        COUNT(CASE WHEN (correct::DECIMAL / GREATEST(attempts, 1)) >= 0.75 AND streak >= 3 THEN 1 END) as mastered_count
      FROM reviews 
      GROUP BY learning_mode, item_type
      ORDER BY learning_mode, item_type
    `;
    
    const modeResult = await pool.query(modeComparisonQuery);
    console.log('🎯 模式对比查询结果:');
    modeResult.rows.forEach(row => {
      console.log(`${row.learning_mode} - ${row.item_type}:`);
      console.log(`  总题目: ${row.total_items}`);
      console.log(`  总尝试: ${row.total_attempts}`);
      console.log(`  总正确: ${row.total_correct}`);
      console.log(`  平均Streak: ${parseFloat(row.avg_streak || 0).toFixed(2)}`);
      console.log(`  到期数量: ${row.due_count}`);
      console.log(`  已掌握数量: ${row.mastered_count}`);
      console.log('');
    });
    
    // 5. 检查具体用户的数据（如果有的话）
    const userDataCheck = await pool.query(`
      SELECT 
        u.email,
        COUNT(r.*) as review_count,
        COUNT(CASE WHEN (r.correct::DECIMAL / GREATEST(r.attempts, 1)) >= 0.75 AND r.streak >= 3 THEN 1 END) as mastered_count
      FROM users u
      LEFT JOIN reviews r ON u.id = r.user_id
      WHERE u.email_verified = true
      GROUP BY u.id, u.email
      ORDER BY review_count DESC
    `);
    
    console.log('👤 用户学习数据:');
    userDataCheck.rows.forEach(row => {
      console.log(`${row.email}: ${row.review_count}条记录, ${row.mastered_count}个已掌握`);
    });
    
    // 6. 分析问题原因
    console.log('\n🔍 问题分析:');
    if (reviewsCheck.rows[0].review_count === '0') {
      console.log('❌ 主要问题：没有学习记录');
    } else {
      const totalMastered = modeResult.rows.reduce((sum, row) => sum + parseInt(row.mastered_count), 0);
      if (totalMastered === 0) {
        console.log('❌ 主要问题：没有题目达到掌握标准（准确率>=75% 且 streak>=3）');
        console.log('💡 用户需要提高答题准确率并保持连续正确');
      } else {
        console.log('✅ 数据正常，可能是前端显示问题');
      }
    }
    
  } catch (error) {
    console.error('❌ 调试过程中出错:', error);
  } finally {
    await pool.end();
  }
}

// 运行调试
debugMasteredData();