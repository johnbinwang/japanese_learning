const sharp = require('sharp');

const ONE_MB = 1024 * 1024;

async function ensureMaxImageSize(buffer, maxBytes = ONE_MB) {
  if (!buffer || buffer.length <= maxBytes) {
    return buffer;
  }

  let candidate = buffer;

  const qualityLevels = [85, 75, 65, 55, 45];
  for (const quality of qualityLevels) {
    try {
      candidate = await sharp(buffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (candidate.length <= maxBytes) {
        return candidate;
      }
    } catch (error) {
      console.error('[ImageUtils] JPEG 压缩失败', error);
      break;
    }
  }

  let width = 1600;
  while (width >= 640) {
    try {
      candidate = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 60, mozjpeg: true })
        .toBuffer();
      if (candidate.length <= maxBytes) {
        return candidate;
      }
    } catch (error) {
      console.error('[ImageUtils] 缩放压缩失败', error);
      break;
    }
    width -= 320;
  }

  return candidate;
}

module.exports = {
  ensureMaxImageSize,
  ONE_MB
};
