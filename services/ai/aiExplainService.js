const { ocrImageToText } = require('./ocrService');
const { explainCombinedInput } = require('./deepseekClient');
const { AiExplainError } = require('./errors');

const MAX_INPUT_LENGTH = parseInt(process.env.AI_TEXT_MAX_LENGTH || '1000', 10);

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

async function aiExplainService({ textInput = '', fileBuffer = null }) {
  const sources = await prepareAiSources({ textInput, fileBuffer });

  const explain = await explainCombinedInput({
    textInput: sources.text_input,
    imageOcrText: sources.image_ocr_text
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
  prepareAiSources
};
