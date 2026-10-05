"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EntryResult } from "@/lib/entries/payload";
import { allEntries, putEntry, removeEntries, type QueuedEntry } from "@/lib/offline/queue";

type Rejected = { entry: QueuedEntry; error: string };

type SyncState = {
  /** Saved on the device, not yet confirmed by the server. */
  pending: QueuedEntry[];
  /** Confirmed recently; kept so totals don't dip until the page data refreshes. */
  recent: QueuedEntry[];
  rejected: Rejected[];
  online: boolean;
  add: (e: QueuedEntry) => Promise<void>;
  flush: () => Promise<void>;
  dismissRejected: () => void;
};

const Ctx = createContext<SyncState | null>(null);

export function useSync() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSync outside SyncProvider");
  return v;
}

const RETRY_MS = 15_000;
const RECENT_MS = 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<QueuedEntry[]>([]);
  const [recent, setRecent] = useState<QueuedEntry[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const reload = useCallback(async () => setPending(await allEntries()), []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const queued = await allEntries();
      setPending(queued);
      if (!queued.length) return;
      let results: EntryResult[];
      try {
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: queued.map((q) => q.payload) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        results = (await res.json()).results;
        setOnline(true);
      } catch {
        setOnline(false);
        return; // keep everything queued; retry later
      }
      const byId = new Map(queued.map((q) => [q.payload.id, q]));
      const done = results.filter((r) => r.status !== "rejected").map((r) => byId.get(r.id)).filter((x): x is QueuedEntry => !!x);
      const bad = results.flatMap((r) => (r.status === "rejected" && byId.get(r.id) ? [{ entry: byId.get(r.id)!, error: r.error }] : []));
      await removeEntries(results.map((r) => r.id));
      if (bad.length) setRejected((x) => [...x, ...bad]);
      if (done.length) {
        setRecent((x) => [...x, ...done]);
        setTimeout(() => setRecent((x) => x.filter((r) => !done.includes(r))), RECENT_MS);
        router.refresh();
      }
      await reload();
    } finally {
      flushing.current = false;
    }
  }, [reload, router]);

  const add = useCallback(
    async (e: QueuedEntry) => {
      await putEntry(e);
      setPending((p) => [...p, e]);
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    void flush();
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [flush]);

  return (
    <Ctx.Provider value={{ pending, recent, rejected, online, add, flush, dismissRejected: () => setRejected([]) }}>
      {children}
    </Ctx.Provider>
  );
}
