const { test, expect } = require('@playwright/test');
const path = require('path');

// 简单冒烟：mock API 返回，验证多轮对话与清空按钮
test.describe('AI chat multi-turn', () => {
  test('should render multi-turn replies and clear history', async ({ page }) => {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    const indexUrl = 'file://' + indexPath + '#ai';

    // 页面加载前注入：登录、mock fetch、SSE 数据
    await page.addInitScript(() => {
      const streamBody = [
        'data: {"type":"chunk","content":"第1条回复"}\n\n',
        'data: {"type":"chunk","content":"，继续"}\n\n',
        'data: {"type":"done","payload":{"success":true,"data":{"explain":{"content":"第1条回复，继续"}}}}\n\n'
      ].join('');

      const jsonResponse = (data) =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

      const streamResponse = (body) =>
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });

      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url || '';
        if (url.includes('/api/ai/explain/stream')) {
          return Promise.resolve(streamResponse(streamBody));
        }
        if (url.includes('/api/ai/explain')) {
          return Promise.resolve(jsonResponse({ success: true, data: { explain: { content: '第2条回复' } } }));
        }
        if (url.includes('/api/me')) {
          return Promise.resolve(jsonResponse({ id: 1, email: 'test@example.com' }));
        }
        if (url.includes('/api/preferences') || url.includes('/api/today-overview')) {
          return Promise.resolve(jsonResponse({}));
        }
        return originalFetch(input, init);
      };

      localStorage.setItem('authToken', 'dummy.token.part');
    });

    await page.goto(indexUrl);
    await page.waitForSelector('#ai-chat-text', { state: 'visible' });

    // 第一轮（流式）
    await page.fill('#ai-chat-text', '第一轮提问');
    await page.click('#ai-chat-send');
    await expect(page.locator('.ai-message.ai-bot .ai-bubble').last()).toContainText('第1条回复');

    // 第二轮（非流式）
    await page.fill('#ai-chat-text', '第二轮提问');
    await page.click('#ai-chat-send');
    await expect(page.locator('.ai-message.ai-bot .ai-bubble').last()).toContainText('第2条回复');

    // 清空对话
    await page.click('#ai-clear-chat');
    await expect(page.locator('#ai-chat-messages .ai-message')).toHaveCount(1);
    await expect(page.locator('#ai-chat-messages')).toContainText('こんにちは');
  });
});
