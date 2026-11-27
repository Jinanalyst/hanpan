// Gives every script under public/ a URL with its content hash, through the import map in each page.
// The host's CDN keeps .js files for a week while pages are always fetched fresh, so without this a
// browser can pair a new module with an old cached one and the page stops with a missing export.
// With it, a changed file gets a new URL and unchanged files stay cached.
//
//   npm run stamp            rewrite the import maps (run after changing any public .js file)
//   npm run stamp -- --check exit 1 if a page is out of date (the smoke test does this)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SKIP = new Set(['voice-worklet.js']);   // loaded by audioWorklet.addModule, which import maps do not cover

function scripts(dir = PUB, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scripts(p, out);
    else if (e.name.endsWith('.js') && !SKIP.has(e.name)) out.push(p);
  }
  return out;
}
// line endings do not count: git may check files out with CRLF here and LF on the server
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);

// -> { file: new html } for every page whose import map is not current
export function stamp() {
  const map = {};
  for (const f of scripts().sort()) {
    const rel = './' + path.relative(PUB, f).split(path.sep).join('/');
    map[rel] = `${rel}?v=${hash(f)}`;
  }
  const changed = {};
  for (const name of fs.readdirSync(PUB).filter(n => n.endsWith('.html'))) {
    const file = path.join(PUB, name), html = fs.readFileSync(file, 'utf8');
    if (!/<script type="module"/.test(html)) continue;
    const old = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    const outside = Object.fromEntries(Object.entries(old ? JSON.parse(old[1]).imports || {} : {}).filter(([k]) => !k.startsWith('./')));
    const tag = `<script type="importmap">${JSON.stringify({ imports: { ...outside, ...map } })}</script>`;
    let next = old ? html.replace(old[0], tag) : html.replace(/<script type="module"/, `${tag}\n<script type="module"`);
    // the entry script goes through the import map too: <script type="module">import './client.js';</script>
    next = next.replace(/<script type="module" src="([^"?]+)(?:\?[^"]*)?"><\/script>/g, (_, src) => `<script type="module">import './${src.replace(/^\.\//, '')}';</script>`);
    if (next !== html) changed[file] = next;
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const changed = stamp(), names = Object.keys(changed).map(f => path.basename(f));
  if (process.argv.includes('--check')) {
    if (names.length) { console.error('stamp: out of date, run `npm run stamp`: ' + names.join(', ')); process.exit(1); }
    console.log('stamp: all pages current');
  } else {
    for (const [f, html] of Object.entries(changed)) fs.writeFileSync(f, html);
    console.log(names.length ? 'stamp: updated ' + names.join(', ') : 'stamp: all pages current');
  }
}
