// ══════════════════════════════════════════════
// DaffaCell v69 — Service Worker (PWA)
// Cache strategy:
//   - index.html / navigasi → Network-First (SELALU ambil versi terbaru)
//   - CDN assets (JS/CSS/font) → Cache-First (stabil, jarang berubah)
// ══════════════════════════════════════════════

const CACHE_NAME    = 'daffacell-v69-cache';
const CACHE_VERSION = 'v69.0';

const APP_SHELL = [
  './manifest.json',
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).then(() => {
        return cache.addAll(CDN_ASSETS).catch(() => {});
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: hapus semua cache lama ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if(event.request.method !== 'GET') return;
  if(url.hostname.includes('supabase.co')) return;
  if(url.hostname === 'api.telegram.org') return;
  if(url.protocol === 'chrome-extension:') return;

  // index.html & navigasi → Network-First
  const isNavigation =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.pathname.endsWith('index.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if(isNavigation){
    event.respondWith(networkFirstHTML(event.request));
    return;
  }

  // CDN / asset lain → Cache-First
  event.respondWith(cacheFirst(event.request));
});

// Network-First: coba network, fallback cache jika offline
async function networkFirstHTML(request){
  const cache = await caches.open(CACHE_NAME);
  try{
    const res = await fetch(request, { cache: 'no-cache' });
    if(res && res.status === 200){
      cache.put(request, res.clone()).catch(()=>{});
    }
    return res;
  }catch(err){
    const cached = await cache.match(request)
      || await cache.match('./index.html')
      || await cache.match('./');
    if(cached) return cached;
    return new Response('<h2>Offline</h2>', {status:503, headers:{'Content-Type':'text/html'}});
  }
}

// Cache-First: pakai cache, fallback network
async function cacheFirst(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if(cached) return cached;
  try{
    const res = await fetch(request);
    if(res && res.status === 200 && res.type !== 'opaque'){
      cache.put(request, res.clone()).catch(()=>{});
    }
    return res;
  }catch(err){
    return new Response(JSON.stringify({error:'Offline'}),
      {status:503, headers:{'Content-Type':'application/json'}});
  }
}

// ── MESSAGE ──
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if(event.data?.type === 'CLEAR_CACHE')
    caches.delete(CACHE_NAME).then(() => event.ports[0]?.postMessage({success:true}));
});
