import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { Wordmark } from "../Wordmark";

export const metadata = withPublicSEO('/support', {
  title: "Support · SyncedIn",
  description:
    "Get help with SyncedIn — bug reports, feature requests, privacy questions, and account issues. We respond fast."
});

/**
 * /support — required by App Store Connect to submit an app (Support URL
 * field on the listing). Lists the contact paths, common questions, and
 * the data-deletion request flow so reviewers can verify the app honors
 * user rights.
 */
export default function SupportPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 pt-4 pb-12">
      <div className="flex items-center justify-between" style={{ minHeight: 40 }}>
        <Wordmark />
        <Link href="/" className="retro-dim text-xs">
          home →
        </Link>
      </div>

      <section className="mt-10">
        <div className="retro-label">support</div>
        <h1 className="retro-h1 text-3xl sm:text-4xl mt-3">
          Need help? We respond fast.
        </h1>
        <p
          className="mt-5 text-base leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          SyncedIn is small. When you email us, you get a real person —
          most often Jack — replying inside 24 hours.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="retro-h1 text-xl">Reach us</h2>
        <ul className="mt-3 space-y-3 text-base leading-relaxed">
          <li>
            <strong>Email:</strong>{" "}
            <a
              href="mailto:jacksonjezio@gmail.com"
              style={{ color: "var(--amber-bright)" }}
            >
              jacksonjezio@gmail.com
            </a>
          </li>
          <li>
            <strong>Book a call:</strong>{" "}
            <a
              href="https://calendly.com/JackJay"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--amber-bright)" }}
            >
              calendly.com/JackJay
            </a>
          </li>
          <li>
            <strong>In-app feedback:</strong>{" "}
            <Link
              href="/feedback"
              style={{ color: "var(--amber-bright)" }}
            >
              /feedback
            </Link>{" "}
            — fastest path for product reports.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="retro-h1 text-xl">Common questions</h2>
        <div className="mt-3 space-y-5">
          <Q
            q="How do I delete my account and all my data?"
            a="Email jacksonjezio@gmail.com with the subject 'delete my account.' We delete your profile, twin, conversations, and pending invites within 30 days, and confirm by email when it's done. You can also delete individual twin profile fields from /onboarding directly."
          />
          <Q
            q="Where does my data go when I use the platform?"
            a={
              <>
                Full breakdown is on the{" "}
                <Link
                  href="/privacy"
                  style={{ color: "var(--amber-bright)" }}
                >
                  Privacy Policy
                </Link>
                . Short version: Supabase (database), Anthropic Claude
                (message generation), Apify / ScrapingDog / Exa (public
                profile scraping when you invite someone), Resend (email),
                Microsoft Clarity (anonymized analytics).
              </>
            }
          />
          <Q
            q="Why isn't my magic-link email arriving?"
            a="Check spam — magic links from new senders often land there on first contact. If it still hasn't arrived after 5 minutes, email us and we'll sign you in manually."
          />
          <Q
            q="My twin said something wrong / inaccurate / out of voice — what now?"
            a="Edit any message before it sends. Click the bubble (or double-click on desktop, long-press on mobile) → edit. The edit becomes a training signal for your twin going forward."
          />
          <Q
            q="Can I export my twin profile?"
            a="Yes. Email jacksonjezio@gmail.com with 'export my data' in the subject. We'll send a JSON dump of your profile, twin, conversations, and invites within 7 days."
          />
          <Q
            q="Is my data used to train AI?"
            a="No. Anthropic does not train on Claude API data per their published policy. We do not provide your data to any other model trainer."
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="retro-h1 text-xl">Status</h2>
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          For any outage updates we post first to{" "}
          <a
            href="https://x.com/syncedin"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--amber-bright)" }}
          >
            @syncedin on X
          </a>
          . If you can&apos;t reach the site at all, email is the
          fastest path.
        </p>
      </section>

      <footer
        className="mt-14 mb-4 text-xs"
        style={{ color: "var(--text-dim)" }}
      >
        <Link href="/" className="hover:text-white">
          syncedin.org
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-white">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="hover:text-white">
          Terms
        </Link>
      </footer>
    </main>
  );
}

function Q({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-semibold text-sm"
        style={{ color: "var(--text)" }}
      >
        {q}
      </div>
      <div
        className="mt-1.5 text-sm leading-relaxed"
        style={{ color: "var(--text-dim)" }}
      >
        {a}
      </div>
    </div>
  );
}
