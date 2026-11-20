import type { Viewport } from "next";
import type { ReactNode } from "react";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default function GuidesLayout({ children }: { children: ReactNode }) {
  return children;
}
