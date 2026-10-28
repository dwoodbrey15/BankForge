(function(root){'use strict';const colors=['#63e4d0','#73a6ff','#ffaf72','#c698ff','#72cce5','#d2d36b','#f18eb5','#b9c3d8','#7cce96','#e0a3e5','#efcf74','#85aa84','#ea8e8e','#98b4db','#c6aa7c','#c99495'];
const ns='http://www.w3.org/2000/svg';
function el(name,attrs={},text){const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
function smooth(points){if(points.length<2)return points.length?'M'+points[0].join(','):'';const slopes=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]||1)),tangents=points.map((_,i)=>i===0?slopes[0]:i===points.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
 let d='M'+points[0].join(',');for(let i=0;i<points.length-1;i++){const [x,y]=points[i],[xx,yy]=points[i+1],h=(xx-x)/3;d+='C'+[x+h,y+h*tangents[i],xx-h,yy-h*tangents[i+1],xx,yy].join(',');}return d;}
class Plot{
 constructor(container,legend,names){this.container=container;this.legend=legend;this.names=names;this.hidden=new Set();this.colors={learner:colors[0]};this.keys=[];this.options={metric:'win_rate',view:'actual',length:20};new ResizeObserver(()=>this.draw()).observe(container);}
 set(history,bestUpdate,options={}){this.history=history;this.bestUpdate=bestUpdate;Object.assign(this.options,options);this.keys=Array.from(new Set(history.flatMap(r=>Object.keys(r.entries)))).sort((a,b)=>a==='learner'?-1:b==='learner'?1:0);this.keys.forEach((k,i)=>{if(!this.colors[k])this.colors[k]=colors[i%colors.length];});this.draw();}
 value(v){return BFScore.metric(v,this.options.metric).mean;}
 format(v){return this.options.metric==='balanced_multiple'?v.toFixed(2)+'×':this.options.metric==='average_placement'?v.toFixed(2):(v*100).toFixed(0)+'%';}
 draw(){if(!this.history?.length){this.container.replaceChildren();const p=document.createElement('p');p.className='muted';p.textContent='Completed benchmarks will appear here.';this.container.append(p);return;}
  const width=Math.max(300,this.container.clientWidth),height=300,left=46,right=14,top=18,bottom=40,plotW=width-left-right,plotH=height-top-bottom,updates=this.history.map(r=>r.update),xmin=Math.min(...updates),xmax=Math.max(xmin+1,...updates);
  let ymax=0;for(const r of this.history)for(const [key,v] of Object.entries(r.entries))if(!this.hidden.has(key)){const value=this.value(v);if(value!==null)ymax=Math.max(ymax,value);}if(ymax<=0)ymax=this.options.metric==='balanced_multiple'?1:.1;
  const sx=x=>left+(x-xmin)/(xmax-xmin)*plotW,sy=y=>top+(1-y/ymax)*plotH,svg=el('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Benchmark history'}),defs=el('defs'),clip=el('clipPath',{id:'plotClip'});clip.append(el('rect',{x:left-2,y:top-3,width:plotW+4,height:plotH+6}));defs.append(clip);svg.append(defs);
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=sy(v);svg.append(el('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#293748','stroke-width':.6}),el('text',{x:left-7,y:y+3,fill:'#9eb0c8','font-size':9,'text-anchor':'end'},this.format(v)));}
  for(let i=0;i<=4;i++){const u=xmin+(xmax-xmin)*i/4;svg.append(el('text',{x:sx(u),y:height-20,fill:'#9eb0c8','font-size':9,'text-anchor':'middle'},String(Math.round(u))));}svg.append(el('text',{x:left+plotW/2,y:height-4,fill:'#9eb0c8','font-size':9,'text-anchor':'middle'},'Training update'));
  const paths=new Map();this.legend.replaceChildren();
  for(const key of this.keys){const button=document.createElement('button');button.style.color=this.colors[key];button.classList.toggle('hiddenline',this.hidden.has(key));const line=document.createElement('i'),label=document.createElement('span');label.textContent=this.names(key);button.append(line,label);button.title=this.names(key);button.onclick=()=>{this.hidden.has(key)?this.hidden.delete(key):this.hidden.add(key);this.draw();};this.legend.append(button);
   if(this.hidden.has(key))continue;const points=[];let ema=null,alpha=2/(Math.max(1,Number(this.options.length)||20)+1);
   for(const r of this.history){const entry=r.entries[key];if(!entry)continue;let v=this.value(entry);if(v===null)continue;if(this.options.view==='ema'){ema=ema===null?v:alpha*v+(1-alpha)*ema;v=ema;}points.push([sx(r.update),sy(v)]);}
   const path=el('path',{d:smooth(points),fill:'none',stroke:this.colors[key],'stroke-width':key==='learner'?2.4:1.05,'stroke-linecap':'round','stroke-linejoin':'round','clip-path':'url(#plotClip)'});svg.append(path);paths.set(key,{path,button});const hit=el('path',{d:smooth(points),fill:'none',stroke:'transparent','stroke-width':13,'pointer-events':'stroke'});
   const highlight=yes=>{for(const [id,item] of paths){item.path.style.opacity=yes&&id!==key?'.3':'1';item.path.setAttribute('stroke-width',id===key&&yes?(id==='learner'?3.2:2.3):id==='learner'?2.4:1.05);item.button.classList.toggle('hover',yes&&id===key);}};hit.onpointerenter=()=>highlight(true);hit.onpointerleave=()=>highlight(false);button.onpointerenter=()=>highlight(true);button.onpointerleave=()=>highlight(false);svg.append(hit);
  }
  if(this.bestUpdate!==undefined&&this.bestUpdate!==null&&this.bestUpdate>=xmin&&this.bestUpdate<=xmax){const x=sx(this.bestUpdate);svg.append(el('line',{x1:x,y1:top,x2:x,y2:height-bottom,stroke:'#f2bf62','stroke-width':.8,'stroke-dasharray':'3 3'}),el('text',{x:Math.min(width-right,Math.max(left+60,x)),y:height-29,fill:'#f2bf62','font-size':9,'text-anchor':'end'},'BEST · '+this.bestUpdate));}
  this.container.replaceChildren(svg);
 }
 visibility(area){area.replaceChildren();for(const key of this.keys){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=!this.hidden.has(key);input.onchange=()=>{input.checked?this.hidden.delete(key):this.hidden.add(key);this.draw();};const text=document.createElement('span');text.textContent=this.names(key);text.style.color=this.colors[key];label.append(input,text);area.append(label);}}
}
root.BFPlot=Plot;
})(globalThis);
