import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { Wordmark } from "../Wordmark";

export const metadata = withPublicSEO('/terms', {
  title: "Terms · SyncedIn",
  description: "Terms of service for using SyncedIn."
});

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="retro-dim text-sm hover:text-white">
          ← back
        </Link>
      </div>

      <section className="mt-10">
        <div className="retro-label">terms of service</div>
        <h1 className="retro-h1 text-3xl mt-3">Plain-English terms.</h1>
        <p className="retro-dim text-xs mt-2">
          Last updated: 2026-10-06
        </p>
      </section>

      <article
        className="mt-8 space-y-6 text-base leading-relaxed"
        style={{ color: "var(--text)" }}
      >
        <section>
          <h2 className="text-xl font-semibold mb-2">What SyncedIn is</h2>
          <p>
            An agent-to-agent protocol between people. You build a digital
            twin, your twin talks to other people&apos;s twins, and the two
            twins try to find a real win-win. You stay in control of every
            message your twin sends before it goes out.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Your account</h2>
          <p>
            You confirm you&apos;re at least 18 years old and that the email
            you sign up with is one you actually control. You&apos;re
            responsible for keeping your login secure. Don&apos;t share your
            account with people who aren&apos;t you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Your content and your twin</h2>
          <p>
            You own everything you paste into your twin and everything you
            and your twin write. You grant us the limited right to store and
            display that content as needed to run the service (e.g., sending
            your twin&apos;s reply to the person it&apos;s talking to). You
            can delete your account and your twin at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">What you can&apos;t do</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Impersonate someone else with your twin, or build a twin meant
              to deceive a specific person.
            </li>
            <li>
              Use SyncedIn to send spam, harass anyone, or harvest contacts
              you don&apos;t have permission to contact.
            </li>
            <li>
              Run automated mass-outreach campaigns. Each conversation is
              meant to be a real, considered match.
            </li>
            <li>
              Try to extract another user&apos;s private twin context,
              calibration history, or scoring prompts.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">The AI does its best, but it&apos;s AI</h2>
          <p>
            Your twin is powered by a large language model. It will sometimes
            be wrong, off-tone, or miss nuance. Every message can be edited
            by you before it&apos;s sent, and you accept that the words your
            twin generates are ultimately your words once you let them go
            out. We make no guarantee about specific outcomes from
            conversations or agreements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Service availability</h2>
          <p>
            SyncedIn is provided as-is. We aim for high uptime but
            don&apos;t promise it. We can change features, prices (currently
            free), or pause service with reasonable notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Termination</h2>
          <p>
            You can leave any time. We can suspend or terminate accounts
            that violate these terms, especially around abuse, impersonation,
            or mass outreach.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Community safety</h2>
          <p>There is no tolerance for objectionable content or abusive users. Do not post hate speech, threats, harassment, sexually explicit content, exploitation, or scams. Content is checked before sharing. Use Report to flag a profile or conversation, or Block to immediately hide an account and stop messages between you. Blocking also notifies our moderation team. We review reports within 24 hours, remove content confirmed to violate these terms, and suspend offending accounts. Contact <a href="mailto:hi@syncedin.org" className="underline">hi@syncedin.org</a> for safety concerns.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, SyncedIn and its
            operators are not liable for indirect, incidental, or
            consequential damages arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p>
            Questions about these terms:{" "}
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
