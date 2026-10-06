import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";

export const metadata = withPublicSEO('/transformer', {
  title: "The Attention Transformer for Humanity · SyncedIn",
  description:
    "A companion to Intention Is All You Need. We read the Transformer architecture layer by layer and rebuild each component for people instead of tokens: encoder/decoder as twins, multi-head as multi-goal, positional encoding as timing, and why self-attention beats linear human search.",
  openGraph: {
    title: "The Attention Transformer for Humanity",
    description:
      "Reading the Transformer architecture layer by layer, rebuilt for people instead of tokens.",
    url: "https://syncedin.org/transformer",
    type: "article"
  }
});

export const revalidate = 3600;

/* ── Figures (server-rendered SVG; CSS-keyframe motion, no client JS) ── */

// FIG A — Encoder–Decoder stack, for people. Mirrors Figure 1 of the paper.
function FigStack() {
  return (
    <figure className="fig">
      <div className="stack-pair">
        <div className="stack-col">
          <div className="stack-head">Twin encoder (N×)</div>
          <div className="stack-box">Multi-goal self-attention</div>
          <div className="stack-arrow">↑</div>
          <div className="stack-box">Context feed-forward</div>
          <div className="stack-arrow">↑</div>
          <div className="stack-box stack-in">Profile + Intent</div>
        </div>
        <div className="stack-bridge" aria-hidden>
          <div className="bridge-label">win-win<br/>cross-attention</div>
          <svg viewBox="0 0 60 120" width="60" height="120">
            <path d="M2 30 Q 30 60 58 30" className="bridge-arc" fill="none" />
            <path d="M2 90 Q 30 60 58 90" className="bridge-arc" fill="none" />
          </svg>
        </div>
        <div className="stack-col">
          <div className="stack-head">Match decoder (N×)</div>
          <div className="stack-box stack-out">Match · reason + next step</div>
          <div className="stack-arrow">↑</div>
          <div className="stack-box stack-core">Cross-attention over the other twin</div>
          <div className="stack-arrow">↑</div>
          <div className="stack-box">Masked self-attention (no overcommitting)</div>
        </div>
      </div>
      <figcaption>
        Figure A: The encoder–decoder, for people. Your twin encodes your
        context; the decoder attends across the other twin and emits a match.
        The decoder&apos;s self-attention is masked: it can build on what was
        already agreed, never on a commitment that has not happened yet.
      </figcaption>
    </figure>
  );
}

// FIG B — Multi-head attention = multi-goal coordination.
function FigMultiGoal() {
  const heads = [
    { label: "if VC → raise", color: "var(--amber)" },
    { label: "if founder → collaborate", color: "var(--amber-bright)" },
    { label: "if operator → hire", color: "var(--blue, #2358ff)" },
    { label: "if press → story", color: "#9333ea" }
  ];
  return (
    <figure className="fig">
      <div className="heads">
        {heads.map((h, i) => (
          <div key={i} className="head-box" style={{ borderColor: h.color }}>
            <span className="head-dot" style={{ background: h.color }} />
            {h.label}
          </div>
        ))}
      </div>
      <div className="heads-join">↓ concatenate · project ↓</div>
      <div className="heads-out">One twin, the right intent for each counterpart</div>
      <figcaption>
        Figure B: Multi-head attention lets a model attend in several
        representation subspaces at once. A twin does the same with goals: it
        pitches a different win-win to an investor, a founder, an operator, or a
        journalist, in parallel, from one identity.
      </figcaption>
    </figure>
  );
}

// FIG C — The complexity table (Table 1 of the paper), for coordination.
function FigComplexity() {
  return (
    <figure className="fig">
      <div className="ctable-wrap">
        <table className="ctable">
          <thead>
            <tr>
              <th>Layer / method</th>
              <th>Path length between two people</th>
              <th>Sequential steps</th>
              <th>Parallel?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Human introductions (recurrent)</td>
              <td><code>O(n)</code></td>
              <td><code>O(n)</code></td>
              <td>No</td>
            </tr>
            <tr>
              <td>Warm-intro chains (convolutional)</td>
              <td><code>O(logₖ n)</code></td>
              <td><code>O(1)</code></td>
              <td>Partly</td>
            </tr>
            <tr className="ctable-hi">
              <td>Agent network (self-attention)</td>
              <td><code>O(1)</code></td>
              <td><code>O(1)</code></td>
              <td>Yes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <figcaption>
        Figure C: The reason the architecture matters. In the paper, self-
        attention connects any two positions in a constant number of steps,
        while recurrence needs O(n). Coordination has the same shape: human
        introductions relate two people in O(n) hops; an agent network relates
        any pair in O(1), in parallel.
      </figcaption>
    </figure>
  );
}

