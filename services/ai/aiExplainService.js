const { ocrImageToText } = require('./ocrService');
const { explainCombinedInput, summarizeHistory } = require('./deepseekClient');
const { AiExplainError } = require('./errors');

const MAX_INPUT_LENGTH = parseInt(process.env.AI_TEXT_MAX_LENGTH || '1000', 10);
const MAX_HISTORY_TURNS = parseInt(process.env.AI_HISTORY_MAX_TURNS || '12', 10);
const MAX_HISTORY_CHARS = parseInt(process.env.AI_HISTORY_MAX_CHARS || '6000', 10);
const MAX_HISTORY_TOKENS = parseInt(process.env.AI_HISTORY_MAX_TOKENS || '8000', 10);
const MAX_IMPORTANT_TURNS = parseInt(process.env.AI_HISTORY_IMPORTANT_KEEP || '6', 10);

function normalizeHistory(historyInput) {
  if (!historyInput) return [];

  let parsed = historyInput;
  if (typeof historyInput === 'string') {
    try {
      parsed = JSON.parse(historyInput);
    } catch (error) {
      throw new AiExplainError('INVALID_HISTORY', '对话历史格式不正确，请重试。');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new AiExplainError('INVALID_HISTORY', '对话历史需为数组格式。');
  }

  const cleaned = parsed
    .map(item => {
      const role = typeof item?.role === 'string' ? item.role.trim() : '';
      const content = typeof item?.content === 'string' ? item.content.trim() : '';
      if (!content) return null;
      if (role !== 'user' && role !== 'assistant') return null;
      const important =
        Boolean(item?.important) ||
        /记住|务必|以后|不要忘|必须|重要/i.test(content);
      return { role, content, important };
    })
    .filter(Boolean);

  if (!cleaned.length) return [];

  // 保留最近的若干轮，并限制总字符数，避免请求过大
  const capped = cleaned.slice(-MAX_HISTORY_TURNS);
  let totalChars = capped.reduce((sum, item) => sum + item.content.length, 0);
  while (totalChars > MAX_HISTORY_CHARS && capped.length > 1) {
    const removed = capped.shift();
    totalChars -= removed.content.length;
  }

  return capped;
}

// 粗略估算 token 数：字符 / 4，避免额外依赖
function estimateTokens(text = '') {
  return Math.ceil((text || '').length / 4);
}

function estimateHistoryTokens(history = []) {
  return history.reduce((sum, item) => sum + estimateTokens(item.content || ''), 0);
}

async function compressHistoryIfNeeded(history = []) {
  if (!Array.isArray(history) || !history.length) return [];

  let result = [...history];
  const tokenBudget = MAX_HISTORY_TOKENS;

  // 先做硬窗口
  if (result.length > MAX_HISTORY_TURNS) {
    result = result.slice(-MAX_HISTORY_TURNS);
  }

  // 总 token 足够则直接返回
  if (estimateHistoryTokens(result) <= tokenBudget) {
    return result;
  }

  // 选择要压缩的区段（保留末尾几轮及重要消息）
  const keepTail = 4;
  const tail = result.slice(-keepTail);
  const head = result.slice(0, result.length - keepTail);

  const importantHead = head.filter(item => item.important).slice(-MAX_IMPORTANT_TURNS);
  const compressCandidates = head.filter(item => !item.important);

  let summaryMessage = null;
  if (compressCandidates.length) {
    try {
      const summaryContent = await summarizeHistory(compressCandidates);
      summaryMessage = {
        role: 'assistant',
        content: summaryContent,
        important: true
      };
    } catch (err) {
      console.error('[AI History] summarize failed, fallback to truncation', err);
    }
  }

  // 组合：重要消息 + 摘要(如有) + 尾部
  let combined = [...importantHead];
  if (summaryMessage) combined.push(summaryMessage);
  combined = combined.concat(tail);

  // 若仍超预算，继续从最早的非重要部分截断
  while (combined.length > 1 && estimateHistoryTokens(combined) > tokenBudget) {
    const idx = combined.findIndex(item => !item.important);
    if (idx === -1) break;
    combined.splice(idx, 1);
  }

  return combined;
}

async function prepareAiSources({ textInput = '', fileBuffer = null }) {
  const trimmedText = (textInput || '').trim();

  if (!trimmedText && !fileBuffer) {
    throw new AiExplainError('NO_INPUT', '请输入文本或上传图片。');
  }

  if (trimmedText.length > MAX_INPUT_LENGTH) {
    throw new AiExplainError(
      'TEXT_TOO_LONG',
      `输入文字超过限制（最多 ${MAX_INPUT_LENGTH} 个字符）。`
    );
  }

  let imageOcrText = '';
  if (fileBuffer) {
    imageOcrText = (await ocrImageToText(fileBuffer)).trim();
  }

  if (!trimmedText && fileBuffer && !imageOcrText) {
    throw new AiExplainError(
      'NO_TEXT_FROM_IMAGE',
      '未在图片中识别到可用文本，请尝试换一张更清晰的照片。'
    );
  }

  return {
    text_input: trimmedText,
    image_ocr_text: imageOcrText
  };
}

async function aiExplainService({ textInput = '', fileBuffer = null, history = null }) {
  const sources = await prepareAiSources({ textInput, fileBuffer });
  const normalizedHistory = normalizeHistory(history);
  const compressedHistory = await compressHistoryIfNeeded(normalizedHistory);

  const explain = await explainCombinedInput({
    textInput: sources.text_input,
    imageOcrText: sources.image_ocr_text,
    history: compressedHistory
  });

  return {
    sources,
    explain: {
      content: explain
    }
  };
}

module.exports = {
  aiExplainService,
  AiExplainError,
  prepareAiSources,
  normalizeHistory,
  compressHistoryIfNeeded,
  estimateHistoryTokens
};
