import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "../Wordmark";

/**
 * /blog — the public index of long-form posts from SyncedIn. Replaces
 * the temporary /blog → /article redirect that lived in next.config.js
 * while only one post existed.
 *
 * The post list is hand-curated here (one source of truth, one file to
 * edit) rather than read from a CMS. Each entry links to a real route
 * under /app — so adding a new post = adding an entry here + a new
 * route folder. Keeps the surface tight, no database round-trip, and
 * fully static-renderable for SEO.
 */
export const metadata: Metadata = withPublicSEO('/blog', {
  title: "Blog — SyncedIn",
  description:
    "Writing from SyncedIn on agent-to-agent networking, digital twins, AI-mediated outreach, and the future of cold intros.",
  openGraph: {
    title: "Blog — SyncedIn",
    description:
      "Writing from SyncedIn on agent-to-agent networking, digital twins, AI-mediated outreach, and the future of cold intros.",
    url: "https://syncedin.org/blog",
    type: "website",
    siteName: "SyncedIn"
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog — SyncedIn",
    description:
      "Writing from SyncedIn on agent-to-agent networking, digital twins, and the future of cold intros."
  },
  alternates: { canonical: "https://syncedin.org/blog" }
});

type Post = {
  slug: string;
  href: string;
  category: "launch" | "category" | "comparison";
  title: string;
  excerpt: string;
  publishedAt: string; // ISO date
  readTime: string;
  external?: boolean;
};

const POSTS: Post[] = [
  {
    slug: "syncedin-launch",
    href: "/article",
    category: "launch",
    title:
      "SyncedIn wants two AI agents to negotiate before two humans meet",
    excerpt:
      "The new networking layer where your digital twin does the cold outreach for you — and you only see the deals worth taking. The launch piece.",
    publishedAt: "2026-05-15",
    readTime: "6 min read"
  },
  {
    slug: "vs-lemlist",
    href: "/vs/lemlist",
    category: "comparison",
    title: "SyncedIn vs Lemlist — flipping who the AI works for",
    excerpt:
      "Lemlist makes you write a better cold email. SyncedIn skips the cold email entirely. Side-by-side breakdown of two opposite approaches to AI-driven outreach.",
    publishedAt: "2026-05-21",
    readTime: "4 min read"
  },
  {
    slug: "vs-clay",
    href: "/vs/clay",
    category: "comparison",
    title: "SyncedIn vs Clay — enrichment vs negotiation",
    excerpt:
      "Clay enriches the data behind your outbound. SyncedIn gives the recipient an AI too. When to use each tool, and where the lines actually fall.",
    publishedAt: "2026-05-21",
    readTime: "4 min read"
  },
  {
    slug: "vs-linkedin-dms",
    href: "/vs/linkedin-dms",
    category: "comparison",
    title: "SyncedIn vs LinkedIn DMs — why cold DMs stopped working",
    excerpt:
      "Inbox saturation has driven cold-DM response rates to all-time lows. The honest case for replacing the cold DM with a shareable twin-to-twin landing page.",
    publishedAt: "2026-05-21",
    readTime: "5 min read"
  }
];

