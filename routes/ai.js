const express = require('express');
const multer = require('multer');
const { requireAuthJson } = require('../middleware/requireAuthJson');
const {
  aiExplainService,
  AiExplainError,
  prepareAiSources
} = require('../services/ai/aiExplainService');
const { streamExplainCombinedInput } = require('../services/ai/deepseekClient');

const router = express.Router();

const MAX_FILE_SIZE = parseInt(process.env.AI_IMAGE_MAX_BYTES || (5 * 1024 * 1024), 10);
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    cb(null, true);
  }
});

const respondError = (res, code, message, status = 400) => {
  res.status(status).json({
    success: false,
    data: null,
    error: {
      code,
      message
    }
  });
};

const decodeUnicode = (str = '') =>
  str
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n/g, '\n');

const formatStreamPreview = (text = '') => decodeUnicode(text || '');

const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return respondError(
          res,
          'IMAGE_TOO_LARGE',
          `图片大小超出限制（最多 ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB）。`
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return respondError(
          res,
          'INVALID_IMAGE',
          '仅支持 JPG/PNG 等常见图片格式。'
        );
      }
    }

    console.error('[AI Upload] 处理文件失败', err);
    return respondError(res, 'UPLOAD_FAILED', '图片上传失败，请稍后重试。', 500);
  });
};

router.post('/ai/explain', requireAuthJson, handleUpload, async (req, res) => {
  try {
    const textInput = typeof req.body?.text === 'string' ? req.body.text : '';
    const fileBuffer = req.file ? req.file.buffer : null;
    const history = req.body?.history ?? null;

    const payload = await aiExplainService({
      textInput,
      fileBuffer,
      history
    });

    res.json({
      success: true,
      data: payload,
      error: null
    });
  } catch (error) {
    if (error instanceof AiExplainError) {
      return respondError(res, error.code, error.message, error.statusCode || 400);
    }

    console.error('[AI Explain] 未预期错误', error);
    return respondError(res, 'AI_SERVICE_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 500);
  }
});

router.post('/ai/explain/stream', requireAuthJson, handleUpload, async (req, res) => {
  try {
    const textInput = typeof req.body?.text === 'string' ? req.body.text : '';
    const fileBuffer = req.file ? req.file.buffer : null;
    const history = req.body?.history ?? null;
    const sources = await prepareAiSources({ textInput, fileBuffer });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const explainContent = await streamExplainCombinedInput({
        textInput: sources.text_input,
        imageOcrText: sources.image_ocr_text,
        history,
        onDelta: (content) => {
          const preview = formatStreamPreview(content);
          if (preview) {
            sendEvent({ type: 'chunk', content: preview });
          }
        }
      });

      sendEvent({
        type: 'done',
        payload: {
          success: true,
          data: {
            sources,
            explain: {
              content: explainContent
            }
          },
          error: null
        }
      });
      res.end();
    } catch (error) {
      if (error instanceof AiExplainError) {
        sendEvent({
          type: 'error',
          error: { code: error.code, message: error.message }
        });
      } else {
        console.error('[AI Explain Stream] 未预期错误', error);
        sendEvent({
          type: 'error',
          error: { code: 'AI_SERVICE_ERROR', message: 'AI 讲解服务暂时不可用，请稍后重试。' }
        });
      }
      res.end();
    }
  } catch (error) {
    if (error instanceof AiExplainError) {
      return respondError(res, error.code, error.message, error.statusCode || 400);
    }

    console.error('[AI Explain Stream] 准备失败', error);
    return respondError(res, 'AI_SERVICE_ERROR', 'AI 讲解服务暂时不可用，请稍后重试。', 500);
  }
});

module.exports = router;
