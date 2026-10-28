(function(){'use strict';const elements=()=>document.querySelectorAll('[data-offline]');
function show(text,ready=false){for(const el of elements()){el.textContent=text;el.dataset.ready=String(ready);}}
async function status(worker){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>reject(Error('Cache check timed out')),20000);channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(e.data);};worker.postMessage({type:'STATUS'},[channel.port2]);});}
const src=document.currentScript?.src;document.addEventListener('DOMContentLoaded',()=>{const base=new URL('../',src);window.BFBase=base;setupWithBase(base);});
async function setupWithBase(base){
 if(!('serviceWorker' in navigator)){show('Offline install needs HTTPS');return;}
 try{const registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname});show('Preparing offline files…');const ready=await navigator.serviceWorker.ready,report=await status(ready.active);show(report.ready?(navigator.onLine?'Offline ready':'Offline · ready'):'Offline files incomplete · reconnect',report.ready);window.BFOffline={ready:report.ready,repair:async()=>{const channel=new MessageChannel();channel.port1.onmessage=e=>show(e.data.ready?'Offline ready':'Offline repair failed',e.data.ready);registration.active.postMessage({type:'REPAIR'},[channel.port2]);}};}catch(e){show('Offline setup failed · reconnect and reload');console.warn(e);}
}
addEventListener('online',()=>{if(window.BFOffline?.ready)show('Offline ready',true);});addEventListener('offline',()=>{if(window.BFOffline?.ready)show('Offline · ready',true);});
})();
