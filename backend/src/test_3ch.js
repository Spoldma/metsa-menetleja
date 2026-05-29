const sharp = require('sharp');
console.log('sharp version:', require('./node_modules/sharp/package.json').version);
// Test: does removeAlpha work on TIFF at all?
sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 0.5 } } })
  .removeAlpha()
  .tiff()
  .toBuffer()
  .then(buf => sharp(buf).metadata())
  .then(m => console.log('After removeAlpha -> tiff: channels=', m.channels, 'hasAlpha=', m.hasAlpha));

// Test: raw() approach to force 3-channel
const maskSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="black" width="100" height="100"/><rect fill="white" x="25" y="25" width="50" height="50"/></svg>');
sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } } })
  .png().toBuffer()
  .then(buf => sharp(buf).composite([{ input: maskSvg, blend: 'multiply' }]).raw().toBuffer({ resolveWithObject: true }))
  .then(({ data, info }) => {
    console.log('raw info:', info);
    // Build 3-channel buffer if 4 channels
    let rgb = data;
    if (info.channels === 4) {
      rgb = Buffer.alloc(info.width * info.height * 3);
      for (let i = 0; i < info.width * info.height; i++) {
        rgb[i*3] = data[i*4]; rgb[i*3+1] = data[i*4+1]; rgb[i*3+2] = data[i*4+2];
      }
    }
    return sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
      .tiff({ compression: 'lzw' }).toFile('output/test_raw3ch.tif');
  })
  .then(() => sharp('output/test_raw3ch.tif').metadata())
  .then(m => console.log('raw 3ch tif: channels=', m.channels, 'hasAlpha=', m.hasAlpha))
  .catch(e => console.error(e.message));
