"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { computeSyncScore, type SyncInputs } from "@/lib/sync-score";

/** The breakdown uses a dialog so it also works with touch and keyboards. */
function SyncInfoBadge({
  breakdown,
  nextStep
}: {
  breakdown: { label: string; points: number; max: number; done: boolean }[];
  nextStep: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return (
    <span
      className="group"
      style={{ position: "relative", display: "inline-flex", marginLeft: 6 }}
    >
      <button
        type="button"
        className="sync-info-button"
        aria-label="How Sync % works"
        title="How Sync % works"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className="app-frame app-dialog sync-dialog"
        aria-labelledby={titleId}
        onCancel={event => { event.stopPropagation(); setOpen(false); }}
        onClose={event => { event.stopPropagation(); setOpen(false); }}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          fontFamily: "inherit",
          textAlign: "left"
        }}
      >
        <div className="dialog-header"><h2 id={titleId}>Your twin sync</h2><button type="button" className="icon-button" aria-label="Close sync breakdown" title="Close sync breakdown" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <div
          style={{
            color: "var(--text-dim)",
            marginBottom: 8,
            fontSize: 10.5,
            lineHeight: 1.5
          }}
        >
          The meter grows every time you give your twin more signal — new
          context, a finished conversation, a captured edit, a sealed deal.
          It caps at 99% on purpose (the last 1% is the north star).
        </div>
        <table
          style={{
            width: "100%",
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 10,
            borderCollapse: "collapse"
          }}
        >
          <tbody>
            {breakdown.map((p) => (
              <tr key={p.label}>
                <td
                  style={{
                    padding: "2px 0",
                    color: p.points > 0 ? "var(--text)" : "var(--text-dim)"
                  }}
                >
                  {p.label}
                </td>
                <td
                  style={{
                    padding: "2px 0",
                    textAlign: "right",
                    color:
                      p.points >= p.max
                        ? "var(--green)"
                        : p.points > 0
                        ? "var(--amber-bright)"
                        : "var(--text-dim)"
                  }}
                >
                  {p.points}/{p.max}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {nextStep && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
              fontSize: 10.5,
              color: "var(--text-dim)"
            }}
          >
            <strong style={{ color: "var(--amber-bright)" }}>Next:</strong>{" "}
            {nextStep}
          </div>
        )}
      </dialog>
    </span>
  );
}

/**
 * SyncMeter v8 — variant X "clean caption".
 *
 * Uniform everyman silhouette: outlined head + outlined body + rainbow
 * gradient fill that rises from the feet up to the current sync level.
 * The percentage sits in a clean caption BELOW the body so nothing
 * overlays the silhouette. Reads well from nav-avatar (size 40) up to
 * dashboard size (240).
 *
 * The optional avatarUrl / userId props are kept for backward compat
 * with the v7 call signature but are no longer used — variant X uses a
 * plain outlined head circle to stay consistent with the icon-style of
 * the rest of the platform.
 */
