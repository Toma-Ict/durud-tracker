// Saves (POST) or removes (DELETE) one phone's push subscription.
// Stored per phone: the push endpoint, its time zone, and where its maghrib comes from
// (rounded location or a manually typed time). No durud counts are sent here.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const keyOf = (endpoint) => createHash("sha256").update(endpoint).digest("hex");
const okTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const num = (v, lim) => (typeof v === "number" && isFinite(v) && Math.abs(v) <= lim ? Math.round(v * 100) / 100 : null);

export default async (req) => {
  const store = getStore("subs");
  const body = await req.json().catch(() => null);
  const ep = body && body.sub && body.sub.endpoint;
  if (typeof ep !== "string" || !ep.startsWith("https://") || ep.length > 1000) return new Response("bad request", { status: 400 });
  const key = keyOf(ep);

  if (req.method === "DELETE") { await store.delete(key); return Response.json({ ok: true }); }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const k = body.sub.keys || {};
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return new Response("bad keys", { status: 400 });
  const old = (await store.get(key, { type: "json" })) || {};
  const rec = {
    sub: { endpoint: ep, keys: { p256dh: k.p256dh, auth: k.auth } },
    tz: okTz(body.tz) ? body.tz : "Asia/Dhaka",
    lat: num(body.lat, 90), lng: num(body.lng, 180),
    maghrib: /^\d{1,2}:\d{2}$/.test(body.maghrib || "") ? body.maghrib : "18:00",
    sent: old.sent || {},
    updated: Date.now(),
  };
  await store.setJSON(key, rec);
  return Response.json({ ok: true });
};

export const config = { path: "/api/subscribe" };
