import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Review your private profile draft",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
// Private, secret-bearing draft review is intentionally excluded from public cards and sitemap.
export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
