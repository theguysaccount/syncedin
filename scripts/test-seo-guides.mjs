import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import postcss from "postcss";
import { inspectPublicPage, inspectSitemap, verifyPublicPage } from "../verification/public-page.mjs";

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
const goals = load("lib/networking-goals.ts");
const productFaq = load("lib/product-faq.ts");
const cards = JSON.parse(fs.readFileSync("verification/social-card-manifest.json", "utf8"));
const seo = load("lib/public-seo.ts", { "@/verification/social-card-manifest.json": { default: cards } });
const css = new Proxy({}, { get: (_, name) => String(name) });
const nextLink = { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
const wordmark = load("app/Wordmark.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink });
const theme = load("app/ThemeToggle.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons });
const layout = load("app/guides/GuideLayout.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons, "../Wordmark": wordmark, "../ThemeToggle": theme, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const editor = load("app/guides/ConnectionNoteEditor.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const goalBuilder = load("app/guides/ConversationGoalBuilder.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/networking-goals": goals, "./guides.module.css": { __esModule: true, default: css } });
const dependencies = { "react/jsx-runtime": jsx, "next/link": nextLink, "@/lib/public-seo": seo, "@/lib/networking-guides": guides, "../GuideLayout": layout, "../ConnectionNoteEditor": editor, "../ConversationGoalBuilder": goalBuilder, "../guides.module.css": { __esModule: true, default: css } };

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
    assert.equal(graph[0].dateModified, guide.reviewedAt);
    assert.equal(graph[0].datePublished, guide.publishedAt);
    assert.equal(graph[1]["@type"], "BreadcrumbList");
    assert.equal(page.metadata.alternates.canonical, `https://syncedin.org/guides/${guide.slug}`);
    assert.equal(page.metadata.twitter.card, "summary_large_image");
    assert(page.metadata.openGraph.images[0].url.endsWith(`/guides/${guide.slug}/opengraph-image.png`));
    assert(html.length > 4500, "A full substantive guide must not be replaced with a placeholder");
    assert(!/free forever|10x|response rates 10/.test(html));
  }
});

test("conversation briefs count their labels and line breaks within the real 500-character goal budget", () => {
  const empty = { purpose: "", contribution: "", nextStep: "", boundary: "" };
  assert.deepEqual(goals.conversationBriefBudget(empty), { text: "", count: 0, remaining: 500, fits: true, ready: false });
  assert.equal(goals.conversationBriefBudget({ ...empty, boundary: "No pitch" }).ready, false);
  assert.equal(goals.formatConversationBrief({ ...empty, purpose: "  Compare methods  ", boundary: " No pitch " }), "Purpose: Compare methods\nBoundaries: No pitch");
  const exact = goals.conversationBriefBudget({ ...empty, purpose: "x".repeat(491) });
  assert.equal(exact.count, 500);
  assert(exact.fits && exact.ready);
  assert(!goals.conversationBriefBudget({ ...empty, purpose: "x".repeat(492) }).fits);
  assert.equal(goals.conversationBriefBudget({ ...empty, purpose: "\ud83d\ude00" }).count, 11);
  for (const example of goals.CONVERSATION_BRIEF_EXAMPLES) {
    const budget = goals.conversationBriefBudget(example.brief);
    assert(budget.ready && budget.fits, example.id);
    assert(budget.text.includes("Boundaries:"));
  }
  const productEditor = fs.readFileSync("app/conversations/[id]/PerConversationGoal.tsx", "utf8");
  assert(productEditor.includes(`maxLength={${goals.CONVERSATION_BRIEF_LIMIT}}`));
});

