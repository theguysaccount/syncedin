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
