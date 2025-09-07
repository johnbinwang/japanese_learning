const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 要删除的邮箱
const TARGET_EMAIL = '61901160@qq.com';

async function cleanupUser() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log(`🗑️  开始清理用户: ${TARGET_EMAIL}`);
        console.log('=' .repeat(50));
        
        // 1. 查找用户ID
        const userResult = await client.query(
            'SELECT id, email, email_verified, created_at FROM users WHERE email = $1',
            [TARGET_EMAIL]
        );
        
        if (userResult.rows.length === 0) {
            console.log('❌ 未找到该邮箱的用户记录');
            await client.query('ROLLBACK');
            return;
        }
        
        const user = userResult.rows[0];
        console.log(`📋 找到用户:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   邮箱: ${user.email}`);
        console.log(`   验证状态: ${user.email_verified ? '已验证' : '未验证'}`);
        console.log(`   创建时间: ${user.created_at}`);
        console.log('');
        
        // 2. 删除验证码记录
        const verificationResult = await client.query(
            'DELETE FROM verification_codes WHERE email = $1',
            [TARGET_EMAIL]
        );
        console.log(`🔑 删除验证码记录: ${verificationResult.rowCount} 条`);
        
        // 3. 删除邮件日志
        const emailLogResult = await client.query(
            'DELETE FROM email_logs WHERE email = $1',
            [TARGET_EMAIL]
        );
        console.log(`📧 删除邮件日志: ${emailLogResult.rowCount} 条`);
        
        // 4. 删除学习会话记录
        const sessionResult = await client.query(
            'DELETE FROM learning_sessions WHERE user_id = $1',
            [user.id]
        );
        console.log(`📚 删除学习会话: ${sessionResult.rowCount} 条`);
        
        // 5. 删除每日学习统计
        const statsResult = await client.query(
            'DELETE FROM daily_learning_stats WHERE user_id = $1',
            [user.id]
        );
        console.log(`📊 删除学习统计: ${statsResult.rowCount} 条`);
        
        // 6. 删除学习偏好
        const preferencesResult = await client.query(
            'DELETE FROM user_learning_preferences WHERE user_id = $1',
            [user.id]
        );
        console.log(`⚙️  删除学习偏好: ${preferencesResult.rowCount} 条`);
        
        // 7. 删除复习记录
        const reviewsResult = await client.query(
            'DELETE FROM reviews WHERE user_id = $1',
            [user.id]
        );
        console.log(`🔄 删除复习记录: ${reviewsResult.rowCount} 条`);
        
        // 8. 删除用户记录
        const userDeleteResult = await client.query(
            'DELETE FROM users WHERE id = $1',
            [user.id]
        );
        console.log(`👤 删除用户记录: ${userDeleteResult.rowCount} 条`);
        
        await client.query('COMMIT');
        
        console.log('');
        console.log('=' .repeat(50));
        console.log(`✅ 用户 ${TARGET_EMAIL} 的所有数据已成功清理`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ 清理过程中发生错误:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// 执行清理
cleanupUser()
    .then(() => {
        console.log('\n🎉 清理操作完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 清理操作失败:', error.message);
        process.exit(1);
    });