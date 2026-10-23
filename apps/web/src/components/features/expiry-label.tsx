"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** "59 minutes", "1 hour 5 min", "2 days 3 hours": what is left until `expiresAt`, rounded up to the minute. */
export function timeLeft(expiresAt: Date, now: number): string {
  const minutes = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${plural(hours, "hour")} ${rest} min` : plural(hours, "hour");
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${plural(days, "day")} ${plural(restHours, "hour")}` : plural(days, "day");
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * A live countdown to `expiresAt`, e.g. "Expires in 59 minutes", updated every 15 seconds.
 * Once the time has passed the page is refreshed, since the access it describes is gone.
 */
export function ExpiryLabel({ expiresAt, prefix = "Expires in" }: { expiresAt: Date; prefix?: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const expired = expiresAt.getTime() <= now;

  useEffect(() => {
    if (expired) {
      router.refresh();
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [expired, router]);

  // The server render and the first client render can differ by a few seconds.
  return (
    <span suppressHydrationWarning>{expired ? "Expired" : `${prefix} ${timeLeft(expiresAt, now)}`}</span>
  );
}
