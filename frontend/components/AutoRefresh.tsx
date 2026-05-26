"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  /** Interval in seconds between background refreshes. */
  intervalSec?: number;
};

/**
 * Mount in a server-rendered page to trigger `router.refresh()` on an
 * interval. Re-fetches server components' data (KIS portfolio, market
 * prices, alerts, …) without a full page reload, preserving client state
 * (chart period selectors, expanded rows, drawer, etc.).
 *
 * Pauses while the tab is hidden so background tabs don't burn API quota.
 */
export function AutoRefresh({ intervalSec = 30 }: Props) {
  const router = useRouter();

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, intervalSec * 1000);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    start();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // Refresh immediately on re-focus, then resume interval.
        router.refresh();
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
    };
  }, [intervalSec, router]);

  return null;
}
