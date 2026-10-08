"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles, Settings, UserRound, Upload, Download, LogOut, Network, CalendarDays, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { BrandMark } from "./BrandMark";
export function TopBar({ userId, displayName, avatarUrl, portfolioHandle, signOutAction, isAdmin = false }: {
  userId: string; displayName: string; avatarUrl: string | null; portfolioHandle?: string | null;
  signOutAction: () => void | Promise<void>; unreadCounts?: Record<string, number>; isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>(".account-menu a")?.focus();
    function down(e: PointerEvent) { if (!wrap.current?.contains(e.target as Node)) setOpen(false); }
    function key(e: KeyboardEvent) { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    window.addEventListener("pointerdown", down); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [open]);
  const links = [
    { href: "/onboarding", label: "Edit twin", icon: Sparkles },
    { href: "/settings", label: "Account settings", icon: Settings },
    ...(portfolioHandle ? [{ href: `/u/${portfolioHandle}`, label: "My portfolio", icon: UserRound }] : []),
    { href: "/continuation", label: "Import a chat", icon: Upload }
  ];
  const network = [
    { href: "/hypernetwork", label: "Hypernetwork", icon: Network },
    { href: "/conferences/new", label: "Sync a conference", icon: CalendarDays },
    { href: "/communities/new", label: "Sync a community", icon: Users }
  ];
  return <header className="app-topbar">
    <Link href="/dashboard" className="app-brand-link" aria-label="SyncedIn home"><BrandMark /></Link>
    <nav aria-label="Network navigation">
      {network.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href || pathname?.startsWith(href + "/") ? "page" : undefined}><Icon size={16} aria-hidden="true" />{label}</Link>)}
      {isAdmin && <><Link href="/admin/usage">Admin</Link><Link href="/admin/safety">Safety</Link></>}
    </nav>
    <div ref={wrap} style={{ position: "relative" }}>
      <button ref={trigger} type="button" className="account-trigger" onClick={() => setOpen(v => !v)} aria-label="Account menu" aria-expanded={open} aria-controls="account-options">
        <Avatar id={userId} name={displayName} avatarUrl={avatarUrl} size={32} /><span className="text-xs font-semibold max-w-[120px] truncate">{displayName}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div id="account-options" className="account-menu" aria-label="Account options">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={16} aria-hidden="true" />{label}</Link>)}
        <a href="/api/export-messages" download><Download size={16} aria-hidden="true" />Export my messages</a>
        <form action={signOutAction}><button type="submit"><LogOut size={16} aria-hidden="true" />Sign out</button></form>
      </div>}
    </div>
  </header>;
}
