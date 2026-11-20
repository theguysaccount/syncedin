import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";
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
const indexNow = load("lib/indexnow.ts", { "@/verification/social-card-manifest.json": { default: cards } });
const productReference = load("lib/product-reference.ts");
const profileCopy = load("lib/profile-preview-copy.ts");
const profileResult = load("lib/profile-preview-result.ts");
const launchArticle = load("lib/launch-article.ts");
const funnelEvents = load("lib/funnel-events.ts");
const nextServer = { NextResponse: class extends Response { static json(body, options) { return Response.json(body, options); } } };
const nextRuntime = createRequire(import.meta.url)("next/server");
const css = new Proxy({}, { get: (_, name) => String(name) });
const nextLink = { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
const wordmark = load("app/Wordmark.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink });
const brandLogo = load("app/BrandLogo.tsx", { "react/jsx-runtime": jsx });
const trustNote = load("app/TrustNote.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons });
const theme = load("app/ThemeToggle.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons });
const layout = load("app/guides/GuideLayout.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons, "../Wordmark": wordmark, "../ThemeToggle": theme, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const editor = load("app/guides/ConnectionNoteEditor.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/networking-guides": guides, "./guides.module.css": { __esModule: true, default: css } });
const goalBuilder = load("app/guides/ConversationGoalBuilder.tsx", { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/networking-goals": goals, "./guides.module.css": { __esModule: true, default: css } });
const dependencies = { "react/jsx-runtime": jsx, "next/link": nextLink, "@/lib/public-seo": seo, "@/lib/networking-guides": guides, "../GuideLayout": layout, "../ConnectionNoteEditor": editor, "../ConversationGoalBuilder": goalBuilder, "../guides.module.css": { __esModule: true, default: css } };

function previewComponent(file, states = {}, observe = {}) {
  let index = 0;
  return load(file, {
    "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons,
    "../BrandLogo": brandLogo, "../TrustNote": trustNote,
    "./BrandLogo": brandLogo,
    "next/navigation": { useRouter: () => ({ push: url => observe.navigations?.push(url) }) },
    "@/lib/profile-preview-copy": profileCopy, "@/lib/profile-preview-result": profileResult,
    "@/lib/track": { track: (...args) => observe.events?.push(args) },
    react: { ...React, useEffect: () => {}, useRef: initial => ({ current: initial }), useState: initial => {
      const key = index++;
      return [Object.hasOwn(states, key) ? states[key] : typeof initial === "function" ? initial() : initial, value => observe.updates?.push([key, value])];
    } },
  });
}

function elementText(element) {
  if (Array.isArray(element)) return element.map(elementText).join("");
  if (React.isValidElement(element)) return elementText(element.props.children);
  return typeof element === "string" || typeof element === "number" ? String(element) : "";
}

function findButton(element, label) {
  if (Array.isArray(element)) {
    for (const child of element) { const result = findButton(child, label); if (result) return result; }
  } else if (React.isValidElement(element)) {
    if (element.type === "button" && elementText(element).trim() === label) return element;
    return findButton(element.props.children, label);
  }
}

function functionBody(file, name) {
  const source = fs.readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.body.getText(parsed);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert(result, name + " function missing");
  return result;
}

function trackRouteFixture({ user = null, profile = { is_test_persona: false }, profileError = null, insertError = false } = {}) {
  const observed = { auth: 0, profiles: 0, inserts: [] };
  const service = { from: table => {
    if (table === "funnel_events") return { insert: async row => { observed.inserts.push(row); if (insertError) throw new Error("private details"); } };
    assert.equal(table, "profiles"); observed.profiles++;
    const query = { select: field => { assert.equal(field, "is_test_persona"); return query; }, eq: (field, id) => { assert.equal(field, "id"); assert.equal(id, user.id); return query; }, maybeSingle: async () => ({ data: profile, error: profileError }) };
    return query;
  } };
  const route = load("app/api/track/route.ts", {
    "next/server": nextServer, "@/lib/funnel-events": funnelEvents,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { observed.auth++; return { data: { user } }; } } }), createServiceClient: () => service }
  });
  return { route, observed };
}

test("funnel events keep only bounded categories and remove names, context and personalized paths", () => {
  const result = funnelEvents.sanitizeFunnelEvent({ event: "claim_clicked", path: "/fictional-jane", anon: "qa@example.invalid", meta: { door: "invite-lockin", needs: 2, name: "Fictional Jane", summary: "private draft", email: "qa@example.invalid", chars: -1, people: Infinity } });
  assert.deepEqual(result, { event: "claim_clicked", path: "/[invite]", anon_id: null, meta: { door: "invite-lockin", needs: 2 } });
  assert.deepEqual(funnelEvents.sanitizeFunnelEvent({ event: "ghost_prefill_used", path: "/ghosts", meta: { name: "Fictional Jane" } }), { event: "ghost_prefill_used", path: "/ghosts", anon_id: null, meta: null });
  assert.deepEqual(funnelEvents.sanitizeFunnelEvent({ event: "win_published", path: "/messages", meta: { anonymize: true, text: "private outcome" } }).meta, { anonymize: true });
  for (const input of [null, [], { event: "unknown", path: "/" }, { event: "view", path: "/messages" }, { event: "view", path: "/jane" }, { event: "view", path: "/?email=private" }]) assert.equal(funnelEvents.sanitizeFunnelEvent(input), null);
  for (const path of ["/", "/talk", "/ai-knows-me", "/generate-free-portfolio", "/wins"]) assert(funnelEvents.sanitizeFunnelEvent({ event: "view", path }));
  assert(funnelEvents.validFunnelId("123e4567-e89b-12d3-a456-426614174000"));
  assert(funnelEvents.validFunnelId("abcde12345fghij67890"));
  assert(!funnelEvents.validFunnelId("email@example.invalid"));
});

test("funnel collection excludes local, preview, QA, automation and privacy opt-outs before creating identifiers", async () => {
  for (const [url, privacy] of [["http://localhost:3016/", {}], ["https://preview.vercel.app/", {}], ["https://syncedin.org/?qa=1", {}], ["https://syncedin.org/?preview=1", {}], ["https://syncedin.org/", { doNotTrack: "1" }], ["https://syncedin.org/", { globalPrivacyControl: true }], ["https://syncedin.org/", { automated: true }]]) assert.equal(funnelEvents.funnelCollectionAllowed(url, privacy), false);
  assert(funnelEvents.funnelCollectionAllowed("https://syncedin.org/?utm_source=editorial"));
  const descriptors = Object.fromEntries(["window", "navigator", "localStorage", "crypto"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const sent = []; let storageReads = 0; let storageWrites = 0; let stored = "abcde12345fghij67890";
  try {
    const location = { href: "http://localhost:3016/", pathname: "/" };
    const navigator = { doNotTrack: null, webdriver: false, sendBeacon: (_url, blob) => { sent.push(blob); return true; } };
    Object.defineProperty(globalThis, "window", { value: { location }, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => { storageReads++; return stored; }, setItem: () => { storageWrites++; } }, configurable: true });
    const client = load("lib/track.ts", { "@/lib/funnel-events": funnelEvents });
    client.track("view"); assert.equal(storageReads, 0); assert.equal(sent.length, 0);
    location.href = "https://syncedin.org/"; navigator.doNotTrack = "1"; client.track("view"); assert.equal(storageReads, 0);
    navigator.doNotTrack = null; navigator.globalPrivacyControl = true; client.track("view"); assert.equal(storageReads, 0);
    navigator.globalPrivacyControl = false; location.pathname = "/private-profile"; client.track("view"); assert.equal(storageReads, 0);
    location.pathname = "/"; client.track("view", { door: "landing", email: "qa@example.invalid", name: "Fictional Jane" });
    assert.equal(sent.length, 1); assert.equal(storageWrites, 0);
    assert.deepEqual(JSON.parse(await sent[0].text()), { event: "view", path: "/", anon: "abcde12345fghij67890", meta: { door: "landing" } });
    stored = "private@example.invalid";
    Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => { throw new Error("Unavailable"); } }, configurable: true });
    client.track("view");
    assert.equal(JSON.parse(await sent[1].text()).anon, "", "A failed UUID generator must not transmit invalid stored text");
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test("funnel sink sanitizes cached-client input, ignores QA accounts and preserves nonblocking responses", async () => {
  const payload = { event: "claim_clicked", path: "/fictional-jane", anon: "123e4567-e89b-12d3-a456-426614174000", meta: { door: "invite-lockin", name: "Fictional Jane", needs: 1 } };
  const request = () => new Request("https://syncedin.org/api/track", { method: "POST", headers: { origin: "https://syncedin.org" }, body: JSON.stringify(payload) });
  const normal = trackRouteFixture();
  assert.equal((await normal.route.POST(request())).status, 204);
  assert.deepEqual(normal.observed.inserts, [{ event: "claim_clicked", path: "/[invite]", anon_id: payload.anon, meta: { door: "invite-lockin", needs: 1 }, user_id: null }]);
  for (const options of [{ profile: { is_test_persona: true } }, { profile: null }, { profileError: { message: "private database detail" } }]) {
    const fixture = trackRouteFixture({ user: { id: "qa-id" }, ...options });
    const response = await fixture.route.POST(request()); assert.equal(response.status, 204); assert.equal(await response.text(), ""); assert.equal(fixture.observed.inserts.length, 0);
  }
  const member = trackRouteFixture({ user: { id: "member-id" } });
  assert.equal((await member.route.POST(request())).status, 204); assert.equal(member.observed.inserts[0].user_id, "member-id");
  const failed = trackRouteFixture({ insertError: true }); assert.equal((await failed.route.POST(request())).status, 204);
});

test("funnel sink ignores cross-origin, opt-out, nonproduction and oversized streamed requests without account lookup", async () => {
  const fixture = trackRouteFixture();
  const body = JSON.stringify({ event: "view", path: "/" });
  for (const [url, headers, text] of [["https://syncedin.org/api/track", { origin: "https://other.invalid" }, body], ["https://syncedin.org/api/track", { "sec-fetch-site": "cross-site" }, body], ["https://syncedin.org/api/track", { dnt: "1" }, body], ["https://syncedin.org/api/track", { "sec-gpc": "1" }, body], ["http://localhost:3016/api/track", {}, body], ["https://preview.vercel.app/api/track", {}, body], ["https://syncedin.org/api/track", {}, "not json"], ["https://syncedin.org/api/track", { "content-length": "9000" }, body]]) assert.equal((await fixture.route.POST(new Request(url, { method: "POST", headers, body: text }))).status, 204);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(9000))); }, cancel() { cancelled = true; } });
  assert.equal((await fixture.route.POST(new Request("https://syncedin.org/api/track", { method: "POST", body: stream, duplex: "half" }))).status, 204);
  assert(cancelled); assert.equal(fixture.observed.auth, 0); assert.equal(fixture.observed.inserts.length, 0);
  assert(fs.readFileSync("app/talk/TalkChat.tsx", "utf8").includes('data-clarity-mask="True"'));
});