export default function TransformerPage() {
  return (
    <main className="paper">
      <style>{`
        .paper { max-width: 760px; margin: 0 auto; padding: 28px 22px 96px; color: var(--text); line-height: 1.7; font-size: 17px; }
        .paper a.back { font-size: 13px; color: var(--text-dim); text-decoration: none; }
        .paper .kicker { margin-top: 26px; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--amber-bright); }
        .paper h1 { font-size: clamp(32px, 5.5vw, 48px); font-weight: 850; letter-spacing: -0.025em; line-height: 1.06; margin: 8px 0 6px; }
        .paper .byline { color: var(--text-dim); font-size: 14px; margin-bottom: 4px; }
        .paper h2 { font-size: 25px; font-weight: 820; letter-spacing: -0.015em; margin: 44px 0 10px; }
        .paper .abstract { margin-top: 22px; padding: 18px 20px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 14px; font-size: 16px; }
        .paper .abstract .lbl { font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-dim); display: block; margin-bottom: 6px; }
        .paper p { margin: 14px 0; }
        .paper blockquote { margin: 22px 0; padding: 12px 18px; border-left: 3px solid var(--amber); background: var(--panel-2); border-radius: 0 10px 10px 0; font-size: 18px; font-style: italic; }
        .paper code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; background: var(--panel-2); padding: 1px 6px; border-radius: 6px; }
        .fig { margin: 30px 0; }
        figcaption { margin-top: 14px; font-size: 13.5px; color: var(--text-dim); line-height: 1.5; text-align: center; }

        /* encoder/decoder stacks */
        .stack-pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
        @media (max-width: 620px) { .stack-pair { grid-template-columns: 1fr; } .stack-bridge { transform: rotate(90deg); margin: 4px auto; } }
        .stack-col { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .stack-head { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }
        .stack-box { width: 100%; text-align: center; padding: 11px 12px; border-radius: 11px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--border); background: var(--panel-2); }
        .stack-in { background: var(--panel-solid); font-weight: 800; }
        .stack-out { background: var(--panel-solid); font-weight: 800; }
        .stack-core { border-color: var(--amber); background: linear-gradient(135deg, rgba(35,88,255,0.12), rgba(147,51,234,0.12)); font-weight: 800; animation: coreGlow 2.8s ease-in-out infinite; }
        .stack-arrow { color: var(--text-dim); font-size: 14px; }
        .stack-bridge { display: flex; flex-direction: column; align-items: center; }
        .bridge-label { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--amber-bright); text-align: center; line-height: 1.3; margin-bottom: 2px; }
        .bridge-arc { stroke: var(--amber); stroke-width: 2; opacity: 0.6; stroke-dasharray: 4 5; animation: march 1.6s linear infinite; }
        @keyframes march { to { stroke-dashoffset: -28; } }
        @keyframes coreGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(107,45,201,0); } 50% { box-shadow: 0 0 0 4px rgba(107,45,201,0.18); } }

        /* multi-head */
        .heads { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .head-box { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--panel-2); font-size: 13px; font-weight: 700; }
        .head-dot { width: 9px; height: 9px; border-radius: 3px; }
        .heads-join { text-align: center; color: var(--text-dim); font-size: 12px; font-weight: 700; margin: 12px 0; letter-spacing: 0.04em; }
        .heads-out { text-align: center; padding: 11px 16px; border-radius: 11px; border: 1px solid var(--amber); background: linear-gradient(135deg, rgba(35,88,255,0.10), rgba(147,51,234,0.10)); font-weight: 800; font-size: 14px; max-width: 460px; margin: 0 auto; }

        /* complexity table */
        .ctable-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 14px; }
        .ctable { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .ctable th { text-align: left; padding: 11px 14px; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--border); }
        .ctable td { padding: 11px 14px; border-top: 1px solid var(--border); }
        .ctable-hi { background: linear-gradient(135deg, rgba(35,88,255,0.08), rgba(147,51,234,0.08)); }
        .ctable-hi td { font-weight: 800; }
      `}</style>

      <Link href="/paper" className="back">&lt; Intention Is All You Need</Link>

      <div className="kicker">A companion to “Intention Is All You Need”</div>
      <h1>The Attention Transformer for Humanity</h1>
      <div className="byline">Jackson Jesionowski · SyncedIn · Persist Ventures</div>
      <div className="byline">Reading the architecture, layer by layer</div>

      <div className="abstract">
        <span className="lbl">Abstract</span>
        The companion paper argued that intention is the right primitive for a
        coordination layer. This one takes the argument literally. We read the
        Transformer architecture component by component and rebuild each one for
        people instead of tokens: the encoder becomes your twin, the decoder
        emits matches, scaled dot-product attention becomes win-win attention,
        multi-head attention becomes multi-goal coordination, positional
        encoding becomes timing, and the complexity table that justified
        self-attention turns out to justify agent-to-agent coordination for
        exactly the same reason. The machine that learned to understand language
        is, almost line for line, the machine that could help humanity
        coordinate.
      </div>

      <h2>1. The encoder and decoder, for people</h2>
      <p>
        A sequence transducer has two stacks. The encoder maps an input into a
        rich internal representation; the decoder consumes that representation
        and generates an output one element at a time, attending back over the
        encoder at every step. Map this onto coordination. Your{" "}
        <strong>twin is the encoder</strong>: it takes your profile and intent
        and builds a representation rich enough to negotiate from. The{" "}
        <strong>match is the decoder output</strong>: produced step by step,
        attending across the other person&apos;s twin, until it lands on a
        concrete next step. The decoder&apos;s self-attention is{" "}
        <strong>masked</strong> in the paper so a position cannot peek at the
        future. Ours is masked too, for a different reason: a twin can build on
        what was already agreed, never on a commitment that has not happened.
      </p>
      <FigStack />

      <h2>2. Scaled win-win attention</h2>
      <p>
        Scaled dot-product attention computes <code>softmax(QKᵀ/√d)·V</code>:
        queries dotted against keys give compatibility weights, scaled by{" "}
        <code>√d</code> so the softmax does not saturate, then used to mix the
        values. Win-win attention is the same operation over people. Your
        intentions are the queries, everyone else&apos;s are the keys, the dot
        product is the size of the deal between you, and the values are the
        matches that get surfaced. The <code>√d</code> scaling has a human
        analog too: without it, one loud signal (a famous name, a giant raise)
        dominates everything; scaling keeps the network attending to genuine
        fit rather than magnitude.
      </p>

      <h2>3. Multi-head is multi-goal</h2>
      <p>
        The paper&apos;s key trick is that a single attention head averages too
        much, so it runs several in parallel, each attending in a different
        representation subspace, then concatenates them. A person is not one
        intent either. You are a different counterpart to an investor, a
        founder, an operator, and a journalist. Multi-head attention, for
        humans, is <strong>multi-goal coordination</strong>: one twin, one
        identity, several intents attended in parallel, with the right win-win
        offered to each kind of person.
      </p>
      <FigMultiGoal />

      <h2>4. Positional encoding is timing</h2>
      <p>
        A transformer has no recurrence, so it injects positional encodings to
        recover order. A coordination layer has no shared clock, so it must
        inject <strong>timing</strong>: when you are reachable, how urgent a need
        is, how fresh an intent is. A pre-seed raise closing this week and a
        someday-maybe idea are different positions in time, and the network has
        to encode that or it will surface the right match at the wrong moment.
      </p>

      <h2>5. Residuals, honesty, and the human in the loop</h2>
      <p>
        Residual connections and layer norm are what let a deep stack train
        without drifting: every sub-layer adds to its input rather than
        replacing it, and the result is renormalized. Coordination needs the
        same stabilizers. The <strong>learning loop</strong> is the residual:
        each edit you make adds a correction on top of who your twin already is,
        rather than overwriting it. <strong>Human confirmation</strong> is the
        normalization: nothing reaches the world until you approve it. And the
        single hard constraint, that <strong>the agent never claims an action it
        did not take</strong>, is what keeps the whole stack trustworthy as it
        deepens.
      </p>

      <h2>6. Why self-attention, for coordination</h2>
      <p>
        The paper justifies self-attention with a table. Self-attention connects
        any two positions in a constant number of operations; recurrence needs
        O(n); and self-attention parallelizes where recurrence cannot. That
        table is the whole argument for agent-to-agent coordination, with the
        word &quot;position&quot; replaced by &quot;person.&quot;
      </p>
      <FigComplexity />
      <blockquote>
        Human introductions relate two people in O(n) hops, one warm intro at a
        time. An agent network relates any pair in O(1), in parallel. That is
        the difference between the speed of a human and the speed of light.
      </blockquote>

      <h2>7. Training is the learning loop</h2>
      <p>
        A transformer learns by gradient descent against a loss. A twin learns
        the same way, with a softer signal. Every time you edit a draft your
        twin produced, the edit is the gradient: it nudges your twin&apos;s voice
        and judgment toward yours. Every accepted or denied proposal labels the
        match. The platform is never finished training, because the loss it is
        minimizing is the distance between what your twin says and what you would
        have said, and you keep teaching it.
      </p>

      <h2>8. Conclusion</h2>
      <p>
        Run the substitution all the way through and almost every part of the
        Transformer has a coordination twin: encoder and decoder, scaled
        attention, multi-head, positional encoding, residuals, masking,
        training. The architecture that let machines understand each other&apos;s
        language is, component for component, an architecture for letting people
        find each other. We did not invent it. We are pointing it at us.
      </p>

      <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/paper" className="retro-btn" style={{ padding: "12px 22px" }}>
          ← Read “Intention Is All You Need”
        </Link>
        <Link href="/onboarding" className="retro-btn retro-btn-primary" style={{ padding: "12px 22px", fontWeight: 800 }}>
          Build your twin →
        </Link>
      </div>
    </main>
  );
}
