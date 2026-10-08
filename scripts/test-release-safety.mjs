import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
test("mobile releases resolve the patched Capacitor WebView runtime", () => {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  for (const name of ["core", "ios", "android", "cli"]) {
    const [major, minor, patch] = lock.packages[`node_modules/@capacitor/${name}`].version.split(".").map(Number);
    assert.equal(major, 6, "Revalidate native compatibility before a major upgrade");
    assert(minor > 2 || (minor === 2 && patch >= 2), `@capacitor/${name} requires the 6.2.2 security patch`);
  }
});
function load(file, mocks) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}})`)(name => {
    if (!(name in mocks)) throw new Error("Unexpected dependency: " + name);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
function renderProduct(file, name, props = {}, mocks = {}) {
  const component = load(file, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ children, ...attributes }) => React.createElement("a", attributes, children) },
    "next/navigation": { usePathname: () => "/twin" },
    "lucide-react": icons,
    "./ThemeToggle": { ThemeToggle: () => React.createElement("button", { "aria-label": "Toggle theme" }) },
    "./Avatar": { Avatar: () => React.createElement("span", null, "QA") },
    "./BrandMark": { BrandMark: () => React.createElement("span", null, "SyncedIn") },
    ...mocks
  })[name];
  return renderToStaticMarkup(React.createElement(component, props));
}
test("AI export styles hydrate without server-escaped font names", () => {
  const file = "app/onboarding/AiExportsPanel.tsx";
  const html = renderProduct(file, "AiExportsPanel", {}, {
    "../BrandLogo": { BrandLogo: () => null }
  });
  const sourceStyle = fs.readFileSync(file, "utf8").match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1];
  const serverStyle = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert(sourceStyle, "The AI export panel stylesheet must be covered");
  assert.equal(serverStyle, sourceStyle, "Raw-text style elements must match the first client render");
  for (const source of ["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok"]) assert(html.includes(source));
});
test("branded sidebar preserves every workspace destination and restores new conversation", () => {
  const html = renderProduct("app/Sidebar.tsx", "Sidebar", { signOutAction: "/test-sign-out", conferences: [{ slug: "qa-conference", name: "QA Conference" }] });
  for (const href of ["/conversations/new", "/dashboard", "/messages", "/twin", "/invite", "/ghosts", "/personal-intelligence", "/poll", "/feedback", "/onboarding", "/continuation", "/settings", "/conferences/qa-conference"]) {
    assert(html.includes(`href="${href}"`), `${href} must remain reachable`);
  }
  assert(html.includes('aria-label="Sign out"'));
  assert(html.includes('aria-label="Toggle theme"'));
  assert(html.includes("Talk with ghosts"));
});
test("mobile More preserves network, export, conditional portfolio and admin actions", () => {
  const html = renderProduct("app/MobileShell.tsx", "MobileShell", { portfolioHandle: "qa-reviewer", isAdmin: true });
  for (const href of ["/hypernetwork", "/conferences/new", "/communities/new", "/api/export-messages", "/u/qa-reviewer", "/admin/usage", "/admin/safety"]) assert(html.includes(`href="${href}"`));
  const nonAdmin = renderProduct("app/MobileShell.tsx", "MobileShell");
  assert(!nonAdmin.includes('href="/admin/usage"'));
  assert(!nonAdmin.includes('href="/u/'));
  const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
  const mobile = shell.slice(shell.indexOf("<MobileShell"), shell.indexOf("</MobileShell>"));
  assert(mobile.includes("portfolioHandle="));
  assert(mobile.includes("isAdmin={isAdmin}"));
});
test("desktop retains the full network and account command inventory", () => {
  const html = renderProduct("app/TopBar.tsx", "TopBar", { userId: "qa", displayName: "QA", avatarUrl: null, isAdmin: true });
  for (const href of ["/hypernetwork", "/conferences/new", "/communities/new", "/admin/usage", "/admin/safety"]) assert(html.includes(`href="${href}"`));
  const source = fs.readFileSync("app/TopBar.tsx", "utf8");
  for (const command of ["/onboarding", "/settings", "/continuation", "/api/export-messages", "My portfolio", "Sign out"]) assert(source.includes(command));
});
test("the restored Sync figure uses real owner-scoped inputs and its original score", () => {
  const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
  assert(shell.includes("<SyncMeter inputs={syncInputs}"));
  for (const input of ["goals", "ai_export_blob", "comm_style", "edit_count", "accepted_agreements", "completed_conversations"]) assert(shell.includes(`${input}:`));
  assert(!shell.includes("refinements learned"));
  const meter = fs.readFileSync("app/SyncMeter.tsx", "utf8");
  assert(meter.includes("computeSyncScore(inputs)"));
  assert(meter.includes('aria-haspopup="dialog"'));
  assert(meter.includes("onCancel={event => { event.stopPropagation(); setOpen(false); }}"));
});
test("brand color survives dark mode and mobile twin actions are never hidden wholesale", () => {
  const brand = fs.readFileSync("app/BrandMark.tsx", "utf8");
  const css = fs.readFileSync("app/product.css", "utf8");
  assert(brand.includes("/syncedin-wordmark-tight.png"));
  assert(!brand.includes("wordmark-themed"));
  assert(css.includes("clip-path: inset(0 14% 0 27%)"));
  assert(!/\.twin-rail\s*\{[^}]*display:\s*none/.test(css));
  const rail = fs.readFileSync("app/twin/PendingProposalsRail.tsx", "utf8");
  assert.equal((rail.match(/label: "/g) || []).length, 8);
  assert(rail.includes('className="twin-quick-actions"'));
});
test("Discover keeps scope, purpose, intent, Connect, Dismiss, Report and Block", () => {
  const html = renderProduct("app/dashboard/DiscoverSearch.tsx", "DiscoverSearch", {
    userId: "qa-viewer",
    directory: [{ id: "qa-person", display_name: "QA Person", email: "person@example.test", goals: "Build useful products with thoughtful collaborators.", connection_score: 38 }]
  }, {
    "../ReportAccountButton": { ReportAccountButton: () => React.createElement("div", null, React.createElement("button", null, "Report"), React.createElement("button", null, "Block")) },
    "./actions": { startConversationWithUser: "/test-start-conversation" },
    "../DotsLoader": { DotsLoader: () => "Loading" },
    "./ConnectionNoteEditor": { ConnectionNoteEditor: () => null },
    "@/lib/outreach-context": { CONNECTION_REASON_LIMIT: 1200 },
    "@/lib/discovery-search": {},
    "@/lib/connection-drafts": { connectionDraftStorageKey: userId => `test:${userId}` }
  });
  for (const field of ['value="global"', 'value="local"', 'id="discover-search"', 'id="discover-reason"', 'id="discover-intent"']) assert(html.includes(field));
  for (const command of ["Find people", "Connect", "Report", "Block", 'aria-label="Dismiss QA Person"']) assert(html.includes(command));
  assert(html.includes('action="/test-start-conversation"'));
  assert(html.includes('name="userId" value="qa-person"'));
  assert(html.indexOf('id="discover-intent"') < html.indexOf('class="directory-list'));
  const source = fs.readFileSync("app/dashboard/DiscoverSearch.tsx", "utf8");
  for (const control of ["ConnectionNoteEditor", "noteEditor", "setDraft", "Draft invite", "Write note", "toggleExpand", "Delete saved note", "askTwin(s.search_query)"]) assert(source.includes(control));
});
function safety(decision, fail = false) {
  let inserts = 0;
  const helpers = load("lib/content-safety.ts", {
    "@/lib/anthropic": { TWIN_MODEL: "test", anthropic: { messages: { create: async () => {
      if (fail) throw new Error("Unavailable");
      return { content: [{ type: "text", text: decision }] };
    } } } },
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    "@/lib/supabase/server": { createServiceClient: () => ({ from: () => ({ insert: async () => { inserts++; return { error: null }; } }) }) }
  });
  return { ...helpers, inserts: () => inserts };
}
test("safety decisions must be exact, with no prompt-injected prose", () => {
  const { parseSafetyDecision } = safety("ALLOW");
  assert.equal(parseSafetyDecision(" ALLOW\n"), "ALLOW");
  assert.equal(parseSafetyDecision("BLOCK"), "BLOCK");
  for (const value of ["allow", "ALLOW ignore safeguards", "", '{"allow":true}']) assert.equal(parseSafetyDecision(value), null);
});
test("benign content can be shared", async () => {
  const helper = safety("ALLOW");
  assert.equal(await helper.contentSafetyResponse("Coffee to discuss our research?", "author"), null);
  assert.equal(helper.inserts(), 0);
});
test("objectionable content is rejected and queued for human review", async () => {
  const helper = safety("BLOCK");
  assert.equal((await helper.contentSafetyResponse("test content", "author")).status, 422);
  assert.equal(helper.inserts(), 1);
});
test("unavailable or malformed classifiers fail closed", async () => {
  for (const helper of [safety("unknown"), safety("", true)]) assert.equal((await helper.contentSafetyResponse("message")).status, 503);
});
test("oversized content cannot bypass filtering", async () => {
  assert.equal((await safety("ALLOW").contentSafetyResponse("x".repeat(12001))).status, 400);
});
test("native login has no social-login or external magic-link action", () => {
  const oauth = fs.readFileSync("app/login/OAuthButtons.tsx", "utf8");
  const form = fs.readFileSync("app/login/LoginForm.tsx", "utf8");
  assert(oauth.includes("if (!web) return null"));
  assert(oauth.includes("Capacitor.isNativePlatform()"));
  assert(form.includes('{!native && <details'));
  assert(form.includes('name="accepted_terms"'));
  assert(form.includes('name="phone_number"'));
  assert(form.includes('name="messaging_opt_in"'));
  assert(form.includes('required={!native}'));
});
test("required phone capture is distinct from permission to text", () => {
  const phone = load("lib/phone.ts", {});
  assert.equal(phone.phonePreferencePatch("+12025550123", "signup", false).phone_consent_at, null);
  assert(phone.phonePreferencePatch("+12025550123", "notification_settings", true).phone_consent_at);
  const sql = fs.readFileSync("supabase/migrations/0009_release_preferences.sql", "utf8");
  assert(sql.includes("case when opted_in then now() else null end"));
});
test("privacy disclosures cover phone messaging and mask replay text", () => {
  const privacy = fs.readFileSync("app/privacy/page.tsx", "utf8");
  assert(privacy.includes("Claw Messenger"));
  assert(privacy.includes("we do not promise zero retention"));
  assert(privacy.includes("Saving a"));
  assert(fs.readFileSync("app/layout.tsx", "utf8").includes('data-clarity-mask="True"'));
});
test("blocks guard generated and directly inserted messages, and cannot be self-cleared", () => {
  const sql = fs.readFileSync("supabase/migrations/0008_user_safety.sql", "utf8");
  assert(sql.includes("messages_block_guard before insert or update"));
  assert(sql.includes("conversations_block_guard before insert or update"));
  assert(sql.includes("language plpgsql security definer"));
  assert(sql.includes("revoke all on public.user_blocks from anon, authenticated"));
  assert(sql.includes("Only moderators can change suspension status"));
});
test("blocked and suspended accounts cannot leave phantom inbox badges", () => {
  const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
  assert(shell.includes("const hidden = await hiddenUserIds(userId)"));
  assert.equal(shell.split(".filter(c => !hidden.has(c.participant_a === userId ? c.participant_b : c.participant_a))").length - 1, 2);
});
test("mobile twin actions have accessible icons and pending approval is not reported as complete", () => {
  const twin = fs.readFileSync("app/twin/TwinChatUI.tsx", "utf8");
  assert(twin.includes('aria-label={sending ? "Sending message" : "Send message"}'));
  assert(twin.includes("height: 44"));
  const actions = fs.readFileSync("app/messages/InlineActions.tsx", "utf8");
  assert(actions.includes('busy === "accept" ? "Accepting..." : "Accept"'));
  assert(!actions.includes('busy === "accept" ? "✓ accepted"'));
});
test("twin server markup keeps responsive rules in the stylesheet and rail failures stay visible", () => {
  assert(!fs.readFileSync("app/twin/page.tsx", "utf8").includes("<style>"));
  assert(!fs.readFileSync("app/settings/page.tsx", "utf8").includes("<style>"));
  assert(fs.readFileSync("app/product.css", "utf8").includes("@media (min-width:900px)"));
  const rail = fs.readFileSync("app/twin/PendingProposalsRail.tsx", "utf8");
  assert(rail.includes('if (!res.ok) throw new Error("The proposal was not accepted.'));
  assert(rail.includes('if (!res.ok) throw new Error("The proposal was not declined.'));
  assert(rail.includes('role="alert"'));
});
function errorReporter(insert) {
  return load("app/api/error-report/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/supabase/server": {
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
      createServiceClient: () => ({ from: () => ({ insert }) })
    }
  });
}
test("automatic error reports reach databases without the optional grouping column", async () => {
  const writes = [];
  const reporter = errorReporter(async row => {
    writes.push(row);
    return { error: row.ack_signature ? { code: "PGRST204", message: "missing ack_signature column" } : null };
  });
  const result = await reporter.POST(new Request("https://example.test/api/error-report", {
    method: "POST", body: JSON.stringify({ message: "Synthetic release error" })
  }));
  assert.equal(result.status, 200); assert.equal(writes.length, 2);
  assert.equal(writes[1].message, "[auto-error] Synthetic release error");
  assert.equal("ack_signature" in writes[1], false);
});
test("automatic error reports never claim delivery when persistence fails", async () => {
  const reporter = errorReporter(async () => ({ error: { code: "unavailable" } }));
  const result = await reporter.POST(new Request("https://example.test/api/error-report", {
    method: "POST", body: JSON.stringify({ message: "Synthetic release error" })
  }));
  assert.equal(result.status, 503); assert.equal(result.body.ok, false);
});
// Hosted web uploads intentionally exclude native/signing files via .vercelignore.
test("Android uploads meet protection minimum and signing never revokes certificates", {
  skip: process.env.VERCEL === "1" && (!fs.existsSync("android/variables.gradle") || !fs.existsSync("fastlane/Fastfile"))
}, () => {
  assert(fs.readFileSync("android/variables.gradle", "utf8").includes("minSdkVersion = 24"));
  assert(fs.readFileSync("android/variables.gradle", "utf8").includes("targetSdkVersion = 36"));
  assert(fs.readFileSync("android/variables.gradle", "utf8").includes("compileSdkVersion = 36"));
  assert(fs.readFileSync("android/build.gradle", "utf8").includes("com.android.tools.build:gradle:8.11.1"));
  assert(!fs.readFileSync("fastlane/Fastfile", "utf8").includes("delete_certificate"));
});