function publicRecordsFixture({ failed = false, count = 0, scores = [], receipts = [] } = {}) {
  const calls = [];
  const service = { from: table => {
    const query = { table, field: "", head: false };
    const builder = { select: (field, options) => { query.field = field; query.head = !!options?.head; calls.push([table, "select", field]); return builder; }, then: (resolve, reject) => {
      const error = failed ? { message: "private database diagnostic" } : null;
      const data = failed ? null : table === "win_receipts" ? receipts : table === "conversations" && query.field === "excitement_score" ? scores.map(excitement_score => ({ excitement_score })) : [];
      return Promise.resolve({ count: failed ? null : count, data, error }).then(resolve, reject);
    } };
    for (const method of ["eq", "not", "order", "limit"]) builder[method] = (...args) => { calls.push([table, method, ...args]); return builder; };
    return builder;
  } };
  const shared = { "react/jsx-runtime": jsx, "next/link": nextLink, "@/lib/public-seo": seo, "../Wordmark": wordmark,
    "@/lib/supabase/server": { createServiceClient: () => service, createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) } };
  const network = load("app/hypernetwork/page.tsx", { ...shared,
    "./SignupsChart": load("app/hypernetwork/SignupsChart.tsx", { "react/jsx-runtime": jsx }),
    "../BulkReachToolkit": { BulkReachToolkit: () => React.createElement("div", null, "Existing reach toolkit") },
    "../AppShell": { AppShell: ({ children }) => children },
    "./WorldRadarAnimation": { WorldRadarAnimation: () => React.createElement("div", null, "Existing radar animation") },
    "../LoomEmbed": load("app/LoomEmbed.tsx", { "react/jsx-runtime": jsx })
  });
  const wins = load("app/wins/page.tsx", { ...shared, "../TrackBeacon": { TrackBeacon: () => null } });
  return { network, wins, calls };
}

test("public network records distinguish failed queries from real zero and label actual units", async () => {
  const empty = publicRecordsFixture();
  const html = renderToStaticMarkup(await empty.network.default());
  for (const phrase of ["registered accounts", "twins with goals", "acceptance responses", "individual accepted responses, not mutually completed deals", "not external text delivery", "not model retraining", "including test activity", "Unavailable is not zero"]) assert(html.includes(phrase), phrase);
  for (const href of ["/login", "/feedback", "/onboarding", "/dashboard", "/careers"]) assert(html.includes(`href="${href}"`), href);
  assert(html.includes("Existing reach toolkit") && html.includes("Existing radar animation"));
  assert(empty.calls.some(call => call[0] === "profiles" && call[1] === "eq" && call[2] === "is_test_persona" && call[3] === false));
  const failure = renderToStaticMarkup(await publicRecordsFixture({ failed: true }).network.default());
  assert(failure.includes("Signup history is temporarily unavailable"));
  assert(!failure.includes("No signups yet") && !failure.includes("private database diagnostic"));
  assert((failure.match(/>Unavailable</g) || []).length >= 10);
  assert(!failure.includes("both humans accepted what their twins proposed"));
});

test("network averages ignore nonfinite and out-of-range values instead of publishing invalid evidence", async () => {
  const html = renderToStaticMarkup(await publicRecordsFixture({ count: 2, scores: [NaN, Infinity, -1, 101, 20, 80, "100"] }).network.default());
  assert(html.includes("50/100"));
  assert(!html.includes("NaN/100") && !html.includes("Infinity/100"));
});

