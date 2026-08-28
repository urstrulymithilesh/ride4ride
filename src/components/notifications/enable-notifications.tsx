"use client";

import { useEffect, useState } from "react";

/** VAPID public key (base64url) -> ArrayBuffer for PushManager.subscribe. */
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type Status = "idle" | "unsupported" | "working" | "enabled" | "denied" | "error";

/**
 * Contextual prompt to enable pre-expiry push reminders. Rendered where it's
 * relevant (the owner's own ride post) rather than on first load, so we ask
 * permission at a moment the user understands the value.
 */
export function EnableNotifications() {
  const [status, setStatus] = useState<Status>("idle");
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let active = true;

    async function detect() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        if (active) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setStatus("denied");
        return;
      }
      if (Notification.permission === "granted") {
        // Already granted; confirm a subscription exists silently.
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (active && sub) setStatus("enabled");
      }
    }

    void detect();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    if (!vapidKey) {
      setStatus("error");
      return;
    }
    setStatus("working");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setStatus(res.ok ? "enabled" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "unsupported") return null;

  if (status === "enabled") {
    return (
      <p className="text-xs text-success">
        🔔 Expiry reminders are on for this browser.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-xs text-muted">
        Notifications are blocked. Enable them in your browser settings to get
        expiry reminders.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={enable}
        disabled={status === "working"}
        className="btn btn-secondary text-xs"
      >
        {status === "working" ? "Enabling…" : "🔔 Notify me before it expires"}
      </button>
      {status === "error" ? (
        <span className="text-xs text-danger" role="alert">
          Couldn&apos;t enable reminders.
        </span>
      ) : null}
    </div>
  );
}