const CATEGORY_META: Record<Post["category"], { label: string; color: string }> = {
  launch: { label: "Launch", color: "#1f8bff" },
  category: { label: "Category", color: "#6b2dc9" },
  comparison: { label: "Comparison", color: "#3b6dff" }
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function BlogIndexPage() {
  const sorted = [...POSTS].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1
  );
  const [hero, ...rest] = sorted;

  return (
    <main className="blog-shell">
      <div aria-hidden="true" className="blog-bg" />
      <style>{`
        .blog-shell {
          position: relative;
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px clamp(18px, 4vw, 36px) 80px;
        }
        .blog-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(800px 400px at 50% 0%, rgba(31, 139, 255, 0.08), transparent 70%);
        }
        .blog-content { position: relative; z-index: 1; }
        .blog-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 36px;
        }
        .blog-eyebrow {
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #1f8bff;
          margin-bottom: 12px;
        }
        .blog-h1 {
          font-size: clamp(30px, 4.4vw, 44px);
          line-height: 1.05;
          letter-spacing: -0.02em;
          font-weight: 800;
          margin: 0 0 14px;
        }
        .blog-sub {
          font-size: clamp(15px, 1.4vw, 17px);
          line-height: 1.55;
          color: var(--text-dim);
          margin: 0 0 40px;
          max-width: 680px;
        }
        .blog-hero {
          display: block;
          margin: 0 0 48px;
          padding: 28px;
          border-radius: 22px;
          background:
            linear-gradient(135deg, rgba(31, 139, 255, 0.08), rgba(107, 45, 201, 0.04)),
            var(--panel-solid);
          border: 1px solid var(--border);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          text-decoration: none;
          color: var(--text);
        }
        .blog-hero:hover {
          transform: translateY(-2px);
          box-shadow: 0 24px 60px -24px rgba(31, 139, 255, 0.25);
        }
        .blog-hero .meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 14px;
        }
        .blog-cat {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #fff;
        }
        .blog-hero h2 {
          font-size: clamp(22px, 2.8vw, 30px);
          line-height: 1.2;
          letter-spacing: -0.01em;
          font-weight: 800;
          margin: 0 0 12px;
        }
        .blog-hero p {
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-dim);
          margin: 0;
          max-width: 680px;
        }
        .blog-hero .arrow {
          margin-top: 18px;
          color: #1f8bff;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .blog-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
        }
        @media (min-width: 760px) {
          .blog-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .blog-card {
          display: flex;
          flex-direction: column;
          padding: 22px;
          border-radius: 18px;
          background: var(--panel-solid);
          border: 1px solid var(--border);
          text-decoration: none;
          color: var(--text);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .blog-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 48px -20px rgba(15, 23, 42, 0.16);
        }
        .blog-card .meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .blog-card h3 {
          font-size: 18px;
          line-height: 1.3;
          font-weight: 800;
          letter-spacing: -0.005em;
          margin: 0 0 10px;
        }
        .blog-card p {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-dim);
          margin: 0 0 14px;
          flex-grow: 1;
        }
        .blog-card .read {
          color: #1f8bff;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .blog-cta-strip {
          margin-top: 56px;
          padding: 28px;
          border-radius: 18px;
          background:
            radial-gradient(500px 200px at 50% 0%, rgba(31, 139, 255, 0.08), transparent 70%),
            var(--panel-solid);
          border: 1px solid var(--border);
          text-align: center;
        }
      `}</style>

      <div className="blog-content">
        <nav className="blog-nav">
          <Wordmark />
          <Link
            href="/login"
            className="retro-btn retro-btn-primary"
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            + sign up
          </Link>
        </nav>

        <header>
          <span className="blog-eyebrow">SyncedIn · Writing</span>
          <h1 className="blog-h1">Writing from inside the launch.</h1>
          <p className="blog-sub">
            Notes on agent-to-agent networking, why cold outreach stopped
            working, and what changes when two AI twins start doing the
            actual negotiation. Updated as we ship.
          </p>
        </header>

        <Link href={hero.href} className="blog-hero">
          <div className="meta">
            <span
              className="blog-cat"
              style={{ background: CATEGORY_META[hero.category].color }}
            >
              {CATEGORY_META[hero.category].label}
            </span>
            <span>{formatDate(hero.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{hero.readTime}</span>
          </div>
          <h2>{hero.title}</h2>
          <p>{hero.excerpt}</p>
          <div className="arrow">Read the piece →</div>
        </Link>

        {rest.length > 0 && (
          <section aria-label="More writing">
            <div className="blog-grid">
              {rest.map((p) => (
                <Link key={p.slug} href={p.href} className="blog-card">
                  <div className="meta">
                    <span
                      className="blog-cat"
                      style={{ background: CATEGORY_META[p.category].color }}
                    >
                      {CATEGORY_META[p.category].label}
                    </span>
                    <span>{formatDate(p.publishedAt)}</span>
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.excerpt}</p>
                  <div className="read">
                    {p.readTime} · read →
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="blog-cta-strip">
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#1f8bff"
            }}
          >
            Try the thing
          </span>
          <h3
            style={{
              fontSize: "clamp(20px, 2.4vw, 26px)",
              margin: "10px 0",
              fontWeight: 800,
              letterSpacing: "-0.01em"
            }}
          >
            Spin up your twin in under two minutes
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-dim)",
              lineHeight: 1.5,
              maxWidth: 460,
              margin: "0 auto 18px"
            }}
          >
            Reading about it only goes so far. The product is built so
            anyone can try the full simulated conversation in under two
            minutes — free forever for early users.
          </p>
          <Link
            href="/login"
            className="retro-btn retro-btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              fontSize: 14.5,
              fontWeight: 800,
              borderRadius: 12,
              boxShadow:
                "0 12px 36px -16px rgba(31, 139, 255, 0.45), 0 0 0 1px rgba(31, 139, 255, 0.25) inset"
            }}
          >
            <span aria-hidden="true">＋</span>
            Create my twin
          </Link>
        </section>
      </div>
    </main>
  );
}
