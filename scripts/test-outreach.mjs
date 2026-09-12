import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts", mocks);
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`, { filename })(
    localRequire, module, module.exports, process
  );
  return module.exports;
}

const context = {
  person_title: "Alex Rivera, climate founder",
  person_url: "https://example.com/alex",
  person_background: "Founder researching climate adaptation and carbon removal.",
  search_query: "climate founders",
  connection_reason: "Invite them to a research dinner"
};
const note = "Alex, your carbon-removal research caught my eye. I'm bringing climate founders together for a small research dinner. Would you be interested?";
const helpers = load("lib/outreach-context.ts");

function fixture({ authenticated = true, failSave = false, missingMemory = false, failInvite = false, emptyModel = false, liveModel = false, city = "Los Angeles", hometown = "Austin" } = {}) {
  const rows = new Map();
  const prompts = [];
  const reads = [];
  const searches = [];
  const inserts = [];
  const people = [
    { title: "Strongest topic match", url: "https://example.com/global", highlights: ["AI reasoning researcher in London"] },
    { title: "Local researcher", url: "https://example.com/local", highlights: ["AI reasoning researcher in Los Angeles"] }
  ];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: "owner" } : null } }) },
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        or() { return query; },
        neq() { return query; },
        in(key, value) { filters[key] = value; return query; },
        order() { return query; },
        limit() { return query; },
        single() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          reads.push({ table, filters });
          let data = null;
          if (table === "profiles") data = { display_name: "Taylor", email: "taylor@example.com" };
          if (table === "profiles" && !filters.id) data = [];
          if (table === "twin_profiles") data = { goals: "Raise funding for my company", current_city: city, hometown, ai_export_blob: "I live in Los Angeles and study AI reasoning." };
          if (table === "outreach_examples") data = [...rows.values()].filter((row) => row.user_id === filters.user_id);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
        async upsert(row) {
          if (missingMemory) return { error: { code: "PGRST205", message: "missing table" } };
          if (failSave) return { error: { message: "database unavailable" } };
          rows.set(`${row.user_id}:${row.context_key}`, row);
          return { error: null };
        },
        async insert(row) { inserts.push({ table, row }); return { error: failInvite ? { message: "database unavailable" } : null }; }
      };
      return query;
    }
  };
  const mocks = {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/supabase/server": { createClient: () => client, createServiceClient: () => client },
    "@/lib/exa": { exaGetContents: async () => context.person_background, exaPeopleSearch: async (query) => { searches.push(query); return people; } },
    "@/lib/anthropic": { TWIN_MODEL: "test-model", anthropic: { messages: { create: async (input) => {
      prompts.push(input);
      if (emptyModel) return { content: [] };
      if (liveModel) {
        const { anthropic, TWIN_MODEL } = load("lib/anthropic.ts");
        return anthropic.messages.create({ ...input, model: TWIN_MODEL });
      }
      if (input.max_tokens === 700) return { content: [{ type: "text", text: JSON.stringify({ suggestions: [{ rationale: "Researchers working on related ideas", search_query: "AI reasoning researchers" }] }) }] };
      return { content: [{ type: "text", text: input.max_tokens === 300 ? "x".repeat(310) : "A relevant opening." }] };
    } } } }
  };
  return { rows, reads, prompts, searches, inserts,
    find: load("app/api/find-counterpart/route.ts", mocks).POST,
    suggest: load("app/api/twin-suggest-connections/route.ts", mocks).POST,
    save: load("app/api/outreach-feedback/route.ts", mocks).POST,
    draft: load("app/api/exa-draft-outreach/route.ts", mocks).POST };
}
const request = (body) => new Request("http://localhost/api/outreach-feedback", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

test("300-character notes survive; longer generated notes are capped and dashes scrubbed", () => {
  assert.equal(helpers.capConnectionNote("a".repeat(300)).length, 300);
  assert.equal(helpers.capConnectionNote("a".repeat(301)).length, 300);
  assert.equal(helpers.capConnectionNote("Hi \u2014 let's connect"), "Hi, let's connect");
});

test("authentication is required before reading or saving examples", async () => {
  const f = fixture({ authenticated: false });
  assert.equal((await f.save(request({ ...context, edited_text: note }))).status, 401);
  assert.equal((await f.draft(request(context))).status, 401);
  assert.equal(f.rows.size, 0);
  assert.equal(f.reads.length, 0);
});

test("rejects malformed, blank, and oversized notes without a write", async () => {
  const f = fixture();
  for (const body of [null, [], { ...context, edited_text: " " }, { ...context, edited_text: "a".repeat(301) },
    { ...context, edited_text: note, original_draft: "a".repeat(301) }]) {
    assert.equal((await f.save(request(body))).status, 400);
  }
  assert.equal(f.rows.size, 0);
});

test("pasted notes are owned by the signed-in user and exact-context saves are idempotent", async () => {
  const f = fixture();
  const body = { ...context, edited_text: note, user_id: "another-user" };
  assert.equal((await f.save(request(body))).status, 200);
  assert.equal((await f.save(request({ ...body, edited_text: "Updated wording." }))).status, 200);
  assert.equal(f.rows.size, 1);
  const row = [...f.rows.values()][0];
  assert.equal(row.user_id, "owner");
  assert.equal(row.edited_text, "Updated wording.");
  assert.equal(row.person_background, context.person_background);
  assert.equal(row.edit_magnitude, null);
  await f.save(request({ ...body, connection_reason: "Ask about seed investment" }));
  assert.equal(f.rows.size, 2);
});

test("edits retain the original draft and measure the correction", async () => {
  const f = fixture();
  await f.save(request({ ...context, edited_text: note, original_draft: "I'd love to explore synergies." }));
  const row = [...f.rows.values()][0];
  assert.equal(row.original_draft, "I'd love to explore synergies.");
  assert.ok(row.edit_magnitude > 0);
  assert.ok(row.change_tags.includes("remove_hedging"));
});

test("failed writes never return a false success", async () => {
  const f = fixture({ failSave: true });
  const response = await f.save(request({ ...context, edited_text: note }));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).ok, undefined);
});

test("a saved contextual example reaches future drafts; current purpose has priority", async () => {
  const f = fixture();
  await f.save(request({ ...context, original_draft: "Let's discuss funding.", edited_text: note }));
  f.rows.set("someone-else", { ...context, user_id: "someone-else", edited_text: "PRIVATE OTHER USER NOTE" });
  const response = await f.draft(request({ ...context, person_title: "Morgan, climate scientist", highlights: [context.person_background] }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.short_message.length, 300);
  assert.equal(data.person_background, context.person_background);
  assert.equal(f.prompts.length, 3);
  for (const prompt of f.prompts) {
    assert.ok(prompt.system.includes(note));
    assert.ok(prompt.system.includes(context.connection_reason));
    assert.ok(prompt.system.includes("prioritize it over their general networking goals"));
    assert.ok(prompt.system.includes("Use only examples that fit both the audience and purpose"));
    assert.ok(!prompt.system.includes("PRIVATE OTHER USER NOTE"));
  }
  assert.ok(f.reads.some((read) => read.table === "outreach_examples" && read.filters.user_id === "owner"));
});

test("live model respects matching examples and a changed outreach purpose", { skip: process.env.OUTREACH_LIVE_EVAL !== "1" }, async () => {
  const f = fixture({ liveModel: true });
  await f.save(request({ ...context, edited_text: note }));
  for (const reason of ["Invite them to a research dinner", "Ask for a short research interview about carbon removal, no dinner or funding pitch"]) {
    const response = await f.draft(request({ ...context, mode: "connection_note", person_title: "Morgan Lee, carbon removal scientist", connection_reason: reason }));
    assert.equal(response.status, 200);
    const { short_message: message } = await response.json();
    console.log(JSON.stringify({ reason, message, characters: message.length }));
    assert.ok(message.length <= 300);
    assert.ok(!/syncedin|fundrais|\u2014|\u2013/i.test(message));
    if (reason.startsWith("Invite")) assert.match(message, /dinner/i);
    else {
      assert.match(message, /interview/i);
      assert.doesNotMatch(message, /dinner/i);
    }
  }
});

test("Discover note mode makes one model call and never creates a hidden invite", async () => {
  const f = fixture();
  await f.save(request({ ...context, edited_text: note }));
  const response = await f.draft(request({ ...context, mode: "connection_note" }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.short_message.length, 300);
  assert.equal(data.invite_url, undefined);
  assert.equal(f.prompts.length, 1);
  assert.ok(f.prompts[0].system.includes(note));
  assert.equal(f.inserts.length, 0);
  assert.ok(!f.reads.some((read) => read.table === "pending_invites"));
});

test("invalid modes and empty generations fail without creating an invite", async () => {
  const f = fixture({ emptyModel: true });
  assert.equal((await f.draft(request({ ...context, mode: "bad-mode" }))).status, 400);
  assert.equal(f.prompts.length, 0);
  assert.equal((await f.draft(request({ ...context, mode: "connection_note" }))).status, 502);
  assert.equal(f.inserts.length, 0);
});

test("legacy invite mode never reports a nonexistent landing page as ready", async () => {
  const f = fixture({ failInvite: true });
  const response = await f.draft(request(context));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).invite_url, undefined);
  assert.equal(f.prompts.length, 3);
});

test("missing memory migration is distinguished from a retryable save failure", async () => {
  const f = fixture({ missingMemory: true });
  const response = await f.save(request({ ...context, edited_text: note }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /has not been learned/);
});

test("draft identity separates purpose, audience query, and recipient", () => {
  const { connectionDraftKey, connectionDraftStorageKey } = load("lib/connection-drafts.ts");
  const key = connectionDraftKey(context);
  for (const patch of [{ connection_reason: "Funding" }, { search_query: "Other audience" }, { person_url: "https://example.com/other" }]) {
    assert.notEqual(connectionDraftKey({ ...context, ...patch }), key);
  }
  assert.equal(connectionDraftKey({ ...context, connection_reason: ` ${context.connection_reason} ` }), key);
  assert.notEqual(connectionDraftStorageKey("user-one"), connectionDraftStorageKey("user-two"));
});

test("draft recovery preserves edits and their original context but clears interrupted loading", () => {
  const { connectionDraftKey, serializeConnectionDrafts, restoreConnectionDrafts } = load("lib/connection-drafts.ts");
  const now = Date.now();
  const draft = { context, shortText: note, originalShortText: "Original note", generating: true, error: "old error", updatedAt: now };
  const encoded = serializeConnectionDrafts(new Map([[connectionDraftKey(context), draft]]), now);
  const restored = restoreConnectionDrafts(encoded, now).get(connectionDraftKey(context));
  assert.deepEqual(restored.context, context);
  assert.equal(restored.shortText, note);
  assert.equal(restored.originalShortText, "Original note");
  assert.equal(restored.generating, false);
  assert.match(restored.error, /interrupted/);
  assert.equal(restoreConnectionDrafts(encoded, now + 8 * 86400000).size, 0);
});

test("browser draft storage is bounded and rejects corrupt or unsafe entries", () => {
  const { connectionDraftKey, serializeConnectionDrafts, restoreConnectionDrafts } = load("lib/connection-drafts.ts");
  const now = Date.now();
  const draft = { context, shortText: note, originalShortText: "", generating: false, updatedAt: now };
  for (const raw of ["{", "{}", "[null]", JSON.stringify([{ ...draft, context: { ...context, person_url: "javascript:alert(1)" } }]),
    JSON.stringify([{ ...draft, shortText: "a".repeat(301) }]), JSON.stringify([{ ...draft, updatedAt: now + 1000 }])]) {
    assert.equal(restoreConnectionDrafts(raw, now).size, 0);
  }
  const drafts = new Map(Array.from({ length: 60 }, (_, index) => {
    const entry = { ...draft, context: { ...context, connection_reason: String(index) }, updatedAt: now - index };
    return [connectionDraftKey(entry.context), entry];
  }));
  assert.equal(restoreConnectionDrafts(serializeConnectionDrafts(drafts, now), now).size, 50);
});

function authFixture({ passwordError = null, signupResult = { data: { user: { identities: [{}] }, session: null }, error: null }, otpError = null } = {}) {
  const calls = [];
  const privilegedCalls = [];
  const client = { auth: {
    signInWithPassword: async (input) => { calls.push(input); return { data: {}, error: passwordError }; },
    signUp: async (input) => { calls.push(input); return signupResult; },
    signInWithOtp: async (input) => { calls.push(input); return { error: otpError }; },
    exchangeCodeForSession: async () => ({ error: { message: "Link expired at 100%" } })
  } };
  const mocks = {
    "next/navigation": { redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); } },
    "next/server": { NextResponse: { redirect: (url) => Response.redirect(url) } },
    "@/lib/supabase/server": { createClient: () => client, createServiceClient: () => { privilegedCalls.push("service"); throw new Error("Unexpected service write"); } },
    "@/lib/claw-messenger": { registerClawRoute: async () => { privilegedCalls.push("register"); throw new Error("Unexpected phone registration"); } }
  };
  return { calls, privilegedCalls, actions: load("app/login/actions.ts", mocks), callback: load("app/auth/callback/route.ts", mocks).GET };
}
const authForm = (overrides = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: "user@example.com", password: "long-password", invite: "alex-rivera", ...overrides })) form.set(key, value);
  return form;
};
async function redirected(action) {
  try { await action(); } catch (error) { if (error.url) return new URL(error.url, "https://syncedin.org"); throw error; }
  assert.fail("Expected redirect");
}

test("password errors and missing signup phone retain the original invitation", async () => {
  const f = authFixture({ passwordError: { message: "Invalid password (100%)" } });
  const failed = await redirected(() => f.actions.signInWithPassword(authForm()));
  assert.equal(failed.searchParams.get("invite"), "alex-rivera");
  assert.equal(failed.searchParams.get("detail"), "Invalid password (100%)");
  const missingPhone = await redirected(() => f.actions.signUpWithPassword(authForm()));
  assert.equal(missingPhone.searchParams.get("error"), "missing_phone");
  assert.equal(missingPhone.searchParams.get("invite"), "alex-rivera");
});

test("magic-link success and failure retain community join context", async () => {
  for (const otpError of [null, { message: "Provider unavailable" }]) {
    const f = authFixture({ otpError });
    const result = await redirected(() => f.actions.login(authForm({ invite: "", conference: "research-club" })));
    assert.equal(result.searchParams.get("conference"), "research-club");
    assert.equal(result.searchParams.get(otpError ? "error" : "sent"), otpError ? "send_failed" : "1");
    assert.equal(new URL(f.calls[0].options.emailRedirectTo).searchParams.get("next"), "/conferences/research-club/join");
  }
});

test("existing-account recovery never claims it emailed when delivery failed", async () => {
  const f = authFixture({ signupResult: { data: { user: { identities: [] }, session: null }, error: null }, otpError: { message: "Rate limit" } });
  const result = await redirected(() => f.actions.signUpWithPassword(authForm({ phone_number: "+12025550123" })));
  assert.equal(result.searchParams.get("error"), "send_failed");
  assert.equal(result.searchParams.get("exists"), null);
  assert.equal(result.searchParams.get("invite"), "alex-rivera");
});

test("callback errors preserve invitations and reject unsafe next destinations", async () => {
  const f = authFixture();
  const result = await f.callback(new Request("https://syncedin.org/auth/callback?code=expired&next=%2Fclaim%2Falex-rivera"));
  const target = new URL(result.headers.get("location"));
  assert.equal(target.searchParams.get("invite"), "alex-rivera");
  assert.equal(target.searchParams.get("detail"), "Link expired at 100%");
  const { safeAuthNext, authDestination } = load("lib/auth-return.ts");
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil.example"]) assert.equal(safeAuthNext(next), null);
  assert.equal(safeAuthNext("/claim/alex-rivera"), "/claim/alex-rivera");
  assert.equal(authDestination({ invite: "../external", conference: "Research-Club" }), "/conferences/research-club/join");
});

function notificationFixture({ legacy = false, email = "ok", phone = "ok", disabled = false } = {}) {
  const attempts = [];
  const updates = [];
  const sends = [];
  const reservations = new Set();
  const client = { from(table) {
    let columns = "";
    let update = null;
    const filters = {};
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      maybeSingle() { return query; },
      update(value) { update = value; return query; },
      async insert(row) {
        attempts.push(row);
        if (legacy && "phone_number" in row) return { error: { code: "PGRST204", message: "Unknown phone column" } };
        if (reservations.has(row.dedupe_key)) return { error: { code: "23505", message: "duplicate key" } };
        reservations.add(row.dedupe_key);
        return { error: null };
      },
      then(resolve, reject) {
        if (update) { updates.push({ update, filters }); return Promise.resolve({ error: null }).then(resolve, reject); }
        if (table === "profiles" && legacy && columns.includes("phone_number")) return Promise.resolve({ data: null, error: { code: "42703" } }).then(resolve, reject);
        const data = table === "profiles" ? { id: "recipient", email: "recipient@example.com", display_name: "Recipient" } : { on_call_scheduled: !disabled, ...(legacy ? {} : { phone_number: "+12025550123" }) };
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return query;
  } };
  const send = async (channel, result) => {
    sends.push(channel);
    if (result === "throw") throw new Error("Provider exception");
    return { ok: result !== "fail", skipped: result === "skip", error: result === "fail" ? "provider_failure" : undefined };
  };
  const { notifyCallScheduled } = load("lib/notify.ts", {
    "@/lib/supabase/server": { createServiceClient: () => client },
    "@/lib/email": { sendEmail: () => send("email", email), renderEmailHtml: () => "<p>Call scheduled</p>" },
    "@/lib/claw-messenger": { sendClawMessage: () => send("phone", phone) },
    "@/lib/push": {},
    "@/lib/pair-score": {}
  });
  return { attempts, updates, sends, notify: () => notifyCallScheduled({ conversationId: "conversation", recipientId: "recipient", callTimeIso: "2026-09-15T12:00:00Z" }) };
}

test("email alerts survive a database that has not installed phone columns", async () => {
  const f = notificationFixture({ legacy: true });
  await f.notify();
  assert.deepEqual(f.sends, ["email"]);
  assert.equal(f.attempts.length, 2);
  assert.equal("phone_number" in f.attempts[1], false);
  assert.equal(f.updates.length, 0);
});

test("notification logs record accepted channels after attempts, never anticipated success", async () => {
  for (const [email, phone, accepted] of [["ok", "fail", ["email"]], ["skip", "ok", ["phone"]], ["throw", "ok", ["phone"]], ["fail", "skip", []]]) {
    const f = notificationFixture({ email, phone });
    await f.notify();
    assert.deepEqual(f.attempts[0].sent_channels, []);
    assert.deepEqual(f.sends, ["email", "phone"]);
    assert.deepEqual(f.updates[0].update.sent_channels, accepted);
    assert.equal(f.updates[0].filters.user_id, "recipient");
  }
});

test("notification preferences and deduplication still prevent additional sends", async () => {
  const disabled = notificationFixture({ disabled: true });
  await disabled.notify();
  assert.equal(disabled.sends.length, 0);
  const f = notificationFixture();
  await f.notify();
  await f.notify();
  assert.deepEqual(f.sends, ["email", "phone"]);
});

test("phone capture never writes to the publicly readable profile", async () => {
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from(table) {
      const query = {
        update(row) { writes.push({ table, row }); return query; },
        eq() { return query; },
        upsert(row) { writes.push({ table, row }); return query; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); }
      };
      return query;
    }
  };
  const handler = load("app/api/save-twin-draft/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/supabase/server": { createClient: () => client }
  }).POST;
  const response = await handler(request({ display_name: "Owner", phone_number: "+12025550123", goals: "Discuss research" }));
  assert.equal(response.status, 200);
  const phoneWrite = writes.find((write) => write.row.phone_number);
  assert.equal(phoneWrite.table, "notification_preferences");
  assert.equal(phoneWrite.row.user_id, "owner");
  assert.ok(writes.filter((write) => write.table === "profiles").every((write) => !("phone_number" in write.row)));
  assert.equal((await handler(request({ phone_number: 123 }))).status, 400);
});

test("signup does not register phone routes before the human authenticates", async () => {
  const f = authFixture({ signupResult: { data: { user: { id: "unconfirmed-user", identities: [{}] }, session: null }, error: null } });
  const result = await redirected(() => f.actions.signUpWithPassword(authForm({ phone_number: "+12025550123" })));
  assert.equal(result.searchParams.get("sent"), "1");
  assert.equal(f.calls[0].options.data.phone_number, "+12025550123");
  const magic = await redirected(() => f.actions.login(authForm({ phone_number: "+12025550123" })));
  assert.equal(magic.searchParams.get("sent"), "1");
  assert.deepEqual(f.privilegedCalls, []);
});

test("phone migration and bootstrap schema keep contacts behind owner-only RLS", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/0006_phone_claw_messaging.sql"), "utf8");
  const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
  for (const sql of [migration, schema]) {
    assert.doesNotMatch(sql, /alter table public\.profiles\s+add column if not exists phone/i);
    assert.match(sql, /insert into public\.notification_preferences \(user_id, phone_number/);
  }
  assert.match(schema, /alter table public\.notification_preferences enable row level security/);
  assert.match(schema, /create policy "notif_prefs_select_own"[\s\S]*?for select using \(auth\.uid\(\) = user_id\)/);
  const { phonePreferencePatch } = load("lib/phone.ts");
  assert.equal(phonePreferencePatch("", "notification_settings").phone_consent_source, "notification_settings");
  assert.equal(phonePreferencePatch("+12025550123", "signup").phone_number_verified_at, null);
});

test("global direct search keeps semantic ordering and excludes profile-location bias", async () => {
  const f = fixture();
  const response = await f.find(request({ query: "AI reasoning researchers", search_scope: "global", search_location: "Los Angeles" }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(f.searches[0], "AI reasoning researchers");
  assert.equal(data.exa_people[0].url, "https://example.com/global");
  assert.equal(data.search_location, "");
  assert.ok(!f.reads.some((read) => read.table === "twin_profiles"));
});

test("local direct search uses one chosen city and boosts matching snippets", async () => {
  const f = fixture();
  const data = await (await f.find(request({ query: "AI researchers", search_scope: "local" }))).json();
  assert.match(f.searches[0], /Los Angeles/);
  assert.doesNotMatch(f.searches[0], /Austin/);
  assert.equal(data.exa_people[0].url, "https://example.com/local");
  const override = fixture();
  await override.find(request({ query: "AI researchers", search_scope: "local", search_location: "London" }));
  assert.match(override.searches[0], /London/);
  assert.doesNotMatch(override.searches[0], /Los Angeles|Austin/);
});

test("local searches without a city report the missing information", async () => {
  const f = fixture({ city: "", hometown: "" });
  assert.equal((await f.find(request({ query: "AI researchers", search_scope: "local" }))).status, 400);
  assert.equal((await f.suggest(request({ search_scope: "local" }))).status, 400);
  assert.equal(f.searches.length, 0);
});

test("both suggestion modes preserve the explicit purpose and apply their own geographic rules", async () => {
  for (const scope of ["global", "local"]) {
    const f = fixture();
    const response = await f.suggest(request({ search_scope: scope, search_location: "Los Angeles", connection_reason: "Discuss research ideas, not funding" }));
    assert.equal(response.status, 200);
    assert.ok(f.prompts[0].system.includes("Discuss research ideas, not funding"));
    if (scope === "global") {
      assert.ok(f.prompts[0].system.includes("Prioritize intellectual compatibility"));
      assert.doesNotMatch(f.searches[0], /Los Angeles|Austin/);
    } else assert.match(f.searches[0], /Los Angeles/);
  }
});

test("discovery caches separate users, local cities, scope, and connection purpose", () => {
  const { discoveryCacheKey } = load("lib/discovery-search.ts");
  const global = { scope: "global", location: "Los Angeles" };
  const local = { scope: "local", location: "Los Angeles" };
  assert.notEqual(discoveryCacheKey("a", global, ""), discoveryCacheKey("a", local, ""));
  assert.notEqual(discoveryCacheKey("a", local, ""), discoveryCacheKey("a", { ...local, location: "London" }, ""));
  assert.notEqual(discoveryCacheKey("a", global, ""), discoveryCacheKey("b", global, ""));
  assert.notEqual(discoveryCacheKey("a", global, "dinner"), discoveryCacheKey("a", global, "research"));
  assert.equal(discoveryCacheKey("a", global, ""), discoveryCacheKey("a", { ...global, location: "London" }, ""));
});

test("live global planner ignores biography location when seeking intellectual matches", { skip: process.env.DISCOVERY_LIVE_EVAL !== "1" }, async () => {
  const f = fixture({ liveModel: true });
  const response = await f.suggest(request({ search_scope: "global", intent: "AI reasoning researchers", connection_reason: "Compare theories of reasoning and scientific discovery" }));
  assert.equal(response.status, 200);
  assert.ok(f.searches.length >= 3);
  for (const query of f.searches) assert.doesNotMatch(query, /Los Angeles|Austin|near me|local|California/i);
  console.log(JSON.stringify({ scope: "global", queries: f.searches }));
});
