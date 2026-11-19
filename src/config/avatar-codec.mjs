// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The fixed native avatar child program. The OS probe owns its launch and RSS units. */
export const AVATAR_CODEC = String.raw`
const fs = require('node:fs');
const [entry, said, stopWith] = process.argv.slice(1);
const ownerFlag = /^--stop-with-pid=([1-9]\d*)$/.exec(stopWith || '');
const owner = Number(ownerFlag && ownerFlag[1]);
if (ownerFlag === null || !Number.isSafeInteger(owner) || owner <= 0 || owner !== process.ppid) {
  process.stderr.write('The avatar codec needs its actual parent in --stop-with-pid.');
  process.exit(1);
}
function stopWhenAvatarOwnerEnds() { if (process.ppid !== owner) process.exit(1); }
const watch = setInterval(stopWhenAvatarOwnerEnds, 50);
watch.unref();
const policy = JSON.parse(said);
const bytes = fs.readFileSync(0);
const finish = value => { process.stdout.write(JSON.stringify(value)); };
let sharp;
try { sharp = require(entry); }
catch { finish({disposition: policy.dispositions.unavailable}); process.exit(0); }
sharp.cache(false);
sharp.concurrency(1);
const native = () => ({cacheMemory: sharp.cache().memory.max, cacheItems: sharp.cache().items.max, concurrency: sharp.concurrency(), inputPixelLimit: policy.pixels, peakRssBytes: process.resourceUsage().maxRSS * policy.rssBytesPerUnit});
(async () => {
  const options = {limitInputPixels: policy.pixels, failOn: 'error', sequentialRead: true};
  const metadata = await sharp(bytes, options).metadata();
  if (metadata.format !== policy.format) throw new Error('The decoded image format differs from its signature.');
  if ((metadata.pages || 1) > 1) return finish({disposition: policy.dispositions.animated, native: native()});
  if (!metadata.width || !metadata.height) throw new Error('The decoded image has no dimensions.');
  if (Math.max(metadata.width, metadata.height) <= policy.side) return finish({disposition: policy.dispositions.small, native: native()});
  let image = sharp(bytes, options).resize({width: policy.side, height: policy.side, fit: 'inside', withoutEnlargement: true}).keepMetadata().keepIccProfile();
  if (metadata.depth === 'ushort') image = image.toColourspace('rgb16');
  if (policy.format === 'png') image = image.png({compressionLevel: 9});
  else if (policy.format === 'jpeg') image = image.jpeg({quality: 100, chromaSubsampling: '4:4:4'});
  else image = image.webp({lossless: true});
  const result = await image.toBuffer();
  if (result.length >= bytes.length) return finish({disposition: policy.dispositions.noSaving, native: native()});
  finish({disposition: policy.dispositions.resized, base64: result.toString('base64'), native: native()});
})().catch(error => {
  finish({failure: error && error.message === 'Input image exceeds pixel limit' ? policy.dispositions.pixelBound : policy.dispositions.processingFailed});
  process.stderr.write(String(error && error.message || error)); process.exitCode = 1;
});
`
