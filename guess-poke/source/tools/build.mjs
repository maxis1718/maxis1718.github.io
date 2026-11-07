// Bundle src/main.js into a single self-contained HTML file: dist/index.html
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: ['es2020', 'safari15'],
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="4" y="1" width="8" height="14" fill="#141428"/><rect x="1" y="4" width="14" height="8" fill="#141428"/><rect x="2" y="2" width="12" height="12" fill="#141428"/><rect x="5" y="2" width="6" height="5" fill="#e8483b"/><rect x="3" y="3" width="10" height="4" fill="#e8483b"/><rect x="3" y="9" width="10" height="4" fill="#fff"/><rect x="5" y="9" width="6" height="5" fill="#fff"/><rect x="2" y="7" width="12" height="2" fill="#141428"/><rect x="6" y="6" width="4" height="4" fill="#141428"/><rect x="7" y="7" width="2" height="2" fill="#fff"/></svg>')}`;
const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="我是誰？">
<meta name="theme-color" content="#101a3c">
<link rel="icon" href="${icon}">
<title>我是誰？猜猜寶可夢</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#101a3c;overflow:hidden;overscroll-behavior:none;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none}
body{display:flex;align-items:center;justify-content:center}
canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>${js}</script>
</body>
</html>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