test("published receipts use publication dates, honest member reports and a separate unavailable state", async () => {
  const receipt = { id: "synthetic", party_a: "A SyncedIn member", party_b: "A SyncedIn member", outcome_text: "A fictional QA example, not a customer outcome.", anonymized: true, created_at: new Date(Date.now() - 3600000).toISOString() };
  const html = renderToStaticMarkup(await publicRecordsFixture({ receipts: [receipt] }).wins.default());
  assert(html.includes("member-reported summaries") && html.includes("not independent verification"));
  assert(html.includes("1 receipt published in the last seven days among the latest 50"));
  assert(html.includes("published anonymously") && html.includes("fictional QA example"));
  assert(!html.includes("accepted this week") && !html.includes("Nothing on this page is seeded"));
  const empty = renderToStaticMarkup(await publicRecordsFixture().wins.default());
  assert(empty.includes("No public receipts to show yet") && empty.includes('href="/ai-knows-me"'));
  const failure = renderToStaticMarkup(await publicRecordsFixture({ failed: true }).wins.default());
  assert(failure.includes("Published receipts are temporarily unavailable") && failure.includes('href="/ai-knows-me"'));
  assert(!failure.includes("No public receipts to show yet") && !failure.includes("private database diagnostic"));
});

function homepageFixture({ user = null, rows = [], queryFailure = false } = {}) {
  const calls = [];
  const builder = {};
  for (const method of ["select", "eq", "not", "order"]) builder[method] = (...args) => { calls.push([method, ...args]); return builder; };
  builder.limit = async (...args) => { calls.push(["limit", ...args]); if (queryFailure) throw new Error("Synthetic private database detail"); return { data: rows }; };
  const page = load("app/page.tsx", {
    "react/jsx-runtime": jsx, "next/link": nextLink, "lucide-react": icons,
    "next/navigation": { redirect: path => { throw new Error("redirect:" + path); } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }), createServiceClient: () => ({ from: name => { calls.push(["from", name]); return builder; } }) },
    "./Wordmark": wordmark, "./LandingHandleHero": previewComponent("app/LandingHandleHero.tsx"),
    "./LoomEmbed": load("app/LoomEmbed.tsx", { "react/jsx-runtime": jsx }),
    "./TrackBeacon": { TrackBeacon: () => null }, "./ThemeToggle": theme,
    "@/lib/product-faq": productFaq,
  });
  return { page, calls };
}

function middlewareFixture({ user = null, refreshed = [] } = {}) {
  const observed = { clients: 0, auth: 0, writes: [] };
  const module = load("middleware.ts", {
    "next/server": nextRuntime,
    "@supabase/ssr": { createServerClient: (_url, _key, { cookies }) => {
      observed.clients++;
      return { auth: { getUser: async () => {
        observed.auth++;
        if (refreshed.length) cookies.setAll(refreshed);
        return { data: { user } };
      } }, from: table => ({ update: data => ({ eq: async (column, id) => { observed.writes.push({ table, data, column, id }); return { error: null }; } }) }) };
    } },
  });
  return { middleware: module.middleware, observed };
}

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

