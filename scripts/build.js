// scripts/build.js — minify JS, CSS, and HTML for GitHub Pages deployment
const esbuild = require('esbuild');
const { minify: minifyHtml } = require('html-minifier-terser');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

// ── helpers ──────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg) {
  console.log(`[build] ${msg}`);
}

// ── JS (esbuild) ─────────────────────────────────────────────────────────────
async function buildJs() {
  const srcDir = path.join(root, 'js');
  const outDir = path.join(dist, 'js');
  ensureDir(outDir);

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
  await Promise.all(files.map(f =>
    esbuild.build({
      entryPoints: [path.join(srcDir, f)],
      outfile: path.join(outDir, f),
      bundle: false,
      minify: true,
    })
  ));
  log(`JS: minified ${files.length} file(s)`);
}

// ── sw.js ─────────────────────────────────────────────────────────────────────
async function buildSw() {
  await esbuild.build({
    entryPoints: [path.join(root, 'sw.js')],
    outfile: path.join(dist, 'sw.js'),
    bundle: false,
    minify: true,
  });
  log('sw.js: minified');
}

// ── CSS (postcss + cssnano via CLI) ───────────────────────────────────────────
function buildCss() {
  const outDir = path.join(dist, 'css');
  ensureDir(outDir);
  // postcss-cli processes all css files into dist/css/
  execSync('npx postcss css/*.css --dir dist/css', { cwd: root, stdio: 'inherit' });
  log('CSS: minified');
}

// ── HTML (html-minifier-terser) ───────────────────────────────────────────────
async function buildHtml() {
  const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
  const opts = {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true,
  };

  await Promise.all(htmlFiles.map(async f => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const out = await minifyHtml(src, opts);
    fs.writeFileSync(path.join(dist, f), out);
  }));
  log(`HTML: minified ${htmlFiles.length} file(s)`);
}

// ── static assets (copied verbatim — the minifiers above skip them) ─────────
// dist/ is what gets deployed to GitHub Pages, so anything the app loads
// at runtime must be copied here: Leaflet (vendor/), PWA icons (icons/),
// and the web manifest. Missing files 404 on Pages (e.g. no vendor/ means
// no map). images/ holds local dev fixtures only and is intentionally left
// out — course images come from user imports at runtime.
function copyStatic() {
  const items = ['vendor', 'icons', 'manifest.webmanifest'];
  for (const item of items) {
    const src = path.join(root, item);
    const dest = path.join(dist, item);
    if (!fs.existsSync(src)) {
      log(`static: ${item} not found, skipping`);
      continue;
    }
    fs.cpSync(src, dest, { recursive: true });
  }
  log('static: copied vendor/, icons/, manifest.webmanifest');
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  ensureDir(dist);
  try {
    await Promise.all([buildJs(), buildSw(), buildHtml()]);
    buildCss(); // sync, runs after async steps above
    copyStatic();
    log('Done — output in dist/');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
