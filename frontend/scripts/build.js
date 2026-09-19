import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const frontendDir = path.resolve(import.meta.dir, '..');
const pkgPath = path.join(frontendDir, 'package.json');
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
const distDir = path.join(frontendDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const publicDir = path.join(frontendDir, 'public');

// 1. Clean previous dist
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(assetsDir, { recursive: true });

// 2. Run Bun.build on main entrypoint
const buildResult = await Bun.build({
  entrypoints: [path.join(frontendDir, 'src/main.jsx')],
  outdir: assetsDir,
  naming: {
    entry: 'index-[hash].[ext]',
    chunk: 'chunk-[hash].[ext]',
    asset: 'index-[hash].[ext]',
  },
  minify: true,
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    'import.meta.env': JSON.stringify({
      MOBILE: process.env.MOBILE || process.env.VITE_MOBILE || '',
      VITE_MOBILE: process.env.MOBILE || process.env.VITE_MOBILE || '',
      IMG_BASE: process.env.IMG_BASE || process.env.VITE_IMG_BASE || '',
      VITE_IMG_BASE: process.env.IMG_BASE || process.env.VITE_IMG_BASE || '',
      GIF_BASE: process.env.GIF_BASE || process.env.VITE_GIF_BASE || '',
      VITE_GIF_BASE: process.env.GIF_BASE || process.env.VITE_GIF_BASE || '',
      DEMO: process.env.DEMO || process.env.VITE_DEMO || '',
      VITE_DEMO: process.env.DEMO || process.env.VITE_DEMO || '',
    }),
    'import.meta.env.MOBILE': JSON.stringify(process.env.MOBILE || process.env.VITE_MOBILE || ''),
    'import.meta.env.VITE_MOBILE': JSON.stringify(process.env.MOBILE || process.env.VITE_MOBILE || ''),
    'import.meta.env.IMG_BASE': JSON.stringify(process.env.IMG_BASE || process.env.VITE_IMG_BASE || ''),
    'import.meta.env.VITE_IMG_BASE': JSON.stringify(process.env.IMG_BASE || process.env.VITE_IMG_BASE || ''),
    'import.meta.env.GIF_BASE': JSON.stringify(process.env.GIF_BASE || process.env.VITE_GIF_BASE || ''),
    'import.meta.env.VITE_GIF_BASE': JSON.stringify(process.env.GIF_BASE || process.env.VITE_GIF_BASE || ''),
    'import.meta.env.DEMO': JSON.stringify(process.env.DEMO || process.env.VITE_DEMO || ''),
    'import.meta.env.VITE_DEMO': JSON.stringify(process.env.DEMO || process.env.VITE_DEMO || ''),
  }
});

if (!buildResult.success) {
  console.error('Bun build failed:');
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// 3. Locate generated main JS and CSS files
let jsFile = null;
let cssFile = null;

for (const out of buildResult.outputs) {
  const base = path.basename(out.path);
  if (base.endsWith('.js') && base.startsWith('index-')) {
    jsFile = base;
  } else if (base.endsWith('.css') && base.startsWith('index-')) {
    cssFile = base;
  }
}

if (!jsFile) {
  console.error('Could not find generated index JS bundle in outputs');
  process.exit(1);
}

// 4. Copy public directory assets into dist root
if (existsSync(publicDir)) {
  cpSync(publicDir, distDir, { recursive: true });
}

// 5. Generate production index.html
const sourceHtmlPath = path.join(frontendDir, 'index.html');
let htmlContent = readFileSync(sourceHtmlPath, 'utf8');

// Replace script tag with compiled bundle
htmlContent = htmlContent.replace(
  /<script\b[^>]*\bsrc="[^"]*main\.jsx"[^>]*><\/script>/i,
  `<script type="module" src="./assets/${jsFile}"></script>`
);

// Inject compiled CSS link
if (cssFile) {
  const cssTag = `<link rel="stylesheet" href="./assets/${cssFile}">\n`;
  htmlContent = htmlContent.replace('</head>', `${cssTag}</head>`);
}

// Inject optional Umami analytics
const umamiSrc = process.env.VITE_UMAMI_SRC;
const umamiId = process.env.VITE_UMAMI_ID;
if (umamiSrc && umamiId) {
  const umamiTag = `<script defer src="${umamiSrc}" data-website-id="${umamiId}"></script>\n`;
  htmlContent = htmlContent.replace('</head>', `${umamiTag}</head>`);
}

// Normalize public references for dist root
htmlContent = htmlContent
  .replace(/href="\.\/public\/manifest\.json"/g, 'href="manifest.json"')
  .replace(/href="\.\/public\/icon-180\.png"/g, 'href="icon-180.png"');

const targetHtmlPath = path.join(distDir, 'index.html');
writeFileSync(targetHtmlPath, htmlContent, 'utf8');

// 6. Stamp Service Worker build hash
const swPath = path.join(distDir, 'sw.js');
if (existsSync(swPath)) {
  const stamp = createHash('sha256').update(readFileSync(targetHtmlPath)).digest('hex').slice(0, 10);
  const stampedSw = readFileSync(swPath, 'utf8').replace('__BUILD__', stamp);
  writeFileSync(swPath, stampedSw, 'utf8');
}

const totalSize = buildResult.outputs.reduce((sum, out) => sum + out.size, 0);
console.log(`✓ Built openGym v${pkgVersion} cleanly into dist/ (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
