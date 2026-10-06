import { withPublicSEO } from '@/lib/public-seo';
import Link from "next/link";
import { NetworkDensity } from "../communities/NetworkDensity";

export const metadata = withPublicSEO('/paper', {
  title: "Intention Is All You Need · SyncedIn",
  description:
    "The attention transformer for humanity. An open protocol for world harmonization: why intention, routed at the speed of light, is the missing coordination layer that routes around Moloch.",
  openGraph: {
    title: "Intention Is All You Need",
    description:
      "The attention transformer for humanity. An open protocol for world harmonization.",
    url: "https://syncedin.org/paper",
    type: "article"
  }
});

export const revalidate = 3600;

/* ─────────────────────────────────────────────────────────────────────────
   Figures. Server-rendered inline SVG. Motion via CSS keyframes (defined in
   the page <style> block) + SMIL, so they animate with no client JS. Each
   maps a figure from "Attention Is All You Need" onto SyncedIn's design.
   ──────────────────────────────────────────────────────────────────────── */

// FIG 1 — Linear human search vs exponential agent network. The bandwidth thesis.
function FigBandwidth() {
  const ring = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
    return { x: 150 + 95 * Math.cos(a), y: 110 + 80 * Math.sin(a) };
  });
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 1; j < ring.length; j++) edges.push([i, j]);
  const scatter = [
    [40, 60], [110, 45], [70, 120], [30, 160], [120, 150],
    [180, 70], [95, 180], [55, 95], [160, 120]
  ];
  return (
    <figure className="fig">
      <div className="fig-pair">
        <div className="fig-cell">
          <div className="fig-tag">Today · human bandwidth (linear)</div>
          <svg viewBox="0 0 220 210" className="fig-svg">
            {scatter.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="6" className="node-dim" />
            ))}
            {/* one connection forms at a time, marching */}
            <path
              d="M55 95 L110 45 L180 70"
              className="thread"
              fill="none"
            />
          </svg>
        </div>
        <div className="fig-cell">
          <div className="fig-tag accent">On SyncedIn · agent network (exponential)</div>
          <svg viewBox="0 0 300 220" className="fig-svg">
            {edges.map(([a, b], i) => (
              <line
                key={i}
                x1={ring[a].x}
                y1={ring[a].y}
                x2={ring[b].x}
                y2={ring[b].y}
                className="mesh"
                style={{ animationDelay: `${(i % 9) * 0.15}s` }}
              />
            ))}
            {ring.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="7" className="node-live" />
            ))}
          </svg>
        </div>
      </div>
      <figcaption>
        Figure 1: Human search relates two people in O(n) steps, one
        introduction at a time. An agent network relates every pair at once.
        The same gap as the speed of a human versus the speed of light.
      </figcaption>
    </figure>
  );
}

// FIG 2 — Attention over tokens → attention over intentions.
function FigAttentionToIntention() {
  const tokens = ["I", "need", "a", "designer"];
  const people = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: 150 + 78 * Math.cos(a), y: 105 + 70 * Math.sin(a) };
  });
  return (
    <figure className="fig">
      <div className="fig-pair">
        <div className="fig-cell">
          <div className="fig-tag">Attention over tokens</div>
          <svg viewBox="0 0 300 210" className="fig-svg">
            {tokens.map((t, i) => {
              const x = 40 + i * 70;
              return (
                <g key={t}>
                  {tokens.map((_, j) =>
                    j === 3 ? (
                      <path
                        key={j}
                        d={`M${40 + j * 70} 150 Q ${(40 + j * 70 + x) / 2} 60 ${x} 150`}
                        className="attn-arc"
                        fill="none"
                      />
                    ) : null
                  )}
                  <rect x={x - 26} y="150" width="52" height="34" rx="8" className="tok" />
                  <text x={x} y="172" className="tok-label">{t}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="fig-cell">
          <div className="fig-tag accent">Attention over intentions</div>
          <svg viewBox="0 0 300 210" className="fig-svg">
            {people.map((p, i) =>
              i === 0 ? null : (
                <path
                  key={i}
                  d={`M${people[0].x} ${people[0].y} Q 150 ${people[0].y - 30} ${p.x} ${p.y}`}
                  className="winwin-arc"
                  fill="none"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              )
            )}
            {people.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === 0 ? 11 : 8}
                className={i === 0 ? "node-self" : "node-live"}
              />
            ))}
          </svg>
        </div>
      </div>
      <figcaption>
        Figure 2: A transformer lets a token attend to every other token,
        weighted by relevance. SyncedIn lets a person&apos;s intention attend
        to every other person&apos;s, weighted by the size of the win-win.
      </figcaption>
    </figure>
  );
}

