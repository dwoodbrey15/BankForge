const VERSION="764d08f9b0c8f703",ASSETS=["index.html", "play/index.html", "play/manifest.webmanifest", "play/play.css", "play/play.js", "train/index.html", "train/manifest.webmanifest", "train/plot.js", "train/train.css", "train/train.js", "train/worker.js", "shared/core.js", "shared/icon-192.png", "shared/icon-512.png", "shared/icon.svg", "shared/model.js", "shared/offline.js", "shared/scoring.js", "shared/simulator.js", "shared/storage.js", "shared/tensor-model.js", "vendor/tf.min.js", "models/neural-9.json"];

'use strict';
const PREFIX='bankforge-iphone:'+self.registration.scope+':',CACHE=PREFIX+VERSION;
const url=path=>new URL(path,self.registration.scope).href;
const known=new Set(ASSETS.map(url));
async function prepare(){const cache=await caches.open(CACHE);await Promise.all(ASSETS.map(async path=>{const response=await fetch(new Request(url(path),{cache:'reload'}));if(!response.ok)throw Error('Offline download failed: '+path);await cache.put(url(path),response);}));}
async function status(){const cache=await caches.open(CACHE),missing=[];for(const path of ASSETS)if(!await cache.match(url(path)))missing.push(path);return {version:VERSION,ready:!missing.length,missing};}
self.addEventListener('install',event=>event.waitUntil(prepare().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);})()));
self.addEventListener('message',event=>{if(!event.ports[0])return;event.waitUntil((async()=>{try{if(event.data?.type==='REPAIR')await prepare();event.ports[0].postMessage(await status());}catch(e){event.ports[0].postMessage({version:VERSION,ready:false,error:e.message});}})());});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;const target=new URL(event.request.url);if(target.origin!==self.location.origin||!target.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);target.search='';target.hash='';let key=target.href;if(target.pathname.endsWith('/'))key+='index.html';
 const hit=await cache.match(key);if(hit)return hit;
 try{const response=await fetch(event.request);if(response.ok&&known.has(key))await cache.put(key,response.clone());return response;}catch(e){return new Response('This file is not cached. Open the app online and wait for Offline ready.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
 })());
});