test("the product article and plain-text export share facts, visible authorship and review dates", () => {
  const article = launchArticle.LAUNCH_ARTICLE;
  const page = load("app/article/page.tsx", { ...dependencies, "lucide-react": icons, "@/lib/launch-article": launchArticle, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
  assert.deepEqual(parsed.headings, [article.title]);
  assert(html.includes(article.disclosure));
  const graph = parsed.schemas.find(item => item["@graph"])["@graph"];
  const schema = graph.find(item => item["@type"] === "Article");
  assert.equal(schema.headline, article.title);
  assert.equal(schema.dateModified, article.reviewedAt);
  assert.equal(schema.author.name, "SyncedIn");
  assert.equal(schema.author.url, "https://syncedin.org/about");
  assert.equal(schema.publisher["@id"], "https://syncedin.org/#organization");
  assert(!Object.hasOwn(schema, "datePublished"), "Do not invent an exact original publication date");
  assert.equal(page.metadata.alternates.canonical, "https://syncedin.org/article");
  assert.equal(page.viewport.userScalable, true);
  const markdown = launchArticle.launchArticleMarkdown();
  assert.equal(fs.readFileSync("public/articles/syncedin-launch.md", "utf8"), markdown);
  for (const section of article.sections) {
    assert(html.includes(section.heading));
    assert(markdown.includes(`## ${section.heading}`));
    for (const paragraph of [...section.paragraphs, ...section.steps]) assert(markdown.includes(paragraph));
  }
  for (const href of ["/", "/blog", "/login", "/article.md", "https://calendly.com/JackJay"]) assert(parsed.links.some(link => link.href === href), href);
  assert.equal(parsed.links.filter(link => link.href === "/login").length, 2, "Preserve both signup actions");
  for (const claim of ["free forever", "pre-vetted", "only AI networking platform", "he wrote recently", "final review windows", "13 parallel ventures"]) assert(!markdown.includes(claim), claim);
  assert(markdown.includes("fictional example") && markdown.includes("not evidence that the underlying model has been retrained"));
  const exported = JSON.parse(fs.readFileSync("verification/article-export-manifest.json", "utf8"));
  assert.equal(exported.sha256, crypto.createHash("sha256").update(markdown).digest("hex"));
  assert.equal(exported.bytes, Buffer.byteLength(markdown));
});

test("the optional article download is a canonical-linked text representation and the old redirect stays intact", async () => {
  const route = load("app/article.md/route.ts", { "@/lib/launch-article": launchArticle });
  const response = route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(response.headers.get("link"), '<https://syncedin.org/article>; rel="canonical"');
  assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
  assert.equal(await response.text(), launchArticle.launchArticleMarkdown());
  const config = createRequire(import.meta.url)("../next.config.js");
  const redirects = await config.redirects();
  assert(redirects.some(row => row.source === "/articles/syncedin-launch.md" && row.destination === "/article" && row.permanent === true));
  assert(!fs.readFileSync("app/sitemap.ts", "utf8").includes("/article.md"), "Do not promote a duplicate text representation as another canonical HTML page");
});

test("the journal retains all article and signup actions, matching visible items and intentional image sizes", () => {
  const page = load("app/blog/page.tsx", { ...dependencies, "lucide-react": icons, "@/lib/launch-article": launchArticle, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
  assert.deepEqual(parsed.headings, ["SyncedIn journal"]);
  assert.equal(parsed.links.filter(link => link.href === "/login").length, 2);
  assert(parsed.links.some(link => link.href === "/guides"));
  const schema = parsed.schemas.find(item => item["@type"] === "CollectionPage");
  assert.equal(schema.mainEntity.itemListElement.length, 4);
  for (const [index, href] of ["/article", "/vs/lemlist", "/vs/clay", "/vs/linkedin-dms"].entries()) {
    const item = schema.mainEntity.itemListElement[index];
    assert(parsed.links.some(link => link.href === href && link.text.includes(item.name)));
    assert(html.includes(`src="${href}/opengraph-image.png"`));
    assert.equal(item.url, "https://syncedin.org" + href);
  }
  assert.equal(schema.mainEntity.itemListElement[0].name, launchArticle.LAUNCH_ARTICLE.title);
  assert.equal((html.match(/width="1200" height="630"/g) || []).length, 4);
  assert.equal((html.match(/loading="eager"/g) || []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
  assert(!/under two minutes|free forever/.test(html));
  assert.equal(page.viewport.userScalable, true);
  const styles = postcss.parse(fs.readFileSync("app/guides/guides.module.css", "utf8"));
  styles.walkRules(rule => { if (rule.selector.includes(".guideList") && rule.selector.includes("a")) rule.walkDecls("display", declaration => assert.notEqual(declaration.value, "contents", "Keep a real focusable box around each whole article link")); });
});

test("the homepage preserves its paths and native controls without unsupported ratings or private-name fallbacks", async () => {
  const { page, calls } = homepageFixture({ rows: [
    { id: "qa-public", display_name: "", handle: "fictional-public", avatar_url: "https://example.invalid/public.jpg", email: "private-qa-address@example.invalid" },
    { id: "qa-unpublished", display_name: "Not public", handle: null, avatar_url: "https://example.invalid/private.jpg" },
  ] });
  const html = renderToStaticMarkup(await page.default());
  const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
  assert.equal(parsed.headings.length, 1);
  assert(parsed.headings[0].includes("AI networking."));
  for (const claim of ["4.9 average", "4.9 avg", "40+", "94%", "~0 sec", "in 30 seconds", "30 seconds away", "everything wipes", "unlimited conversations", "first deal your twin", "private-qa-address", "example.invalid/private.jpg", "api.dicebear.com"]) assert(!html.includes(claim), claim);
  assert(html.includes("fictional-public"));
  assert(html.includes('src="/syncedin-wordmark-tight.png"'), "Use the actual tight brand artwork, not a padded logo container");
  assert(calls.some(call => call[0] === "eq" && call[1] === "is_test_persona" && call[2] === false));
  assert(calls.some(call => call[0] === "not" && call[1] === "handle" && call[2] === "is" && call[3] === null));
  assert(calls.filter(call => call[0] === "select").every(call => !call[1].includes("email")));
  assert.equal((html.match(/<details[ >]/g) || []).length, 4, "Keep four native FAQ controls");
  for (const id of ["message-review", "edit-a-message", "context-and-privacy", "pricing"]) {
    const item = productFaq.PRODUCT_FAQS.find(item => item.id === id);
    assert(item && html.includes(item.q.replaceAll("'", "&#x27;")));
  }
  for (const href of ["/article", "/hypernetwork", "/login", "#top", "/faq"]) assert(parsed.links.some(link => link.href === href), href);
  const intents = parsed.links.filter(link => link.href.startsWith("/login?next="));
  assert.equal(intents.length, 4, "Preserve all four audience choices");
  assert.deepEqual(intents.map(link => new URL(new URL(link.href, "https://syncedin.org").searchParams.get("next"), "https://syncedin.org").searchParams.get("intent")), ["cofounder", "investors", "advisors", "idea"]);
  assert(html.includes("f1a22bc84d914c6399f0ea20e955ccc8"), "Preserve the existing product walkthrough");
  assert(html.includes("What if the real superintelligence was the friends we"), "Preserve the user's manifesto");
  assert.equal(page.viewport.userScalable, true);
  const failure = homepageFixture({ queryFailure: true });
  const fallback = renderToStaticMarkup(await failure.page.default());
  assert(fallback.includes("Build my twin") && !fallback.includes("Synthetic private database detail"));
  const signedIn = homepageFixture({ user: { id: "isolated-qa" } });
  await assert.rejects(() => signedIn.page.default(), /redirect:\/dashboard/);
  assert.equal(signedIn.calls.length, 0);
});

test("public content checks do not mistake animation percentages, SVG coordinates or scripts for marketing claims", () => {
  const page = inspectPublicPage('<html><head><style>@keyframes x {94% {opacity:1}}</style></head><body><h1>AI networking</h1><p>Context and choice.</p><svg><title>4.9 average</title><path d="M4.9 0"/></svg><script>const old="40+ founders";</script><div hidden>Private fallback</div><span aria-hidden="true">Decorative</span></body></html>');
  assert.equal(page.contentText, "AI networking Context and choice.");
  assert(inspectPublicPage('<html><body><p>4.9 average</p></body></html>').contentText.includes("4.9 average"), "Real unsupported content must still be detectable");
});

test("new homepage experiment assignments reach the actual response and use a temporary query-preserving redirect", async () => {
  const originalRandom = Math.random;
  try {
    for (const [random, variant, status] of [[0.1, "a", 200], [0.9, "b", 302]]) {
      Math.random = () => random;
      const { middleware, observed } = middlewareFixture();
      const response = await middleware(new nextRuntime.NextRequest("https://syncedin.org/?utm_source=synthetic"));
      assert.equal(response.status, status);
      const cookie = response.cookies.get("syncedin_landing_ab");
      assert.equal(cookie.value, variant);
      assert.equal(cookie.path, "/");
      assert.equal(cookie.sameSite, "lax");
      assert.equal(cookie.maxAge, 60 * 60 * 24 * 30);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      if (variant === "b") {
        const target = new URL(response.headers.get("location"));
        assert.equal(target.pathname, "/talk");
        assert.equal(target.search, "?utm_source=synthetic");
      } else assert.equal(response.headers.get("location"), null);
      assert.equal(observed.auth, 1);
      assert.equal(observed.writes.length, 0);
    }
  } finally { Math.random = originalRandom; }
});

test("homepage variants remain sticky and preserve refreshed cookie attributes without crawler-specific treatment", async () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => { throw new Error("Existing assignments must not be rerolled"); };
    for (const [variant, status] of [["a", 200], ["b", 302]]) {
      const { middleware } = middlewareFixture();
      const response = await middleware(new nextRuntime.NextRequest("https://syncedin.org/", { headers: { cookie: `syncedin_landing_ab=${variant}` } }));
      assert.equal(response.status, status);
      assert.equal(response.cookies.get("syncedin_landing_ab"), undefined, "Do not reset an existing preference's lifetime");
    }
    Math.random = () => 0.9;
    for (const userAgent of ["Mozilla/5.0 Synthetic QA", "Googlebot Synthetic QA"]) {
      const { middleware } = middlewareFixture({ refreshed: [{ name: "sb-synthetic-refresh", value: "qa-only", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 } }] });
      const response = await middleware(new nextRuntime.NextRequest("https://syncedin.org/", { headers: { "user-agent": userAgent } }));
      assert.equal(response.status, 302);
      assert.equal(response.cookies.get("syncedin_landing_ab").value, "b");
      const refresh = response.cookies.get("sb-synthetic-refresh");
      assert.equal(refresh.value, "qa-only");
      assert(refresh.httpOnly && refresh.secure);
      assert.equal(refresh.maxAge, 600);
    }
  } finally { Math.random = originalRandom; }
});

test("homepage testing leaves non-navigation methods, protected routes, assets, signed-in users and activity stamps intact", async () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("No assignment expected"); };
  try {
    for (const [path, method, expected] of [["/", "POST", 200], ["/guides", "GET", 200], ["/synthetic-invite", "GET", 200], ["/dashboard", "GET", 307], ["/settings/notifications", "GET", 307]]) {
      const { middleware } = middlewareFixture();
      const response = await middleware(new nextRuntime.NextRequest("https://syncedin.org" + path, { method, headers: { cookie: "syncedin_landing_ab=b" } }));
      assert.equal(response.status, expected, method + path);
      assert.equal(response.cookies.get("syncedin_landing_ab"), undefined);
      if (expected === 307) assert.equal(new URL(response.headers.get("location")).pathname, "/login");
    }
    for (const path of ["/api/track", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/guides/ai-networking/opengraph-image", "/8e7c4f3a2b1d9e6f5c8a7b4d2e9f1c3a.txt"]) {
      const { middleware, observed } = middlewareFixture();
      assert.equal((await middleware(new nextRuntime.NextRequest("https://syncedin.org" + path))).status, 200);
      assert.equal(observed.clients, 0, "Keep public assets free of auth-cookie work");
    }
    const authed = middlewareFixture({ user: { id: "isolated-qa" } });
    const response = await authed.middleware(new nextRuntime.NextRequest("https://syncedin.org/", { headers: { cookie: "syncedin_landing_ab=b" } }));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.get("syncedin_landing_ab"), undefined);
    assert(response.cookies.get("syncedin_last_stamp"));
    assert.equal(authed.observed.writes.length, 1);
    assert.equal(authed.observed.writes[0].id, "isolated-qa");
    const debounced = middlewareFixture({ user: { id: "isolated-qa" } });
    await debounced.middleware(new nextRuntime.NextRequest("https://syncedin.org/guides", { headers: { cookie: `syncedin_last_stamp=${Date.now()}` } }));
    assert.equal(debounced.observed.writes.length, 0);
    const head = middlewareFixture();
    assert.equal((await head.middleware(new nextRuntime.NextRequest("https://syncedin.org/", { method: "HEAD", headers: { cookie: "syncedin_landing_ab=b" } }))).status, 302);
  } finally { Math.random = originalRandom; }
});

test("the chat homepage variant keeps its original canonical and animation without becoming a second sitemap destination", () => {
  const metadata = seo.withHomeVariantSEO({ title: "Chat with SyncedIn", description: "A test description" });
  assert.equal(metadata.alternates.canonical, "https://syncedin.org/");
  assert.equal(metadata.openGraph.url, "https://syncedin.org/");
  assert.equal(metadata.openGraph.images[0].url, "https://syncedin.org/social/syncedin-preview.gif");
  assert(!fs.readFileSync("app/sitemap.ts", "utf8").includes('`${APP_URL}/talk`'));
  assert.equal(indexNow.canonicalIndexNowUrls(["https://syncedin.org/talk"]), null);
  const page = load("app/talk/page.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "@/lib/public-seo": seo, "../Wordmark": wordmark, "./TalkChat": { TalkChat: () => null }, "@/lib/supabase/server": {} });
  assert.equal(page.metadata.alternates.canonical, "https://syncedin.org/");
  assert.equal(page.viewport.userScalable, true);
});

test("the homepage handle entry keeps every platform and signup handoff while labelling and masking the input", async () => {
  const file = "app/LandingHandleHero.tsx";
  const initial = previewComponent(file).LandingHandleHero;
  const html = renderToStaticMarkup(React.createElement(initial));
  assert(html.includes('role="group" aria-label="Profile platform"'));
  assert(html.includes('for="signup-profile-handle"') && html.includes('id="signup-profile-handle"'));
  assert(html.includes('data-clarity-mask="True"'));
  assert(html.includes('aria-pressed="true"'));
  assert(!/4\.9\s+(?:average|avg|rating)/.test(html) && !html.includes("dicebear") && !html.includes('role="tab"'));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const stored = new Map();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem: (key, value) => stored.set(key, value) } });
  try {
    for (const label of ["Instagram", "X", "LinkedIn", "Facebook"]) {
      const updates = [], navigations = [];
      const choose = previewComponent(file, {}, { updates }).LandingHandleHero;
      findButton(choose({}), label).props.onClick();
      const selected = updates.find(([index]) => index === 0)[1];
      const component = previewComponent(file, { 0: selected, 1: "@fictional-qa" }, { navigations }).LandingHandleHero;
      await findButton(component({}), "Build my twin").props.onClick();
      const intent = JSON.parse(stored.get("syncedin.signupIntent"));
      assert.equal(intent.platform, selected.key);
      assert.equal(intent.profile_url, `https://${selected.prefix}fictional-qa`);
      assert.equal(new URL(navigations[0], "https://syncedin.org").searchParams.get("next"), "/onboarding?welcome=1");
    }
    const navigations = [];
    const component = previewComponent(file, { 1: "https://www.linkedin.com/in/fictional-person/?tracking=synthetic" }, { navigations }).LandingHandleHero;
    await findButton(component({}), "Build my twin").props.onClick();
    assert.equal(JSON.parse(stored.get("syncedin.signupIntent")).profile_url, "https://linkedin.com/in/fictional-person");
    assert.equal(navigations.length, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else delete globalThis.sessionStorage;
  }
});

