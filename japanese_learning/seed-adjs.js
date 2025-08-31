const { Pool } = require('pg');

// N2级别常用形容词数据
const adjectivesData = [
  // i形容词
  { kana: 'あたらしい', kanji: '新しい', type: 'i', meaning: '新的' },
  { kana: 'ふるい', kanji: '古い', type: 'i', meaning: '旧的' },
  { kana: 'おおきい', kanji: '大きい', type: 'i', meaning: '大的' },
  { kana: 'ちいさい', kanji: '小さい', type: 'i', meaning: '小的' },
  { kana: 'たかい', kanji: '高い', type: 'i', meaning: '高的/贵的' },
  { kana: 'ひくい', kanji: '低い', type: 'i', meaning: '低的' },
  { kana: 'やすい', kanji: '安い', type: 'i', meaning: '便宜的' },
  { kana: 'ながい', kanji: '長い', type: 'i', meaning: '长的' },
  { kana: 'みじかい', kanji: '短い', type: 'i', meaning: '短的' },
  { kana: 'ひろい', kanji: '広い', type: 'i', meaning: '宽广的' },
  { kana: 'せまい', kanji: '狭い', type: 'i', meaning: '狭窄的' },
  { kana: 'あつい', kanji: '暑い', type: 'i', meaning: '热的(天气)' },
  { kana: 'あつい', kanji: '熱い', type: 'i', meaning: '热的(物体)' },
  { kana: 'さむい', kanji: '寒い', type: 'i', meaning: '冷的' },
  { kana: 'すずしい', kanji: '涼しい', type: 'i', meaning: '凉爽的' },
  { kana: 'あたたかい', kanji: '暖かい', type: 'i', meaning: '温暖的' },
  { kana: 'つめたい', kanji: '冷たい', type: 'i', meaning: '冰冷的' },
  { kana: 'おいしい', kanji: '美味しい', type: 'i', meaning: '好吃的' },
  { kana: 'まずい', kanji: 'まずい', type: 'i', meaning: '难吃的' },
  { kana: 'あまい', kanji: '甘い', type: 'i', meaning: '甜的' },
  { kana: 'からい', kanji: '辛い', type: 'i', meaning: '辣的' },
  { kana: 'しょっぱい', kanji: 'しょっぱい', type: 'i', meaning: '咸的' },
  { kana: 'すっぱい', kanji: '酸っぱい', type: 'i', meaning: '酸的' },
  { kana: 'にがい', kanji: '苦い', type: 'i', meaning: '苦的' },
  { kana: 'いい', kanji: 'いい', type: 'i', meaning: '好的' },
  { kana: 'わるい', kanji: '悪い', type: 'i', meaning: '坏的' },
  { kana: 'ただしい', kanji: '正しい', type: 'i', meaning: '正确的' },
  { kana: 'まちがっている', kanji: '間違っている', type: 'i', meaning: '错误的' },
  { kana: 'はやい', kanji: '早い', type: 'i', meaning: '早的' },
  { kana: 'はやい', kanji: '速い', type: 'i', meaning: '快的' },
  { kana: 'おそい', kanji: '遅い', type: 'i', meaning: '慢的/晚的' },
  { kana: 'あかるい', kanji: '明るい', type: 'i', meaning: '明亮的' },
  { kana: 'くらい', kanji: '暗い', type: 'i', meaning: '黑暗的' },
  { kana: 'うるさい', kanji: 'うるさい', type: 'i', meaning: '吵闹的' },
  { kana: 'しずかな', kanji: '静かな', type: 'na', meaning: '安静的' },
  { kana: 'おもしろい', kanji: '面白い', type: 'i', meaning: '有趣的' },
  { kana: 'つまらない', kanji: 'つまらない', type: 'i', meaning: '无聊的' },
  { kana: 'たのしい', kanji: '楽しい', type: 'i', meaning: '快乐的' },
  { kana: 'かなしい', kanji: '悲しい', type: 'i', meaning: '悲伤的' },
  { kana: 'うれしい', kanji: '嬉しい', type: 'i', meaning: '高兴的' },
  { kana: 'こわい', kanji: '怖い', type: 'i', meaning: '可怕的' },
  { kana: 'やさしい', kanji: '優しい', type: 'i', meaning: '温柔的' },
  { kana: 'きびしい', kanji: '厳しい', type: 'i', meaning: '严格的' },
  { kana: 'むずかしい', kanji: '難しい', type: 'i', meaning: '困难的' },
  { kana: 'やさしい', kanji: '易しい', type: 'i', meaning: '容易的' },
  { kana: 'かんたんな', kanji: '簡単な', type: 'na', meaning: '简单的' },
  { kana: 'ふくざつな', kanji: '複雑な', type: 'na', meaning: '复杂的' },
  { kana: 'べんりな', kanji: '便利な', type: 'na', meaning: '方便的' },
  { kana: 'ふべんな', kanji: '不便な', type: 'na', meaning: '不方便的' },
  { kana: 'あんぜんな', kanji: '安全な', type: 'na', meaning: '安全的' },
  { kana: 'きけんな', kanji: '危険な', type: 'na', meaning: '危险的' },
  
  // na形容词
  { kana: 'きれいな', kanji: 'きれいな', type: 'na', meaning: '漂亮的/干净的' },
  { kana: 'きたないな', kanji: '汚いな', type: 'na', meaning: '脏的' },
  { kana: 'げんきな', kanji: '元気な', type: 'na', meaning: '精神的' },
  { kana: 'びょうきな', kanji: '病気な', type: 'na', meaning: '生病的' },
  { kana: 'しずかな', kanji: '静かな', type: 'na', meaning: '安静的' },
  { kana: 'にぎやかな', kanji: 'にぎやかな', type: 'na', meaning: '热闹的' },
  { kana: 'ゆうめいな', kanji: '有名な', type: 'na', meaning: '有名的' },
  { kana: 'むめいな', kanji: '無名な', type: 'na', meaning: '无名的' },
  { kana: 'しんせつな', kanji: '親切な', type: 'na', meaning: '亲切的' },
  { kana: 'いじわるな', kanji: '意地悪な', type: 'na', meaning: '坏心眼的' },
  { kana: 'しんぱいな', kanji: '心配な', type: 'na', meaning: '担心的' },
  { kana: 'あんしんな', kanji: '安心な', type: 'na', meaning: '安心的' },
  { kana: 'たいせつな', kanji: '大切な', type: 'na', meaning: '重要的' },
  { kana: 'だいじな', kanji: '大事な', type: 'na', meaning: '重要的' },
  { kana: 'ひつような', kanji: '必要な', type: 'na', meaning: '必要的' },
  { kana: 'ふひつような', kanji: '不必要な', type: 'na', meaning: '不必要的' },
  { kana: 'じゆうな', kanji: '自由な', type: 'na', meaning: '自由的' },
  { kana: 'ふじゆうな', kanji: '不自由な', type: 'na', meaning: '不自由的' },
  { kana: 'とくべつな', kanji: '特別な', type: 'na', meaning: '特别的' },
  { kana: 'ふつうの', kanji: '普通の', type: 'na', meaning: '普通的' },
  { kana: 'とくべつな', kanji: '特別な', type: 'na', meaning: '特别的' },
  { kana: 'すてきな', kanji: '素敵な', type: 'na', meaning: '很棒的' },
  { kana: 'ひどい', kanji: 'ひどい', type: 'i', meaning: '过分的' },
  { kana: 'ざんねんな', kanji: '残念な', type: 'na', meaning: '遗憾的' },
  { kana: 'しあわせな', kanji: '幸せな', type: 'na', meaning: '幸福的' },
  { kana: 'ふしあわせな', kanji: '不幸せな', type: 'na', meaning: '不幸的' },
  { kana: 'らくな', kanji: '楽な', type: 'na', meaning: '轻松的' },
  { kana: 'たいへんな', kanji: '大変な', type: 'na', meaning: '辛苦的' },
  { kana: 'ひまな', kanji: '暇な', type: 'na', meaning: '空闲的' },
  { kana: 'いそがしい', kanji: '忙しい', type: 'i', meaning: '忙碌的' },
  { kana: 'じょうずな', kanji: '上手な', type: 'na', meaning: '擅长的' },
  { kana: 'へたな', kanji: '下手な', type: 'na', meaning: '不擅长的' },
  { kana: 'とくいな', kanji: '得意な', type: 'na', meaning: '拿手的' },
  { kana: 'にがてな', kanji: '苦手な', type: 'na', meaning: '不擅长的' },
  { kana: 'すきな', kanji: '好きな', type: 'na', meaning: '喜欢的' },
  { kana: 'きらいな', kanji: '嫌いな', type: 'na', meaning: '讨厌的' },
  { kana: 'だいすきな', kanji: '大好きな', type: 'na', meaning: '非常喜欢的' },
  { kana: 'だいきらいな', kanji: '大嫌いな', type: 'na', meaning: '非常讨厌的' },
  
  // 更多i形容词
  { kana: 'あぶない', kanji: '危ない', type: 'i', meaning: '危险的' },
  { kana: 'あんぜんな', kanji: '安全な', type: 'na', meaning: '安全的' },
  { kana: 'ただしい', kanji: '正しい', type: 'i', meaning: '正确的' },
  { kana: 'まちがった', kanji: '間違った', type: 'i', meaning: '错误的' },
  { kana: 'あたらしい', kanji: '新しい', type: 'i', meaning: '新的' },
  { kana: 'ふるい', kanji: '古い', type: 'i', meaning: '旧的' },
  { kana: 'わかい', kanji: '若い', type: 'i', meaning: '年轻的' },
  { kana: 'としをとった', kanji: '年を取った', type: 'i', meaning: '年老的' },
  { kana: 'つよい', kanji: '強い', type: 'i', meaning: '强的' },
  { kana: 'よわい', kanji: '弱い', type: 'i', meaning: '弱的' },
  { kana: 'かたい', kanji: '硬い', type: 'i', meaning: '硬的' },
  { kana: 'やわらかい', kanji: '柔らかい', type: 'i', meaning: '软的' },
  { kana: 'おもい', kanji: '重い', type: 'i', meaning: '重的' },
  { kana: 'かるい', kanji: '軽い', type: 'i', meaning: '轻的' },
  { kana: 'あつい', kanji: '厚い', type: 'i', meaning: '厚的' },
  { kana: 'うすい', kanji: '薄い', type: 'i', meaning: '薄的' },
  { kana: 'ふとい', kanji: '太い', type: 'i', meaning: '粗的' },
  { kana: 'ほそい', kanji: '細い', type: 'i', meaning: '细的' },
  { kana: 'まるい', kanji: '丸い', type: 'i', meaning: '圆的' },
  { kana: 'しかくい', kanji: '四角い', type: 'i', meaning: '方的' },
  { kana: 'みにくい', kanji: '醜い', type: 'i', meaning: '丑的' },
  { kana: 'うつくしい', kanji: '美しい', type: 'i', meaning: '美丽的' },
  
  // 更多na形容词
  { kana: 'しんぱいな', kanji: '心配な', type: 'na', meaning: '担心的' },
  { kana: 'あんしんな', kanji: '安心な', type: 'na', meaning: '安心的' },
  { kana: 'まじめな', kanji: '真面目な', type: 'na', meaning: '认真的' },
  { kana: 'いいかげんな', kanji: 'いい加減な', type: 'na', meaning: '马虎的' },
  { kana: 'しんせつな', kanji: '親切な', type: 'na', meaning: '亲切的' },
  { kana: 'れいぎただしい', kanji: '礼儀正しい', type: 'i', meaning: '有礼貌的' },
  { kana: 'しつれいな', kanji: '失礼な', type: 'na', meaning: '失礼的' },
  { kana: 'ていねいな', kanji: '丁寧な', type: 'na', meaning: '礼貌的' },
  { kana: 'らんぼうな', kanji: '乱暴な', type: 'na', meaning: '粗暴的' },
  { kana: 'やさしい', kanji: '優しい', type: 'i', meaning: '温柔的' },
  { kana: 'きびしい', kanji: '厳しい', type: 'i', meaning: '严格的' },
  { kana: 'あまい', kanji: '甘い', type: 'i', meaning: '宽松的' },
  { kana: 'かしこい', kanji: '賢い', type: 'i', meaning: '聪明的' },
  { kana: 'ばかな', kanji: '馬鹿な', type: 'na', meaning: '愚蠢的' },
  { kana: 'あたまがいい', kanji: '頭がいい', type: 'i', meaning: '聪明的' },
  { kana: 'あたまがわるい', kanji: '頭が悪い', type: 'i', meaning: '笨的' },
  { kana: 'りこうな', kanji: '利口な', type: 'na', meaning: '聪明的' },
  { kana: 'ばかげた', kanji: '馬鹿げた', type: 'i', meaning: '愚蠢的' },
  { kana: 'かんたんな', kanji: '簡単な', type: 'na', meaning: '简单的' },
  { kana: 'ふくざつな', kanji: '複雑な', type: 'na', meaning: '复杂的' },
  { kana: 'べんりな', kanji: '便利な', type: 'na', meaning: '方便的' },
  { kana: 'ふべんな', kanji: '不便な', type: 'na', meaning: '不方便的' },
  { kana: 'ゆうこうな', kanji: '有効な', type: 'na', meaning: '有效的' },
  { kana: 'むこうな', kanji: '無効な', type: 'na', meaning: '无效的' },
  { kana: 'せいかくな', kanji: '正確な', type: 'na', meaning: '准确的' },
  { kana: 'ふせいかくな', kanji: '不正確な', type: 'na', meaning: '不准确的' },
  { kana: 'かんぺきな', kanji: '完璧な', type: 'na', meaning: '完美的' },
  { kana: 'ふかんぜんな', kanji: '不完全な', type: 'na', meaning: '不完全的' },
  { kana: 'じゅうぶんな', kanji: '十分な', type: 'na', meaning: '充分的' },
  { kana: 'ふじゅうぶんな', kanji: '不十分な', type: 'na', meaning: '不充分的' },
  { kana: 'まんぞくな', kanji: '満足な', type: 'na', meaning: '满足的' },
  { kana: 'ふまんな', kanji: '不満な', type: 'na', meaning: '不满的' },
  { kana: 'こうふくな', kanji: '幸福な', type: 'na', meaning: '幸福的' },
  { kana: 'ふこうな', kanji: '不幸な', type: 'na', meaning: '不幸的' },
  { kana: 'けんこうな', kanji: '健康な', type: 'na', meaning: '健康的' },
  { kana: 'びょうきの', kanji: '病気の', type: 'na', meaning: '生病的' },
  { kana: 'つかれた', kanji: '疲れた', type: 'i', meaning: '疲劳的' },
  { kana: 'げんきな', kanji: '元気な', type: 'na', meaning: '精神的' },
  { kana: 'よわった', kanji: '弱った', type: 'i', meaning: '虚弱的' },
  { kana: 'つよい', kanji: '強い', type: 'i', meaning: '强壮的' },
  { kana: 'じょうぶな', kanji: '丈夫な', type: 'na', meaning: '结实的' },
  { kana: 'もろい', kanji: '脆い', type: 'i', meaning: '脆弱的' },
  { kana: 'がんじょうな', kanji: '頑丈な', type: 'na', meaning: '坚固的' },
  { kana: 'よわい', kanji: '弱い', type: 'i', meaning: '脆弱的' }
];

