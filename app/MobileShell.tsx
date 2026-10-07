"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Compass, MessagesSquare, Sparkles, Menu, X } from "lucide-react";
import { Avatar } from "./Avatar";
export function MobileShell({ children, userId, displayName, avatarUrl, unreadCounts = {} }: {
  children: React.ReactNode; userId?: string; displayName?: string; avatarUrl?: string | null; unreadCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => { document.body.style.overflow = previous; media.removeEventListener("change", closeOnDesktop); };
  }, [open]);
  const tabs = [
    { href: "/dashboard", label: "Discover", icon: Compass },
    { href: "/messages", label: "Messages", icon: MessagesSquare },
    { href: "/twin", label: "Your twin", icon: Sparkles }
  ];
  return <>
    <header className="mobile-header">
      <Link href="/dashboard" aria-label="SyncedIn home"><img src="/syncedin-wordmark-tight.png" alt="SyncedIn" className="wordmark-themed" style={{ width: 116, height: 28, objectFit: "contain" }} /></Link>
      {userId && <Link href="/settings" aria-label="Account settings" title="Account settings"><Avatar id={userId} name={displayName ?? "You"} avatarUrl={avatarUrl ?? null} size={34} /></Link>}
    </header>
    <nav className="mobile-tabs" aria-label="Mobile navigation">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href === "/messages" && (pathname?.startsWith("/conversations/") || pathname?.startsWith("/dm/")));
        const count = unreadCounts[href] ?? 0;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span>{count > 0 && <span className="nav-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>}</Link>;
      })}
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-more"><Menu size={21} aria-hidden="true" /><span>More</span></button>
    </nav>
    <dialog ref={dialog} id="mobile-more" className="app-dialog mobile-more" aria-labelledby="mobile-more-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="dialog-header"><h2 id="mobile-more-title">Your workspace</h2><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close menu" title="Close menu"><X size={19} /></button></div>
      <div onClick={e => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>
      <nav aria-label="Network"><Link href="/hypernetwork" className="app-nav-link">Hypernetwork</Link><Link href="/conferences/new" className="app-nav-link">Create a conference</Link><Link href="/communities/new" className="app-nav-link">Create a community</Link></nav>
    </dialog>
  </>;
}