test("profile-preview prompts ask for shareable facts rather than private history or inferred psychology", () => {
  const prompt = profileCopy.SHAREABLE_PROFILE_PROMPT;
  assert(prompt.includes("shareable professional summary"));
  assert(prompt.includes('write "unknown" instead of guessing'));
  assert(prompt.includes("Do not include credentials, raw conversation transcripts"));
  assert(prompt.includes("Do not infer psychological traits"));
  assert(!/Tell me everything|Quote exact phrases|haven't fully admitted|say yes to instantly/.test(prompt));
  assert.equal(profileCopy.PROFILE_PREVIEW_CONTEXT_LIMIT, 8000);
  assert(fs.readFileSync("app/api/portfolio-preview/route.ts", "utf8").includes(".slice(0, 8000)"));
  const html = renderToStaticMarkup(React.createElement(trustNote.TrustNote, { style: { textAlign: "left" } }));
  assert(html.includes("AI services process your context"));
  assert(html.includes('href="/privacy"') && html.includes("text-align:left"));
  assert(!html.includes("never shown to another human"));
});

test("profile previews reject incomplete responses and normalize only bounded display fields", () => {
  for (const value of [null, [], "text", {}, { error: "provider detail" }, { headline: "", about: "Text" }, { headline: "Text", about: " " }, { headline: 3, about: "Text" }]) assert.equal(profileResult.parseProfilePreview(value), null);
  const result = profileResult.parseProfilePreview({ headline: " H ", about: " A ", highlights: [null, " ", " First ", 4, "x".repeat(200), "Third", "Fourth", "Fifth"], people: [null, { name: "A" }, { name: " Alice ", why: "x".repeat(100) }, { name: " Bob " }], secret: "never copy this" });
  assert.deepEqual(result, { headline: "H", about: "A", highlights: ["First", "x".repeat(160), "Third", "Fourth"], people: [{ name: "Alice", why: "x".repeat(80) }, { name: "Bob", why: "" }] });
  const bounded = profileResult.parseProfilePreview({ headline: "h".repeat(300), about: "a".repeat(900), people: Array.from({ length: 9 }, () => ({ name: "n".repeat(100) })) });
  assert.equal(bounded.headline.length, 160);
  assert.equal(bounded.about.length, 600);
  assert.equal(bounded.people.length, 5);
  assert.equal(bounded.people[0].name.length, 60);
});

test("preview click handlers prevent duplicate requests, reject bad results and allow retry without losing context", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem: (key, value) => stored.set(key, value) } });
  try {
    for (const [file, name, label, resultIndex, errorIndex] of [
      ["app/ai-knows-me/AiKnowsMeFunnel.tsx", "AiKnowsMeFunnel", "Preview my profile", 10, 4],
      ["app/generate-free-portfolio/GeneratePortfolioForm.tsx", "GeneratePortfolioForm", "Generate my preview", 5, 4],
    ]) {
      const updates = [], events = [], calls = [];
      const dump = "A synthetic professional summary for QA only.";
      const component = previewComponent(file, { 0: "Fictional QA", 1: dump }, { updates, events })[name];
      const button = findButton(component(), label);
      assert(button, label);
      let resolveFetch;
      globalThis.fetch = (url, options) => { calls.push([url, options]); return new Promise(resolve => { resolveFetch = resolve; }); };
      const pending = button.props.onClick();
      await button.props.onClick();
      assert.equal(calls.length, 1, "A second click must not start another provider request");
      assert.deepEqual(JSON.parse(calls[0][1].body), { name: "Fictional QA", dump });
      resolveFetch(Response.json({ error: "private upstream detail" }, { status: 500 }));
      await pending;
      assert(!updates.some(([key, value]) => key === resultIndex && value), "Failure must not reveal a blank success card");
      assert(updates.some(([key, value]) => key === errorIndex && String(value).includes("try again")));
      assert(!JSON.stringify(updates).includes("private upstream detail"));
      assert(!updates.some(([key]) => key === 1), "Keep the user's summary on failure");
      assert.equal(JSON.parse(stored.get("syncedin-portfolio-seed")).dump, dump);
      for (const body of [{ headline: "Only a headline" }, null]) {
        globalThis.fetch = async () => Response.json(body);
        await button.props.onClick();
        assert(!updates.some(([key, value]) => key === resultIndex && value));
      }
      globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error("bad json"); } });
      await button.props.onClick();
      assert(!updates.some(([key, value]) => key === resultIndex && value));
      globalThis.fetch = async () => { throw new Error("private network detail"); };
      await button.props.onClick();
      assert(!JSON.stringify(updates).includes("private network detail"));
      assert(!updates.some(([key, value]) => key === resultIndex && value));
      const valid = { headline: "Synthetic QA", about: "A reviewed fictional profile.", highlights: ["Example"], people: [{ name: "Fictional Colleague", why: "Synthetic" }] };
      globalThis.fetch = async () => Response.json(valid);
      await button.props.onClick();
      assert(updates.some(([key, value]) => key === resultIndex && value?.headline === valid.headline), "Retry must release the in-flight guard");
      assert(events.some(([event]) => event === (name === "AiKnowsMeFunnel" ? "decode_done" : "generate_done")));
      assert(!/minShow|2800/.test(functionBody(file, name === "AiKnowsMeFunnel" ? "decode" : "generate")), "Do not impose a fake minimum generation delay");
    }
    assert.equal(JSON.parse(stored.get("syncedin-decode-people"))[0].name, "Fictional Colleague");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});

