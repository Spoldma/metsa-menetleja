const sharp = require('sharp');
// Test: does removeAlpha() work with TIFF output?
sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 128 } } })
  .removeAlpha()
  .tiff({ compression: 'lzw' })
  .toFile('output/test_alpha.tif')
  .then(() => sharp('output/test_alpha.tif').metadata())
  .then(m => console.log('removeAlpha test - channels:', m.channels, 'hasAlpha:', m.hasAlpha))
  .catch(e => console.error(e.message));
