import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false, follow: false },
};
export default function UtilityLayout({ children }: { children: React.ReactNode }) { return children; }
