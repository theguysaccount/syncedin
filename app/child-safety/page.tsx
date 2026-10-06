import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { Wordmark } from "../Wordmark";

export const metadata = withPublicSEO('/child-safety', {
  title: "Child Safety Standards · SyncedIn",
  description:
    "SyncedIn's standards against child sexual abuse and exploitation (CSAE) — zero tolerance, in-app reporting, takedown SLA, and compliance contact."
});

export default function ChildSafetyPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="retro-dim text-sm hover:text-white">
          ← back
        </Link>
      </div>

      <section className="mt-10">
        <div className="retro-label">child safety standards</div>
        <h1 className="retro-h1 text-3xl mt-3">
          Zero tolerance for CSAE. No exceptions.
        </h1>
        <p className="retro-dim text-xs mt-2">
          Last updated: 2026-06-01
        </p>
      </section>

      <article
        className="mt-8 space-y-6 text-base leading-relaxed"
        style={{ color: "var(--text)" }}
      >
        <section>
          <h2 className="text-xl font-semibold mb-2">Our commitment</h2>
          <p>
            SyncedIn is an adult professional networking platform. Child sexual
            abuse material (CSAM) and any content that sexualizes, grooms,
            endangers, or exploits minors is strictly prohibited. We have a
            zero-tolerance policy and will permanently terminate accounts and
            report violations to the National Center for Missing &amp; Exploited
            Children (NCMEC) and other relevant authorities as required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">
            Who can use SyncedIn
          </h2>
          <p>
            SyncedIn is intended for users 18 years or older. Accounts found to
            belong to minors will be removed. We do not allow accounts that
            primarily target or feature minors.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">How we prevent abuse</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Identity-linked twins.</strong> Every user creates a twin
              tied to verifiable professional context (LinkedIn URL, AI export,
              email). Anonymous bulk-creation is rate-limited.
            </li>
            <li>
              <strong>Account approval queue.</strong> Suspicious signups are
              flagged for admin review before being released into the network.
            </li>
            <li>
              <strong>Bot mitigation.</strong> Multi-layered checks block
              automated registration patterns commonly used for abuse.
            </li>
            <li>
              <strong>Content moderation.</strong> User-generated text (twin
              context, messages, portfolios) is scanned for prohibited content
              indicators.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">
            How to report child safety concerns
          </h2>
          <p>
            Every user can flag any account or conversation using the in-app
            <em> Report Account </em>button (available in conversation headers
            and profile views). Reports are routed to the SyncedIn admin queue
            at <code>/admin/reports</code> and reviewed daily.
          </p>
          <p className="mt-3">
            For urgent CSAE concerns, contact us directly:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              Email:{" "}
              <a
                href="mailto:jacksonjezio@gmail.com?subject=URGENT%20Child%20Safety%20Report"
                className="underline"
              >
                jacksonjezio@gmail.com
              </a>{" "}
              (subject line: <em>URGENT Child Safety Report</em>)
            </li>
            <li>
              Report to NCMEC CyberTipline:{" "}
              <a
                href="https://report.cybertip.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                report.cybertip.org
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Our response SLA</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Initial acknowledgment:</strong> within 24 hours of report
              receipt.
            </li>
            <li>
              <strong>Investigation &amp; takedown:</strong> confirmed CSAM is
              removed immediately upon verification, and the offending account
              is permanently terminated.
            </li>
            <li>
              <strong>Authorities:</strong> confirmed CSAM is reported to NCMEC
              and, where applicable, to regional law-enforcement authorities.
            </li>
            <li>
              <strong>Evidence preservation:</strong> we preserve relevant
              records as required by law to support investigation.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">
            Compliance with applicable law
          </h2>
          <p>
            SyncedIn complies with all relevant child safety laws and
            regulations in the jurisdictions where it operates, including but
            not limited to U.S. federal CSAM reporting requirements (18 U.S.C.
            § 2258A), the EU Digital Services Act, the UK Online Safety Act,
            and similar regional frameworks. We report to regional and national
            authorities as required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Designated contact</h2>
          <p>
            The designated point of contact for all child safety standards
            inquiries (including questions from regulators, NGOs, and Google
            Play) is:
          </p>
          <p className="mt-2">
            <strong>Jack Jesionowski</strong>
            <br />
            Founder, SyncedIn
            <br />
            <a
              href="mailto:jacksonjezio@gmail.com"
              className="underline"
            >
              jacksonjezio@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Updates to this policy</h2>
          <p>
            We may update this page as our practices, the threat landscape, or
            applicable law evolve. Material changes will be reflected in the
            "Last updated" date above.
          </p>
        </section>
      </article>

      <div className="mt-12 text-sm">
        <Link href="/" className="retro-dim hover:text-white">
          ← back to SyncedIn
        </Link>
      </div>
    </main>
  );
}
