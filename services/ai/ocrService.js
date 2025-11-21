const axios = require('axios');
const FormData = require('form-data');
const { AiExplainError } = require('./errors');
const { ensureMaxImageSize, ONE_MB } = require('./imageUtils');

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

async function ocrImageToText(buffer) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new AiExplainError('AI_FEATURE_DISABLED', 'AI 讲解功能未配置。', 503);
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new AiExplainError('OCR_FAILED', '未检测到有效的图片数据。');
  }

  const optimizedBuffer = await ensureMaxImageSize(buffer, ONE_MB);

  const form = new FormData();
  form.append('file', optimizedBuffer, {
    filename: 'upload.jpg',
    contentType: 'image/jpeg'
  });
  form.append('language', 'jpn');
  form.append('OCREngine', '1');
  form.append('isOverlayRequired', 'false');

  try {
    const { data } = await axios.post(OCR_ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        apikey: apiKey
      },
      timeout: parseInt(process.env.OCR_SPACE_TIMEOUT || '20000', 10)
    });

    if (data?.OCRExitCode !== 1 || !Array.isArray(data?.ParsedResults) || data.ParsedResults.length === 0) {
      const errorMessage =
        data?.ErrorMessage ||
        data?.ErrorDetails ||
        'OCR 服务解析失败，请稍后重试。';
      throw new AiExplainError('OCR_FAILED', errorMessage, 503);
    }

    const parsedText = data.ParsedResults.map(item => item.ParsedText || '').join('\n').trim();

    if (!parsedText) {
      throw new AiExplainError('NO_TEXT_FROM_IMAGE', '未在图片中识别到可用文本，请尝试更清晰的照片。');
    }

    return parsedText;
  } catch (error) {
    if (error instanceof AiExplainError) {
      throw error;
    }

    console.error('[OCR.Space] 调用失败', error?.response?.data || error.message);
    throw new AiExplainError('OCR_FAILED', '图片识别出现异常，请稍后再试。', 503);
  }
}

module.exports = {
  ocrImageToText
};