test("both preview tools retain labelled inputs, prompts, data handling notices and their signup handoff", () => {
  for (const [file, name, prefix] of [["app/ai-knows-me/AiKnowsMeFunnel.tsx", "AiKnowsMeFunnel", "ai-preview"], ["app/generate-free-portfolio/GeneratePortfolioForm.tsx", "GeneratePortfolioForm", "portfolio-preview"]]) {
    const component = previewComponent(file)[name];
    const html = renderToStaticMarkup(React.createElement(component));
    assert(html.includes(`for="${prefix}-name"`) && html.includes(`id="${prefix}-name"`));
    assert(html.includes(`for="${prefix}-context"`) && html.includes(`id="${prefix}-context"`));
    assert(html.includes(`aria-describedby="${prefix}-data-note"`));
    assert(html.includes("SyncedIn and its AI provider"));
    assert(html.includes("local prefill") && html.includes("8,000"));
    assert(html.includes('data-clarity-mask="True"'));
    assert(html.includes("Copy") && html.includes("preview"));
    const source = fs.readFileSync(file, "utf8");
    assert(source.includes('fetch("/api/portfolio-preview"'));
    assert(source.includes('"syncedin-portfolio-seed"'));
    assert(source.includes('href="/login?next=/onboarding"'));
    for (const claim of ["Takes ~10 seconds", "usually under 10 seconds", "while you sleep", "full answer here", "pulls out everything"]) assert(!html.includes(claim), claim);
  }
  const ai = previewComponent("app/ai-knows-me/AiKnowsMeFunnel.tsx");
  const html = renderToStaticMarkup(React.createElement(ai.AiKnowsMeFunnel));
  for (const url of ["https://chatgpt.com", "https://claude.ai/new", "https://gemini.google.com/app", "https://grok.com"]) assert(html.includes(`href="${url}"`), "Keep the existing AI-app links");
  const share = functionBody("app/ai-knows-me/AiKnowsMeFunnel.tsx", "shareTest");
  assert(share.includes("SHARE_TEXT") && share.includes("SHARE_URL"));
  assert(!/\b(?:dump|result|name)\b/.test(share), "Sharing the tool must not share a visitor's profile context");
});

test("preview loading, failure and result states retain the actions and expose accessible state", () => {
  const styles = postcss.parse(fs.readFileSync("app/guides/guides.module.css", "utf8"));
  let accessibleAccent = false;
  styles.walkRules(".toolSection", rule => rule.walkDecls("--amber-bright", declaration => { accessibleAccent = declaration.value === "var(--accent)"; }));
  assert(accessibleAccent, "Preview accents must use the contrast-tested guide colour in each theme");
  const result = { headline: "Fictional QA headline", about: "Synthetic preview, not customer data.", highlights: ["Synthetic example"], people: [{ name: "Fictional Reviewer", why: "Synthetic public context" }] };
  let component = previewComponent("app/ai-knows-me/AiKnowsMeFunnel.tsx", { 1: "A synthetic professional summary.", 5: "decoding" }).AiKnowsMeFunnel;
  let html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes('aria-busy="true"') && html.includes('aria-live="polite"'));
  component = previewComponent("app/ai-knows-me/AiKnowsMeFunnel.tsx", { 4: "Synthetic validation error" }).AiKnowsMeFunnel;
  html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes('role="alert"') && html.includes("Synthetic validation error"));
  component = previewComponent("app/ai-knows-me/AiKnowsMeFunnel.tsx", { 0: "A".repeat(150), 5: "reveal", 7: result.headline, 9: true, 10: result }).AiKnowsMeFunnel;
  html = renderToStaticMarkup(React.createElement(component));
  for (const label of ["Continue to my profile", "Share the preview tool", "Edit my summary", "Names to review"]) assert(html.includes(label), label);
  assert(html.includes('href="/login?next=/onboarding"'));
  assert(html.includes("overflow-wrap:anywhere"));
  component = previewComponent("app/generate-free-portfolio/GeneratePortfolioForm.tsx", { 3: true }).GeneratePortfolioForm;
  html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes('aria-busy="true"') && html.includes('disabled=""'));
  component = previewComponent("app/generate-free-portfolio/GeneratePortfolioForm.tsx", { 5: result }).GeneratePortfolioForm;
  html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes("Continue to my portfolio") && html.includes("Edit my summary"));
});