test("the goal builder starts empty, masks every field and does not transmit or persist context", () => {
  const html = renderToStaticMarkup(React.createElement(goalBuilder.ConversationGoalBuilder));
  assert(html.includes('data-clarity-mask="True"'));
  for (const field of ["purpose", "contribution", "nextStep", "boundary"]) assert(html.includes(`id="brief-${field}"`));
  assert(html.includes('id="conversation-brief-output"') && /readonly=""/i.test(html));
  assert(/<button[^>]*disabled=""[^>]*>[\s\S]*?Copy brief/.test(html));
  assert(html.includes('role="status"'));
  const source = fs.readFileSync("app/guides/ConversationGoalBuilder.tsx", "utf8");
  assert(!/fetch\(|localStorage|sessionStorage|\.track\(/.test(source));
  assert(source.includes("disabled={!budget.ready || !budget.fits}"));
  assert(source.includes("currentRevision !== revision.current"));
});

test("all comparisons retain actions, cite the vendor and describe actual workflow differences", () => {
  const shell = load("app/vs/VsPageShell.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons, "../ThemeToggle": theme });
  for (const slug of ["clay", "lemlist", "linkedin-dms"]) {
    const page = load(`app/vs/${slug}/page.tsx`, { ...dependencies, "../VsPageShell": shell });
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert((html.match(/href="\/login"/g) || []).length >= 3, "Keep all existing signup actions");
    assert(html.includes('href="/article"'));
    assert(html.includes('href="/guides/networking-goals"'));
    assert(html.includes("Sources and disclosure"));
    assert(html.includes("not an independent benchmark"));
    for (const claim of ["Free forever", "$149", "$159", "20% better", "500 cold emails", "training signal for both twins"]) assert(!html.includes(claim), claim);
    const schemas = inspectPublicPage(`<html><body>${html}</body></html>`).schemas;
    const faq = schemas.find(schema => schema["@type"] === "FAQPage");
    assert.equal(faq.mainEntity.length, 5);
    for (const question of faq.mainEntity) {
      assert(question.name && question.acceptedAnswer.text);
      assert(html.includes(question.name.replaceAll("'", "&#x27;")), question.name);
    }
    assert.equal(page.metadata.alternates.canonical, `https://syncedin.org/vs/${slug}`);
  }
});

test("About names the existing project team and offers real help with matching entity markup", () => {
  const page = load("app/about/page.tsx", { ...dependencies, "lucide-react": icons, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  assert(html.includes("Jackson Jesionowski") && html.includes("Persist Ventures"));
  for (const path of ["/support", "/privacy", "/terms", "/guides", "/login"]) assert(html.includes(`href="${path}"`));
  const schema = inspectPublicPage(`<html><body>${html}</body></html>`).schemas.find(item => item["@type"] === "AboutPage");
  assert.equal(schema.about["@id"], "https://syncedin.org/#organization");
  assert.equal(schema.image, "https://syncedin.org/about/opengraph-image.png");
  assert.equal(page.viewport.userScalable, true);
});

test("the product FAQ exposes the same reviewed answers in native disclosures and structured data", () => {
  const page = load("app/faq/page.tsx", { ...dependencies, "lucide-react": icons, "@/lib/product-faq": productFaq, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
  assert.equal(parsed.headings.length, 1);
  assert.equal(new Set(productFaq.PRODUCT_FAQS.map(item => item.id)).size, 16);
  assert.equal((html.match(/<details[ >]/g) || []).length, productFaq.PRODUCT_FAQS.length);
  assert.equal((html.match(/<summary[ >]/g) || []).length, productFaq.PRODUCT_FAQS.length);
  const schema = parsed.schemas.find(item => item["@type"] === "FAQPage");
  assert.equal(schema.dateModified, productFaq.PRODUCT_FAQ_REVIEWED_AT);
  assert.deepEqual(schema.mainEntity.map(item => [item.name, item.acceptedAnswer.text]), productFaq.PRODUCT_FAQS.map(item => [item.q, item.a]));
  for (const item of productFaq.PRODUCT_FAQS) {
    assert(html.includes(`id="${item.id}"`));
    assert(html.includes(item.q.replaceAll("'", "&#x27;")), item.id);
    for (const link of item.links) assert(html.includes(`href="${link.href}"`));
  }
  for (const falseClaim of ["$20M", "founded in 2025", "never leaves our database", "unlimited outbound", "paid creator inbox", "App Store review", "30-60 seconds"]) assert(!html.includes(falseClaim), falseClaim);
  assert(html.includes("They do not retrain the underlying model"));
  assert(html.includes("500 characters"));
  assert(html.includes("Saving a number is separate from opting in"));
  assert(html.includes('href="/support"'));
  assert.equal(page.metadata.alternates.canonical, "https://syncedin.org/faq");
  assert.equal(page.viewport.userScalable, true);
});

test("founder pages retain their actions and pass the intended onboarding destination through sign-in", () => {
  const shell = load("app/(verticals)/VerticalLandingShell.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  for (const slug of ["founders-cofounder", "founders-vc"]) {
    const page = load(`app/${slug}/page.tsx`, { ...dependencies, "../(verticals)/VerticalLandingShell": shell });
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
    const signupLinks = links.filter(href => href.startsWith("/login?next="));
    assert.equal(signupLinks.length, 2, "Keep both primary signup actions");
    for (const href of signupLinks) {
      const auth = new URL(href, "https://syncedin.org");
      assert.equal(auth.searchParams.get("next"), `/onboarding?welcome=1&vertical=${slug}`);
    }
    assert(links.includes("/hypernetwork") && links.includes("/"));
    assert(html.includes("Sources and limits"));
    assert(html.includes("Questions to clarify together"));
    assert(html.includes("is not their consent"));
    for (const claim of ["80 funds", "5 calls", "30 minutes saved", "yes immediately", "every public post"]) assert(!html.includes(claim), claim);
    assert.equal(page.metadata.alternates.canonical, `https://syncedin.org/${slug}`);
    assert.equal(parsed.headings.length, 1);
    assert.equal(page.viewport.userScalable, true);
  }
});

test("the release parser handles HTML attributes, entities, nested JSON and XML sitemap namespaces", () => {
  const path = "/guides";
  const image = "https://syncedin.org/guides/opengraph-image.png";
  const html = `<html><head><title>Guides &amp; context</title><meta content="Useful guides" name="description"><link href="https://syncedin.org/guides" rel="canonical"><meta content="${image}" property="og:image"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta name="twitter:image" content="https://syncedin.org/guides/twitter-image.png"><meta name="twitter:card" content="summary_large_image"></head><body><h1>Networking <span>guides</span></h1><script type="application/ld+json">{"@type":"CollectionPage","name":"Guides"}</script></body></html>`;
  const page = inspectPublicPage(html);
  assert.equal(page.title[0], "Guides & context");
  assert.equal(page.headings[0], "Networking guides");
  for (const svg of ['<svg xmlns="http://www.w3.org/2000/svg">', "<svg>"]) {
    const withIcon = html.replace("<h1>", `${svg}<title>chatgpt</title></svg><h1>`);
    assert.deepEqual(inspectPublicPage(withIcon).title, ["Guides & context"], "An SVG icon title is not the document title");
  }
  verifyPublicPage(page, path);
  assert.throws(() => verifyPublicPage({ ...page, robots: ["noindex, nofollow"] }, path), /noindex/);
  assert.throws(() => verifyPublicPage({ ...page, canonical: ["https://other.example/guides"] }, path), /canonical/);
  assert.throws(() => verifyPublicPage({ ...page, headings: [] }, path), /H1/);
  assert.throws(() => inspectPublicPage('<html><script type="application/ld+json">invalid</script></html>'));
  const xml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://syncedin.org/guides</loc><lastmod>2026-11-19</lastmod></url></urlset>';
  assert.deepEqual(inspectSitemap(xml), [{ url: "https://syncedin.org/guides", lastModified: "2026-11-19" }]);
  assert.throws(() => inspectSitemap('<sitemapindex/>'), /canonical URL sitemap/);
  assert.throws(() => inspectSitemap('<urlset xmlns="https://wrong.example"/>'), /namespace/);
  assert.throws(() => inspectSitemap('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url>'));
  assert.deepEqual(inspectSitemap(xml.replaceAll("<url", "<sm:url").replaceAll("</url", "</sm:url").replace('xmlns=', 'xmlns:sm=').replaceAll("<loc", "<sm:loc").replaceAll("</loc", "</sm:loc").replaceAll("<lastmod", "<sm:lastmod").replaceAll("</lastmod", "</sm:lastmod")), [{ url: "https://syncedin.org/guides", lastModified: "2026-11-19" }]);
});

test("guide text and status colours remain readable in both existing themes", () => {
  const sheet = postcss.parse(fs.readFileSync("app/guides/guides.module.css", "utf8"));
  const palettes = [];
  sheet.walkRules(rule => {
    if (rule.selector !== ".page" && rule.selector !== ':global(:root[data-theme="dark"]) .page') return;
    const values = {};
    rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; });
    palettes.push({ theme: rule.selector.includes("dark") ? "dark" : "light", values });
  });
  function luminance(hex) {
    let value = hex.slice(1);
    if (value.length === 3) value = [...value].map(c => c + c).join("");
    const rgb = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  assert.equal(palettes.length, 2);
  for (const { theme, values } of palettes) {
    const background = luminance(theme === "dark" ? "#131829" : "#ffffff");
    for (const name of ["--accent", "--green", "--red"]) {
      const foreground = luminance(values[name]);
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      assert(ratio >= 4.5, `${theme} ${name} contrast ${ratio.toFixed(2)}`);
    }
  }
});

test("shared entity markup remains factual and does not advertise a retired public search box", () => {
  const stub = name => ({ [name]: () => null });
  const root = load("app/layout.tsx", {
    "react/jsx-runtime": jsx, "./globals.css": {}, "./product.css": {},
    "next/script": { __esModule: true, default: props => React.createElement("script", props) },
    "./Footer": stub("Footer"), "./ChunkErrorRecovery": stub("ChunkErrorRecovery"),
    "./ErrorAutoReport": stub("ErrorAutoReport"), "./FeedbackBubble": stub("FeedbackBubble"),
  });
  const html = renderToStaticMarkup(React.createElement(root.default, {}, "Page content"));
  const schemas = inspectPublicPage(html).schemas;
  const website = schemas.find(schema => schema["@type"] === "WebSite");
  const organization = schemas.find(schema => schema["@type"] === "Organization");
  const application = schemas.find(schema => schema["@type"] === "SoftwareApplication");
  assert.equal(website.publisher["@id"], organization["@id"]);
  assert.equal(website.potentialAction, undefined);
  assert.equal(application.operatingSystem, "Web browser");
  assert.equal(organization.foundingDate, undefined, "Do not publish an unsupported founding year");
  assert(html.includes('data-clarity-mask="True"'));
  assert(!JSON.stringify(schemas).includes("before either human spends a minute"));
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
