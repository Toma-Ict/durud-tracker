// Network-first: always try the live site so updates (icons, fixes) arrive at once;
// fall back to the saved copy only when offline.
const CACHE = "durud-v32";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "dome.jpg", "hero.jpg", "uthmani.woff2", "saw.woff2", "splash.webp", "badge-96.png", "bn-num-400.woff2", "bn-num-500.woff2", "bn-num-600.woff2", "bn-num-700.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then(res => {
      if (res && (res.ok || res.type === "opaque")) {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html")))
  );
});

/* ---------- daily reminders ----------
   The server only says which reminder this is ("morning" / "evening").
   Today's count comes from the copy the app keeps in IndexedDB on this phone. */
const BN = "০১২৩৪৫৬৭৮৯";
const bn = n => Number(n).toLocaleString("en-IN").replace(/\d/g, d => BN[d]);
const isoLocal = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function readMirror() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open("durud", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onerror = () => res(null);
      rq.onsuccess = () => {
        try {
          const g = rq.result.transaction("kv").objectStore("kv").get("state");
          g.onsuccess = () => res(g.result || null); g.onerror = () => res(null);
        } catch (e) { res(null); }
      };
    } catch (e) { res(null); }
  });
}

function compose(kind, m) {
  if (!m || !m.daily) return ["🌙 দুরুদ", "আজকের দুরুদ পড়েছেন? একটু সময় নিয়ে পড়ে নিন, প্রিয় নবীজী ﷺ-এর জন্য।"];
  const t = (m.days && m.days[isoLocal(new Date())]) || 0, d = m.daily, left = d - t;
  const before = m.dayMode === "midnight" ? "আজকের মধ্যে" : "মাগরিবের আগে";
  if (t >= d) return ["🏆 আলহামদুলিল্লাহ! আজকের " + bn(d) + " পূর্ণ", "চাইলে আরেকটু পড়তে পারেন।"];
  if (t > 0) return ["📿 মাশাআল্লাহ! " + bn(t) + " হয়েছে",
    kind === "evening" ? "আর মাত্র " + bn(left) + " বাকি। " + before + " পূর্ণ করে ফেলুন ইনশাআল্লাহ।" : "আর " + bn(left) + " বাকি। আজকের লক্ষ্য পূরণে এগিয়ে চলুন।"];
  return ["🌙 দুরুদ", kind === "evening" ? before + " এখনো সময় আছে। আজকের দুরুদ পড়া শুরু করুন।" : "আজকের দুরুদ পড়া এখনো শুরু হয়নি। একটু সময় নিয়ে শুরু করুন, প্রিয় নবীজী ﷺ-এর জন্য।"];
}

self.addEventListener("push", e => {
  let kind = "morning";
  try { kind = (e.data && e.data.json().kind) || kind; } catch (x) {}
  e.waitUntil(readMirror().then(m => {
    const [title, body] = compose(kind, m);
    return self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "badge-96.png", tag: "durud-reminder", lang: "bn", data: { url: "./" } });
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return clients.openWindow("./");
  }));
});
