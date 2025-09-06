const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function restoreData() {
  try {
    console.log('=== 开始数据恢复 ===\n');
    
    // 清空现有数据
    await pool.query('TRUNCATE verbs, adjectives, plain, reviews RESTART IDENTITY CASCADE');
    
    // 恢复verbs表
    const verbsData = JSON.parse(fs.readFileSync('verbs_backup_2025-09-06T03-06-23-763Z.json', 'utf8'));
    for (const row of verbsData) {
      await pool.query(
        'INSERT INTO verbs (id, kana, kanji, group_type, meaning) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.kana, row.kanji, row.group_type, row.meaning]
      );
    }
    console.log(`恢复verbs表: ${verbsData.length} 条记录`);
    
    // 恢复adjectives表
    const adjsData = JSON.parse(fs.readFileSync('adjectives_backup_2025-09-06T03-06-23-763Z.json', 'utf8'));
    for (const row of adjsData) {
      await pool.query(
        'INSERT INTO adjectives (id, kana, kanji, type, meaning) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.kana, row.kanji, row.type, row.meaning]
      );
    }
    console.log(`恢复adjectives表: ${adjsData.length} 条记录`);
    
    // 恢复plain表
    const plainData = JSON.parse(fs.readFileSync('plain_backup_2025-09-06T03-06-23-763Z.json', 'utf8'));
    for (const row of plainData) {
      await pool.query(
        'INSERT INTO plain (id, kana, kanji, item_type, group_type, adj_type, meaning, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [row.id, row.kana, row.kanji, row.item_type, row.group_type, row.adj_type, row.meaning, row.created_at]
      );
    }
    console.log(`恢复plain表: ${plainData.length} 条记录`);
    
    // 恢复reviews表
    const reviewsData = JSON.parse(fs.readFileSync('reviews_backup_2025-09-06T03-06-23-763Z.json', 'utf8'));
    for (const row of reviewsData) {
      await pool.query(
        'INSERT INTO reviews (id, anon_id, item_type, item_id, form, learning_mode, attempts, correct, streak, due_at, last_reviewed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [row.id, row.anon_id, row.item_type, row.item_id, row.form, row.learning_mode, row.attempts, row.correct, row.streak, row.due_at, row.last_reviewed]
      );
    }
    console.log(`恢复reviews表: ${reviewsData.length} 条记录`);
    
    // 重置序列
    await pool.query(`
      SELECT setval('verbs_id_seq', (SELECT MAX(id) FROM verbs));
      SELECT setval('adjectives_id_seq', (SELECT MAX(id) FROM adjectives));
      SELECT setval('plain_id_seq', (SELECT MAX(id) FROM plain));
      SELECT setval('reviews_id_seq', (SELECT MAX(id) FROM reviews));
    `);
    
    console.log('\n=== 数据恢复完成 ===');
  } catch (error) {
    console.error('恢复数据时出错:', error);
  } finally {
    await pool.end();
  }
}

restoreData();
