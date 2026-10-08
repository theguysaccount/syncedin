/** Supabase owns PKCE, token verification, account linking, sessions, and RLS. */
export async function chatgptSignInEnabled(): Promise<boolean> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return false;
  try {
    const response = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/admin/custom-providers",
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!response.ok) return false;
    const result = await response.json();
    return (
      Array.isArray(result.providers) &&
      result.providers.some(
        (p: Record<string, unknown>) =>
          p.identifier === "custom:chatgpt" &&
          p.enabled === true &&
          p.issuer === "https://auth.openai.com" &&
          !!p.client_id,
      )
    );
  } catch {
    return false;
  }
}
