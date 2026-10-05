"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (production builds only: in dev it
 * would cache hot-reload chunks).
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("SW registration failed", e));
  }, []);
  return null;
}

/** Drops cached screens of the previous user (called from the sign-in screen). */
export function clearCachedPages() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
  } catch {
    /* no service worker */
  }
}