test("the link-profile tool retains read, continue and retry states and labels inferred categories safely", () => {
  let component = previewComponent("app/for/linkme/LinkmeImporter.tsx").LinkmeImporter;
  let html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes('for="linkme-profile-url"') && html.includes('id="linkme-profile-url"'));
  assert(html.includes('aria-describedby="linkme-import-note"'));
  assert(html.includes("Read profile") && html.includes('disabled=""'));
  component = previewComponent("app/for/linkme/LinkmeImporter.tsx", { 1: true }).LinkmeImporter;
  html = renderToStaticMarkup(React.createElement(component));
  assert(html.includes("Reading...") && html.includes('aria-busy="true"'));
  component = previewComponent("app/for/linkme/LinkmeImporter.tsx", { 3: "Synthetic import error" }).LinkmeImporter;
  assert(renderToStaticMarkup(React.createElement(component)).includes('role="alert"'));
  component = previewComponent("app/for/linkme/LinkmeImporter.tsx", { 2: { ok: true, name: "N".repeat(150), bio: "Synthetic test profile", links: [{ label: "A profile link", url: "https://example.invalid", intent: "social_linkedin" }, { label: "Unknown category", url: "https://example.invalid/other", intent: "__proto__" }] } }).LinkmeImporter;
  html = renderToStaticMarkup(React.createElement(component));
  for (const label of ["Continue to my twin", "Try a different URL", "LinkedIn", "Unknown category", "No profile photo"]) assert(html.includes(label), label);
  const source = fs.readFileSync("app/for/linkme/LinkmeImporter.tsx", "utf8");
  assert(source.includes('"syncedin_linkme_handoff_v1"'));
  assert(source.includes('"/onboarding?from=linkme"'));
  assert(source.includes("window.sessionStorage.setItem"));
});

