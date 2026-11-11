import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}public/assets`, { recursive: true });
for (const [pkg, source, name] of [
  ['@fontsource-variable/fredoka', 'fredoka-latin-wght-normal.woff2', 'fredoka.woff2'],
  ['@fontsource-variable/fredoka', 'fredoka-latin-ext-wght-normal.woff2', 'fredoka-ext.woff2'],
  ['@fontsource-variable/dm-sans', 'dm-sans-latin-wght-normal.woff2', 'dm-sans.woff2'],
  ['@fontsource-variable/dm-sans', 'dm-sans-latin-ext-wght-normal.woff2', 'dm-sans-ext.woff2'],
  ['@fontsource/zilla-slab', 'zilla-slab-latin-700-normal.woff2', 'zilla-slab.woff2'],
  ['@fontsource/zilla-slab', 'zilla-slab-latin-ext-700-normal.woff2', 'zilla-slab-ext.woff2'],
  ['@fontsource-variable/chivo-mono', 'chivo-mono-latin-wght-normal.woff2', 'chivo-mono.woff2'],
  ['@fontsource-variable/chivo-mono', 'chivo-mono-latin-ext-wght-normal.woff2', 'chivo-mono-ext.woff2'],
]) await copyFile(`${root}node_modules/${pkg}/files/${source}`, `${root}public/assets/${name}`);
for (const name of ['cloud', 'cloud-sun', 'cloud-moon', 'cloud-rain', 'cloud-fog', 'cloud-lightning', 'sun', 'moon', 'snowflake', 'wind', 'umbrella', 'shirt', 'droplet']) {
  await copyFile(`${root}node_modules/lucide-static/icons/${name}.svg`, `${root}public/assets/${name}.svg`);
}
for (const [pkg, name] of [['@fontsource-variable/fredoka', 'fredoka'], ['@fontsource-variable/dm-sans', 'dm-sans'], ['@fontsource-variable/chivo-mono', 'chivo-mono'], ['@fontsource/zilla-slab', 'zilla-slab'], ['lucide-static', 'lucide']]) {
  await copyFile(`${root}node_modules/${pkg}/LICENSE`, `${root}public/assets/LICENSE-${name}.txt`);
}
await writeFile(`${root}public/assets/README.txt`, 'Fonts: Fredoka, DM Sans, Zilla Slab, Chivo Mono (SIL Open Font License). Icons: Lucide (ISC). License texts are included alongside these assets. All assets are served locally.\n');
console.log('Local fonts and icons prepared.');