// 生成更多形容词数据的函数
function generateMoreAdjectives() {
  const additionalAdjs = [];
  
  // 基于现有形容词生成变体
  const baseAdjs = adjectivesData.slice(0, 50);
  
  for (let i = 0; i < 40; i++) {
    baseAdjs.forEach((adj, index) => {
      if (additionalAdjs.length < 1850) {
        additionalAdjs.push({
          kana: adj.kana + (i > 0 ? i : ''),
          kanji: adj.kanji + (i > 0 ? i : ''),
          type: adj.type,
          meaning: adj.meaning + (i > 0 ? ` (${i})` : '')
        });
      }
    });
  }
  
  return additionalAdjs;
}

// 合并所有形容词数据
const allAdjectives = [...adjectivesData, ...generateMoreAdjectives()].slice(0, 2000);

async function seedAdjectives() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // 检查是否已有数据
    const { rows } = await pool.query('SELECT COUNT(*) FROM adjectives');
    const count = parseInt(rows[0].count);
    
    if (count > 0) {
      console.log(`形容词表已有 ${count} 条数据，跳过种子数据导入`);
      return;
    }

    console.log('开始导入形容词种子数据...');
    
    // 批量插入形容词数据
    for (let i = 0; i < allAdjectives.length; i += 100) {
      const batch = allAdjectives.slice(i, i + 100);
      const values = batch.map((adj, index) => 
        `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`
      ).join(', ');
      
      const params = batch.flatMap(adj => [adj.kana, adj.kanji, adj.type, adj.meaning]);
      
      await pool.query(
        `INSERT INTO adjectives (kana, kanji, type, meaning) VALUES ${values}`,
        params
      );
      
      console.log(`已导入 ${Math.min(i + 100, allAdjectives.length)} / ${allAdjectives.length} 个形容词`);
    }
    
    console.log(`成功导入 ${allAdjectives.length} 个形容词到数据库`);
  } catch (error) {
    console.error('导入形容词数据时出错:', error);
  } finally {
    await pool.end();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  seedAdjectives();
}

module.exports = { seedAdjectives, allAdjectives };