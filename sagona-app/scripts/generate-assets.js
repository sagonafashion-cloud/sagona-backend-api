/**
 * Generates branded placeholder PNG assets for Sagona app.
 * Run: node scripts/generate-assets.js
 * Requires: npm install canvas  (not in devDependencies — install once, don't commit)
 *
 * Replace the generated files with real brand assets before App Store submission.
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const out   = (f) => resolve(__dir, '..', 'assets', f);

const GOLD  = '#C9A84C';
const BLACK = '#0A0A0A';

function draw(w, h, filename, text = 'SAGONA') {
  const canvas = createCanvas(w, h);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, w, h);

  const fontSize = Math.floor(w / 6);
  ctx.font      = `bold ${fontSize}px serif`;
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);

  writeFileSync(out(filename), canvas.toBuffer('image/png'));
  console.log(`✓ ${filename}  (${w}×${h})`);
}

draw(1024, 1024,   'icon.png');
draw(1024, 1024,   'adaptive-icon.png');
draw(1284, 2778,   'splash.png');
draw(48,   48,     'favicon.png',  'S');
console.log('\nDone. Replace with real brand assets before App Store submission.');
