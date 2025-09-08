/**
 * 调试智能建议模块
 * 文件名: debug_suggestions.js
 * 作者: AI Assistant
 * 创建日期: 2025-01-08
 * 修改日期: 2025-01-08
 * 版本号: 1.0.0
 * 描述: 检查智能建议模块的数据获取和显示逻辑
 * 版权信息: MIT License
 */

const pool = require('./db/pool');

// 测试用户ID
const testUserId = 'e72baaa7-977a-4ff5-92d0-aa13d4855aa3';

async function debugSuggestions() {
  console.log('=== 智能建议模块调试 ===');
  console.log(`测试用户ID: ${testUserId}`);
  
  try {
    // 1. 检查用户的学习数据
    console.log('\n1. 检查用户学习数据:');
    const userReviews = await pool.query(
      `SELECT COUNT(*) as total_reviews, 
              COUNT(DISTINCT DATE(last_reviewed)) as active_days,
              AVG(CASE WHEN correct > 0 THEN 1.0 ELSE 0.0 END) as avg_accuracy
       FROM reviews 
       WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '7 days'`,
      [testUserId]
    );
    console.log('7天内学习数据:', userReviews.rows[0]);
    
    // 2. 检查到期项目
    console.log('\n2. 检查到期项目:');
    const dueItems = await pool.query(
      `SELECT COUNT(*) as due_count FROM reviews 
       WHERE user_id = $1 AND due_at <= NOW()`,
      [testUserId]
    );
    console.log('到期项目数量:', dueItems.rows[0]);
    
    // 3. 检查错误率高的变形
    console.log('\n3. 检查错误率高的变形:');
    const problemForms = await pool.query(
      `SELECT form, 
              AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) as accuracy,
              COUNT(*) as total_attempts
       FROM reviews 
       WHERE user_id = $1 AND attempts >= 3
       GROUP BY form
       HAVING AVG(CASE WHEN attempts > 0 THEN correct::float / attempts ELSE 0 END) < 0.7
       ORDER BY accuracy`,
      [testUserId]
    );
    console.log('错误率高的变形:', problemForms.rows);
    
    // 4. 检查最近活动
    console.log('\n4. 检查最近活动:');
    const recentActivity = await pool.query(
      `SELECT COUNT(*) as recent_reviews FROM reviews 
       WHERE user_id = $1 AND last_reviewed >= NOW() - INTERVAL '3 days'`,
      [testUserId]
    );
    console.log('3天内复习数:', recentActivity.rows[0]);
    
    // 5. 测试 getRecommendations 函数逻辑
    console.log('\n5. 测试推荐生成逻辑:');
    const recommendations = [];
    
    const freq = userReviews.rows[0];
    const due = dueItems.rows[0];
    
    // 检查到期项目推荐
    if (parseInt(due.due_count) > 0) {
      recommendations.push({
        type: 'review',
        priority: 'high',
        message: `您有 ${due.due_count} 个项目需要复习`,
        action: 'start_review'
      });
    }
    
    // 检查错误率高的变形推荐
    if (problemForms.rows.length > 0) {
      recommendations.push({
        type: 'focus',
        priority: 'medium',
        message: `建议重点练习 ${problemForms.rows[0].form} 变形，当前准确率较低`,
        action: 'focus_form',
        data: { form: problemForms.rows[0].form }
      });
    }
    
    // 检查学习频率推荐
    if (parseInt(recentActivity.rows[0].recent_reviews) === 0) {
      recommendations.push({
        type: 'motivation',
        priority: 'low',
        message: '已经3天没有学习了，保持学习习惯很重要哦！',
        action: 'start_practice'
      });
    }
    
    console.log('生成的推荐:', recommendations);
    
    // 6. 模拟API调用
    console.log('\n6. 模拟API响应数据结构:');
    const groupedRecommendations = {
      goals: [],
      modes: [],
      schedule: [],
      focus_areas: []
    };
    
    recommendations.forEach(rec => {
      switch (rec.type) {
        case 'review':
          groupedRecommendations.goals.push({
            icon: '📚',
            title: '复习提醒',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'focus':
          groupedRecommendations.focus_areas.push({
            icon: '🎯',
            title: '重点练习',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        case 'motivation':
          groupedRecommendations.schedule.push({
            icon: '⏰',
            title: '学习提醒',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
          break;
        default:
          groupedRecommendations.goals.push({
            icon: '💡',
            title: '学习建议',
            description: rec.message,
            action: rec.action,
            priority: rec.priority,
            data: rec.data
          });
      }
    });
    
    console.log('分组后的推荐数据:');
    console.log('- goals:', groupedRecommendations.goals.length, '条');
    console.log('- modes:', groupedRecommendations.modes.length, '条');
    console.log('- schedule:', groupedRecommendations.schedule.length, '条');
    console.log('- focus_areas:', groupedRecommendations.focus_areas.length, '条');
    
    console.log('\n详细数据:', JSON.stringify(groupedRecommendations, null, 2));
    
  } catch (error) {
    console.error('调试过程中出错:', error);
  } finally {
    await pool.end();
  }
}

debugSuggestions();