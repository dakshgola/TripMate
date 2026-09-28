/**
 * Generates PNG icons for PWA from the master SVG icon.
 * Run: node scripts/generate-icons.mjs
 * Called automatically via the "prebuild" npm script.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

const sizes = [
  { name: 'apple-touch-icon-180x180.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(svgBuffer, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, name));
  console.log(`  \u2713 ${name} (${size}x${size})`);
}

// Maskable variants: Android lays a maskable icon edge to edge under the round
// launcher mask, so the glyph has to sit inside the safe zone (80% of canvas).
const maskableSvg = svgBuffer
  .toString()
  .replace('<g id="iconContent">', '<g id="iconContent" transform="translate(51.2, 51.2) scale(0.8)">');

const maskableSizes = [
  { name: 'icon-maskable-192x192.png', size: 192 },
  { name: 'icon-maskable-512x512.png', size: 512 },
];

for (const { name, size } of maskableSizes) {
  await sharp(Buffer.from(maskableSvg), { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, name));
  console.log(`  \u2713 ${name} (${size}x${size}, maskable)`);
}

console.log('PWA icons generated.');
