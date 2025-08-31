// 测试API返回的「遊ぶ」变形结果
const http = require('http');

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

async function testAsobuConjugation() {
    console.log('=== 测试API返回的「遊ぶ」变形结果 ===');
    
    try {
        // 尝试多次请求，直到获取到「遊ぶ」
        for (let i = 0; i < 50; i++) {
            const response = await makeRequest('http://localhost:3000/api/next?module=verb&forms=ta');
            
            if (response.error) {
                console.log('API错误:', response.error);
                break;
            }
            
            const word = response.kanji || response.kana;
            console.log(`第${i+1}次请求: ${word} (${response.group}类) → ${response.targetForm}形`);
            
            if (word === '遊ぶ' || response.kana === 'あそぶ') {
                console.log('\n找到「遊ぶ」！');
                console.log('完整响应:', JSON.stringify(response, null, 2));
                console.log('\n关键信息:');
                console.log('- 动词:', word);
                console.log('- 假名:', response.kana);
                console.log('- 分组:', response.group);
                console.log('- 目标形式:', response.targetForm);
                console.log('- 后端返回的correctAnswer:', response.correctAnswer);
                
                // 验证变形逻辑
                if (response.correctAnswer === '遊ぶた') {
                    console.log('\n❌ 发现问题！后端返回的答案是错误的「遊ぶた」');
                } else if (response.correctAnswer === '遊んだ') {
                    console.log('\n✅ 后端返回的答案是正确的「遊んだ」');
                } else {
                    console.log('\n❓ 后端返回了意外的答案:', response.correctAnswer);
                }
                return;
            }
            
            // 添加小延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\n未能在50次请求中找到「遊ぶ」');
    } catch (error) {
        console.error('测试失败:', error.message);
    }
}

testAsobuConjugation();