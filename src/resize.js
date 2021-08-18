const log = require('./logger');
const sharp = require('sharp');

const resizeImage = async (buffer, width, height, format) => {
  if (typeof width !== 'number' || width > 480 || width <= 0 || !Number.isFinite(width) || Math.floor(width) !== width) {
    throw new Error('Width is invalid');
  }
  if (typeof height !== 'number' || height > 360 || height <= 0 || !Number.isFinite(height) || Math.floor(height) !== height) {
    throw new Error('Height is invalid');
  }
  log.debug(`Resizing image to ${width}x${height} ${format}`);
  const sh = sharp(buffer);
  sh.resize(width, height);
  if (format === 'image/webp') {
    sh.webp({quality: 90});
  } else if (format === 'image/jpeg') {
    sh.jpeg({quality: 90});
  } else if (format === 'image/png') {
    sh.png({quality: 90});
  } else {
    throw new Error('Invalid format');
  }
  return sh.toBuffer();
};

module.exports = resizeImage;
