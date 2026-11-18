// Exports the extension icons (extension/icons/icon<size>.png) from assets/logo.svg.
// Each size is rendered natively by headless Chrome, so the SVG may use gradients, filters and text.
// An optional assets/logo-<size>.svg replaces logo.svg for that size, for art simplified for small sizes.
// Run `npm run icons` after editing the SVG. Set CHROME to the browser binary if it is not found.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIZES = [16, 32, 48, 128];

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const found = (CANDIDATES[process.platform] || []).find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME to the path of a Chrome or Chromium binary');
  return found;
}

function render(chrome, svgFile, size, outFile, tmp) {
  const page = path.join(tmp, `icon${size}.html`);
  fs.writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">`
    + `<img src="${pathToFileURL(svgFile).href}" width="${size}" height="${size}" style="display:block"></body></html>`);
  const r = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--user-data-dir=${path.join(tmp, 'profile')}`,
    `--window-size=${size},${size}`, `--screenshot=${outFile}`, pathToFileURL(page).href,
    // Chrome's helper processes inherit captured pipes and keep them open, so output is not captured.
  ], { stdio: 'ignore', timeout: 60000 });
  if (r.status !== 0 || !fs.existsSync(outFile)) throw new Error(`Chrome failed for ${size}px: ${r.error || `exit ${r.status}`}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-glossary-icons-'));
  try {
    for (const size of SIZES) {
      const special = fileURLToPath(new URL(`./logo-${size}.svg`, import.meta.url));
      const svg = fs.existsSync(special) ? special : fileURLToPath(new URL('./logo.svg', import.meta.url));
      const out = fileURLToPath(new URL(`../extension/icons/icon${size}.png`, import.meta.url));
      render(chrome, svg, size, out, tmp);
      console.log(`wrote ${out} from ${path.basename(svg)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
