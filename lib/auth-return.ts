type AuthContext = { invite?: string | null; conference?: string | null; next?: string | null };

function slug(value: string | null | undefined): string {
  const clean = (value || "").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(clean) ? clean : "";
}

export function authDestination(context: AuthContext): string {
  const invite = slug(context.invite);
  if (invite) return `/claim/${invite}`;
  const conference = slug(context.conference);
  return conference ? `/conferences/${conference}/join` : safeAuthNext(context.next) || "/dashboard";
}

export function loginReturnUrl(context: AuthContext, status: Record<string, string>): string {
  const params = new URLSearchParams(status);
  const invite = slug(context.invite);
  const conference = slug(context.conference);
  if (invite) params.set("invite", invite);
  else if (conference) params.set("conference", conference);
  else if (safeAuthNext(context.next)) params.set("next", context.next!);
  return `/login?${params}`;
}

export function authContextFromNext(next: string | null): AuthContext {
  const invite = next?.match(/^\/claim\/([a-z0-9-]+)$/i)?.[1];
  const conference = next?.match(/^\/conferences\/([a-z0-9-]+)\/join$/i)?.[1];
  return { invite, conference, next };
}

export function safeAuthNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !/^\/\//.test(next) && !/[\\\u0000-\u0020]/.test(next) ? next : null;
}
