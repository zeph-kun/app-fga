"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const HOUR = 3_600_000;

/**
 * "2 days 3 hours", "1 hour 5 min", "59 min 30 s", "12 seconds": what is left until `expiresAt`.
 * Rounded up to the minute above an hour, to the second below it.
 */
export function timeLeft(expiresAt: Date, now: number): string {
  const ms = expiresAt.getTime() - now;
  if (ms <= HOUR) {
    const seconds = Math.max(1, Math.ceil(ms / 1000));
    if (seconds < 60) return plural(seconds, "second");
    return seconds % 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : plural(seconds / 60, "minute");
  }
  const minutes = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 60_000));
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
 * A live countdown to `expiresAt`, e.g. "Expires in 59 min 30 s": it ticks every second during
 * the last hour and every 15 seconds before. Once the time has passed, the User is sent to
 * `onExpiredGoTo` if given (the access it describes is gone), else the page is refreshed.
 */
export function ExpiryLabel({
  expiresAt,
  prefix = "Expires in",
  onExpiredGoTo,
}: {
  expiresAt: Date;
  prefix?: string;
  onExpiredGoTo?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const expired = expiresAt.getTime() <= now;
  const lastHour = expiresAt.getTime() - now <= HOUR;

  useEffect(() => {
    if (expired) {
      if (onExpiredGoTo) router.replace(onExpiredGoTo);
      else router.refresh();
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), lastHour ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [expired, lastHour, onExpiredGoTo, router]);

  // The server render and the first client render can differ by a few seconds.
  return (
    <span suppressHydrationWarning>{expired ? "Expired" : `${prefix} ${timeLeft(expiresAt, now)}`}</span>
  );
}
