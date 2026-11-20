import Link from "next/link";
import { LockKeyhole } from "lucide-react";

/**
 * Consistent processing notice next to context inputs. Do not promise
 * zero retention or that generated output can never reveal context.
 */
export function TrustNote({
  style
}: {
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        marginTop: 8,
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-dim)",
        textAlign: "center",
        ...style
      }}
    >
      <LockKeyhole size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
      Choose what you share. AI services process your context to generate
      drafts. Review the result before publishing.{" "}
      <Link
        href="/privacy"
        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        How we handle data
      </Link>
    </p>
  );
}
