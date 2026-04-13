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

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  ensureDir(dist);
  try {
    await Promise.all([buildJs(), buildSw(), buildHtml()]);
    buildCss(); // sync, runs after async steps above
    log('Done — output in dist/');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
