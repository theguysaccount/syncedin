import Link from "next/link";

/**
 * Legacy segmented control from the old messages/proposals split.
 * Proposal clicks stay on /messages now that the surfaces are merged.
 */
export function InboxTabs({ active }: { active: "messages" | "proposals" }) {
  const tabs = [
    { key: "messages" as const, href: "/messages", icon: "💬", label: "Conversations" },
    { key: "proposals" as const, href: "/messages", icon: "🤝", label: "Proposals" }
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        marginTop: 14,
        borderRadius: 999,
        background: "var(--panel-2)",
        border: "1px solid var(--border)"
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              transition: "all 140ms ease",
              color: isActive ? "#fff" : "var(--text-dim)",
              background: isActive
                ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                : "transparent",
              boxShadow: isActive
                ? "0 6px 18px -8px rgba(99,102,241,0.6)"
                : "none"
            }}
          >
            <span aria-hidden style={{ fontSize: 15 }}>
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
