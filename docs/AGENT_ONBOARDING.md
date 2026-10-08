# SyncedIn agent onboarding

## Operating model

`/agents` is the human entry point; `/join.md` and `/.well-known/agent.json` are agent-readable. The terminal client is `/syncedin.mjs`. `/api/mcp` uses Vercel's Apache-2.0-licensed mcp-handler and the official MCP SDK; it is stateless Streamable HTTP, not a hand-written protocol. If a chat client cannot perform network requests, the human can import its enrollment JSON on `/agents` and continue through the same private review flow.

An agent submits a professional profile draft. It receives a private review link and an inactive bearer token. Only the authenticated human can approve the draft, supply a private phone number, and optionally grant 24-hour access. Approval atomically updates the existing profiles/twin_profiles rows and private notification preferences. It never creates a duplicate identity, accepts terms, activates messaging, sends a message, or approves a commitment. Existing context is preserved when new context is appended.

Grant scopes: read_profile, find_matches, draft_introductions. No raw export history, phone, email, or another person's private twin fields are returned. Agent matches exclude blocks, suspended accounts, and test personas. Introduction notes are private drafts capped at 300 characters.

All tokens are random 256-bit values stored as SHA-256 hashes. Review links put the secret in a URL fragment. The root's beforeInteractive guard removes it before analytics can load. Review routes skip new Clarity loads, mask fields, and strip URLs from error reports. Owners can revoke access at `/agents`; account deletion cascades agent rows. Pending drafts expire after 24 hours. Expired draft contents are cleared on the next enrollment rate check, not necessarily at the exact expiry instant. The API rejects expired drafts immediately regardless of cleanup timing.

Apply `supabase/migrations/0010_agent_onboarding.sql` before deployment. Tables have RLS enabled and no anon/authenticated grants; only authenticated server routes can use the service-role client. The approval RPC locks the enrollment and atomically commits all profile updates; it is executable only by service_role.

## ChatGPT identity sign-in: external activation required

Verified official documentation, October 8, 2026:
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/website
- https://developers.openai.com/siwc/request-client-id
- https://supabase.com/docs/guides/auth/custom-oauth-providers

Sign in with ChatGPT website identity exists, but commercial clients require OpenAI approval. SyncedIn has no configured custom:chatgpt provider at implementation time. Do not use the Codex client ID or extract/reuse a ChatGPT/Claude subscription token. Do not claim identity scopes import conversations.

Once OpenAI issues SyncedIn's approved credentials:
1. Configure a Supabase custom OIDC provider with identifier `custom:chatgpt`, issuer `https://auth.openai.com`, approved client credentials, and scopes `openid profile email`.
2. Register the actual callback `https://rlccoomlndwmwpjawkzv.supabase.co/auth/v1/callback` with OpenAI. Confirm Supabase's current provider settings and approved platform URIs before activation.
3. Supabase handles PKCE, state, ID-token verification, account linking, session issuance, and existing RLS. Do not implement a parallel session system.
4. Enable the provider only after an actual new/returning-account callback test. Login discovers only an enabled custom:chatgpt provider with the expected issuer and client ID; otherwise the button is hidden, not a dead sign-in control.

No equivalent documented Claude identity-provider integration was established. Claude's supported route is a custom MCP connector: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp . Fixed Authorization headers are supported. The MCP endpoint does not claim OAuth auto-connection. Users must explicitly configure their approved short-lived bearer token for private tools; REST/terminal onboarding also works. Do not claim installation in an official directory or approval by either provider.

## Privacy and release gates

`/agents` has its own public share image. `/agent/review` is a private noindex/referrer-free utility page, excluded from sitemap and public cards. The agent guide/discovery/client are programmatic resources, not marketing pages. Keep existing source controls and all existing public cards.
