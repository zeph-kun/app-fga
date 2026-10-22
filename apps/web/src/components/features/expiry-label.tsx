const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "Expires in 3 hours", "Expires in 2 days" — or null once past, since the API stops listing it anyway. */
export function expiryLabel(expiresAt: Date | undefined): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `Expires ${rtf.format(hours, "hour")}`;
  return `Expires ${rtf.format(Math.round(hours / 24), "day")}`;
}
