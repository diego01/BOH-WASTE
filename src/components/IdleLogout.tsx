"use client";

import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { useT } from "./I18nProvider";

const WARN_SECONDS = 15;

/**
 * Shared-phone safety: signs out after `minutes` without interaction, with a
 * short countdown that any tap cancels. Unsynced entries stay queued and still
 * sync to their author (they carry their own entry token).
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const last = useRef(0);
  const { t } = useT();

  useEffect(() => {
    if (minutes <= 0) return;
    last.current = Date.now();
    const bump = () => {
      last.current = Date.now();
      setLeft(null);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      const remaining = Math.ceil(minutes * 60 - idle);
      if (remaining <= 0) {
        clearInterval(t);
        void logout();
      } else if (remaining <= WARN_SECONDS) {
        setLeft(remaining);
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [minutes]);

  if (left === null) return null;
  return (
    <div className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[70] mx-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-center text-white shadow-xl">
      {t(`Signing out in ${left}s — tap anywhere to stay`, `Cerrando sesión en ${left}s — toca la pantalla para seguir`)}
    </div>
  );
}
