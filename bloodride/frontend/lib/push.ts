import { get, post } from "./api";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Turns on browser notifications for the signed-in account. Returns a message for the user. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, message: "This browser can’t show notifications. Keep this page open, or use Telegram." };
  }
  if (!window.isSecureContext) {
    return { ok: false, message: "Notifications need a secure (https) address." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications are blocked. Allow them in the browser’s site settings." };
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { public_key } = await get<{ public_key: string }>("/api/push/public-key");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
  await post("/api/me/webpush", sub.toJSON());
  return { ok: true, message: "Notifications are on for this browser." };
}