// FIG 3 — The coordination architecture (the humanity transformer stack).
function FigArchitecture() {
  const blocks = [
    { label: "The meeting · real-world outcome", kind: "out" },
    { label: "Human confirmation", kind: "human" },
    { label: "Agreement · intent receipt (the agent never fakes an action)", kind: "norm" },
    { label: "Match · reason + next step", kind: "norm" },
    { label: "Win-Win Attention · twin ↔ twin (parallel)", kind: "core" },
    { label: "Twin · context encoder (goals, voice, offers)", kind: "norm" },
    { label: "Profile + Intent · what I seek, what I offer, what my agent may do", kind: "in" }
  ];
  return (
    <figure className="fig">
      <div className="arch">
        {blocks.map((b, i) => (
          <div key={i} className={`arch-row arch-${b.kind}`}>
            {i !== 0 && <span className="arch-arrow" aria-hidden>↑</span>}
            <div className={`arch-box arch-box-${b.kind}`}>{b.label}</div>
          </div>
        ))}
      </div>
      <figcaption>
        Figure 3: The architecture, read bottom to top. Inputs are intentions,
        not tokens. The encoder is your twin; the attention block is twins
        negotiating in parallel; the decoder emits a match with a reason and a
        next step. Nothing reaches the world without your confirmation.
      </figcaption>
    </figure>
  );
}

// FIG 4 — Scaled win-win attention (the scaled dot-product analog).
function FigWinWinAttention() {
  const steps = [
    "Your intentions (Q)",
    "Their intentions (K)",
    "Match score  Q·Kᵀ / √d",
    "Softmax · rank the world",
    "Surface matches (V)"
  ];
  return (
    <figure className="fig">
      <div className="flow">
        {steps.map((s, i) => (
          <div key={i} className="flow-item">
            <div className={`flow-box ${i === 3 ? "flow-soft" : ""}`}>{s}</div>
            {i < steps.length - 1 && <span className="flow-arrow" aria-hidden>→</span>}
          </div>
        ))}
      </div>
      <figcaption>
        Figure 4: Scaled win-win attention. Your intentions query everyone
        else&apos;s; the compatibility of each pair becomes a score; a softmax
        ranks the whole world; the strongest matches are surfaced to you.
      </figcaption>
    </figure>
  );
}

// FIG 5 — The lived-experience flywheel. The reality-navigation loop.
function FigFlywheel() {
  const stages = ["Live", "Record", "Sync", "Understand", "Coordinate", "Live better"];
  const cx = 160;
  const cy = 160;
  const r = 116;
  const pts = stages.map((s, i) => {
    const a = (i / stages.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), label: s };
  });
  return (
    <figure className="fig">
      <svg viewBox="0 0 320 320" className="fig-svg" style={{ maxWidth: 360, margin: "0 auto" }}>
        <circle cx={cx} cy={cy} r={r} className="fly-ring" fill="none" />
        <circle r="6" className="fly-spark">
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            path={`M ${cx},${cy - r} a ${r},${r} 0 1,1 -0.1,0 z`}
          />
        </circle>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="7" className="node-live" style={{ animationDelay: `${i * 0.3}s` }} />
            <text x={p.x} y={p.y - 14} className="fly-label">{p.label}</text>
          </g>
        ))}
        <text x={cx} y={cy} className="fly-center">the flywheel</text>
      </svg>
      <figcaption>
        Figure 5: Live, record, sync, understand, coordinate, live better. Your
        real-world experience becomes the dataset; your purpose becomes the
        compass; your twin becomes the navigator. Each turn of the loop makes
        the next one sharper.
      </figcaption>
    </figure>
  );
}

