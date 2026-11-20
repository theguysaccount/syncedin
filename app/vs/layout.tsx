import type { Viewport } from "next";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default function ComparisonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
