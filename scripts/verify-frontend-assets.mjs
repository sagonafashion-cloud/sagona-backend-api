import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve('frontend');
const htmlFiles = readdirSync(frontendDir).filter((f) => f.endsWith('.html'));

const errors = [];

for (const fileName of htmlFiles) {
  const filePath = path.join(frontendDir, fileName);
  const html = readFileSync(filePath, 'utf8');

  if (/href=["']style\.css["']/.test(html)) {
    errors.push(`${fileName}: uses style.css (must use styles.css)`);
  }

  if (fileName !== 'returns.html' && !/href=["']styles\.css["']/.test(html)) {
    errors.push(`${fileName}: missing styles.css reference`);
  }

  const refs = [...html.matchAll(/(?:src|href)=['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|#)/.test(ref)) continue;
    const target = path.join(frontendDir, ref);
    if (!existsSync(target)) {
      errors.push(`${fileName}: missing local asset ${ref}`);
    }
  }
}

if (errors.length) {
  console.error('Frontend asset validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Frontend asset validation passed for ${htmlFiles.length} HTML files.`);
