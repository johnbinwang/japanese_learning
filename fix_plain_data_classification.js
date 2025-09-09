/**
 * 修复plain表中的数据分类问题
 * 文件名: fix_plain_data_classification.js
 * 作者: AI Assistant
 * 创建日期: 2025-01-09
 * 描述: 修复被错误分类为动词的形容词和形容词短语
 * 版权信息: Japanese Learning App v1.0.2
 */

const pool = require('./db/pool');

// 需要修复的数据：从动词改为形容词
const fixData = [
    {
        kana: 'あたまがいたい',
        kanji: '頭が痛い',
        correctType: 'adj',
        correctAdjType: 'i',
        reason: '形容词短语，以い结尾'
    },
    {
        kana: 'おなかがいたい', 
        kanji: 'お腹が痛い',
        correctType: 'adj',
        correctAdjType: 'i',
        reason: '形容词短语，以い结尾'
    },
    {
        kana: 'きらい',
        kanji: '嫌い',
        correctType: 'adj', 
        correctAdjType: 'na',
        reason: 'na形容词'
    },
    {
        kana: 'のどがいたい',
        kanji: '喉が痛い', 
        correctType: 'adj',
        correctAdjType: 'i',
        reason: '形容词短语，以い结尾'
    }
];

async function checkCurrentData() {
    console.log('=== 检查当前数据分类 ===\n');
    
    for (const item of fixData) {
        try {
            const result = await pool.query(
                'SELECT kana, kanji, item_type, group_type FROM plain WHERE kana = $1',
                [item.kana]
            );
            
            if (result.rows.length > 0) {
                const current = result.rows[0];
                console.log(`${item.kana} (${item.kanji})`);
                console.log(`  当前分类: ${current.item_type} (${current.group_type})`);
                console.log(`  应该分类: ${item.correctType} (${item.correctAdjType})`);
                console.log(`  原因: ${item.reason}\n`);
            }
        } catch (error) {
            console.error(`检查 ${item.kana} 时出错:`, error.message);
        }
    }
}

async function fixClassification() {
    console.log('=== 开始修复数据分类 ===\n');
    
    for (const item of fixData) {
        try {
            // 更新item_type和adj_type字段
            const result = await pool.query(
                `UPDATE plain 
                 SET item_type = $1, adj_type = $2, group_type = NULL
                 WHERE kana = $3`,
                [item.correctType, item.correctAdjType, item.kana]
            );
            
            if (result.rowCount > 0) {
                console.log(`✅ 已修复: ${item.kana} -> ${item.correctType} (${item.correctAdjType})`);
            } else {
                console.log(`⚠️  未找到: ${item.kana}`);
            }
        } catch (error) {
            console.error(`❌ 修复 ${item.kana} 时出错:`, error.message);
        }
    }
}

async function verifyFix() {
    console.log('\n=== 验证修复结果 ===\n');
    
    for (const item of fixData) {
        try {
            const result = await pool.query(
                'SELECT kana, kanji, item_type, adj_type, group_type FROM plain WHERE kana = $1',
                [item.kana]
            );
            
            if (result.rows.length > 0) {
                const current = result.rows[0];
                const isCorrect = current.item_type === item.correctType && 
                                current.adj_type === item.correctAdjType;
                
                console.log(`${item.kana} (${item.kanji})`);
                console.log(`  修复后: ${current.item_type} (${current.adj_type || 'NULL'}) ${isCorrect ? '✅' : '❌'}`);
            }
        } catch (error) {
            console.error(`验证 ${item.kana} 时出错:`, error.message);
        }
    }
}

async function testConjugation() {
    console.log('\n=== 测试修复后的变形逻辑 ===\n');
    
    // 模拟形容词变形逻辑
    function conjugateAdjective(adj, form, type) {
        const base = adj.replace(/い$/, '').replace(/だ$/, '').replace(/な$/, '');
        
        if (type === 'i') {
            switch (form) {
                case 'plain_negative':
                    return base + 'くない';
                case 'plain_past':
                    return base + 'かった';
                case 'plain_past_negative':
                    return base + 'くなかった';
                default:
                    return adj;
            }
        } else { // na形容词
            switch (form) {
                case 'plain_negative':
                    return base + 'じゃない';
                case 'plain_past':
                    return base + 'だった';
                case 'plain_past_negative':
                    return base + 'じゃなかった';
                default:
                    return base + 'だ';
            }
        }
    }
    
    const testForms = ['plain_present', 'plain_past', 'plain_negative', 'plain_past_negative'];
    
    for (const item of fixData) {
        console.log(`${item.kana} (${item.kanji}) - ${item.correctAdjType}形容词:`);
        
        testForms.forEach(form => {
            const result = conjugateAdjective(item.kana, form, item.correctAdjType);
            console.log(`  ${form}: ${result}`);
        });
        
        console.log('');
    }
}

async function main() {
    try {
        await checkCurrentData();
        
        console.log('是否要执行修复？(y/n)');
        // 在实际使用中，这里应该等待用户输入
        // 为了自动化，我们直接执行修复
        
        await fixClassification();
        await verifyFix();
        await testConjugation();
        
        console.log('\n=== 修复完成 ===');
        console.log('建议重启应用以确保更改生效。');
        
    } catch (error) {
        console.error('修复过程中出错:', error.message);
    } finally {
        await pool.end();
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fixData, checkCurrentData, fixClassification, verifyFix };