export function SyncMeter({
  inputs,
  size = 240,
  compact = false,
  // kept for backward-compat call sites; ignored in v8
  avatarUrl: _avatarUrl,
  userId: _userId
}: {
  inputs: SyncInputs;
  size?: number;
  compact?: boolean;
  avatarUrl?: string | null;
  userId?: string | null;
}) {
  const { total, parts, nextStep } = computeSyncScore(inputs);

  // Per-instance unique IDs for the SVG <defs>. Critical: when two
  // SyncMeter instances mount on the same page (e.g. AppShell sidebar
  // at size=110 + a second one inside the page), they used to share the
  // hard-coded "syncUpload" / "syncBodyClip" IDs and the browser would
  // resolve `url(#syncUpload)` to whichever `<defs>` it parsed first.
  // On desktop with the sidebar mounted, the page-level SyncMeter would
  // resolve to the sidebar's gradient (out of the page's viewBox space)
  // and render as outline-only (no fill). Jack: "The mobile human sync
  // thing looks far better. It got messed up on desktop. Not really
  // filled in." useId() makes every instance's IDs collision-proof.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `syncUpload-${uid}`;
  const haloId = `syncSurfaceHalo-${uid}`;
  const clipId = `syncBodyClip-${uid}`;

  // Body spans y=50 (top of torso) to y=295 (feet bottom). Fill rises from
  // y=FILL_BOTTOM up to y=fillY where fillY = bottom - range * (pct/100).
  const FILL_TOP = 50;
  const FILL_BOTTOM = 295;
  const fillY = FILL_BOTTOM - (FILL_BOTTOM - FILL_TOP) * (total / 100);

  // Uniform-proportion human silhouette path (no head — head is a separate
  // circle). Shoulders 36 wide, waist 28, arms 10 wide, legs 14 wide.
  // Generated once; intentionally not parameterized — we want every render
  // identical down to the pixel for brand consistency.
  const bodyPath =
    "M 82 50 L 118 50 Q 132 52 138 64 L 138 168 Q 138 174 132 174 Q 126 174 126 168 L 126 78 L 124 86 Q 122 130 116 162 L 120 180 L 118 290 Q 118 295 113 295 Q 108 295 108 290 L 106 188 Q 100 184 94 188 L 92 290 Q 92 295 87 295 Q 82 295 82 290 L 80 180 L 84 162 Q 78 130 76 86 L 74 78 L 74 168 Q 74 174 68 174 Q 62 174 62 168 L 62 64 Q 68 52 82 50 Z";

  // viewBox: 200 wide × 340 tall (300 for body + 40 for caption underneath).
  const VB_W = 200;
  // Was 340 to make room for the in-SVG % SYNC caption. Caption now
  // lives as an HTML flex row below the SVG, so we tighten the viewBox
  // to just the body (300 = body bottom + a small breathing margin).
  const VB_H = 300;

  // Outer container preserves aspect ratio at any `size`.
  const aspect = VB_H / VB_W;

  // Outer glow intensity scales aggressively with sync — barely-there at
  // low %, blazing magenta halo at high %. This is the "power" feel: the
  // more you've uploaded, the more energy bleeds out of the silhouette.
  const glowStrength = 6 + (total / 99) * 48;
  const glowOpacity = 0.22 + (total / 99) * 0.45;
  const glowColor = `rgba(216, 59, 255, ${glowOpacity})`;
  const innerGlow = `rgba(120, 60, 255, ${0.18 + (total / 99) * 0.3})`;

  return (
    <div
      className={compact ? "sync-meter sync-meter-compact" : "sync-meter"}
      style={{
        position: "relative",
        // Mobile-safe sizing: never exceed the parent container's width,
        // and never blow out narrow viewports. The desktop size prop is
        // still the upper bound — on mobile we clamp to the viewport.
        //
        // No fixed aspectRatio on the outer div anymore: the SVG sets
        // its own proportions via viewBox, and the caption flex row
        // sits BELOW it in normal flow. Previous version locked the
        // container to width × 1.5 (viewBox aspect) so the caption row
        // overflowed and overlapped whatever rendered after the meter.
        width: `min(${size}px, 70vw)`,
        maxWidth: size,
        height: "auto",
        // Cap the outer drop-shadow at a value that can't escape its
        // parent card (was scaling to ~51px at high sync, bleeding
        // pink/purple haze into the sidebar nav rendered above this
        // element on the desktop column). 24px max keeps the glow
        // contained while still reading as "powered up."
        filter: compact ? undefined : `drop-shadow(0 0 ${Math.min(12, glowStrength * 0.5)}px ${innerGlow}) drop-shadow(0 0 ${Math.min(24, glowStrength)}px ${glowColor})`
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        // SVG holds its own aspect via viewBox + preserveAspectRatio
        // (default = "xMidYMid meet"). height=auto = computed so the SVG
        // takes only what it needs, leaving room for the caption row
        // below in normal flow.
        style={{ height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* SCI-FI UPLOAD gradient v2 — "power core."
              Reads as: dormant indigo at the feet → electric blue charging
              up through the legs → deep violet at the torso → hot magenta
              cresting at the surface → near-white overdrive past the line.
              The further you've uploaded, the further up this ramp the fill
              has climbed. Powerful, not pretty. */}
          <linearGradient
            id={gradId}
            x1="0"
            y1={FILL_BOTTOM}
            x2="0"
            y2={FILL_TOP - 30}
            gradientUnits="userSpaceOnUse"
          >
            {/* Was #05021f at the bottom — read as empty/black against
                the dark page bg, so at 98% the legs looked vacant even
                though the math was correct. Brightened the floor to
                live indigo so the WHOLE filled silhouette reads as
                "lit up" all the way down. */}
            <stop offset="0%" stopColor="#1e3aff" />
            <stop offset="35%" stopColor="#4a3dff" />
            <stop offset="60%" stopColor="#6b2dc9" />
            <stop offset="82%" stopColor="#d83bff" />
            <stop offset="100%" stopColor="#ff5cf0" />
          </linearGradient>
          {/* Hot surface halo — used behind the white surface bar so the
              fill line reads as molten / overclocked rather than flat. */}
          <linearGradient
            id={haloId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#ff5cf0" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff5cf0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff5cf0" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={bodyPath} />
          </clipPath>
        </defs>

        {/* Fill rises from the feet up to fillY. The unfilled portion above
            is left TRANSPARENT (no background rect). On top of the gradient
            fill we paint a bright "surface" bar riding the fill line + a few
            thin scan lines drifting up through the fill — evoking a data-
            upload progress display from a sci-fi UI. */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            x="0"
            y={fillY}
            width={VB_W}
            height={VB_H - fillY}
            fill={`url(#${gradId})`}
          />
          {/* Hot magenta halo — sits behind the surface bar so the white
              core reads as molten metal at the upload front, not a thin
              line. The halo height pulses gently. */}
          <rect
            x="0"
            y={fillY - 18}
            width={VB_W}
            height={36}
            fill={`url(#${haloId})`}
          >
            <animate
              attributeName="height"
              values="28;42;28"
              dur="1.8s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="y"
              values={`${fillY - 14};${fillY - 21};${fillY - 14}`}
              dur="1.8s"
              repeatCount="indefinite"
            />
          </rect>
          {/* White-hot surface core — thicker than v1 so it reads as power,
              not just a progress tick. Breathes brightness. */}
          <rect
            x="0"
            y={fillY - 3}
            width={VB_W}
            height={6}
            fill="#ffffff"
            opacity={0.92}
          >
            <animate
              attributeName="opacity"
              values="0.75;1;0.75"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </rect>
          {/* Scan lines drifting up through the filled portion */}
          <rect
            x="0"
            y={FILL_BOTTOM}
            width={VB_W}
            height={1.5}
            fill="#ffffff"
            opacity={0.5}
          >
            <animate
              attributeName="y"
              from={FILL_BOTTOM}
              to={fillY}
              dur="2.4s"
              repeatCount="indefinite"
            />
          </rect>
          <rect
            x="0"
            y={FILL_BOTTOM}
            width={VB_W}
            height={1}
            fill="#ffffff"
            opacity={0.4}
          >
            <animate
              attributeName="y"
              from={FILL_BOTTOM}
              to={fillY}
              dur="3s"
              begin="0.6s"
              repeatCount="indefinite"
            />
          </rect>
          <rect
            x="0"
            y={FILL_BOTTOM}
            width={VB_W}
            height={1}
            fill="#ffffff"
            opacity={0.3}
          >
            <animate
              attributeName="y"
              from={FILL_BOTTOM}
              to={fillY}
              dur="3.6s"
              begin="1.2s"
              repeatCount="indefinite"
            />
          </rect>
        </g>

        {/* Head: simple outlined circle */}
        <circle
          cx="100"
          cy="24"
          r="18"
          fill="none"
          stroke="var(--text, #0a0d18)"
          strokeWidth="3"
        />

        {/* Body outline */}
        <path
          d={bodyPath}
          fill="none"
          stroke="var(--text, #0a0d18)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Caption removed from the SVG — now rendered as an HTML flex
            row below so the (i) badge can sit inline with the % SYNC
            text, properly baseline-aligned. The old SVG-text-plus-
            absolute-positioned-div approach made the (i) drift to the
            right and slightly off the % baseline. */}
      </svg>

      {/* Caption row — flex-aligned, (i) sits inline with the percentage.
          Positive marginTop instead of the old -10 pull-up so there's
          breathing room between the silhouette's feet and the "% SYNC"
          line. The body silhouette is already tightly cropped by the
          viewBox; this is the gap that visually rests the eye. */}
      <div
        className="sync-meter-caption"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 14,
          fontFamily:
            '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace'
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 0,
            color: "var(--text)"
          }}
        >
          {total}%
        </span>
        {!compact && <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0,
            color: "var(--text-dim)"
          }}
        >
          SYNC
        </span>}
        <SyncInfoBadge breakdown={parts} nextStep={nextStep} />
      </div>
    </div>
  );
}
