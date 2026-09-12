"use client";

import { useState } from "react";

type Initial = {
  email_address: string;
  phone_number: string;
  on_text_notifications: boolean;
  preferred_messaging_service: string;
  on_new_connection: boolean;
  on_new_message: boolean;
  on_agreement_accepted: boolean;
  on_call_scheduled: boolean;
  on_new_match: boolean;
  on_weekly_digest: boolean;
  match_threshold: number;
};

type Toggle = {
  name: keyof Pick<
    Initial,
    | "on_new_connection"
    | "on_new_message"
    | "on_agreement_accepted"
    | "on_call_scheduled"
    | "on_new_match"
    | "on_weekly_digest"
    | "on_text_notifications"
  >;
  label: string;
  blurb: string;
};

const TOGGLES: Toggle[] = [
  {
    name: "on_text_notifications",
    label: "iMessage / SMS alerts",
    blurb:
      "Send the important moments to your phone first. Email stays available as backup."
  },
  {
    name: "on_new_connection",
    label: "New connection",
    blurb:
      "Someone's twin starts a conversation with yours. (Recommended on — this is how you discover wins.)"
  },
  {
    name: "on_new_message",
    label: "New message",
    blurb:
      "Activity in an existing conversation. Debounced to one alert per 30 minutes so the twin-to-twin volleys don't flood your inbox."
  },
  {
    name: "on_agreement_accepted",
    label: "Agreement sealed",
    blurb:
      "Both sides accepted a proposed deal. Take it into the real world from there."
  },
  {
    name: "on_call_scheduled",
    label: "Call scheduled",
    blurb:
      "Your twin locked in a meeting time. We'll send you the calendar invite details."
  },
  {
    name: "on_new_match",
    label: "High-match new signup",
    blurb:
      "A new user just joined whose twin lines up with yours above your threshold (set below). The most-asked-for notification — never miss the right intro."
  },
  {
    name: "on_weekly_digest",
    label: "Weekly proposals digest",
    blurb:
      "Monday-morning roll-up of every proposal still waiting on your reply, with one-tap accept buttons. Keeps the network healthy + your inbox calm."
  }
];

export function NotifPrefsForm({
  initial,
  action,
  defaultEmail,
  defaultPhone
}: {
  initial: Initial;
  action: (formData: FormData) => void;
  defaultEmail: string;
  defaultPhone: string;
}) {
  const [state, setState] = useState<Initial>(initial);

  return (
    <form action={action} className="mt-6 space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="retro-label">Phone for iMessage / SMS</label>
          <input
            type="tel"
            name="phone_number"
            defaultValue={state.phone_number || defaultPhone}
            className="mt-2 w-full retro-input"
            placeholder="+1 415 555 0123"
            autoComplete="tel"
          />
          <p className="mt-1 retro-dim text-xs">
            Used for urgent, high-signal moments your twin should not bury in
            email.
          </p>
        </div>
        <div>
          <label className="retro-label">Preferred phone route</label>
          <select
            name="preferred_messaging_service"
            value={state.preferred_messaging_service}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                preferred_messaging_service: e.target.value
              }))
            }
            className="mt-2 w-full retro-input"
          >
            <option value="iMessage">iMessage</option>
            <option value="RCS">RCS</option>
            <option value="SMS">SMS</option>
          </select>
          <p className="mt-1 retro-dim text-xs">
            Claw Messenger will try this service for outbound phone alerts.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="retro-label">Backup email</label>
          <input
            type="email"
            name="email_address"
            defaultValue={state.email_address || defaultEmail}
            className="mt-2 w-full retro-input"
            placeholder={defaultEmail || "you@example.com"}
            autoComplete="email"
          />
          <p className="mt-1 retro-dim text-xs">
            Defaults to the email on your account. Override here if you want
            backup notifications somewhere else.
          </p>
        </div>
      </div>

      <div className="retro-panel divide-y" style={{ borderColor: "var(--border)" }}>
        {TOGGLES.map((t) => (
          <div
            key={t.name}
            className="flex items-start gap-4 p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <label className="flex items-center cursor-pointer pt-1">
              <input
                type="checkbox"
                name={t.name}
                checked={state[t.name]}
                onChange={(e) =>
                  setState((s) => ({ ...s, [t.name]: e.target.checked }))
                }
                className="sr-only peer"
              />
              <span
                className="relative inline-block w-11 h-6 rounded-full transition-colors"
                style={{
                  background: state[t.name]
                    ? "var(--amber-bright)"
                    : "var(--border)"
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{
                    transform: state[t.name]
                      ? "translateX(20px)"
                      : "translateX(0)"
                  }}
                />
              </span>
            </label>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm">{t.label}</div>
              <p className="mt-0.5 retro-dim text-xs">{t.blurb}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Match-threshold slider — only relevant if on_new_match is enabled.
          Lives below the toggle list so it visually clusters with that
          row. Default 65, range 30-95. Below 30 the platform is too
          noisy; above 95 you'd never get pinged. */}
      {state.on_new_match && (
        <div
          className="retro-panel p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-baseline justify-between">
            <label
              className="text-sm font-semibold"
              htmlFor="match_threshold"
            >
              Notify me only when match is at least
            </label>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                color: "var(--amber-bright)",
                fontSize: 18
              }}
            >
              {state.match_threshold}%
            </span>
          </div>
          <input
            id="match_threshold"
            type="range"
            min={30}
            max={95}
            step={1}
            name="match_threshold"
            value={state.match_threshold}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                match_threshold: parseInt(e.target.value, 10)
              }))
            }
            className="w-full mt-3"
            style={{ accentColor: "var(--amber-bright)" }}
          />
          <div
            className="flex justify-between text-xs mt-1"
            style={{ color: "var(--text-dim)" }}
          >
            <span>30% (loose — more pings)</span>
            <span>95% (only stellar matches)</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="retro-btn retro-btn-primary">
          Save settings
        </button>
        <span className="retro-dim text-xs">
          You can change these any time. Notifications are batched per recipient
          and never sent twice for the same event.
        </span>
      </div>
    </form>
  );
}
