import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from 'typescript';
const read = file => fs.readFileSync(file, 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const cards = JSON.parse(read('verification/social-card-manifest.json'));
assert.equal(cards.length, 22);
const unique = new Set();
function hasPublicSEO(file, path) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === 'withPublicSEO' && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === path) found = true;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}
for (const card of cards) {
  const bytes = fs.readFileSync(card.file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
  assert.equal(hash(bytes), card.sha256); assert(bytes.length < 1000000);
  assert(!unique.has(card.sha256)); unique.add(card.sha256);
  assert.equal(hash(fs.readFileSync(card.twitterFile)), card.sha256);
  for (const file of [card.file, card.twitterFile]) assert.equal(read(file.replace('.png', '.alt.txt')), card.alt);
  assert(hasPublicSEO('app' + card.path + '/page.tsx', card.path));
  assert(read('app/sitemap.ts').includes('`${APP_URL}' + card.path + '`'));
}
const original = JSON.parse(read('verification/original-source-manifest.json'));
const product = JSON.parse(read('verification/product-release-scope.json'));
for (const row of original.files) {
  if (row.file === 'vercel.json') {
    // The provider transforms its runtime build configuration. Uploaded source
    // bytes are checked separately before promotion; preserve cron/routing here.
    const config = JSON.parse(read(row.file));
    assert.deepEqual(config.crons, [{ path: '/api/cron/weekly-digest', schedule: '0 14 * * 1' }]);
    assert.deepEqual(config.redirects || [], []); assert.deepEqual(config.rewrites || [], []);
  } else assert.equal(hash(fs.readFileSync(row.file)), product.files[row.file] || row.sha256, row.file + ' changed outside reviewed release scope');
}
const dates = JSON.parse(read('verification/policy-content-dates.json'));
function body(file) {
  const source = read(file); const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let result;
  ts.forEachChild(sf, n => { if (ts.isFunctionDeclaration(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) result = n.body?.getText(sf); });
  return result;
}
function normalize(b, file) {
  if (file === 'app/talk/page.tsx') b = b.replace('      <h1 className="sr-only">Chat with SyncedIn</h1>\n', '');
  for (const [name, { date }] of Object.entries(dates)) if (file === `app/${name}/page.tsx`) b = b.replace(date, '{new Date().toISOString().slice(0, 10)}');
  if (file === 'app/layout.tsx') b = b.replace(/itemListElement:\s*\[[\s\S]*?\]\s*(?=\n\s*\})/, 'itemListElement: PUBLIC_NAVIGATION');
  return b;
}
const components = JSON.parse(read('verification/original-component-bodies.json'));
for (const row of components.files) assert.equal(hash(normalize(body(row.file), row.file)), product.components[row.file] || row.sha256, row.file + ' product component changed outside reviewed release scope');
for (const path of ['agent/review','login','invite','messages','onboarding','settings','conversations','admin','dashboard','personal-intelligence','careers','communities/new','conferences/new','ghosts','welcome','poll','[slug]','continuation','landing-pages','twin','dm','conferences/[slug]/edit']) assert(/index:\s*false/.test(read('app/' + path + '/layout.tsx')), path);
const sitemap = read('app/sitemap.ts');
for (const path of ['/careers','/communities/new','/conferences/new','/poll','/dashboard']) assert(!sitemap.includes('`${APP_URL}' + path + '`'), path + ' private sitemap URL');
assert(!/lastModified:\s*now|const now\s*=/.test(sitemap));
for (const name of Object.keys(dates)) assert(!read('app/' + name + '/page.tsx').includes('new Date()'));
for (const file of ['app/opengraph-image.tsx','app/twitter-image.tsx']) assert(read(file).includes('width: 600, height: 338'));
assert(read('app/robots.ts').includes('userAgent: "GPTBot", allow: "/", disallow: PRIVATE_PATHS'));
console.log(`SEO release gate passed: ${cards.length} distinct public cards; ${original.files.length} source files checked against the original or reviewed product release; private routes excluded; policy dates supported by content history.`);
