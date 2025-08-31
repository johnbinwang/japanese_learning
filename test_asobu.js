// 测试「遊ぶ」的变形
const conjugationEngine = {
    conjugateToTe(verb, group) {
        if (verb === 'する') return 'して';
        if (verb === '来る' || verb === 'くる') return 'きて';
        if (verb === '行く' || verb === 'いく') return 'いって';
        
        if (group === 'I') {
            const stem = verb.slice(0, -1);
            const lastChar = verb.slice(-1);
            
            if (['く', 'ぐ'].includes(lastChar)) {
                return stem + (lastChar === 'く' ? 'いて' : 'いで');
            } else if (['す'].includes(lastChar)) {
                return stem + 'して';
            } else if (['つ', 'う', 'る'].includes(lastChar)) {
                return stem + 'って';
            } else if (['ぬ', 'ぶ', 'む'].includes(lastChar)) {
                return stem + 'んで';
            }
        } else if (group === 'II') {
            return verb.slice(0, -1) + 'て';
        }
        return verb + 'て';
    },

    conjugateToTa(verb, group) {
        // 特殊处理：确保II类动词正确变形
        if (group === 'II') {
            // II类动词：去る+た
            return verb.slice(0, -1) + 'た';
        }
        
        // 其他情况使用て形转换
        const teForm = this.conjugateToTe(verb, group);
        return teForm.replace(/て$/, 'た').replace(/で$/, 'だ');
    }
};

// 测试用例
const testCases = [
    { verb: '遊ぶ', group: 'I', expected_te: '遊んで', expected_ta: '遊んだ' },
    { verb: '読む', group: 'I', expected_te: '読んで', expected_ta: '読んだ' },
    { verb: '呼ぶ', group: 'I', expected_te: '呼んで', expected_ta: '呼んだ' },
    { verb: '買う', group: 'I', expected_te: '買って', expected_ta: '買った' },
    { verb: '書く', group: 'I', expected_te: '書いて', expected_ta: '書いた' }
];

console.log('=== 测试I类动词的て形和た形变形 ===');
testCases.forEach(test => {
    const teResult = conjugationEngine.conjugateToTe(test.verb, test.group);
    const taResult = conjugationEngine.conjugateToTa(test.verb, test.group);
    
    const teStatus = teResult === test.expected_te ? '✓' : '✗';
    const taStatus = taResult === test.expected_ta ? '✓' : '✗';
    
    console.log(`${test.verb} (${test.group}类):`);
    console.log(`  て形: ${teStatus} ${teResult} (期望: ${test.expected_te})`);
    console.log(`  た形: ${taStatus} ${taResult} (期望: ${test.expected_ta})`);
    console.log('');
});