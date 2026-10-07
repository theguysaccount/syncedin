"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, MessagesSquare, Sparkles, UserPlus, ScanFace, ChartNoAxesColumn, Brain, MessageCircle, CalendarDays, Settings, Upload, LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
const primary = [
  { href: "/dashboard", label: "Discover", icon: Compass },
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/twin", label: "Your twin", icon: Sparkles }
];
const explore = [
  { href: "/invite", label: "Invitations", icon: UserPlus },
  { href: "/ghosts", label: "Practice conversations", icon: ScanFace },
  { href: "/personal-intelligence", label: "Personal intelligence", icon: Brain },
  { href: "/poll", label: "Polls", icon: ChartNoAxesColumn },
  { href: "/feedback", label: "Feedback", icon: MessageCircle }
];
export function Sidebar({ signOutAction, conferences = [], unreadCounts = {}, cloneCard }: {
  userId: string; displayName: string; avatarUrl: string | null;
  signOutAction: () => void | Promise<void>;
  conferences?: { slug: string; name: string }[];
  unreadCounts?: Record<string, number>;
  cloneCard?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  function links(items: typeof primary) {
    return items.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(href + "/") || (href === "/messages" && pathname.startsWith("/conversations/"));
      const count = unreadCounts[href] ?? 0;
      return <Link key={href} href={href} className="app-nav-link" aria-current={active ? "page" : undefined}>
        <Icon size={18} aria-hidden="true" /><span>{label}</span>
        {count > 0 && <span className="nav-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>}
      </Link>;
    });
  }
  return <aside className="app-sidebar">
    <nav aria-label="Main navigation">{links(primary)}</nav>
    <div><div className="nav-section-label">Workspace</div><nav aria-label="Workspace">{links(explore)}</nav></div>
    {conferences.length > 0 && <div><div className="nav-section-label">Your conferences</div><nav aria-label="Your conferences">
      {conferences.map(c => <Link key={c.slug} href={`/conferences/${c.slug}`} className="app-nav-link"><CalendarDays size={17} aria-hidden="true" /><span>{c.name}</span></Link>)}
    </nav></div>}
    <div className="sidebar-footer">
      {cloneCard}
      <Link href="/onboarding" className="app-nav-link"><Sparkles size={17} aria-hidden="true" />Edit twin context</Link>
      <Link href="/continuation" className="app-nav-link"><Upload size={17} aria-hidden="true" />Import a chat</Link>
      <Link href="/settings" className="app-nav-link"><Settings size={17} aria-hidden="true" />Settings</Link>
      <div className="flex items-center justify-between px-3"><ThemeToggle /><form action={signOutAction}><button className="icon-button" title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></form></div>
    </div>
  </aside>;
}
