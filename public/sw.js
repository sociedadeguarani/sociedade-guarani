/*
 * Guarani PWA service worker.
 * Cacheia somente a página pública e estática de indisponibilidade e os ícones.
 * Nunca armazena páginas autenticadas, chamadas /api, Supabase, sessões ou dados pessoais.
 */
const CACHE_NAME = "guarani-pwa-static-v1";
const STATIC_ASSETS = [
  "/offline.html",
  "/apple-icon-guarani.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("guarani-pwa-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre tenta o servidor primeiro. Se não houver rede, mostra
  // apenas o aviso estático; não substitui nem guarda conteúdo autenticado.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match("/offline.html");
        return offline || new Response("Sem conexão com a internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
  }
});
