require('dotenv').config();
const { Pool } = require('pg');
const { verbsData } = require('./seed-verbs');
const { adjectivesData } = require('./seed-adjs');

// 创建数据库连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 生成动词简体形数据
function generateVerbPlainForms(verbs) {
  return verbs.map(verb => ({
    kana: verb.kana,
    kanji: verb.kanji || null,
    item_type: 'vrb',
    group_type: verb.group_type,
    adj_type: null,
    meaning: verb.meaning
  }));
}

// 生成形容词简体形数据
function generateAdjectivePlainForms(adjectives) {
  return adjectives.map(adj => ({
    kana: adj.kana,
    kanji: adj.kanji || null,
    item_type: 'adj',
    group_type: null,
    adj_type: adj.type,
    meaning: adj.meaning
  }));
}



// 主要的种子函数
async function seedPlain() {
  try {
    // console.log('开始导入plain表数据...');
    
    // 获取现有数据
    const existingResult = await pool.query('SELECT COUNT(*) as count FROM plain');
    const existingCount = parseInt(existingResult.rows[0].count);
    // console.log(`Plain表现有数据量: ${existingCount}`);
    
    // 获取动词和形容词数据
     const verbsResult = await pool.query('SELECT * FROM verbs');
     const adjectivesResult = await pool.query('SELECT * FROM adjectives');
     
     // 生成简体形数据
     const verbPlainForms = generateVerbPlainForms(verbsResult.rows);
     const adjectivePlainForms = generateAdjectivePlainForms(adjectivesResult.rows);
    
    const allPlainForms = [...verbPlainForms, ...adjectivePlainForms];
    
    if (existingCount === 0) {
      // 如果表为空，直接插入所有数据
      // console.log(`插入${allPlainForms.length}条新记录...`);
      
      for (const plainForm of allPlainForms) {
         await pool.query(
           'INSERT INTO plain (kana, kanji, item_type, group_type, adj_type, meaning) VALUES ($1, $2, $3, $4, $5, $6)',
           [plainForm.kana, plainForm.kanji, plainForm.item_type, plainForm.group_type, plainForm.adj_type, plainForm.meaning]
         );
       }
    } else {
      // 增量导入：检查哪些数据不存在
      const existingPlainResult = await pool.query('SELECT kana, kanji, item_type FROM plain');
      const existingPlainSet = new Set(
        existingPlainResult.rows.map(row => `${row.kana}-${row.kanji}-${row.item_type}`)
      );
      
      const newPlainForms = allPlainForms.filter(plainForm => 
        !existingPlainSet.has(`${plainForm.kana}-${plainForm.kanji}-${plainForm.item_type}`)
      );
      
      if (newPlainForms.length > 0) {
        // console.log(`发现${newPlainForms.length}条新记录，开始插入...`);
        
        for (const plainForm of newPlainForms) {
           await pool.query(
             'INSERT INTO plain (kana, kanji, item_type, group_type, adj_type, meaning) VALUES ($1, $2, $3, $4, $5, $6)',
             [plainForm.kana, plainForm.kanji, plainForm.item_type, plainForm.group_type, plainForm.adj_type, plainForm.meaning]
           );
         }
      } else {
        // console.log('没有发现新数据，跳过插入。');
      }
    }
    
    // 验证最终结果
    const finalResult = await pool.query('SELECT COUNT(*) as count FROM plain');
    const finalCount = parseInt(finalResult.rows[0].count);
    // console.log(`Plain表最终数据量: ${finalCount}`);
    
    // console.log('Plain表数据导入完成！');
  } catch (error) {
    // console.error('导入plain表数据时出错:', error);
  }
}

// 如果直接运行此文件，则执行种子函数
if (require.main === module) {
  seedPlain().then(() => {
    // console.log('plain表数据导入完成');
    process.exit(0);
  }).catch(error => {
    // console.error('导入失败:', error);
    process.exit(1);
  });
}

module.exports = { seedPlain };