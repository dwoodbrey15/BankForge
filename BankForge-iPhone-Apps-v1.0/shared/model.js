/* Portable BankForge inference. PyTorch parameter layout and LayerNorm eps preserved. */
(function(root){'use strict';
const SCHEMAS={
 'bankforge-mlp-gae-1':'mlp','bankforge-position-mlp-1':'position-mlp',
 'bankforge-opponent-attention-1':'attention','bankforge-position-attention-1':'position-attention',
 'bankforge-position-attention-2':'position-attention-power','bankforge-position-attention-3':'position-attention-cdf',
 'bankforge-set-transformer-1':'set-state','bankforge-set-memory-1':'set-memory',
 'bankforge-attention-memory-1':'attention-memory','bankforge-set-prediction-1':'set-predict'};
const LABELS={'position-attention-cdf':'Attention · state only (Neural 9)','position-mlp':'MLP · state only',attention:'Standard attention',mlp:'Original MLP','set-state':'Set Transformer','attention-memory':'Attention + GRU','set-memory':'Set Transformer + GRU','set-predict':'Set + GRU + prediction','position-attention':'State attention · legacy /210','position-attention-power':'State attention · legacy power'};
const memory=a=>['attention-memory','set-memory','set-predict'].includes(a);
const relation=a=>['set-state','set-memory','set-predict'].includes(a);
const mlp=a=>a==='mlp'||a==='position-mlp';
function specification(a='position-attention-cdf',width=16,depth=2){
 const schema=Object.keys(SCHEMAS).find(k=>SCHEMAS[k]===a);if(!schema)throw Error('Unknown architecture');
 return {schema,architecture:a,inputs:a==='mlp'?135:memory(a)?1609:411,width,depth,
  ...(mlp(a)?{}:{globals:48,opponent_slots:memory(a)?7:11,opponent_features:memory(a)?14:32,attention_heads:2,trunk_width:relation(a)?2*width:Math.floor(width*2.5)}),
  ...(memory(a)?{memory_width:width/2,memory_events:16,memory_event_features:12}:{}),
  ...(a==='position-attention-cdf'||a==='position-mlp'?{safe_pot_normalization:'exact-inclusive-cdf-rescaled-endpoints-v1',current_state_only:true,safe_round_pot_anchor:true}:{}),
  activation:'SiLU',normalization:'LayerNorm'};
}
function shapes(spec){
 const a=SCHEMAS[spec.schema],w=spec.width,d=spec.depth,s={};
 const widths=a==='mlp'?[64,128,256,512]:a==='position-mlp'?[8,12,16,24,32,48,64,128,256,512]:[8,12,16,24,32,48,64];
 if(!a||![2,3].includes(d)||!widths.includes(w))throw Error('Unsupported model architecture, width or depth');
 const expected=a==='mlp'?135:memory(a)?1609:411;if(spec.inputs!==expected)throw Error('Wrong model input count');
 const linear=(p,i,o)=>{s[p+'.weight']=[o,i];s[p+'.bias']=[o];};
 const norm=(p,n)=>{s[p+'.weight']=[n];s[p+'.bias']=[n];};
 const residual=(p,n)=>{linear(p+'.linear',n,n);norm(p+'.norm',n);};
 if(mlp(a)){for(let i=0;i<d;i++){linear('trunk.'+(3*i),i?w:expected,w);norm('trunk.'+(3*i+1),w);}linear('policy',w,1);linear('value',w,1);return s;}
 if(memory(a)){
  const h=w/2;s['memory.weight_ih_l0']=[3*h,12];s['memory.weight_hh_l0']=[3*h,h];s['memory.bias_ih_l0']=[3*h];s['memory.bias_hh_l0']=[3*h];norm('memory_norm',h);
 }
 linear('encoder.0',memory(a)?14+w/2:32,w);norm('encoder.1',w);
 if(!relation(a))for(let i=1;i<d;i++)residual('encoder.'+(i+2),w);
 if(relation(a))for(let i=0;i<d-1;i++){const p='relations.'+i;norm(p+'.norm1',w);linear(p+'.qkv',w,3*w);linear(p+'.projection',w,w);norm(p+'.norm2',w);linear(p+'.feed.0',w,2*w);linear(p+'.feed.2',2*w,w);}
 linear('query',48,2*w);norm('query_norm',w);const t=relation(a)?2*w:Math.floor(2.5*w);
 linear('trunk.0',48+5*w,t);norm('trunk.1',t);
 for(let i=1;i<(relation(a)?2:d);i++)residual('trunk.'+(i+2),t);
 linear('policy',t,1);linear('value',t,1);
 if(a==='set-predict'){linear('prediction_context.0',48,w/2);linear('opponent_head.0',w+w/2,w/2);linear('opponent_head.2',w/2,1);}
 return s;
}
function flatten(v,out=[]){if(Array.isArray(v)||ArrayBuffer.isView(v))for(const x of v)flatten(x,out);else if(typeof v==='number'&&Number.isFinite(v))out.push(v);else throw Error('Weights must contain finite numbers');return out;}
function nested(values,shape){if(shape.length===1)return Array.from(values);const n=shape.slice(1).reduce((a,b)=>a*b,1);return Array.from({length:shape[0]},(_,i)=>nested(values.slice(i*n,(i+1)*n),shape.slice(1)));}
function validate(data){
 if(!data||typeof data!=='object'||!data.spec||!data.weights)throw Error('Choose a BankForge portable model JSON (best-weights.json is supported)');
 const ss=shapes(data.spec),keys=Object.keys(ss);if(Object.keys(data.weights).length!==keys.length)throw Error('Model has missing or unexpected parameters');
 function check(v,shape,key){if(!shape.length){if(typeof v!=='number'||!Number.isFinite(v))throw Error('Non-finite weight: '+key);return;}if(!Array.isArray(v)||v.length!==shape[0])throw Error('Wrong tensor shape: '+key);for(const row of v)check(row,shape.slice(1),key);}
 let count=0;for(const key of keys){const shape=ss[key],v=data.weights[key];check(v,shape,key);count+=shape.reduce((a,b)=>a*b,1);}
 if(count>2000000)throw Error('Model exceeds the mobile size limit');
 if(data.action_sampling&&!['bernoulli-counter-v2','greedy-v1'].includes(data.action_sampling))throw Error('Unsupported action sampling rule');
 return count;
}
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const silu=x=>x*sigmoid(x),sum=a=>a.reduce((x,y)=>x+y,0);
function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function softmax(x,mask){const max=Math.max(...x.filter((_,i)=>mask[i]));if(!Number.isFinite(max))return x.map(()=>0);const e=x.map((v,i)=>mask[i]?Math.exp(v-max):0),s=sum(e);return e.map(v=>v/Math.max(s,1e-8));}
class Model{
 constructor(data){this.count=validate(data);this.data=data;this.spec=data.spec;this.a=SCHEMAS[data.spec.schema];this.w={};for(const [k,v] of Object.entries(data.weights))this.w[k]=Array.isArray(v[0])?v.map(row=>Float64Array.from(row)):Float64Array.from(v);}
 linear(x,p){const w=this.w[p+'.weight'],b=this.w[p+'.bias'];return Array.from(b,(v,i)=>v+dot(w[i],x));}
 norm(x,p){const mean=sum(x)/x.length,variance=sum(x.map(v=>(v-mean)**2))/x.length,scale=1/Math.sqrt(variance+1e-5),w=this.w[p+'.weight'],b=this.w[p+'.bias'];return x.map((v,i)=>(v-mean)*scale*w[i]+b[i]);}
 residual(x,p){const y=this.linear(x.map(silu),p+'.linear');return this.norm(x.map((v,i)=>v+y[i]),p+'.norm');}
 sequence(x,p,depth){let y=this.norm(this.linear(x,p+'.0'),p+'.1').map(silu);for(let i=1;i<depth;i++)y=this.residual(y,p+'.'+(i+2));return y;}
 remembered(row){
  const h=this.spec.width/2;let state=Array(h).fill(0),valid=0;
  for(let t=0;t<16;t++){const off=15+t*13;if(row[off+12]<=.5)continue;valid++;
   const x=row.slice(off,off+12),gi=this.linear(x,'memory_ih'),gh=this.linear(state,'memory_hh');
   const next=[];for(let j=0;j<h;j++){const r=sigmoid(gi[j]+gh[j]),z=sigmoid(gi[h+j]+gh[h+j]),n=Math.tanh(gi[2*h+j]+r*gh[2*h+j]);next.push((1-z)*n+z*state[j]);}state=next;
  }
  return valid?this.norm(state,'memory_norm'):state;
 }
 relation(tokens,mask,index){
  const p='relations.'+index,w=this.spec.width,h=w/2,qkv=tokens.map(x=>this.linear(this.norm(x,p+'.norm1'),p+'.qkv'));
  const next=tokens.map((x,i)=>{
   let joined=[];for(let head=0;head<2;head++){const q=qkv[i].slice(head*h,(head+1)*h),weights=softmax(qkv.map(v=>dot(q,v.slice(w+head*h,w+(head+1)*h))/Math.sqrt(h)),mask);
    joined.push(...Array.from({length:h},(_,j)=>sum(qkv.map((v,k)=>weights[k]*v[2*w+head*h+j]))));}
   const proj=this.linear(joined,p+'.projection'),y=x.map((v,j)=>v+proj[j]);
   const ff=this.linear(this.linear(this.norm(y,p+'.norm2'),p+'.feed.0').map(silu),p+'.feed.2');return y.map((v,j)=>mask[i]?v+ff[j]:0);
  });return next;
 }
 forward(x){
  if(x.length!==this.spec.inputs||!x.every(Number.isFinite))throw Error('Invalid network input');
  const w=this.spec.width,d=this.spec.depth,a=this.a;let z;
  if(mlp(a)){z=Array.from(x);for(let i=0;i<d;i++)z=this.norm(this.linear(z,'trunk.'+(3*i)),'trunk.'+(3*i+1)).map(silu);}
  else{
   if(memory(a)&&!this.w['memory_ih.weight']){for(const [p,s] of [['memory_ih','ih'],['memory_hh','hh']]){this.w[p+'.weight']=this.w['memory.weight_'+s+'_l0'];this.w[p+'.bias']=this.w['memory.bias_'+s+'_l0'];}}
   const g=x.slice(0,48),n=memory(a)?7:11,stride=memory(a)?223:33,columns=memory(a)?14:32,rows=Array.from({length:n},(_,i)=>x.slice(48+i*stride,48+(i+1)*stride));
   const mask=rows.map(r=>r[columns]>.5),active=rows.map((r,i)=>mask[i]&&r[1]>.5);
   let tokens=rows.map((r,i)=>{
    const features=mask[i]?r.slice(0,columns):Array(columns).fill(0),v=memory(a)?features.concat(mask[i]?this.remembered(r):Array(w/2).fill(0)):features;
    const token=this.sequence(v,'encoder',relation(a)?1:d);return relation(a)||memory(a)?token.map(v=>mask[i]?v:0):token;
   });
   if(relation(a))for(let i=0;i<d-1;i++)tokens=this.relation(tokens,mask,i);
   const pooling=m=>Array.from({length:w},(_,j)=>sum(tokens.map((t,i)=>m[i]?t[j]:0))/Math.max(1,m.filter(Boolean).length));
   const mean=pooling(mask),max=Array.from({length:w},(_,j)=>mask.some(Boolean)?Math.max(...tokens.filter((_,i)=>mask[i]).map(t=>t[j])):0),activeMean=pooling(active);
   const queries=this.linear(g,'query'),heads=[];
   for(let k=0;k<2;k++){const query=this.norm(queries.slice(k*w,(k+1)*w),'query_norm'),qn=Math.max(1e-12,Math.sqrt(dot(query,query))),m=k===1&&active.some(Boolean)?active:mask;
    const weights=softmax(tokens.map(t=>dot(query,t)/(qn*Math.max(1e-12,Math.sqrt(dot(t,t))))*Math.sqrt(w)),m);
    heads.push(...Array.from({length:w},(_,j)=>sum(tokens.map((t,i)=>weights[i]*t[j]))));}
   z=this.sequence(g.concat(mean,max,heads,activeMean),'trunk',relation(a)?2:d);
  }
  const logit=this.linear(z,'policy')[0],value=this.linear(z,'value')[0];if(!Number.isFinite(logit)||!Number.isFinite(value))throw Error('Non-finite network result');return {logit,value,p:sigmoid(logit)};
 }
}
function features(state,actor,spec){const c=root.BFCore,a=SCHEMAS[spec.schema];if(!c)throw Error('Missing game features');
 if(a==='position-mlp')return c.features.positionMLPInput(state,actor);
 if(a==='position-attention-cdf')return c.Position.cdfInput(state,actor);
 if(a==='position-attention-power')return c.Position.powerInput(state,actor);
 if(a==='position-attention')return c.Position.input(state,actor);
 if(memory(a))return c.Memory.input(state,actor);
 return a==='mlp'?c.features.input(state,actor):c.features.attentionInput(state,actor);
}
function uniform(seed,id,decision,agent){const mask=(1n<<64n)-1n;let x=(BigInt(seed)&mask)^((BigInt(id)+31n)*0x9e3779b97f4a7c15n&mask)^((BigInt(decision)+17n)*0xbf58476d1ce4e5b9n&mask)^((BigInt(agent)+9n)*0x94d049bb133111ebn&mask);x=(x^(x>>30n))*0xbf58476d1ce4e5b9n&mask;x=(x^(x>>27n))*0x94d049bb133111ebn&mask;x=x^(x>>31n);return Number(x>>40n)/16777216;}
function randomModel(a,width,depth,seed=24317){
 const spec=specification(a,width,depth),ss=shapes(spec),rng=root.BFCore.N.rng(seed),weights={};
 const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());
 function orthogonal(rows,cols,gain){const transpose=rows<cols,n=Math.max(rows,cols),k=Math.min(rows,cols),q=[];for(let j=0;j<k;j++){let v=Array.from({length:n},gaussian);for(const old of q){const dp=dot(v,old);v=v.map((x,i)=>x-dp*old[i]);}const norm=Math.sqrt(dot(v,v));q.push(v.map(x=>x/Math.max(norm,1e-12)));}return Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>gain*(transpose?q[i][j]:q[j][i])));}
 for(const [p,shape] of Object.entries(ss)){
  if(shape.length===1){weights[p]=Array(shape[0]).fill(p.endsWith('.weight')?1:0);if(p==='value.bias')weights[p][0]=.2;continue;}
  const [rows,cols]=shape;let gain=p==='policy.weight'?.01:p==='value.weight'?1:p.includes('.linear.weight')||p.includes('.projection.weight')||p.includes('.feed.2.weight')||p==='opponent_head.2.weight'?.1:Math.sqrt(2);
  if(p.startsWith('memory.weight_')){const h=width/2;weights[p]=Array.from({length:3},()=>orthogonal(h,cols,1)).flat();}else weights[p]=orthogonal(rows,cols,gain);
 }
 return {format:'bankforge-portable-1',name:'New learner',spec,weights,action_sampling:'bernoulli-counter-v2',updates:0,games:0};
}
root.BFModel={Model,validate,shapes,specification,features,uniform,randomModel,SCHEMAS,LABELS,memory,relation,mlp,flatten,nested,sigmoid};
if(typeof module!=='undefined')module.exports=root.BFModel;
})(globalThis);