test("public profile-entry pages preserve signed-in redirects and expose one branded usable experience", async () => {
  let user = null;
  const redirect = path => { throw new Error("redirect:" + path); };
  const ai = previewComponent("app/ai-knows-me/AiKnowsMeFunnel.tsx");
  const portfolio = previewComponent("app/generate-free-portfolio/GeneratePortfolioForm.tsx");
  const importer = previewComponent("app/for/linkme/LinkmeImporter.tsx");
  const common = { ...dependencies, "next/navigation": { redirect }, "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }, "../TrackBeacon": { TrackBeacon: () => null }, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css }, "../../guides/GuideLayout": layout, "../../guides/guides.module.css": { __esModule: true, default: css }, "./AiKnowsMeFunnel": ai, "./GeneratePortfolioForm": portfolio, "./LinkmeImporter": importer };
  for (const path of ["ai-knows-me", "generate-free-portfolio", "for/linkme"]) {
    const page = load(`app/${path}/page.tsx`, common);
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert(html.includes("SyncedIn home") && html.includes('href="/login"'));
    assert(html.includes('href="/privacy"') && html.includes('href="/agents"'));
    for (const claim of ["in seconds", "60 second test", "paid priority", "for $X", "every link you've added"]) assert(!html.includes(claim), claim);
    assert.equal(page.metadata.alternates.canonical, "https://syncedin.org/" + path);
    assert.equal(page.viewport.userScalable, true);
  }
  user = { id: "synthetic-user" };
  for (const path of ["ai-knows-me", "generate-free-portfolio"]) {
    const page = load(`app/${path}/page.tsx`, common);
    await assert.rejects(() => page.default({ searchParams: Promise.resolve({}) }), /redirect:\/onboarding/);
  }
  const preview = load("app/ai-knows-me/page.tsx", common);
  assert(await preview.default({ searchParams: Promise.resolve({ preview: "1" }) }), "Keep the existing signed-in preview mode");
});

test("the product FAQ exposes the same reviewed answers in native disclosures and structured data", () => {
  const page = load("app/faq/page.tsx", { ...dependencies, "lucide-react": icons, "@/lib/product-faq": productFaq, "../guides/GuideLayout": layout, "../guides/guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  const parsed = inspectPublicPage(`<html><body>${html}</body></html>`);
  assert.equal(parsed.headings.length, 1);
  assert.equal(new Set(productFaq.PRODUCT_FAQS.map(item => item.id)).size, 17);
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

test("the warm-introduction guide separates permission, a shareable summary and the actual introduction", () => {
  const page = load("app/guides/warm-introduction/page.tsx", dependencies);
  const html = renderToStaticMarkup(React.createElement(page.default));
  for (const section of ["Request to the connector", "Forwardable summary, written by the requester", "Permission check from the connector", "The shared introduction"]) assert(html.includes(section), section);
  for (const phrase of ["The names and work below are fictional", "Silence means permission", "not yet a yes to a meeting", "wait for the actual introduction permission"]) assert(html.toLowerCase().includes(phrase.toLowerCase()), phrase);
  assert(html.includes('href="/founders-vc"') && html.includes('href="/founders-cofounder"'));
  assert(html.includes("the-double-optin-introduction"));
  assert(html.includes("how-to-email-early-stage-investors"));
  assert(!/guaranteed reply|10x|response rate of/.test(html));
  assert.equal((html.match(/<blockquote/g) || []).length, 4);
});

test("the guide hub links every completed guide and reserves image dimensions without eager-loading the whole list", () => {
  const page = load("app/guides/page.tsx", { ...dependencies, "lucide-react": icons, "./GuideLayout": layout, "./guides.module.css": { __esModule: true, default: css } });
  const html = renderToStaticMarkup(React.createElement(page.default));
  for (const guide of guides.NETWORKING_GUIDES) assert(html.includes(`href="/guides/${guide.slug}"`));
  assert.equal((html.match(/loading="eager"/g) || []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) || []).length, guides.NETWORKING_GUIDES.length - 2);
  assert.equal((html.match(/width="1200" height="630"/g) || []).length, guides.NETWORKING_GUIDES.length);
});

test("the public footer exposes FAQ and keeps all original links without leaking onto private chat surfaces", () => {
  let pathname = "/guides";
  const footer = load("app/Footer.tsx", { "react/jsx-runtime": jsx, "next/link": nextLink, "next/navigation": { usePathname: () => pathname }, "@/lib/version": { BUILD_SHA: "test-build" } });
  const html = renderToStaticMarkup(React.createElement(footer.Footer));
  for (const href of ["/about", "/guides", "/blog", "/faq", "/wins", "/hypernetwork", "/feedback", "/privacy", "/terms", "/support", "mailto:jacksonjezio@gmail.com"]) assert(html.includes(`href="${href}"`));
  assert(!html.includes("hover:text-white"), "Light-theme links must not become white on hover");
  for (const path of ["/login", "/onboarding", "/settings/notifications", "/dashboard", "/messages", "/conversations/test", "/admin/status", "/talk", "/twin", "/chat/example"]) {
    pathname = path;
    assert.equal(renderToStaticMarkup(React.createElement(footer.Footer)), "", path);
  }
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

test("existing plain-text references share reviewed product facts without invented funding, pricing or access claims", async () => {
  const expected = JSON.parse(fs.readFileSync("verification/product-reference-manifest.json", "utf8"));
  for (const [path, constant] of [["llms.txt", "PRODUCT_REFERENCE_SHORT"], ["llms-full.txt", "PRODUCT_REFERENCE_FULL"]]) {
    const route = load(`app/${path}/route.ts`, { "next/server": nextServer, "@/lib/product-reference": productReference });
    const response = route.GET();
    assert.equal(response.status, 200);
    assert(response.headers.get("content-type").includes("text/plain"));
    const text = await response.text();
    assert.equal(text, productReference[constant]);
    const reference = expected.find(item => item.path === "/" + path);
    assert.equal(crypto.createHash("sha256").update(text).digest("hex"), reference.sha256);
    assert.equal(Buffer.byteLength(text), reference.bytes);
    for (const claim of ["$20M", "Founded: 2025", "30-60 seconds", "100% replicable", "unlimited outbound", "Stripe Connect", "Next.js 14", "adopted by every major"]) assert(!text.includes(claim), claim);
    assert(text.includes("do not retrain the underlying model"));
    assert(text.includes("simulated recipient-side"));
    assert(text.includes("Saving a phone number is separate"));
    for (const path of ["/about", "/faq", "/guides/warm-introduction", "/privacy", "/join.md"]) assert(text.includes("https://syncedin.org" + path));
  }
  assert(productReference.PRODUCT_REFERENCE_FULL.includes("24-hour lifetime"));
  const fallback = fs.readFileSync("public/llms.txt", "utf8");
  assert.equal(fallback, productReference.PRODUCT_REFERENCE_SHORT, "Static fallback and app route must never disagree");
  assert(fallback.includes("not a search-engine ranking requirement"));
  assert(!/training signal|free forever|every cold outreach|Careers:/.test(fallback));
});

test("IndexNow accepts only a bounded deduplicated batch of exact reviewed public canonical URLs", () => {
  const origin = "https://syncedin.org";
  assert.deepEqual(indexNow.canonicalIndexNowUrls([origin, origin + "/", origin + "/guides", origin + "/guides"]), [origin + "/", origin + "/guides"]);
  for (const card of cards) assert.deepEqual(indexNow.canonicalIndexNowUrls([origin + card.path]), [origin + card.path]);
  for (const input of [null, {}, [], "not-an-array", Array(101).fill(origin + "/guides"), [42]]) assert.equal(indexNow.canonicalIndexNowUrls(input), null);
  for (const path of ["/login", "/dashboard", "/careers", "/poll/public-123", "/u/someone", "/api/indexnow", "/conversations/private", "/unknown", "/guides/", "/guides?email=someone@example.com", "/guides#part", "/guides/../faq", "/%67uides"]) assert.equal(indexNow.canonicalIndexNowUrls([origin + path]), null, path);
  for (const url of ["http://syncedin.org/guides", "https://www.syncedin.org/guides", "https://syncedin.org.evil.example/guides", "https://name:password@syncedin.org/guides", "https://syncedin.org:443/guides", "https://syncedin.org\\@evil.example/guides", " https://syncedin.org/guides", "https://syncedin.org/\nguides"]) assert.equal(indexNow.canonicalIndexNowUrls([url]), null, url);
  assert.equal(indexNow.canonicalIndexNowUrls([origin + "/guides", origin + "/login"]), null, "Reject the entire mixed batch rather than silently submit part");
  const payload = indexNow.indexNowPayload([origin + "/guides"]);
  assert.equal(payload.host, "syncedin.org");
  assert.equal(payload.keyLocation, `${origin}/${payload.key}.txt`);
  assert.deepEqual(payload.urlList, [origin + "/guides"]);
});

function indexNowRoute(getUser) {
  return load("app/api/indexnow/route.ts", {
    "next/server": nextServer,
    "@/lib/indexnow": indexNow,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser } }) },
  });
}
const notificationRequest = (body, origin = "https://syncedin.org") => new Request("https://syncedin.org/api/indexnow", { method: "POST", headers: { "content-type": "application/json", origin }, body: typeof body === "string" ? body : JSON.stringify(body) });
const verifiedOwner = { email: "jacksonjezio@gmail.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

test("IndexNow GET never queries data or submits URLs, and POST requires the verified existing owner", async () => {
  let authCalls = 0;
  let user = null;
  const route = indexNowRoute(async () => { authCalls++; return { data: { user } }; });
  const response = route.GET(new Request("https://syncedin.org/api/indexnow?url=https://syncedin.org/guides"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(authCalls, 0);
  assert.equal((await route.POST(notificationRequest({ urls: [] }))).status, 401);
  user = { ...verifiedOwner, email: "not-the-owner@example.invalid" };
  assert.equal((await route.POST(notificationRequest({ urls: [] }))).status, 403);
  user = { email: verifiedOwner.email };
  assert.equal((await route.POST(notificationRequest({ urls: [] }))).status, 403);
  user = verifiedOwner;
  assert.equal((await route.POST(notificationRequest({ urls: [] }, "https://other.example"))).status, 403);
  for (const body of ["not-json", "null", "[]", "{}", { urls: ["https://syncedin.org/login"] }]) assert.equal((await route.POST(notificationRequest(body))).status, 400);
  assert.equal((await route.POST(notificationRequest(" ".repeat(32001)))).status, 413);
  const source = fs.readFileSync("app/api/indexnow/route.ts", "utf8");
  assert(!/createServiceClient|\.from\(|buildAllUrls|Promise\.all/.test(source), "Notification must not enumerate customer profiles/polls or broadcast repeatedly");
});

test("IndexNow makes one bounded notification and distinguishes received from pending key validation", async () => {
  const route = indexNowRoute(async () => ({ data: { user: verifiedOwner } }));
  const previous = globalThis.fetch;
  const calls = [];
  try {
    for (const status of [200, 202]) {
      globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response("", { status }); };
      const response = await route.POST(notificationRequest({ urls: ["https://syncedin.org/guides", "https://syncedin.org/guides"] }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.deepEqual(await response.json(), { notificationStatus: status === 202 ? "key_validation_pending" : "received", notifiedURLs: 1, indexing: "not_verified" });
      const call = calls.at(-1);
      assert.equal(call.url, indexNow.INDEXNOW_ENDPOINT);
      assert.equal(call.options.redirect, "error");
      assert(call.options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(call.options.body).urlList, ["https://syncedin.org/guides"]);
    }
    assert.equal(calls.length, 2, "Exactly one upstream request per approved batch");
    globalThis.fetch = async () => new Response("private provider diagnostics", { status: 429 });
    const rejected = await route.POST(notificationRequest({ urls: ["https://syncedin.org/guides"] }));
    assert.equal(rejected.status, 502);
    assert.deepEqual(await rejected.json(), { error: "notification_not_confirmed", upstreamStatus: 429 });
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; throw new Error("private failure details"); };
    const uncertain = await route.POST(notificationRequest({ urls: ["https://syncedin.org/guides"] }));
    assert.equal(uncertain.status, 502);
    assert.deepEqual(await uncertain.json(), { error: "notification_not_confirmed" });
    assert.equal(attempts, 1, "Never retry an uncertain submission automatically");
  } finally {
    globalThis.fetch = previous;
  }
});

test("IndexNow authentication failures remain closed without exposing service details", async () => {
  const route = indexNowRoute(async () => { throw new Error("private authentication diagnostics"); });
  const response = await route.POST(notificationRequest({ urls: ["https://syncedin.org/guides"] }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "authentication_unavailable" });
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
