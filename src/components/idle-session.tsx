"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const idleMs = 30 * 60 * 1000;
const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function IdleSession() {
  useEffect(() => {
    const client = createClient();
    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function start() {
      const { data } = await client.auth.getClaims();
      const sessionId = data?.claims?.session_id;
      if (disposed || typeof sessionId !== "string") return;

      const key = `bp.lastActivity.${sessionId}`;
      let lastActivity = Date.now();
      let timer: number;
      let signingOut = false;

      function readActivity() {
        try {
          const saved = Number(localStorage.getItem(key));
          if (saved > 0 && saved <= Date.now()) return saved;
        } catch {}
        return lastActivity;
      }

      function recordActivity(now: number) {
        lastActivity = now;
        try { localStorage.setItem(key, String(now)); } catch {}
      }

      async function signOut() {
        signingOut = true;
        window.clearTimeout(timer);
        try {
          await client.auth.signOut({ scope: "local" });
        } finally {
          window.location.replace("/login?error=idle");
        }
      }

      function schedule(): boolean {
        if (signingOut || disposed) return false;
        window.clearTimeout(timer);
        const remaining = idleMs - (Date.now() - readActivity());
        if (remaining <= 0) {
          void signOut();
          return false;
        }
        timer = window.setTimeout(schedule, remaining);
        return true;
      }

      function activity(event: Event) {
        if (!event.isTrusted || document.visibilityState !== "visible" || !schedule()) return;
        recordActivity(Date.now());
        schedule();
      }

      function onStorage(event: StorageEvent) {
        if (event.key === key) schedule();
      }

      recordActivity(readActivity());
      schedule();
      activityEvents.forEach((event) => window.addEventListener(event, activity, { passive: true }));
      window.addEventListener("storage", onStorage);
      window.addEventListener("pageshow", schedule);
      document.addEventListener("visibilitychange", schedule);

      cleanup = () => {
        window.clearTimeout(timer);
        activityEvents.forEach((event) => window.removeEventListener(event, activity));
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("pageshow", schedule);
        document.removeEventListener("visibilitychange", schedule);
      };
    }

    void start();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return null;
}
