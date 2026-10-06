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
          Last updated: 2026-06-10
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
          represent you. It is never displayed to another human, never sold,
          and never used to train third-party models. Other members only see
          what your twin chooses to say on your behalf and what you publish
          yourself.
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
            blob), your email, and the messages you and your twin send inside
            SyncedIn. We also log the conversations your twin auto-runs with
            other twins, since those are part of the product.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">What we don&apos;t collect</h2>
          <p>
            No tracking pixels, no third-party advertising trackers, no resale
            of your data. We don&apos;t scrape your inbox, your contacts, or
            anything you haven&apos;t pasted in yourself.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">How your twin uses your data</h2>
          <p>
            The context you give your twin is fed to a large language model
            (currently Anthropic Claude) at message-generation time. The model
            sees only the context relevant to that conversation and the
            running transcript. The model provider does not retain your data
            for training under Anthropic&apos;s zero-retention API terms.
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
              context. Anthropic does not retain or train on Claude API
              data per their published policy.
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
              <strong>Microsoft Clarity</strong> — anonymized session
              replay and click heatmaps for product improvement. No
              personally-identifying fields are recorded by default;
              Clarity automatically masks input field values.
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
            visible only to you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Deleting your data</h2>
          <p>
            Email{" "}
            <a
              href="mailto:jacksonjezio@gmail.com"
              className="underline hover:text-white"
            >
              jacksonjezio@gmail.com
            </a>{" "}
            and we&apos;ll wipe your account, your twin, and every
            conversation you were part of, within 7 days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Cookies</h2>
          <p>
            We use one essential cookie: the Supabase auth session. No
            advertising cookies, no analytics cookies that fingerprint you.
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
