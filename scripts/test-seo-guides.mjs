import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}})`)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const guides = load("lib/networking-guides.ts");
const cards = JSON.parse(fs.readFileSync("verification/social-card-manifest.json", "utf8"));
const seo = load("lib/public-seo.ts", { "@/verification/social-card-manifest.json": { default: cards } });
const css = new Proxy({}, { get: (_, name) => String(name) });
const nextLink = { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
const wordmark = load("app/Wordmark.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink });
const layout = load("app/guides/GuideLayout.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons, "../Wordmark": wordmark, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const editor = load("app/guides/ConnectionNoteEditor.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const dependencies = { "react/jsx-runtime": jsx, "next/link": nextLink, "@/lib/public-seo": seo, "@/lib/networking-guides": guides, "../GuideLayout": layout, "../ConnectionNoteEditor": editor, "../guides.module.css": { __esModule: true, default: css } };

test("connection-note budgets preserve exact text and distinguish 200 from 300 characters", () => {
  for (const limit of [200, 300]) {
    assert.deepEqual(guides.connectionNoteBudget("x".repeat(limit), limit), { count: limit, remaining: 0, fits: true });
    assert.deepEqual(guides.connectionNoteBudget("x".repeat(limit + 1), limit), { count: limit + 1, remaining: -1, fits: false });
  }
  assert.equal(guides.connectionNoteBudget("", 200).count, 0);
  assert.equal(guides.connectionNoteBudget("a\n\ud83d\ude00", 200).count, 4, "Use the same conservative UTF-16 count as the existing note cap");
  for (const example of guides.CONNECTION_NOTE_EXAMPLES) assert(guides.connectionNoteBudget(example.text, 200).fits, example.id);
});

test("the note editor is usable without a session, has accessible budgets, and masks free text", () => {
  const html = renderToStaticMarkup(React.createElement(editor.ConnectionNoteEditor));
  assert(html.includes('id="connection-note-draft"'));
  assert(html.includes('data-clarity-mask="True"'));
  assert(html.includes('aria-label="Character budget"'));
  assert(html.includes('aria-label="Example notes"'));
  assert(html.includes('role="status"'));
  assert(html.includes("200 characters") && html.includes("300 characters"));
  assert(html.includes("Copy note"));
  const source = fs.readFileSync("app/guides/ConnectionNoteEditor.tsx", "utf8");
  assert(!/fetch\(|localStorage|sessionStorage|\.track\(/.test(source), "Do not send or persist drafts");
  assert(source.includes("disabled={empty || !budget.fits}"));
  assert(source.includes("currentRevision !== revision.current"), "Ignore a stale clipboard result after editing");
});

test("every guide renders one source-backed article, matching schema and intentional metadata", () => {
  for (const guide of guides.NETWORKING_GUIDES) {
    const page = load(`app/guides/${guide.slug}/page.tsx`, dependencies);
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, guide.slug);
    assert(html.includes(guide.title));
    assert(html.includes("Sources and limits"));
    assert(html.includes('href="/login"'));
    assert(html.includes('href="/guides"'));
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    const graph = schemas.find(schema => schema["@graph"])["@graph"];
    assert.equal(graph[0].headline, guide.title);
    assert.equal(graph[0].dateModified, guides.GUIDE_REVIEW_DATE);
    assert.equal(graph[1]["@type"], "BreadcrumbList");
    assert.equal(page.metadata.alternates.canonical, `https://syncedin.org/guides/${guide.slug}`);
    assert.equal(page.metadata.twitter.card, "summary_large_image");
    assert(page.metadata.openGraph.images[0].url.endsWith(`/guides/${guide.slug}/opengraph-image.png`));
    assert(html.length > 4500, "A full substantive guide must not be replaced with a placeholder");
    assert(!/free forever|10x|response rates 10/.test(html));
  }
});

test("new guide routes have unique dimensioned artwork and explicit canonical sitemap membership", () => {
  const sitemap = fs.readFileSync("app/sitemap.ts", "utf8");
  const hashes = new Set();
  for (const route of ["/guides", ...guides.NETWORKING_GUIDES.map(guide => `/guides/${guide.slug}`)]) {
    const card = cards.find(card => card.path === route);
    assert(card, route);
    assert(!hashes.has(card.sha256)); hashes.add(card.sha256);
    const image = fs.readFileSync(card.file);
    assert.equal(image.readUInt32BE(16), 1200); assert.equal(image.readUInt32BE(20), 630);
    assert(image.length < 1_000_000);
    assert(sitemap.includes('`${APP_URL}' + route + '`'));
  }
});

test("comparison copy preserves the useful decisions without fabricated prices, results, or fresh-on-every-request dates", () => {
  const page = load("app/alternatives/linkedin/page.tsx", { ...dependencies, "lucide-react": icons, "../../guides/GuideLayout": layout, "../../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  for (const term of ["0 min", "65%", "$39.99", "free forever", "unlimited outbound", "new Date()"] ) assert(!html.includes(term), term);
  assert(html.includes("does not guarantee a reply"));
  assert(html.includes("messaging help"));
  assert(html.includes('href="/guides/linkedin-connection-request"'));
  assert(html.includes('href="/article"'));
  assert.equal(page.viewport.userScalable, true);
});
