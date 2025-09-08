/**
 * 文件名: check_constraints.js
 * 作者: AI Assistant
 * 创建日期: 2024-12-19
 * 描述: 查看reviews表的约束条件
 * 版权信息: Japanese Learning App v1.0.2
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkConstraints() {
  try {
    console.log('=== Reviews表约束信息 ===');
    
    // 查看所有约束
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'reviews'
    `);
    
    console.log('\n约束列表:');
    constraints.rows.forEach(row => {
      console.log(`- ${row.constraint_name}: ${row.constraint_type}`);
    });
    
    // 查看主键信息
    const primaryKey = await pool.query(`
      SELECT column_name 
      FROM information_schema.key_column_usage 
      WHERE table_name = 'reviews' 
      AND constraint_name IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'reviews' AND constraint_type = 'PRIMARY KEY'
      )
    `);
    
    console.log('\n主键列:');
    primaryKey.rows.forEach(row => {
      console.log(`- ${row.column_name}`);
    });
    
    // 查看唯一约束信息
    const uniqueConstraints = await pool.query(`
      SELECT kcu.column_name, tc.constraint_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'reviews' 
      AND tc.constraint_type = 'UNIQUE'
    `);
    
    console.log('\n唯一约束:');
    if (uniqueConstraints.rows.length === 0) {
      console.log('- 无唯一约束');
    } else {
      uniqueConstraints.rows.forEach(row => {
        console.log(`- ${row.constraint_name}: ${row.column_name}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await pool.end();
  }
}

checkConstraints();