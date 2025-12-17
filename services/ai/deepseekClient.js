const OpenAI = require('openai');
const { AiExplainError } = require('./errors');

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
const SYSTEM_PROMPT = `
你是一名面向中文母语学习者的日语语法讲解老师，需根据意图区分“讲解句子”与“元对话/功能咨询”：
1) 如果用户是在提问你的功能、流程、需求（例如“可以多轮吗”“不要忘记之前内容”“请总结”等），直接用中文回应并遵循要求，不要把问题当作待讲解的日语句子。
2) 如果用户提供日语句子或包含日语/汉字/假名的示例，再进行语法讲解。

你会收到一个 JSON 对象：
{ "text_input": "...", "image_ocr_text": "..." }
两个字段中可能有一个为空，请综合处理。

输出纯文本，结构清晰，建议包含（仅在句子讲解场景下使用）：
- 简短概括（中文）
- 原句逐条讲解：原文、平假名注音、中文翻译
- 词语/短语拆解：重点词语+读音+释义
- 语法讲解：用法、接续形式、例句（日中对照）
- 练习建议：1~3 条练习提示或造句任务
保持客观、中文说明，可使用简单标题或列表；若是功能类问题，则直接回答，不必套用上述结构。`.trim();

const SUMMARY_PROMPT = `
你是一名对话压缩助手，请将输入的多轮对话内容摘要为一段不超过 200 字的中文要点，保留：
- 用户提问中的关键句子、语言偏好或语气要求
- 助手已给出的核心讲解、语法点、例句
请不要添加新信息，输出纯文本。`.trim();

function buildMessages({ history = [], userContent }) {
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    }
  ];

  if (Array.isArray(history) && history.length) {
    history.forEach(item => {
      if (!item?.role || !item?.content) return;
      messages.push({ role: item.role, content: item.content });
    });
  }

  messages.push({
    role: 'user',
    content: userContent
  });

  return messages;
}

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
      max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || '1500', 10),
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

async function explainCombinedInput({ textInput = '', imageOcrText = '', history = [] }) {
  const payload = JSON.stringify({
    text_input: textInput,
    image_ocr_text: imageOcrText
  });

  const messages = buildMessages({ history, userContent: payload });

  return callDeepseek(messages);
}

async function streamExplainCombinedInput({ textInput = '', imageOcrText = '', history = [], onDelta }) {
  const payload = JSON.stringify({
    text_input: textInput,
    image_ocr_text: imageOcrText
  });

  const messages = buildMessages({ history, userContent: payload });

  const client = getClient();
  try {
    const stream = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE || '0.2'),
      max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || '1500', 10),
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
  streamExplainCombinedInput,
  buildMessages,
  summarizeHistory
};

async function summarizeHistory(history = []) {
  if (!Array.isArray(history) || !history.length) {
    return '';
  }

  const payload = history.map(item => `${item.role === 'user' ? '用户' : '助手'}: ${item.content}`).join('\n');

  const messages = [
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: payload }
  ];

  return callDeepseek(messages);
}
