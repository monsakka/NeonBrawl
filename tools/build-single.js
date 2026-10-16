// Single-file build: bundles the whole game (www/) into ONE self-contained HTML file.
//   - the stylesheet is inlined in a <style> tag
//   - the bundled fonts are embedded as base64 data URIs (they are OFL-licensed; the licence notices are kept in a comment)
//   - every <script src> is inlined in its original load order
// The result runs offline from a double-click, with no other files next to it.
// Run with:  npm run build:single        → single-file/index.html
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'www');
const outDir = path.join(__dirname, '..', 'single-file');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// 1. stylesheets + fonts (the font licences are embedded once, with the first sheet)
let licDone = false;
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const cssDir = path.dirname(href);
  const css = read(href).replace(/url\(([^)]+)\)/g, (u, ref) => {
    const rel = ref.replace(/["']/g, '');
    if (rel.startsWith('data:')) return u;
    const file = path.join(root, cssDir, rel);
    const mime = rel.endsWith('.woff2') ? 'font/woff2' : rel.endsWith('.woff') ? 'font/woff' : rel.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    return `url(data:${mime};base64,${fs.readFileSync(file).toString('base64')})`;
  });
  if (licDone) return `<style>\n${css}\n</style>`; licDone = true;
  const licences = fs.readdirSync(path.join(root, 'fonts')).filter(f => f.startsWith('OFL')).map(f => read(path.join('fonts', f))).join('\n\n');
  return `<!-- Embedded fonts: Orbitron and Inter, SIL Open Font License 1.1 -->\n<!--\n${licences.replace(/--/g, '- -')}\n-->\n<style>\n${css}\n</style>`;
});

// 2. scripts, in order (a literal "</script" inside the code would end the tag early, so escape it)
let count = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  count++;
  return `<script>/* ---- ${src} ---- */\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`;
});

if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('an external reference was left in the bundle');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(process.cwd(), out)}: ${count} scripts inlined, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, no external files.`);
