"use client";

import { useEffect } from "react";

export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        const oldWorkerUrl = new URL("/sw.js", window.location.origin).href;
        registrations.forEach((registration) => {
          const workers = [registration.active, registration.waiting, registration.installing];
          if (workers.some((worker) => worker?.scriptURL === oldWorkerUrl))
            void registration.unregister();
        });
      });
    }
    if ("caches" in window) void caches.delete("moneyguard-shell-v1");
  }, []);

  return null;
}
