# SyncedIn Release Access

Canonical live site: https://syncedin.org. Repository: theguysaccount/syncedin, main. Vercel project prj_eLdHqkrymH4UwmoowQwSNDbpiTwA (twinlink), account team_7w7ZYLNvQsncp5BCqsKzeIpk, CLI scope jacksonjezio-7345s-projects. Confirm the current project and domain alias before releases.

Rollback baseline: eb724bc0b051103031b580400daceb4120d63cac, original production dpl_kH5qSoNhq3BB47mJBuWghHud1LUv. The original deployment serves twinlink-qukmfdive-jacksonjezio-7345s-projects.vercel.app. Keep the original approved social GIF, original styles/fonts/assets, auth middleware and homepage A/B experiment.

Use existing authenticated GitHub/Vercel access. No credentials are stored here or pulled locally. npm ci --ignore-scripts installs the lockfile. npm run build invokes the SEO postbuild gate. Local checks can use an explicitly invalid Supabase URL and placeholder keys; hosted staging must use the existing production environment.

For a reviewed committed change, stage with: vercel deploy --prod --skip-domain --scope jacksonjezio-7345s-projects --yes. Inspect the exact staged deployment, run anonymous public-page/image checks on its URL, verify the Git/source identity and no production drift, then promote that exact deployment or merge the checked PR and verify the actual production deployment. Never change protection, environment credentials, database migrations, cron settings, auth or routing experiments for SEO.

verification/check-seo-release.mjs checks 21 distinct branded cards, metadata wrappers, real policy content dates, private route exclusions, 392 original uploaded website file hashes and original product component bodies. Only visible change: policy dates now reflect existing source content history rather than every request's date. Talk gains an invisible accessible H1. Head-only navigation JSON-LD drops its gated destinations. No forms, chat, outreach, uploads, memory decoding or database writes are part of SEO verification.

Static marketing scope is listed in verification/social-card-manifest.json plus / and /talk. Existing public profiles, personalized invitation cards and conference/community cards keep their original data and appropriate original artwork. Private/operator/error/redirect routes are documented exceptions; profile recipients and product data are not enumerated by the release verification.

## Product Release, October 6, 2026

The product redesign is scoped to authenticated `.app-frame` and `.auth-screen`; original marketing artwork and the 21 page-specific cards remain protected. Reviewed source exceptions are recorded in `verification/product-release-scope.json`, not regenerated during builds. `/admin/safety` is a private, noindex operator route and has no public social card.

Supabase project: rlccoomlndwmwpjawkzv. Migrations 0008 and 0009 add block enforcement, protected suspension status, and previously missing preference/portfolio columns. Apply saved SQL through the existing authenticated SQL editor. Do not replay the whole bootstrap schema against production.

Release QA uses two isolated test personas; local credentials stay in ignored `.qa/` with restrictive file permissions. Disable all notifications for those users. `npm run test:outreach`, `npm run test:release`, the TypeScript check, and the production build are required. `scripts/verify-release-database.mjs` exercises block guards and ownership with only these test accounts.

iOS bundle org.syncedin.app, App Store Connect app 6771601887, team XCUTNS56DG. Native sign-in uses the in-app email/password service; third-party OAuth and magic links are web-only. The mobile workflow uploads iOS to TestFlight and Android to Play Internal Testing, not public store release. Android must use minSdk 24 or newer. Never revoke shared distribution certificates to make CI pass.

Apple's June review requests a physical-device video demonstrating terms acceptance, reporting, and blocking. A simulator recording does not fulfill that requirement. Confirm the uploaded build is selected and review notes explain the actual fixes before resubmission. Founder reviews reports at `/admin/safety`; action overdue reports within 24 hours. Text notifications require explicit signup opt-in; capturing a phone is not itself consent.

## October 7 Release Status

The product redesign is live. Supabase migrations 0008 and 0009 were applied to rlccoomlndwmwpjawkzv and eight live safety/ownership checks passed using only two isolated test personas. Native iPad simulator sign-in and signup screens were visually verified; this is not physical-device evidence or a completed terms-acceptance test.

GitHub mobile run 37570086542 successfully uploaded and processed iOS 1.0 (8) in TestFlight and uploaded Android to Google Play Internal Testing. The App Store version has equivalent native build 1.0 (7) selected and saved, with export-compliance classification completed. Description, promotional text, and review notes were corrected and saved. These are preparation and testing states, not public store approval or final resubmission.

Final Apple resubmission still requires the requested physical iPhone/iPad recording of terms acceptance, report, and block, plus approval to share the isolated reviewer login. The old saved reviewer credentials failed validation. Do not submit them again. Do not accept terms on the owner's behalf without action-time confirmation. Private QA credentials remain only in ignored `.qa/`; never put them in source or release reports.

The live UI block/unblock test was limited to the two synthetic test accounts and generated a normal founder safety alert. No real customer was blocked or contacted. The fixture block was reversed. Authenticated test sessions must be cleared after browser QA.

Run `node verification/check-public-release.mjs https://syncedin.org` after promotion to verify all 21 page-specific cards in both formats, anonymous login/admin protection, replay text masking, and current privacy disclosures. No provider protection or credentials need to be weakened.

Next retention work should prioritize source-grounded twin drafts: a synthetic conversation invented a newsletter/introduction offer not present in the supplied profile. An approval boundary for promises and a measurable edit-to-next-draft loop are more important than increasing notification frequency. Actual iMessage delivery and group messaging remain unverified by this release.

App Store privacy labels were published and verified with 14 collected data types, adding phone number, message content, saved discovery/search context, public contact links, and device identifiers for push/analytics. Four inherited iPhone images and one iPad image are present; refresh them with actual native authenticated screens when the reviewer account's terms acceptance is approved. The pending request remains unanswered; no acceptance or reviewer credential disclosure has occurred.

The final block-badge check also passed in production: a temporary block by the other synthetic account produced zero visible conversations and no unread badge. That fixture preference was then restored. Twin action chips use consistent Lucide icons and 44-pixel touch targets; pending proposal acceptance says "Accepting...", never "accepted" before the server succeeds.

Fresh browser QA identified escaped inline stylesheet text causing hydration warnings on Twin and Settings. Those rules now live in the scoped product stylesheet. The proposal rail keeps failed actions visible, reports load failures instead of claiming an empty inbox, uses consistent icons, and no longer claims to retrain the model. The automatic error-report sink now captures records when the older feedback schema lacks `ack_signature`, and returns an honest failure on unsuccessful persistence. A synthetic, clearly marked release QA report was verified in the real feedback inbox. Grouped acknowledgment still requires the optional grouping column from the bootstrap schema; capture does not.

The mobile runtime is patched to Capacitor 6.2.2 for GHSA-rvm3-566m-v7fv (CVE-2026-103922). Both iOS and Android must be rebuilt and distributed; a web-only deployment does not fix an installed native binary. The release test rejects the affected 6.x runtime. The compatible source-map-js patch is also resolved in the lockfile. A separate major Next.js upgrade remains necessary to resolve the web framework's audit findings; do not describe this release as security-clean or use a forced dependency upgrade without compatibility testing.
