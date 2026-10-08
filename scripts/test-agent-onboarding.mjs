import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import { createMcpHandler } from "mcp-handler";

function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}})`)(
    (name) => {
      if (!(name in mocks)) throw new Error("Unexpected dependency: " + name);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const profile = load("lib/agent-profile.ts", { zod: { z } });
const auth = load("lib/auth-return.ts");
class AgentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const http = load("lib/agent-http.ts", {
  "@/lib/agent-service": { AgentError },
});
const valid = {
  display_name: "Example researcher",
  goals: "Meet collaborators for responsible robotics research.",
};

test("agent enrollment only accepts bounded professional fields, not credentials or contact lists", () => {
  assert.deepEqual(
    profile.normalizeAgentEnrollment({ profile: valid }).profile,
    valid,
  );
  for (const extra of [
    { api_key: "secret" },
    { email: "private@example.com" },
    { contacts: [] },
  ]) {
    assert.throws(
      () =>
        profile.normalizeAgentEnrollment({ profile: { ...valid, ...extra } }),
      z.ZodError,
    );
  }
  assert.throws(() =>
    profile.normalizeAgentEnrollment({ profile: { ...valid, goals: "short" } }),
  );
  assert.throws(() =>
    profile.normalizeAgentEnrollment({
      profile: { ...valid, ai_export_blob: "x".repeat(6001) },
    }),
  );
  assert.throws(() =>
    profile.normalizeAgentEnrollment({
      profile: { ...valid, display_name: "Name\u0000" },
    }),
  );
});
test("Syncbook profiles map into existing twin fields without importing credentials", () => {
  const result = profile.normalizeAgentEnrollment({
    profile: {
      name: "Researcher",
      headline: "Robotics researcher",
      about: "Professional summary",
      location: "Boston",
      offers: [{ tag: "research", description: "Share robotics research" }],
      needs: [
        { tag: "feedback", description: "Find practical research feedback" },
      ],
      intentions: ["Exchange notes"],
      agentName: "My assistant",
      visibility: "public",
    },
    context: { inferredFields: ["current_city"] },
  });
  assert.equal(result.profile.display_name, "Researcher");
  assert.equal(result.profile.current_city, "Boston");
  assert.equal(result.profile.deal_preferences, "Share robotics research");
  assert.equal(
    result.profile.goals,
    "Find practical research feedback\nExchange notes",
  );
  assert.equal(result.agent_name, "My assistant");
  assert.deepEqual(result.context.inferredFields, ["current_city"]);
});
test("agent grants fail closed before approval, after expiry, and after revocation", () => {
  const now = Date.now();
  const row = {
    status: "approved",
    agent_enabled: true,
    revoked_at: null,
    user_id: "owner",
    grant_expires_at: new Date(now + 10000).toISOString(),
  };
  assert.equal(profile.activeAgentGrant(row, now), true);
  for (const change of [
    { status: "pending" },
    { agent_enabled: false },
    { user_id: null },
    { revoked_at: new Date().toISOString() },
    { grant_expires_at: new Date(now).toISOString() },
    { grant_expires_at: "invalid" },
  ]) {
    assert.equal(profile.activeAgentGrant({ ...row, ...change }, now), false);
  }
});
test("authentication roundtrips preserve review destination and existing invite/conference priority", () => {
  const next = "/agent/review?id=00000000-0000-4000-8000-000000000001";
  assert.equal(auth.authDestination({ next }), next);
  assert.equal(
    new URL(
      auth.loginReturnUrl({ next }, { error: "callback" }),
      "https://syncedin.org",
    ).searchParams.get("next"),
    next,
  );
  assert.equal(
    auth.authDestination({ next, invite: "Person" }),
    "/claim/person",
  );
  assert.equal(
    auth.authDestination({ next, conference: "Event" }),
    "/conferences/event/join",
  );
  for (const bad of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/bad\npath",
  ])
    assert.equal(auth.safeAuthNext(bad), null);
});
test("REST and MCP enforce body limits even without Content-Length", async () => {
  const request = (value) =>
    new Request("https://syncedin.org/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: value,
    });
  assert.deepEqual(await http.readAgentJson(request('{"ok":true}')), {
    ok: true,
  });
  await assert.rejects(
    http.readAgentJson(request(JSON.stringify({ text: "x".repeat(20001) }))),
    (error) => error.status === 413,
  );
  await assert.rejects(
    http.readAgentJson(request("{")),
    (error) => error.status === 400,
  );
  await assert.rejects(
    http.readAgentJson(
      new Request("https://syncedin.org/api/mcp", {
        method: "POST",
        body: "{}",
      }),
    ),
    (error) => error.status === 415,
  );
});

test("agent approvals require browser origin, human session, explicit approval and valid phone", async () => {
  let signedIn = false,
    saved = 0;
  const service = {
    AgentError,
    agentOwner: async () => {
      if (!signedIn) throw new AgentError(401, "Sign in");
      return { id: "owner" };
    },
  };
  const route = load("app/api/agent/[...path]/route.ts", {
    "next/server": {
      NextResponse: { json: (v, options) => Response.json(v, options) },
    },
    zod: { z },
    "@/lib/agent-service": { ...service, hashAgentToken: () => "hash" },
    "@/lib/supabase/server": {
      createServiceClient: () => ({
        rpc: async () => {
          saved++;
          return { error: null };
        },
      }),
    },
    "@/lib/agent-profile": profile,
    "@/lib/agent-http": http,
    "@/lib/phone": {
      normalizePhoneNumber: (v) => (/^\+[0-9]{10,15}$/.test(v) ? v : null),
    },
    "@/lib/content-safety": { contentSafetyResponse: async () => null },
  });
  const input = {
    id: "00000000-0000-4000-8000-000000000001",
    ticket: "sir_" + "a".repeat(64),
    profile: valid,
    phone_number: "+12025550123",
    confirmed_profile: true,
    grant_agent_access: false,
  };
  const call = (data, origin = "https://syncedin.org") =>
    route.POST(
      new Request("https://syncedin.org/api/agent/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
          Authorization: "Bearer sia_" + "b".repeat(64),
        },
        body: JSON.stringify(data),
      }),
      { params: { path: ["approve"] } },
    );
  assert.equal(
    (await call(input)).status,
    401,
    "An agent bearer token cannot impersonate the human session",
  );
  signedIn = true;
  assert.equal((await call(input, "https://evil.example")).status, 403);
  assert.equal((await call(input, null)).status, 403);
  assert.equal(
    (await call({ ...input, confirmed_profile: false })).status,
    400,
  );
  assert.equal((await call({ ...input, phone_number: "invalid" })).status, 400);
  assert.equal(saved, 0);
  assert.equal((await call(input)).status, 200);
  assert.equal(
    (await call({ ...input, native_app: true, phone_number: "" })).status,
    200,
  );
  assert.equal(saved, 2);
});

test("ChatGPT sign-in stays hidden until an approved provider is enabled", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-qa-key";
  const provider = load("lib/chatgpt-sign-in.ts");
  const ready = {
    identifier: "custom:chatgpt",
    enabled: true,
    issuer: "https://auth.openai.com",
    client_id: "approved-synthetic-client",
  };
  try {
    for (const [providers, expected] of [
      [[], false],
      [[{ ...ready, enabled: false }], false],
      [[{ ...ready, issuer: "https://wrong.example" }], false],
      [[{ ...ready, client_id: null }], false],
      [[ready], true],
    ]) {
      globalThis.fetch = async () => Response.json({ providers });
      assert.equal(await provider.chatgptSignInEnabled(), expected);
    }
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    assert.equal(await provider.chatgptSignInEnabled(), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test("actual MCP SDK accepts signup schemas and lists only scoped tools", async () => {
  const route = load("app/api/mcp/route.ts", {
    "mcp-handler": { createMcpHandler },
    zod: { z },
    "@/lib/agent-profile": profile,
    "@/lib/agent-http": http,
    "@/lib/agent-service": {
      AgentError,
      authorizeAgent: async () => {
        throw new AgentError(
          401,
          "Agent access is pending, expired, or revoked.",
        );
      },
    },
  });
  const call = async (method, params = {}) => {
    const response = await route.POST(
      new Request("https://syncedin.org/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    assert.equal(response.status, 200);
    const text = await response.text();
    return JSON.parse(
      text.startsWith("data:")
        ? text.trim().slice(5)
        : text.match(/^data: (.+)$/m)?.[1] || text,
    );
  };
  const initialized = await call("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "SyncedIn QA", version: "1.0" },
  });
  assert.equal(initialized.result.serverInfo.name, "syncedin");
  const listed = await call("tools/list");
  assert.deepEqual(listed.result.tools.map((t) => t.name).sort(), [
    "draft_introduction",
    "find_matches",
    "get_my_profile",
    "prepare_signup",
    "signup_status",
  ]);
  const denied = await call("tools/call", {
    name: "get_my_profile",
    arguments: {},
  });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /pending, expired, or revoked/);
});

test(
  "PostgreSQL migration is repeatable, owner-scoped, atomic and respects phone consent and blocks",
  { timeout: 30000 },
  async () => {
    const db = new PGlite();
    const owner = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const enrollment = "00000000-0000-4000-8000-000000000003";
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key,display_name text,handle text,is_suspended boolean default false,is_test_persona boolean default false);
      create table twin_profiles(user_id uuid primary key references profiles,goals text,deal_preferences text,communication_style text,deal_breakers text,current_city text,achievements text,ai_export_blob text,updated_at timestamptz);
      create table notification_preferences(user_id uuid primary key references profiles,phone_number text,phone_consent_at timestamptz,phone_consent_source text,phone_number_verified_at timestamptz,on_text_notifications boolean default false);
      create table user_blocks(blocker_id uuid references profiles,blocked_id uuid references profiles);
      insert into profiles(id,display_name) values('${owner}','Old name'),('${other}','Other person');
      update profiles set handle='other-person' where id='${other}';
      insert into twin_profiles(user_id,goals,deal_preferences,ai_export_blob) values('${owner}','Old goal','Keep existing offer','Existing context');
      insert into notification_preferences(user_id,phone_number,phone_consent_at,phone_consent_source,on_text_notifications) values('${owner}','+12025550123',now(),'settings',true);`);
      const migration = fs.readFileSync(
        "supabase/migrations/0010_agent_onboarding.sql",
        "utf8",
      );
      await db.exec(migration);
      await db.exec(migration);
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const table of [
          "agent_enrollments",
          "agent_signup_rate_limits",
          "agent_introduction_drafts",
        ])
          await assert.rejects(
            db.query(`select * from ${table}`),
            /permission denied/,
          );
        await assert.rejects(
          db.query("select agent_signup_rate('test')"),
          /permission denied/,
        );
        await db.exec("reset role");
      }
      await db.query(
        "insert into agent_enrollments(id,token_hash,review_hash,agent_name,profile) values($1,'token','review','QA agent',$2)",
        [enrollment, JSON.stringify(valid)],
      );
      const approve = (hash = "review", p = valid, phone = "+12025550123") =>
        db.query("select approve_agent_enrollment($1,$2,$3,$4,$5,true)", [
          enrollment,
          hash,
          owner,
          JSON.stringify(p),
          phone,
        ]);
      await assert.rejects(approve("wrong"), /expired or already/);
      assert.equal(
        (
          await db.query("select display_name from profiles where id=$1", [
            owner,
          ])
        ).rows[0].display_name,
        "Old name",
      );
      await approve("review", {
        ...valid,
        ai_export_blob: "Approved research context",
      });
      await assert.rejects(approve(), /expired or already/);
      const twin = (
        await db.query("select * from twin_profiles where user_id=$1", [owner])
      ).rows[0];
      assert.equal(twin.goals, valid.goals);
      assert.equal(twin.deal_preferences, "Keep existing offer");
      assert.match(
        twin.ai_export_blob,
        /^Existing context\n\n# Approved agent context\n\nApproved research context$/,
      );
      const prefs = (
        await db.query(
          "select * from notification_preferences where user_id=$1",
          [owner],
        )
      ).rows[0];
      assert.equal(prefs.on_text_notifications, true);
      assert.equal(prefs.phone_consent_source, "settings");
      assert(prefs.phone_consent_at);
      const cleared = (
        await db.query("select * from agent_enrollments where id=$1", [
          enrollment,
        ])
      ).rows[0];
      assert.deepEqual(cleared.profile, {});
      assert.equal(cleared.review_hash, null);
      assert.equal(cleared.agent_enabled, true);
      const draft = (text = "Private introduction", user = owner) =>
        db.query("select save_agent_introduction($1,$2,$3,$4)", [
          user,
          enrollment,
          other,
          text,
        ]);
      await draft();
      await assert.rejects(draft("x".repeat(301)), /check constraint/);
      await assert.rejects(
        draft("Spoofed", other),
        /pending, expired, or revoked/,
      );
      await db.query("insert into user_blocks values($1,$2)", [other, owner]);
      await assert.rejects(draft(), /connection is unavailable/);
      await db.exec("delete from user_blocks");
      await db.query(
        "update agent_enrollments set revoked_at=now() where id=$1",
        [enrollment],
      );
      await assert.rejects(draft(), /pending, expired, or revoked/);
      await db.query(
        "update agent_enrollments set revoked_at=null,grant_expires_at=now()-interval '1 minute' where id=$1",
        [enrollment],
      );
      await assert.rejects(draft(), /pending, expired, or revoked/);
      await db.query(
        "insert into agent_enrollments(token_hash,review_hash,agent_name,profile,expires_at) values('expired','expired','QA expired',$1,now()-interval '1 minute')",
        [JSON.stringify(valid)],
      );
      assert.equal(
        (await db.query("select agent_signup_rate('qa-rate') as requests"))
          .rows[0].requests,
        1,
      );
      const expired = (
        await db.query(
          "select profile,status,review_hash from agent_enrollments where token_hash='expired'",
        )
      ).rows[0];
      assert.deepEqual(expired.profile, {});
      assert.equal(expired.status, "revoked");
      assert.equal(expired.review_hash, null);
      await db.query(
        "insert into agent_enrollments(token_hash,review_hash,agent_name,profile) values('newphone','newphone','QA phone',$1)",
        [JSON.stringify(valid)],
      );
      const newid = (
        await db.query(
          "select id from agent_enrollments where token_hash='newphone'",
        )
      ).rows[0].id;
      await db.query(
        "select approve_agent_enrollment($1,'newphone',$2,$3,'+12025550124',false)",
        [newid, owner, JSON.stringify(valid)],
      );
      const changed = (
        await db.query(
          "select * from notification_preferences where user_id=$1",
          [owner],
        )
      ).rows[0];
      assert.equal(changed.on_text_notifications, false);
      assert.equal(changed.phone_consent_at, null);
    } finally {
      await db.close();
    }
  },
);
