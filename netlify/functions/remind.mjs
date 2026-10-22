// Runs every 15 minutes. Wakes each phone twice a day, at its own local time:
//   "morning": 10:00      "evening": 90 minutes before that phone's maghrib
// The push carries only which reminder it is; the phone's service worker reads
// today's count from the phone itself and writes the message.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const SLOTS = { morning: () => 600, evening: (mg) => mg - 90 };
const WINDOW = 30; // minutes after the target in which a reminder may still go out

function localNow(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, y: +p.year, m: +p.month, d: +p.day, mins: +p.hour * 60 + +p.minute };
}

// NOAA sunrise/sunset algorithm (zenith 90.833°), same as the app; returns sunset in UT hours.
function sunsetUT(y, m, d, lat, lng) {
  const rad = Math.PI / 180, N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lh = lng / 15, t = N + (18 - lh) / 24, M = 0.9856 * t - 3.289;
  const L = (M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634 + 720) % 360;
  let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 720) % 360;
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sd = 0.39782 * Math.sin(L * rad), cd = Math.cos(Math.asin(sd));
  const cosH = (Math.cos(90.833 * rad) - sd * Math.sin(lat * rad)) / (cd * Math.cos(lat * rad));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad / 15, T = H + RA - 0.06571 * t - 6.622;
  return ((T - lh) % 24 + 24) % 24;
}

function maghribMins(r, ln) {
  if (r.lat != null && r.lng != null) {
    const ut = sunsetUT(ln.y, ln.m, ln.d, r.lat, r.lng);
    if (ut != null) return localNow(new Date(Date.UTC(ln.y, ln.m - 1, ln.d) + Math.round(ut * 60) * 6e4), r.tz).mins;
  }
  const [h, mi] = (r.maghrib || "18:00").split(":").map(Number);
  return h * 60 + (mi || 0);
}

export default async () => {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subj } = process.env;
  if (!pub || !priv) { console.log("VAPID keys missing"); return; }
  webpush.setVapidDetails(subj || "mailto:tomakushtia03@gmail.com", pub, priv);
  const store = getStore("subs");
  const { blobs } = await store.list();
  const now = new Date();
  let sent = 0;
  for (const { key } of blobs) {
    const r = await store.get(key, { type: "json" });
    if (!r || !r.sub) continue;
    const ln = localNow(now, r.tz || "Asia/Dhaka"), mg = maghribMins(r, ln);
    for (const [kind, at] of Object.entries(SLOTS)) {
      const t = at(mg);
      if (ln.mins < t || ln.mins >= t + WINDOW || (r.sent && r.sent[kind] === ln.date)) continue;
      try {
        await webpush.sendNotification(r.sub, JSON.stringify({ kind }), { TTL: 3600, urgency: "normal" });
        r.sent = { ...(r.sent || {}), [kind]: ln.date };
        await store.setJSON(key, r);
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await store.delete(key); break; } // phone unsubscribed
        console.log("push failed", e.statusCode || e.message);
      }
    }
  }
  console.log(`reminders sent: ${sent} of ${blobs.length} phones`);
};

export const config = { schedule: "*/15 * * * *" };
