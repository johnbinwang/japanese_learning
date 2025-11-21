const OpenAI = require('openai');
const { AiExplainError } = require('./errors');

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
const SYSTEM_PROMPT = `
你是一名面向中文母语学习者的日语语法讲解老师。
你会收到一个 JSON 对象：
{ "text_input": "...", "image_ocr_text": "..." }
两个字段中可能有一个为空字符串，请综合处理。

输出纯文本且结构清晰，建议包含：
1. 简短概括（中文）
2. 原句逐条讲解：原文、平假名注音、中文翻译
3. 词语/短语拆解：列出若干重点词语，含读音与释义
4. 语法讲解：列出若干语法点，描述用法、接续形式、例句（日中对照）
5. 练习建议：1~3 条练习提示或造句任务
保持客观、中文说明，可使用简单标题或列表。`.trim();

const getClient = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new AiExplainError('AI_FEATURE_DISABLED', 'AI 讲解功能未配置。', 503);
  }

  return new OpenAI({
    apiKey,
    baseURL: BASE_URL
  });
};

async function callDeepseek(messages) {
  const client = getClient();

  try {
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE || '0.2'),
      max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || '900', 10),
      messages
    });

    const content = completion?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new AiExplainError('LLM_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 503);
    }

    return content;
  } catch (error) {
    if (error instanceof AiExplainError) {
      throw error;
    }

    const status = error?.status || error?.response?.status;
    if (status === 401 || status === 403) {
      throw new AiExplainError('LLM_ERROR', 'AI 服务认证失败，请检查配置。', 503);
    }

    console.error('[DeepSeek] 调用失败', error?.response?.data || error.message);
    throw new AiExplainError('LLM_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 503);
  }
}

async function explainCombinedInput({ textInput = '', imageOcrText = '' }) {
  const payload = JSON.stringify({
    text_input: textInput,
    image_ocr_text: imageOcrText
  });

  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: payload
    }
  ];

  return callDeepseek(messages);
}

async function streamExplainCombinedInput({ textInput = '', imageOcrText = '', onDelta }) {
  const payload = JSON.stringify({
    text_input: textInput,
    image_ocr_text: imageOcrText
  });

  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: payload
    }
  ];

  const client = getClient();
  try {
    const stream = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE || '0.2'),
      max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || '900', 10),
      messages,
      stream: true
    });

    let accumulated = '';
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (delta) {
        accumulated += delta;
        if (typeof onDelta === 'function') {
          try {
            await onDelta(delta);
          } catch (err) {
            console.error('[DeepSeek Stream] onDelta error', err);
          }
        }
      }
    }

    if (!accumulated) {
      throw new AiExplainError('LLM_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 503);
    }

    return accumulated;
  } catch (error) {
    if (error instanceof AiExplainError) {
      throw error;
    }

    const status = error?.status || error?.response?.status;
    if (status === 401 || status === 403) {
      throw new AiExplainError('LLM_ERROR', 'AI 服务认证失败，请检查配置。', 503);
    }

    console.error('[DeepSeek Stream] 调用失败', error?.response?.data || error.message);
    throw new AiExplainError('LLM_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 503);
  }
}

module.exports = {
  explainCombinedInput,
  streamExplainCombinedInput
};
