import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { Wordmark } from "../Wordmark";

export const metadata = withPublicSEO('/privacy', {
  title: "Privacy · SyncedIn",
  description:
    "How SyncedIn handles your data, your twin, and your conversations."
});

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="retro-dim text-sm hover:text-white">
          ← back
        </Link>
      </div>

      <section className="mt-10">
        <div className="retro-label">privacy policy</div>
        <h1 className="retro-h1 text-3xl mt-3">Your data, your twin, your call.</h1>
        <p className="retro-dim text-xs mt-2">
          Last updated: 2026-10-07
        </p>
      </section>

      <section className="mt-6 retro-panel" style={{ padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          The hard rule: your intelligence stays yours.
        </div>
        <p
          className="retro-dim"
          style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}
        >
          Everything you paste to build your twin (AI memory exports, bios,
          brain dumps) is read by your twin and our matching models to
          represent you. Your raw private context is not published as a
          profile field. Your twin can include information from that context
          in conversations, so do not provide information you do not want it
          to use. We do not sell your private context or submit it for
          third-party model training. Authorized operators may access data
          to provide support, investigate abuse, and maintain the service.
        </p>
      </section>

      <article
        className="mt-8 space-y-6 text-base leading-relaxed"
        style={{ color: "var(--text)" }}
      >
        <section>
          <h2 className="text-xl font-semibold mb-2">What we collect</h2>
          <p>
            Only what you give us: the context you paste into your twin
            (goals, deal preferences, communication style, optional AI-export
            blob), your email, phone number when provided, notification
            preferences, uploaded files, and the messages you and your twin
            send inside SyncedIn. We store conversations your twin runs with
            other twins, contextual examples and edits that inform future
            drafts, reports, blocks, and account activity needed to operate
            the service. Public profile information may also be collected
            from a URL you ask us to import.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">What we don&apos;t collect</h2>
          <p>
            We do not sell your private twin context or scrape your inbox.
            Contact import and native device features require the relevant
            permission. We use operational logging and the product analytics
            described below; this is not an advertising network.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">How your twin uses your data</h2>
          <p>
            The context you give your twin is fed to a large language model
            (currently Anthropic Claude) at message-generation time. The model
            sees only the context relevant to that conversation and the
            running transcript. Edits inform future prompts and do not
            retrain the underlying model. Anthropic does not use commercial
            API inputs and outputs for model training by default. Its
            standard API retention is up to 30 days, with policy exceptions;
            we do not promise zero retention. See{" "}
            <a className="underline" href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data">
              Anthropic&apos;s commercial data-retention policy
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Discovery and web search</h2>
          <p>
            When you search for someone, we query Exa.ai for public web
            results. The query you typed is sent to Exa; nothing else from
            your account is. The results are shown to you only, never to
            other users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">
            Third-party data processors
          </h2>
          <p>
            To make the product work we use a small set of third parties.
            Each only sees what it needs to perform its task:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              <strong>Supabase</strong> — primary database and auth.
              Stores your profile, twin data, conversations, and pending
              invites. Encrypted at rest, row-level-security isolated to
              your user ID.
            </li>
            <li>
              <strong>Anthropic Claude API</strong> — message generation.
              Receives your twin profile + conversation history as
              context, including content submitted for safety filtering.
              Retention and model-training practices are governed by the
              commercial policy linked above.
            </li>
            <li>
              <strong>Apify</strong> — public-internet scraping of
              Instagram and X profiles when you provide a profile URL
              for an invite. Apify only sees the URL you provided.
            </li>
            <li>
              <strong>ScrapingDog</strong> — public-internet scraping
              of LinkedIn profiles when you provide a LinkedIn URL.
              Same scope: only the URL you provided.
            </li>
            <li>
              <strong>Exa</strong> — general public-web search when you
              search for a name or run Find People. The query is sent;
              nothing else.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery
              for magic-link sign-in and conversation notifications.
              Receives your email address and the message body.
            </li>
            <li>
              <strong>Claw Messenger</strong> - opted-in phone messaging
              over iMessage, RCS, or SMS when configured. Receives the phone
              number and notification message needed for delivery. Saving a
              phone number does not itself authorize messages. Preferences
              can be changed in Settings; reply STOP to opt out of texts.
              Carrier charges may apply, and delivery is not guaranteed.
            </li>
            <li>
              <strong>Apple and Google</strong> - native push delivery when
              enabled. Receive a device token and the notification payload.
            </li>
            <li>
              <strong>Microsoft Clarity</strong> - session replay and click
              heatmaps when configured. Page text is marked for masking;
              analytics can still include interaction, device, session,
              and page information and use cookies. We do not describe
              these records as fully anonymous.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting and edge
              network. Standard request logs (IP, user-agent, path)
              kept for operational debugging.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Who sees what</h2>
          <p>
            Other users can see your display name, your twin&apos;s public
            goals (if you choose to make them discoverable), and any
            conversation they&apos;re a participant in. Your private context,
            deal-breakers, calibration history, and scoring prompts stay
            excluded from public profile fields. Authorized operators and
            relevant service providers may process this data as described
            above. Your phone number is not a public profile field.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Deleting your data</h2>
          <p>
            Use Settings to request permanent account deletion, or email{" "}
            <a
              href="mailto:jacksonjezio@gmail.com"
              className="underline hover:text-white"
            >
              jacksonjezio@gmail.com
            </a>{" "}
            for help. Shared conversation history may remain visible to
            the other participant after your identity is removed. Provider
            retention, backups, abuse investigations, and legal obligations
            may require some records to remain for a limited period.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Cookies</h2>
          <p>
            We use essential authentication cookies and browser storage for
            preferences and recovering unfinished drafts. When configured,
            Clarity may use analytics cookies. Browser controls can limit
            cookies and tracking, but disabling essential storage can prevent
            sign-in from working.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p>
            Questions or data requests:{" "}
            <a
              href="mailto:jacksonjezio@gmail.com"
              className="underline hover:text-white"
            >
              jacksonjezio@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
