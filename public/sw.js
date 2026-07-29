/*
 * Service Worker — nur die App-Huelle, niemals Daten.
 *
 * Zwischengespeichert werden ausschliesslich eigene, statische Dateien
 * (Dokument, JS, CSS, Icons). Anfragen an Supabase laufen ueber eine fremde
 * Herkunft und werden hier gar nicht angefasst: Finanzdaten und Sitzungen
 * gehoeren nicht in einen Cache, den ein geteiltes Geraet ueberlebt
 * (SECURITY_MODEL.md).
 *
 * Strategien:
 * - Navigation (das eine Dokument des Hash-Routers): erst Netz, dann Cache.
 *   So kommt eine neue Fassung sofort an, und offline erscheint trotzdem die
 *   Huelle statt der Fehlerseite des Browsers.
 * - Statische Dateien: erst Cache, dann Netz. Ihre Namen tragen einen Hash,
 *   eine veraltete Antwort kann es also nicht geben.
 */
const CACHE = "dividend-tracker-shell-v1";
const ASSET_PATTERN = /\.(?:js|css|png|svg|ico|webmanifest|woff2?)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Das Dokument reicht als Grundstock; die uebrigen Dateien tragen sich
      // beim ersten Aufruf selbst ein.
      await cache.add(new Request("./", { cache: "reload" }));
      // Kein `skipWaiting()` an dieser Stelle: Eine neue Fassung waehrend einer
      // laufenden Erfassung unterzuschieben, ist bei einer Finanzanwendung die
      // falsche Entscheidung. Sie wartet, die Oberflaeche weist darauf hin
      // (UpdatePrompt), und erst auf Wunsch wird gewechselt. Nur wenn noch
      // keine Fassung laeuft, uebernimmt sie sofort — da gibt es nichts zu
      // unterbrechen.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Der Wechsel auf die neue Fassung wird von der Oberflaeche ausgeloest.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE);
          await cache.put("./", response.clone());
          return response;
        } catch {
          const cached = await caches.match("./");
          if (cached) return cached;
          throw new Error("Offline und keine gespeicherte Huelle vorhanden.");
        }
      })(),
    );
    return;
  }

  if (!ASSET_PATTERN.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
