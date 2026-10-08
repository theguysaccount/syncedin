import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const base = process.env.AGENT_QA_ORIGIN || "http://localhost:3032";
const qa = JSON.parse(fs.readFileSync(".qa/review-credentials.json", "utf8"));
const account = qa.accounts[0];
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const snapshot = {};
for (const [table, key] of [
  ["profiles", "id"],
  ["twin_profiles", "user_id"],
  ["notification_preferences", "user_id"],
]) {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq(key, account.id)
    .single();
  assert.equal(error, null);
  snapshot[table] = data;
}
assert.equal(
  snapshot.profiles.is_test_persona,
  true,
  "Never modify a real customer during QA.",
);
fs.writeFileSync(".qa/agent-qa-rollback.json", JSON.stringify(snapshot), {
  mode: 0o600,
});
const cookies = new Map();
const client = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach((v) => cookies.set(v.name, v.value)),
    },
  },
);
const auth = await client.auth.signInWithPassword({
  email: account.email,
  password: account.password,
});
assert.equal(auth.error, null);
const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
let enrollment;
let checks = 0;
const profile = {
  display_name: "Synthetic SyncedIn agent QA",
  goals: "Find research collaborators for synthetic release verification.",
  ai_export_blob:
    "Synthetic professional context. No real person or customer data.",
};
async function call(
  path,
  body,
  { human = false, token = "", origin = base } = {},
) {
  const response = await fetch(base + "/api/agent/" + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: origin }),
      ...(human ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  return { status: response.status, value: await response.json() };
}
const expect = (actual, expected) => {
  assert.equal(actual, expected);
  checks++;
};
try {
  expect(
    (
      await call("enrollments", {
        profile: { ...profile, api_key: "reject-secrets" },
      })
    ).status,
    400,
  );
  const prepared = await call("enrollments", {
    agent_name: "Isolated release QA",
    profile,
  });
  expect(prepared.status, 201);
  enrollment = prepared.value;
  const ticket = new URL(enrollment.verificationUrl).hash.slice(
    "#ticket=".length,
  );
  expect(
    (await call("me", undefined, { token: enrollment.agentToken })).status,
    401,
  );
  const preview = await call("preview", {
    id: enrollment.enrollmentId,
    ticket,
  });
  expect(preview.status, 200);
  expect(preview.value.profile.goals, profile.goals);
  const approval = {
    id: enrollment.enrollmentId,
    ticket,
    profile,
    phone_number: "+12025550123",
    grant_agent_access: true,
    confirmed_profile: true,
  };
  expect(
    (await call("approve", approval, { token: enrollment.agentToken })).status,
    401,
  );
  expect(
    (
      await call("approve", approval, {
        human: true,
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  expect(
    (
      await call(
        "approve",
        { ...approval, confirmed_profile: false },
        { human: true },
      )
    ).status,
    400,
  );
  expect((await call("approve", approval, { human: true })).status, 200);
  expect((await call("approve", approval, { human: true })).status, 409);
  expect(
    (await call("preview", { id: enrollment.enrollmentId, ticket })).status,
    404,
  );
  const me = await call("me", undefined, { token: enrollment.agentToken });
  expect(me.status, 200);
  expect(me.value.twin.goals, profile.goals);
  for (const forbidden of ["phone_number", "email", "ai_export_blob"])
    assert(!JSON.stringify(me.value).includes(`"${forbidden}"`));
  checks++;
  const matches = await call("matches", undefined, {
    token: enrollment.agentToken,
  });
  expect(matches.status, 200);
  assert(matches.value.matches.length <= 12);
  checks++;
  for (const match of matches.value.matches)
    assert.deepEqual(Object.keys(match).sort(), [
      "about",
      "id",
      "name",
      "profileUrl",
      "score",
    ]);
  const status = await call(
    `enrollments/${enrollment.enrollmentId}/status`,
    {},
    { token: enrollment.agentToken },
  );
  expect(status.value.agentActive, true);
  expect((await call("access")).status, 401);
  const access = await call("access", undefined, { human: true });
  expect(access.status, 200);
  assert(access.value.grants.some((g) => g.id === enrollment.enrollmentId));
  checks++;
  expect(
    (
      await call(
        "introductions",
        { counterpart_id: qa.accounts[1].id, text: "x".repeat(301) },
        { token: enrollment.agentToken },
      )
    ).status,
    400,
  );
  expect(
    (
      await call(
        "introductions",
        { counterpart_id: qa.accounts[1].id, text: "Synthetic private draft" },
        { token: enrollment.agentToken },
      )
    ).status,
    404,
  );
  const contacts = await db
    .from("notification_preferences")
    .select("on_text_notifications,phone_consent_at")
    .eq("user_id", account.id)
    .single();
  expect(contacts.data.on_text_notifications, false);
  expect(contacts.data.phone_consent_at, null);
  expect(
    (await call("revoke", { id: enrollment.enrollmentId }, { human: true }))
      .status,
    200,
  );
  expect(
    (await call("me", undefined, { token: enrollment.agentToken })).status,
    401,
  );
  expect(
    (
      await call(
        `enrollments/${enrollment.enrollmentId}/status`,
        {},
        { token: enrollment.agentToken },
      )
    ).value.agentActive,
    false,
  );
} finally {
  for (const [table, data] of Object.entries(snapshot)) {
    const { error } = await db.from(table).upsert(data);
    assert.equal(error, null, `Restore isolated ${table}`);
  }
  if (enrollment) {
    const { error } = await db
      .from("agent_enrollments")
      .delete()
      .eq("id", enrollment.enrollmentId)
      .eq("agent_name", "Isolated release QA");
    assert.equal(error, null);
  }
  await client.auth.signOut();
}
console.log(
  `Agent onboarding verified: ${checks} live checks. Isolated QA account restored; no customer profiles changed; no messages sent.`,
);
