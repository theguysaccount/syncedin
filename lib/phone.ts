const E164_RE = /^\+\d{10,15}$/;

export function normalizePhoneNumber(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const hasPlus = value.startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  const normalized =
    hasPlus ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return E164_RE.test(normalized) ? normalized : null;
}

export function phoneLooksComplete(raw: string | null | undefined): boolean {
  return normalizePhoneNumber(raw) !== null;
}

export function phonePreferencePatch(
  raw: string | null | undefined,
  source: string,
  consent = true
): Record<string, string | null> | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return {
      phone_number: null,
      phone_consent_at: null,
      phone_consent_source: source,
      phone_number_verified_at: null
    };
  }

  const phone = normalizePhoneNumber(value);
  if (!phone) return null;
  return {
    phone_number: phone,
    phone_number_verified_at: null,
    phone_consent_at: consent ? new Date().toISOString() : null,
    phone_consent_source: source
  };
}
