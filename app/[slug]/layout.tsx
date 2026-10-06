import type { Metadata } from "next";
// Recipient-specific invitation links retain their own existing share cards.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function InviteLayout({ children }: { children: React.ReactNode }) { return children; }
