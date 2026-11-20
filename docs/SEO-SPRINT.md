# SyncedIn SEO Page Sprint

Work window: November 19, 2026 at 11:16 p.m. through November 20 at 4:16 a.m. Eastern. Source plan: `~/Downloads/SEO-LAUNCH-AND-GROWTH-MASTER-PROMPT.md`. This is a bounded execution plan, not a ranking promise.

## Baseline

- Production observed at `631cd9fca560589b6649b3c8be0bf5c684f095fd`, deployment `dpl_6TGFZiKRnJx9TNC2aVivdtUmH1bX`, canonical `https://syncedin.org`.
- Robots, sitemap, blog, FAQ and LinkedIn alternative return HTTP 200. Sitemap contains 24 static URLs; this is not an indexed-page count.
- GSC Wizard is subscription-blocked. The existing signed-in browser did provide the verified `sc-domain:syncedin.org` property. A dated baseline and source screenshots are retained privately in the sprint evidence directory; no subscription or access changes were made. Historical exclusions include intentionally private routes and must not be presented as current crawl failures without checking the exact URLs.
- Fourteen unrelated local product commits are preserved in the original checkout. This branch starts from actual production and includes only a reviewed compatible Zod security patch plus the SEO work described here.
- No cloud Chrome session is exposed. Public evidence is collected through remote web search and lightweight HTTP. Necessary visual QA may use a task-owned local tab; it is not cloud browsing.

## Intent Map

| Visitor question | Existing destination | Decision and distinct value |
| --- | --- | --- |
| Is SyncedIn a LinkedIn replacement? | `/alternatives/linkedin` | Refresh. Explain complementary uses, human review, real limitations and sourced messaging differences. Remove unsupported performance, prices and paid-feature claims. |
| Should I send a DM or a twin invite? | `/vs/linkedin-dms` | Refresh separately. Distinguish connection notes, ordinary messages and InMail; no universal response-rate or inbox-volume claims. |
| What should I write in a connection request? | No focused existing resource | Build `/guides/linkedin-connection-request`: practical templates plus a private, editable length-checking tool with 200/300-character budgets. |
| How do I follow up after meeting someone? | No focused existing resource | Candidate `/guides/networking-follow-up`: context-specific examples, a bounded ask and a respectful stop rule. Not another product comparison. |
| What does AI-twin networking mean? | Launch article, technical paper, agents setup | Candidate `/guides/ai-networking`: explain a human-reviewed workflow, limitations, contextual feedback and when a simple message is better. |
| Where are the practical guides? | `/blog` lists only launch/comparison material | Build `/guides` only when distinct completed resources exist, and add relevant crawlable links from existing public pages. |

These are product-fit hypotheses supported by observed questions and product capabilities, not measured keyword volumes. Do not create a new URL for each wording variant.

## Verified Source Ledger

Reviewed November 19, 2026. Platform limits can change; the account's visible composer is authoritative for its actual allowance.

- Google people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content . Apply distinct useful answers and original examples, not scaled keyword variants.
- LinkedIn personalized invitations: https://www.linkedin.com/help/linkedin/answer/a563153/personalizing-invitations-to-connect?lang=en . Current help describes 200-character personalized notes for basic members and plan-dependent invitation allowances. Do not assert that every member gets 300 characters.
- LinkedIn messaging: https://www.linkedin.com/help/linkedin/answer/a554575 . First-degree messaging is free; other access depends on connection, recipient settings and subscription. A connection note is not an ordinary DM.
- LinkedIn automation policy: https://www.linkedin.com/help/linkedin/answer/a1341543 . Do not describe SyncedIn as permission to automate activity or bypass limits on LinkedIn.
- Product evidence: `lib/outreach-context.ts`, outreach draft/feedback routes, invitation pages, `lib/twin-prompt.ts`, and the conversation-goal routes. Contextual examples do not establish a separately trained model or guaranteed learning outcome.

## Release Gates

Every new public page must have a substantive answer, an actual useful next step, one descriptive H1, accurate canonical/title/description, crawlable internal links, visible-fact schema, intentional unique OG/Twitter still artwork, and responsive/accessibility checks. Preserve original approved brand artwork. OG motion needs actual playback review; record pending motion honestly, never infer creative quality from a hash check.

Run regression tests, type check, build and original-source release gate. Only record hashes for inspected changed paths. Verify the exact production source, canonical pages, sitemap and public image bytes after any authorized release. Do not count a submission receipt as indexing. No paid tools, credentials, bulk backlinks, customer messages or analytics expansion are part of this sprint.

## Status

Research and source isolation complete. Four new guide routes and two comparison refreshes are implemented locally. Tests: 104 passed, 0 failed, 3 optional live-model checks skipped. The updated production build and the 26-card/392-original-source gate passed. Interactive clipboard, budget, template and empty-draft checks passed in a local browser. The original tight wordmark is legible. Desktop, 390px and 320px checks found no document overflow; keyboard focus is visible. The temporary browser tab was closed, viewport reset, and local QA server stopped. The only recorded browser error predates this pass and occurred while the earlier local server was being restarted. No new page is deployed or claimed indexed by this checkpoint.

Publishing permission: Jack explicitly approved tested SEO-only batches during this sprint. Preserve the unrelated local product commits. Animated OG media remains pending creative playback review; do not describe it as completed.