export default function PaperPage() {
  return (
    <main className="paper">
      <style>{`
        .paper {
          max-width: 760px;
          margin: 0 auto;
          padding: 28px 22px 96px;
          color: var(--text);
          line-height: 1.7;
          font-size: 17px;
        }
        .paper a.back { font-size: 13px; color: var(--text-dim); text-decoration: none; }
        .paper .kicker {
          margin-top: 26px;
          font-size: 12px; font-weight: 800; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--amber-bright);
        }
        .paper h1 {
          font-size: clamp(34px, 6vw, 52px);
          font-weight: 850; letter-spacing: -0.025em; line-height: 1.05;
          margin: 8px 0 6px;
        }
        .paper .byline { color: var(--text-dim); font-size: 14px; margin-bottom: 4px; }
        .paper h2 {
          font-size: 26px; font-weight: 820; letter-spacing: -0.015em;
          margin: 44px 0 10px;
        }
        .paper .abstract {
          margin-top: 22px; padding: 18px 20px;
          background: var(--panel-2); border: 1px solid var(--border);
          border-radius: 14px; font-size: 16px;
        }
        .paper .abstract .lbl {
          font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
          text-transform: uppercase; color: var(--text-dim); display: block; margin-bottom: 6px;
        }
        .paper p { margin: 14px 0; }
        .paper blockquote {
          margin: 22px 0; padding: 12px 18px;
          border-left: 3px solid var(--amber); background: var(--panel-2);
          border-radius: 0 10px 10px 0; font-size: 18px; font-style: italic;
        }
        .paper code {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 13px; background: var(--panel-2);
          padding: 1px 6px; border-radius: 6px;
        }
        .paper pre {
          background: var(--panel-2); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px; overflow-x: auto;
          font-size: 12.5px; line-height: 1.5; margin: 16px 0;
        }
        .paper ul { margin: 12px 0; padding-left: 22px; }
        .paper li { margin: 6px 0; }

        /* ── Figures ── */
        .fig { margin: 30px 0; }
        .fig-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 620px) { .fig-pair { grid-template-columns: 1fr; } }
        .fig-cell {
          background: var(--panel-2); border: 1px solid var(--border);
          border-radius: 14px; padding: 12px;
        }
        .fig-svg { width: 100%; height: auto; display: block; }
        .fig-tag {
          font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--text-dim);
          text-align: center; margin-bottom: 6px;
        }
        .fig-tag.accent { color: var(--amber-bright); }
        figcaption {
          margin-top: 12px; font-size: 13.5px; color: var(--text-dim);
          line-height: 1.5; text-align: center;
        }
        .node-dim { fill: var(--text-dim); opacity: 0.4; }
        .node-live { fill: var(--amber); animation: nodePulse 2.4s ease-in-out infinite; }
        .node-self { fill: var(--amber-bright); }
        .mesh { stroke: var(--amber); stroke-width: 1; opacity: 0.16; animation: meshGlow 3s ease-in-out infinite; }
        .thread { stroke: var(--text-dim); stroke-width: 2.5; stroke-dasharray: 6 8; animation: march 1.2s linear infinite; opacity: 0.7; }
        .tok { fill: var(--panel-solid); stroke: var(--border); stroke-width: 1; }
        .tok-label { fill: var(--text); font-size: 13px; font-weight: 700; text-anchor: middle; font-family: ui-sans-serif, system-ui; }
        .attn-arc { stroke: var(--blue, #2358ff); stroke-width: 1.6; opacity: 0.5; animation: meshGlow 2.6s ease-in-out infinite; }
        .winwin-arc { stroke: var(--amber); stroke-width: 2; opacity: 0.55; stroke-dasharray: 4 5; animation: march 1.6s linear infinite; }
        @keyframes nodePulse { 0%,100% { r: 7; } 50% { r: 9; } }
        @keyframes meshGlow { 0%,100% { opacity: 0.12; } 50% { opacity: 0.4; } }
        @keyframes march { to { stroke-dashoffset: -28; } }

        /* architecture stack */
        .arch { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .arch-row { display: flex; flex-direction: column; align-items: center; width: 100%; }
        .arch-arrow { color: var(--text-dim); font-size: 16px; line-height: 1.4; }
        .arch-box {
          width: min(520px, 100%); text-align: center; padding: 12px 16px;
          border-radius: 12px; font-size: 14.5px; font-weight: 600;
          border: 1px solid var(--border); background: var(--panel-2);
        }
        .arch-box-core {
          border-color: var(--amber); font-weight: 800;
          background: linear-gradient(135deg, rgba(35,88,255,0.12), rgba(147,51,234,0.12));
          animation: coreGlow 2.8s ease-in-out infinite;
        }
        .arch-box-in { background: var(--panel-solid); }
        .arch-box-out { background: var(--panel-solid); font-weight: 800; }
        .arch-box-human { border-color: var(--amber-bright); color: var(--amber-bright); font-weight: 800; }
        @keyframes coreGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(107,45,201,0.0); }
          50% { box-shadow: 0 0 0 4px rgba(107,45,201,0.18); }
        }

        /* horizontal flow */
        .flow { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
        .flow-item { display: inline-flex; align-items: center; gap: 8px; }
        .flow-box {
          padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 700;
          border: 1px solid var(--border); background: var(--panel-2);
        }
        .flow-soft { border-color: var(--amber); background: linear-gradient(135deg, rgba(35,88,255,0.10), rgba(147,51,234,0.10)); }
        .flow-arrow { color: var(--text-dim); font-weight: 800; }

        /* lived-experience flywheel */
        .fly-ring { stroke: var(--border-bright); stroke-width: 2; opacity: 0.5; }
        .fly-spark { fill: var(--amber-bright); }
        .fly-label { fill: var(--text); font-size: 12px; font-weight: 700; text-anchor: middle; font-family: ui-sans-serif, system-ui; }
        .fly-center { fill: var(--text-dim); font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; text-anchor: middle; dominant-baseline: middle; }
      `}</style>

      <Link href="/" className="back">&lt; syncedin.org</Link>

      <div className="kicker">The attention transformer for humanity</div>
      <h1>Intention Is All You Need</h1>
      <div className="byline">Jackson Jesionowski · SyncedIn · Persist Ventures</div>
      <div className="byline">Position paper · draft</div>

      <div className="abstract">
        <span className="lbl">Abstract</span>
        The binding constraint on human potential is not intelligence, capital,
        or will. It is <strong>bandwidth</strong>: the rate at which intentions
        can find the counterparts who could fulfill them. Human search is
        linear; we meet people one at a time and usually find nothing. The
        result is Moloch, the god of coordination failure. We propose{" "}
        <strong>intention</strong> as the right primitive for a coordination
        layer, and a network of personal digital twins as its mechanism. Where
        the transformer made sequence modeling tractable by letting every token
        attend to every other token, a harmonization layer makes human
        coordination tractable by letting every intention reach every other at
        the speed of light. We give it a shape: twins that negotiate win-wins,
        and an open protocol that lets any person, company, or agent express
        machine-readable intent. Intention, routed well and joined faithfully,
        is all you need.
      </div>

      <h2>1. The god of coordination failure</h2>
      <p>
        Look at the world&apos;s hardest problems and a strange fact emerges:
        almost no one wants them. No one wants the smokestack, the prison, the
        arms race. There are nonprofits sitting on hundreds of billions aimed at
        problems nearly every human would vote to solve. And yet the problems
        persist.
      </p>
      <p>
        The rationalist tradition names the force that produces outcomes no one
        chose <strong>Moloch</strong>, the god of coordination failure: locally
        rational decisions that sum to a globally insane result. It is not a
        failure of values. It is a failure of information routing. The aligned
        counterparts never find each other in time. The signal exists. The
        bandwidth does not.
      </p>

      <h2>2. The bandwidth bottleneck</h2>
      <p>
        A thought experiment. Pause time. You are given one conversation with
        every human on Earth, no clock running. When you press play, how
        different is your trajectory? Which permanent-looking problem dissolves
        the moment the two people who could solve it are in the same room? Now
        let groups have those conversations. Which coalitions form that today
        never form, because the members are scattered across the invisibility of
        the world?
      </p>
      <p>
        We live far below that upper bound because human search is linear. We
        have light at our fingertips and we use it to send each other linear
        messages.
      </p>
      <div className="fig">
        <NetworkDensity
          slowLabel="Today · human bandwidth"
          fastLabel="On SyncedIn · speed of light"
          slowCaption="One introduction at a time. Most of the highest-leverage pairs never meet."
          fastCaption="Twins talk in parallel, continuously, surfacing the strongest win-wins ahead of time."
        />
      </div>

      <h2>3. From attention to intention</h2>
      <p>
        The transformer replaced recurrence with attention: you do not process a
        sequence step by step if you let every element attend directly to every
        other, weighted by relevance. We borrow the shape and change the object.
        In a coordination layer the elements are <strong>people, each carrying
        an intention</strong>. The relevance weight between two people is the
        strength of the win-win available to them. Attention over tokens gave us
        language models. Attention over intentions gives us a coordination
        layer.
      </p>
      <FigAttentionToIntention />

      <h2>4. The harmonizer</h2>
      <p>
        A world teacher gives wisdom and stands above people. A{" "}
        <strong>world harmonizer</strong> synchronizes people, meaning,
        incentives, and action, and stands between them. The word earns it.
        Harmony, from the Greek <em>harmonía</em>, first meant not pleasant
        sound but <strong>a means of joining</strong>: the fitting-together of
        separated parts into one working whole. To harmonize the world is to
        discover how its pieces were meant to fit.
      </p>
      <blockquote>
        A prophet is a world harmonizer: someone who hears the dissonance before
        everyone else and builds the rhythm that lets humanity move together.
      </blockquote>
      <p>
        It is not egotistical to want to harmonize the world. It becomes
        egotistical only when the world is asked to serve the ego, instead of
        the ego being disciplined to serve the world.
      </p>

      <h2>5. The coordination architecture</h2>
      <p>
        The harmonizer needs a mechanism: a twin that carries your context, twins
        that negotiate the strongest win-win first and converge on a concrete
        next step, a sync score that ranks the world, and a learning loop where
        every edit you make teaches your twin your voice and judgment. Read the
        stack bottom to top, and it is a transformer whose inputs are intentions.
      </p>
      <FigArchitecture />
      <FigWinWinAttention />

      <h2>6. SyncedIn as an open protocol</h2>
      <p>
        Today everyone is trapped in closed graphs: LinkedIn holds the
        professional graph, X the idea graph, calendars the time graph, CRMs the
        deal graph, each AI assistant a private context. None speak intent to
        each other. SyncedIn becomes the harmonization layer across all of them,
        defined by five core objects.
      </p>
      <ul>
        <li><strong>Profile</strong> — a potential profile: identity, context, needs, offers, values, availability, boundaries.</li>
        <li><strong>Intent</strong> — the part that separates this from social media. Not &quot;look at me,&quot; but &quot;coordinate with me.&quot;</li>
        <li><strong>Agent permission</strong> — the envelope your twin negotiates inside. It can request an intro; it cannot commit equity or terms.</li>
        <li><strong>Match</strong> — a harmonization event that must carry a reason and a next step.</li>
        <li><strong>Agreement</strong> — an intent receipt. The agent never claims an action it did not take.</li>
      </ul>
      <pre>{`{
  "intent_type": "find_cofounder",
  "role": "technical CTO",
  "must_have": ["agent systems", "consumer social", "fast shipping"],
  "permission": "AI may screen and schedule intro after mutual fit"
}`}</pre>
      <p>
        The strategy is one line: <strong>open the language, own the
        harmonizer.</strong> Open the schemas and APIs so any site, community, or
        agent can express and exchange intent. Keep proprietary the matching
        algorithm, the negotiation behavior, the trust models, and the default
        app. HTTP routed documents; SMTP routed mail; MCP routes AI context.
        There is no dominant protocol for human intent and AI-mediated
        introductions. That is the opening.
      </p>

      <h2>7. Why this routes around Moloch</h2>
      <p>
        Moloch wins when coordination is too expensive to attempt. Lower that
        cost toward zero and the default flips: the cooperative move stops
        requiring blind faith, because the platform already simulated the
        handshake and showed both sides it holds. The larger fear about a
        technological singularity is that machine capability outruns human
        coordination. The answer need not be to slow the machines. It can be to
        raise the speed of human coordination to match, using the same
        technology, pointed at us.
      </p>

      <h2>8. From networking to reality navigation</h2>
      <p>
        Everything so far reads as a better way to meet people. The real shift
        is larger. The same layer that routes professional intent can route
        every kind: work, social life, language and meaning, community, purpose,
        inspiration, the environments that make you more alive. Most AI starts
        in the digital world and tries to simulate reality. SyncedIn does the
        reverse. <strong>It starts with lived experience and syncs the digital
        world around it.</strong>
      </p>
      <p>
        That runs on three layers. First, an <strong>internal compass</strong>:
        the system learns what gives you energy, which people make you more
        alive, which rooms unlock you, what work feels meaningful, what patterns
        keep repeating. This is not preferences. It is your alignment signal.
        Second, <strong>real-world discovery</strong>: it routes you toward
        aligned people, inspiring rooms, events, collaborators, cities, retreats,
        and the kind of serendipity that does not happen by accident. Third,
        <strong> digital sync</strong>: after the experience, it records who you
        met, what mattered, what energized you, and what should happen next, and
        your twin gets truer. Live, record, sync, understand, coordinate, live
        better.
      </p>
      <FigFlywheel />
      <blockquote>
        Most people are building AI that understands your files. We are building
        AI that understands your life. Your life becomes the dataset, your
        purpose becomes the compass, your agent becomes the navigator.
      </blockquote>

      <h2>9. Conclusion</h2>
      <p>
        The bottleneck on human potential is the speed at which intentions find
        each other. We finally have machines that can carry intention faithfully
        and route it in parallel. Pointed at language, attention gave us models
        that understand us. Pointed at each other, intention can give us a way to
        find the people, places, and experiences we were always meant to live
        into.
      </p>
      <blockquote>
        LinkedIn mapped who knows whom. SyncedIn maps who should meet whom, and
        lets their agents coordinate why, when, and how.
      </blockquote>
      <p>
        SyncedIn begins as automated networking and becomes a navigation layer
        for reality. It learns from your lived experience, maps your purpose,
        finds the aligned people and environments, and coordinates the next step
        that brings your world into harmony. Not a LinkedIn replacement. Not an
        AI CRM. A world harmonizer: a system for syncing lived experience, human
        potential, and real-world coordination into one moving whole. That is
        the whole reason to build it. Come build it.
      </p>

      <div style={{ marginTop: 40, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/onboarding" className="retro-btn retro-btn-primary" style={{ padding: "12px 22px", fontWeight: 800 }}>
          Build your twin →
        </Link>
        <Link href="/hypernetwork" className="retro-btn" style={{ padding: "12px 22px" }}>
          See the hypernetwork
        </Link>
      </div>
    </main>
  );
}
