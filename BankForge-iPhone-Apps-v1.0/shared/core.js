(function(root){'use strict';const factories={},cache={};
function resolve(base,key){if(key==='readline')return key;const parts=(base.slice(0,base.lastIndexOf('/')+1)+key).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p!=='.'&&p)out.push(p);}return out.join('/');}
function load(id){if(id==='readline')return {};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;const req=key=>load(resolve(id,key));req.main=null;if(!factories[id])throw Error('Missing bundled module '+id);factories[id](req,m,m.exports);return m.exports;}

factories["legacy/engine.js"]=function(require,module,exports){
function bankEngine() {
  const bases=[20,35,55,80,115,165,240,360,550,900,1600];
  const sums=[3,4,5,6,8,9,10,11], counts=[2,2,4,4,4,4,2,2];
  const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
  const clock=()=>typeof performance!=='undefined'?performance.timeOrigin+performance.now():Date.now();
  function hash(seed,r,k,p){let x=(seed^Math.imul(r+31,0x9e3779b1)^Math.imul(k+17,0x85ebca6b)^Math.imul(p+9,0xc2b2ae35))>>>0;x=Math.imul(x^x>>>16,0x7feb352d);x=Math.imul(x^x>>>15,0x846ca68b);return((x^x>>>16)>>>0)/4294967296;}
  const families=['fixed','adaptive','chaser','reactive','matcher','strategic','noisy'];
  const models=families.flatMap((family,f)=>bases.map((base,j)=>({family,base,f,j})));
  const modelVersion=2;
  const scenarios=['Learned mix','Earlier banking','Later banking','Bank reactions','Strategic opposition'];
  const chance=[{face:5,count:6},{face:0,count:6},...sums.map((s,j)=>({face:[1,2,3,4,11,17,23,29][j],count:counts[j]}))];
  function normalize(a){const m=Math.max(...a),w=a.map(v=>Math.exp(v-m)),z=w.reduce((a,b)=>a+b,0);return w.map(v=>v/z);}
  function weights(p){const mean=p.style==='cautious'?60:p.style==='bold'?300:130;return normalize(bases.map((x,i)=>-(Math.log(x/mean)**2)/1.5+(p.style==='learn'?(p.evidence?.[i]||0):0)));}
  function modelWeights(p,scenario=0){
    const mean=scenario===1?60:scenario===2?350:p.style==='cautious'?60:p.style==='bold'?300:130;
    const prior=scenario===3?[.03,.07,.05,.45,.3,.07,.03]:scenario===4?[.02,.05,.12,.1,.21,.48,.02]:[.16,.27,.13,.14,.08,.17,.05];
    const evidence=p.style==='learn'&&p.modelVersion===modelVersion&&p.modelEvidence?.length===models.length?p.modelEvidence:null;
    const w=normalize(models.map((m,k)=>Math.log(prior[m.f])-(Math.log(m.base/mean)**2)/1.5+(scenario===0&&evidence?evidence[k]:0)));
    if(scenario||!evidence)return w;
    const broad=normalize(models.map(m=>Math.log(prior[m.f])-(Math.log(m.base/mean)**2)/1.5));
    return w.map((v,i)=>.9*v+.1*broad[i]);
  }
  function leaders(scores){let first=-Infinity,second=-Infinity,index=-1;for(let i=0;i<scores.length;i++){const v=scores[i];if(v>first){second=first;first=v;index=i;}else if(v>second)second=v;}return{first,second,index};}
  function potentialLeaders(scores,active,pot){let first=-Infinity,second=-Infinity,index=-1;for(let i=0;i<scores.length;i++){const v=scores[i]+(active[i]?pot:0);if(v>first){second=first;first=v;index=i;}else if(v>second)second=v;}return{first,second,index};}
  function adjusted(base,gap,remaining){return base*clamp(1+gap/(220*Math.sqrt(remaining)),.55,3.5);}
  function fastHazard(pot,gap,remaining,base){if(remaining===1&&pot<gap)return .015;const t=adjusted(base,gap,remaining);return .025+.95/(1+Math.exp(-Math.log(Math.max(1,pot)/t)/.48));}
  function hazard(pot,scores,i,remaining,base){const t=leaders(scores),lead=t.index===i?t.second:t.first;return fastHazard(pot,lead-scores[i],remaining,base);}
  function modelHazard(m,pot,scores,i,remaining,context={},top=leaders(scores)){
    if(m.family==='noisy')return .13;
    const sigmoid=t=>.025+.95/(1+Math.exp(-Math.log(Math.max(1,pot)/Math.max(1,t))/.48));
    if(m.family==='fixed')return sigmoid(m.base);
    const active=context.active||scores.map(()=>true),banked=context.banked||scores.map(()=>0),last=context.lastBank??-1;
    const other=top.index===i?top.second:top.first;
    const potential=context.potentialTop||potentialLeaders(scores,active,pot);
    const gap=(potential.index===i?potential.second:potential.first)-(scores[i]+(active[i]?pot:0));
    let h=m.family==='chaser'?sigmoid(m.base*clamp(1+gap/(100*Math.sqrt(remaining)),.25,8)):fastHazard(pot,gap,remaining,m.base);
    if(m.family==='reactive'&&last>=0&&last!==i)h=Math.max(h,.8);
    if(m.family==='matcher'||m.family==='strategic'){
      if(scores.length===2){const j=1-i;if(active[j]&&scores[i]>=scores[j])return .005;if(!active[j]&&scores[i]+pot>scores[j])return .995;}
      if(m.family==='matcher'){let rival=-1,best=-Infinity;for(let j=0;j<scores.length;j++)if(j!==i&&scores[j]-(banked[j]||0)>best){best=scores[j]-(banked[j]||0);rival=j;}if(last===rival)h=Math.max(h,.97);else h*=.25;}
    }
    if(['chaser','strategic'].includes(m.family)&&remaining===1){
      if(scores[i]+pot<=other)return .005;
      if(!active.some((v,j)=>j!==i&&v))return .995;
    }
    return clamp(h,.005,.995);
  }
  function observe(p,pot,scores,i,remaining,banked,context={}){
    if(p.style!=='learn')return;
    if(!p.evidence)p.evidence=bases.map(()=>0);
    bases.forEach((b,j)=>{const h=hazard(pot,scores,i,remaining,b);p.evidence[j]=p.evidence[j]*.997+Math.log(banked?h:1-h);});
    let m=Math.max(...p.evidence);p.evidence=p.evidence.map(v=>v-m);
    if(p.modelVersion!==modelVersion||p.modelEvidence?.length!==models.length){p.modelEvidence=models.map(()=>0);p.modelVersion=modelVersion;p.modelObservations=0;}
    const top=leaders(scores);context={...context,potentialTop:leaders(scores.map((v,j)=>v+((context.active?.[j]??true)?pot:0)))};
    models.forEach((model,j)=>{const h=modelHazard(model,pot,scores,i,remaining,context,top);p.modelEvidence[j]=p.modelEvidence[j]*.995+Math.log(banked?h:1-h);});
    m=Math.max(...p.modelEvidence);p.modelEvidence=p.modelEvidence.map(v=>Math.max(-60,v-m));
    p.observations=(p.observations||0)+1;p.modelObservations=(p.modelObservations||0)+1;
  }
  function modelSummary(p){const w=modelWeights(p),totals=families.map((family,f)=>({family,weight:w.reduce((sum,v,i)=>sum+(models[i].f===f?v:0),0)})).sort((a,b)=>b.weight-a.weight);return{...totals[0],observations:p.modelObservations||0,families:totals};}
  function reward(scores){let max=-Infinity,ties=0;for(const v of scores){if(v>max){max=v;ties=1;}else if(v===max)ties++;}return scores[0]===max?1/ties:0;}
  function transition(pot,rolls,a,b){if(rolls<3)return{pot:pot+(a+b===7?70:a+b),bust:false};if(a+b===7)return{pot:0,bust:true};return{pot:a===b?pot*2:pot+a+b,bust:false};}
  function hittingTable(target){const v=new Float64Array(target+1);for(let b=target-1;b>=0;b--){let total=b===0?0:6*(2*b>=target?1:v[2*b]);for(let j=0;j<sums.length;j++)total+=counts[j]*(b+sums[j]>=target?1:v[b+sums[j]]);v[b]=total/(b===0?30:36);}v[target]=1;return v;}
  function coarseHittingTable(target,step,up){
    const end=up?Math.floor(target/step):Math.ceil(target/step),v=new Float64Array(end+1);
    for(let b=end-1;b>=0;b--){let total=0,self=0;const twice=2*b;if(twice===b)self+=6;else total+=6*(twice>=end?1:v[twice]);for(let j=0;j<sums.length;j++){const next=b+(up?Math.ceil(sums[j]/step):Math.floor(sums[j]/step));if(next===b)self+=counts[j];else total+=counts[j]*(next>=end?1:v[next]);}v[b]=total/(36-self);}v[end]=1;return v;
  }
  function reachModel(target){
    const goal=Math.max(0,Math.ceil(target));if(goal<=16384)return{goal,exact:true,table:hittingTable(goal)};
    const step=Math.ceil(goal/4096);return{goal,exact:false,step,lower:coarseHittingTable(goal,step,false),upper:coarseHittingTable(goal,step,true)};
  }
  function reachAt(model,pot){
    if(pot>=model.goal)return{lower:1,upper:1,exact:true};
    if(model.exact){const value=model.table[pot];return{lower:value,upper:value,exact:true};}
    const lower=model.lower[Math.min(model.lower.length-1,Math.floor(pot/model.step))],upper=model.upper[Math.min(model.upper.length-1,Math.ceil(pot/model.step))];return{lower,upper,exact:false};
  }
  function leadTarget(s){let other=-Infinity;for(let i=1;i<s.players.length;i++)other=Math.max(other,s.players[i].score);return Math.max(0,other-s.players[0].score+1);}
  function reachMetric(s){const target=leadTarget(s),value=s.pot>=target?{lower:1,upper:1,exact:true}:reachAt(reachModel(target),s.pot);return{...value,target,pot:s.pot,alreadyReached:s.pot>=target};}
  function exactEnd(s){if(s.rolls<3)return null;if(s.round!==s.rounds||!s.players[0].active||s.players.slice(1).some(p=>p.active))return null;const scores=s.players.map(p=>p.score),other=Math.max(...scores.slice(1)),tied=scores.slice(1).filter(v=>v===other).length;const bank=scores[0]+s.pot>other?1:scores[0]+s.pot===other?1/(tied+1):0,bust=scores[0]>other?1:scores[0]===other?1/(tied+1):0,target=Math.max(0,other-scores[0]+1);if(target>250000)return{action:bank===1?'BANK':'ROLL',bank,roll:null,exact:true,target};const table=hittingTable(target),at=x=>x>=target?1:bust+(1-bust)*table[x];let roll=6*bust+6*at(2*s.pot);for(let j=0;j<sums.length;j++)roll+=counts[j]*at(s.pot+sums[j]);roll/=36;return{action:bank===1?'BANK':'ROLL',bank,roll,exact:true,target};}
  function guaranteed(s){
    if(s.rolls<3||!s.players[0].active)return null;
    if(s.round===s.rounds&&s.players.slice(1).filter(p=>p.active).length===1&&s.players.slice(1).every(p=>s.players[0].score>p.score))return{action:'WAIT',bank:null,roll:1,exact:true,samples:0,guarantee:'final-shadow',reason:'Only one opponent remains active and your existing score already leads everyone. Stay in, then match their BANK before the next roll to preserve the win.'};
    if(s.players.length!==2)return null;
    const me=s.players[0],op=s.players[1];
    if(op.active&&me.score>op.score)return{action:'WAIT',bank:null,roll:1,exact:true,samples:0,guarantee:'shadow',reason:'Stay in while your opponent stays in. If they BANK, match it before the next roll. This preserves your lead through every remaining round.'};
    if(!op.active&&me.score+s.pot>op.score)return{action:'BANK',bank:1,roll:null,exact:true,samples:0,guarantee:'lock',reason:'Bank to secure a lead. In later rounds, stay in until your opponent BANKs, then match their bank to preserve it.'};
    return null;
  }
  function prepare(s){return{round:s.round,rounds:s.rounds,initialRound:s.round,initialStep:s.rolls,pot:s.pot,step:s.rolls,scores:s.players.map(p=>p.score),active:s.players.map(p=>p.active),banked:s.players.map(p=>p.banked||0),lastBank:s.lastBank??-1,done:false,guarded:false};}
  function makeWorld(seed,post,stratum){return{seed,stratum,styles:post.map((w,i)=>{let x=hash(seed,-11,-7,i);for(let j=0;j<w.length;j++){x-=w[j];if(x<=0)return w.length===bases.length?{family:'adaptive',base:bases[j]}:models[j];}return w.length===bases.length?{family:'adaptive',base:bases.at(-1)}:models.at(-1);})};}
  function dice(g,w){if(g.round===g.initialRound&&g.step===g.initialStep&&w.stratum!==undefined)return[1+Math.floor(w.stratum/6),1+w.stratum%6];return[1+Math.floor(6*hash(w.seed,g.round,g.step,0)),1+Math.floor(6*hash(w.seed,g.round,g.step,1))];}
  function nextRound(g,w){if(g.round===g.rounds){g.done=true;return;}g.round++;g.pot=0;g.step=0;g.active.fill(true);g.banked.fill(0);g.lastBank=-1;for(let j=0;j<3;j++){const[a,b]=dice(g,w);g.pot+=a+b===7?70:a+b;g.step++;}}
  function bankAt(g,i){g.scores[i]+=g.pot;g.banked[i]=g.pot;g.active[i]=false;g.lastBank=i;}
  function advance(g,action,w){
    if(g.done)return;
    if(g.active[0]&&action===0)bankAt(g,0);
    for(;;){
      if(!g.active.some(Boolean)){nextRound(g,w);return;}
      const top=leaders(g.scores),remaining=g.rounds-g.round+1;g.potentialTop=potentialLeaders(g.scores,g.active,g.pot);
      const n=g.active.length,offset=Math.floor(hash(w.seed,g.round,g.step,500)*Math.max(1,n-1));
      let changed=false;
      for(let k=0;k<n-1;k++){
        const i=1+(k+offset)%(n-1);if(!g.active[i])continue;
        const m=typeof w.styles[i]==='number'?{family:'adaptive',base:w.styles[i]}:w.styles[i];
        const h=modelHazard(m,g.pot,g.scores,i,remaining,g,top);
        if(hash(w.seed,g.round,g.step,i+10)<h){bankAt(g,i);changed=true;break;}
      }
      if(changed){if(g.active[0])return;continue;}
      const[a,b]=dice(g,w),sum=a+b;g.pot=sum===7?0:a===b?g.pot*2:g.pot+sum;g.step++;g.lastBank=-1;
      if(sum===7){nextRound(g,w);return;}
      if(g.step>=183||!Number.isSafeInteger(g.pot)){g.guarded=true;nextRound(g,w);return;}
      if(g.active[0])return;
    }
  }
  function soloValue(g,cache){
    if(g.active[0]&&g.scores.length===2&&((g.active[1]&&g.scores[0]>g.scores[1])||(!g.active[1]&&g.scores[0]+g.pot>g.scores[1])))return 1;
    if(g.round!==g.rounds||!g.active[0])return null;
    if(g.active.filter(Boolean).length===2&&g.scores.slice(1).every(v=>g.scores[0]>v))return 1;
    let other=-Infinity,ties=0;for(let i=1;i<g.active.length;i++){if(g.active[i])return null;other=Math.max(other,g.scores[i]);}
    const target=other-g.scores[0]+1;if(g.pot>=target)return 1;if(target>6000)return null;
    for(let i=1;i<g.scores.length;i++)if(g.scores[i]===other)ties++;
    const bust=g.scores[0]===other?1/(ties+1):0;
    let table=cache.get(target);if(!table){if(cache.size>=32)cache.delete(cache.keys().next().value);table=hittingTable(target);cache.set(target,table);}
    return bust+(1-bust)*table[g.pot];
  }
  function policyAction(g,p){
    let other=-Infinity,banked=-Infinity,opponents=0;for(let i=1;i<g.scores.length;i++){other=Math.max(other,g.scores[i]);if(g.active[i])opponents++;else banked=Math.max(banked,g.scores[i]);}
    if(g.round===g.rounds&&opponents===1&&g.scores[0]>other)return 1;
    if(g.scores.length===2){if(g.active[1]&&g.scores[0]>=g.scores[1])return 1;if(!g.active[1]&&g.scores[0]+g.pot>g.scores[1])return 0;}
    const final=g.round===g.rounds;if(final&&!opponents)return g.scores[0]+g.pot>other?0:1;
    if(final&&g.scores[0]+g.pot<=other)return 1;
    if(p.patient&&opponents===g.active.length-1&&opponents)return 1;
    const current=g.round===g.initialRound,rem=g.rounds-g.round+1;
    let t=current?p.threshold:adjusted(p.future,other-g.scores[0],rem);
    if(current&&p.adaptive)t=adjusted(p.threshold,other-g.scores[0],rem);
    if(p.competitive&&Number.isFinite(banked)&&rem<=3)t=Math.max(t,(banked-g.scores[0]+1)/Math.sqrt(rem));
    if(p.reactive&&g.lastBank>=0&&g.scores[0]+g.pot>other)t=Math.min(t,g.pot);
    if(current&&p.reach){if(g.pot>=p.reach.goal)t=Math.min(t,p.reach.goal);else if(reachAt(p.reach,g.pot).lower>=p.reachRisk)t=Math.max(t,p.reach.goal);}
    return g.pot>=t?0:1;
  }
  function rollout(g,w,p,cache){for(let k=0;k<Math.max(450,(g.rounds-g.round+1)*(g.active.length+12))&&!g.done;k++){const exact=soloValue(g,cache);if(exact!==null)return exact;advance(g,policyAction(g,p),w);}if(!g.done)g.guarded=true;return reward(g.scores);}
  function key(g){return g.round+':'+g.pot+':'+g.lastBank+':'+g.scores.join(',')+':'+g.active.map(v=>v?'1':'0').join('')+':'+g.banked.join(',');}
  function node(){return{n:[0,0],sum:[0,0],squares:[0,0],child:[new Map(),new Map()]};}
  function choose(n,fallback,training){const total=n.n[0]+n.n[1];if(!training){if(Math.min(...n.n)<10||total<36)return fallback;return n.sum[1]/n.n[1]>n.sum[0]/n.n[0]?1:0;}if(!n.n[fallback])return fallback;if(!n.n[1-fallback])return 1-fallback;const u=a=>n.sum[a]/n.n[a]+.62*Math.sqrt(Math.log(total+1)/n.n[a]);return u(1)>u(0)?1:0;}
  function walk(g,w,p,root,action,training,ctx){let n=root,a=action,depth=0;const path=[];for(;;){path.push([n,a]);advance(g,a,w);let value=g.done?reward(g.scores):soloValue(g,ctx.cache);if(value===null){if(depth>=10)value=rollout(g,w,p,ctx.cache);else{const k=key(g);let child=n.child[a].get(k);if(!child){if(training&&ctx.nodes<ctx.maxNodes){child=node();n.child[a].set(k,child);ctx.nodes++;}value=rollout(g,w,p,ctx.cache);}else{n=child;a=choose(n,policyAction(g,p),training);depth++;continue;}}}if(training)for(const[n,a]of path){n.n[a]++;n.sum[a]+=value;n.squares[a]+=value*value;}ctx.guarded+=g.guarded?1:0;return value;}}
  function one(s,p,action,seed,post,stratum,ctx){const g=prepare(s),w=makeWorld(seed,post,stratum);advance(g,action,w);const value=g.done?reward(g.scores):rollout(g,w,p,ctx.cache);ctx.guarded+=g.guarded?1:0;return value;}
  function plans(s,targetAware=true){
    let other=-Infinity;for(let i=1;i<s.players.length;i++)other=Math.max(other,s.players[i].score);
    const thresholds=[s.pot+1,55,100,180,320,550,1000,2200,other-s.players[0].score+1],out=[];
    for(const t of new Set(thresholds.map(v=>Math.max(s.pot+1,v))))for(const future of[100,250,550,1200])out.push({threshold:t,future,adaptive:false,competitive:true});
    for(const future of[55,100,180,320,550,1000,1800])out.push({threshold:future,future,adaptive:true,competitive:true});
    for(const future of[100,250,550,1200])out.push({threshold:future,future,adaptive:true,competitive:true,reactive:true,patient:true});
    if(targetAware&&s.round<s.rounds){const goal=leadTarget(s);if(goal>s.pot){const reach=reachModel(goal),base=clamp(24*s.players.length*Math.sqrt(s.rounds),100,1400);for(const reachRisk of[.25,.5,.75])for(const future of[100,250,550])out.push({threshold:base,future,adaptive:true,competitive:true,reactive:true,patient:true,reach,reachRisk});}}
    return out;
  }
  function analyzePart(s,options={},progress=()=>{}){
    const started=clock(),exact=exactEnd(s),lock=exact?null:guaranteed(s);if(lock)return{...lock,elapsed:clock()-started};const bankLoses=s.round===s.rounds&&s.players.slice(1).some(p=>p.score>s.players[0].score+s.pot);if(exact&&exact.roll!==null)return{...exact,samples:0,elapsed:clock()-started};
    const until=options.deadline||started+(options.budgetMs||4000),span=Math.max(20,until-started),seed=options.seed??1234567;
    const stratum=(t,salt)=>((13*t+Math.floor(hash(seed,0,0,salt)*36))%36);
    const work=options.work;const keepGoing=(phase,count,time)=>work?count<(work[phase]||1):clock()<time;
    const policyUntil=started+span*.14,treeUntil=started+span*.56,tuneUntil=started+span*.68;
    const ctx={cache:new Map(),nodes:1,maxNodes:options.maxNodes||24000,guarded:0},post=s.players.map(p=>modelWeights(p)),stress=scenarios.map((_,i)=>s.players.map(p=>modelWeights(p,i))),all=plans(s,options.targetAware!==false&&s.targetAware!==false),records=all.map((p,i)=>({p,i,n:0,b:0,r:0}));
    let pool=records.slice(),trial=0,searchGames=0,evaluatedOutcomes=0,nextProgress=started;
    const report=phase=>{const now=clock();if(now>=nextProgress){progress({phase,elapsed:now-started,nodes:ctx.nodes,games:searchGames,outcomes:evaluatedOutcomes});nextProgress=now+160;}};
    do{for(let batch=0;batch<12;batch++){const t=trial++,worldseed=(seed+Math.imul(t+1,104729))>>>0;for(const rec of pool){rec.b+=one(s,rec.p,0,worldseed,post,stratum(t,101),ctx);rec.r+=one(s,rec.p,1,worldseed,post,stratum(t,101),ctx);rec.n++;searchGames+=2;}if(work?trial>=work.policy:clock()>=policyUntil)break;}if(pool.length>4){const take=Math.max(1,Math.ceil(pool.length/4)),keep=new Set([...pool.slice().sort((a,b)=>b.b/b.n-a.b/a.n).slice(0,take),...pool.slice().sort((a,b)=>b.r/b.n-a.r/a.n).slice(0,take)]);pool=[...keep];}report('Finding banking plans');}while(keepGoing('policy',trial,policyUntil));
    const candidates=pool.filter(r=>r.n>0),bp=candidates.slice().sort((a,b)=>b.b/b.n-a.b/a.n)[0].p,rp=candidates.slice().sort((a,b)=>b.r/b.n-a.r/a.n)[0].p;
    const roots=[node(),node()],selected=[bp,rp];let treeTrials=0;
    do{for(let k=0;k<(work?1:12);k++){const t=treeTrials++,worldseed=(seed^0x71bca321)+Math.imul(t+1,13007);for(let a=0;a<2;a++){walk(prepare(s),makeWorld(worldseed,post,stratum(t,211)),selected[a],roots[a],a,true,ctx);searchGames++;}}report('Searching future decisions');}while(keepGoing('tree',treeTrials,treeUntil));
    const tune=[{d:0,d2:0,n:0},{d:0,d2:0,n:0}];let tuning=0;
    do{for(let k=0;k<(work?1:12);k++){const t=tuning++,worldseed=(seed^0x439bef81)+Math.imul(t+1,65537);for(let a=0;a<2;a++){const tree=walk(prepare(s),makeWorld(worldseed,post,stratum(t,307)),selected[a],roots[a],a,false,ctx),base=one(s,selected[a],a,worldseed,post,stratum(t,307),ctx),d=tree-base;tune[a].d+=d;tune[a].d2+=d*d;tune[a].n++;searchGames+=2;}}report('Checking search improvements');}while(keepGoing('tune',tuning,tuneUntil));
    const useTree=tune.map(t=>t.d/t.n>Math.sqrt(Math.max(0,t.d2/t.n-(t.d/t.n)**2)/t.n));
    let n=0,b=0,r=0,b2=0,r2=0,d=0,d2=0,validation=0;
    const sensitivity=scenarios.map(name=>({name,n:0,b:0,r:0,d:0,d2:0}));
    do{
      const t=validation++,scenario=t%4===3?1+(Math.floor(t/4)%4):0,worldseed=(seed^0xb83a1375)+Math.imul(t+1,99991),v=[0,0];
      for(const outcome of chance)for(let a=0;a<2;a++){
        const value=useTree[a]?walk(prepare(s),makeWorld(worldseed,stress[scenario],outcome.face),selected[a],roots[a],a,false,ctx):one(s,selected[a],a,worldseed,stress[scenario],outcome.face,ctx);
        v[a]+=outcome.count*value/36;
      }
      const delta=v[1]-v[0],group=sensitivity[scenario];group.n++;group.b+=v[0];group.r+=v[1];group.d+=delta;group.d2+=delta*delta;
      if(scenario===0){b+=v[0];r+=v[1];b2+=v[0]*v[0];r2+=v[1]*v[1];d+=delta;d2+=delta*delta;n++;}
      evaluatedOutcomes+=chance.length;
      report('Checking chance outcomes and opponent assumptions');
    }while(keepGoing('validation',validation,until));
    const fallbackThreshold=clamp(24*s.players.length*Math.sqrt(s.rounds),100,1400);
    const fallbackAction=policyAction(prepare(s),{threshold:fallbackThreshold,future:fallbackThreshold,adaptive:true,competitive:true,reactive:true,patient:true})===0?'BANK':'ROLL';
    return{n,b,r,b2,r2,d,d2,fallbackAction,sensitivity,enumeratedOutcomes:validation*chance.length,nodes:ctx.nodes,searchGames,plans:all.length,treeTrials,useTree,guarded:ctx.guarded,exact:!!exact,exactAction:exact?.action,bankLoses,elapsed:clock()-started};
  }

  function combine(parts){
    const exact=parts.find(p=>p.exact&&p.samples===0);if(exact)return{...exact,workers:1};
    const totals={n:0,b:0,r:0,b2:0,r2:0,d:0,d2:0,nodes:0,searchGames:0,treeTrials:0,guarded:0,enumeratedOutcomes:0};
    for(const p of parts)for(const k of Object.keys(totals))totals[k]+=p[k]||0;
    const n=totals.n,bank=totals.b/n,roll=totals.r/n,se=Math.sqrt(Math.max(0,totals.d2/n-(totals.d/n)**2)/Math.max(1,n-1)),bankMargin=1.96*Math.sqrt(Math.max(0,totals.b2/n-bank*bank)/Math.max(1,n-1)),rollMargin=1.96*Math.sqrt(Math.max(0,totals.r2/n-roll*roll)/Math.max(1,n-1));
    const sensitivity=scenarios.map((name,i)=>{let n=0,b=0,r=0,d=0,d2=0;for(const p of parts){const g=p.sensitivity?.[i];if(g){n+=g.n;b+=g.b;r+=g.r;d+=g.d;d2+=g.d2;}}const delta=n?d/n:0;return{name,n,bank:n?b/n:null,roll:n?r/n:null,delta,margin:n>1?1.96*Math.sqrt(Math.max(0,d2/n-delta*delta)/(n-1)):1};});
    const reliable=sensitivity.filter(g=>g.n>=24),modelSensitive=reliable.some(g=>g.delta>g.margin)&&reliable.some(g=>g.delta< -g.margin);
    const close=Math.abs(roll-bank)<=1.96*se,bankLoses=parts.some(p=>p.bankLoses);
    let priorTieBreak=false;let action=parts.find(p=>p.exactAction)?.exactAction||(bankLoses?'ROLL':roll>bank?'ROLL':'BANK'),robustTieBreak=false;
    if(close&&!bankLoses&&!parts.some(p=>p.exactAction)){
      const fallback=parts.find(p=>p.fallbackAction)?.fallbackAction;
      if(fallback){priorTieBreak=action!==fallback;action=fallback;}
    }
    return{action,bankLoses,bank,roll,se,bankMargin,rollMargin,close,sensitivity,modelSensitive,robustTieBreak,priorTieBreak,modelRange:reliable.length?[Math.min(...reliable.map(g=>g.delta)),Math.max(...reliable.map(g=>g.delta))]:null,samples:n,workers:parts.length,nodes:totals.nodes,searchGames:totals.searchGames,treeTrials:totals.treeTrials,enumeratedOutcomes:totals.enumeratedOutcomes,treeUsed:parts.some(p=>p.useTree?.some(Boolean)),plans:Math.max(...parts.map(p=>p.plans||0)),guarded:totals.guarded,elapsed:Math.max(...parts.map(p=>p.elapsed)),exact:parts.some(p=>p.exact),agreement:parts.filter(p=>(p.r>p.b?'ROLL':'BANK')===action).length};
  }
  function analyze(s,quality='deep',progress=()=>{}){return combine([analyzePart(s,{budgetMs:quality==='deep'?4000:1000},progress)]);}
  return{reachModel,reachAt,reachMetric,leadTarget,bases,models,families,modelVersion,modelWeights,modelHazard,modelSummary,scenarios,chance,guaranteed,weights,observe,hazard,transition,exactEnd,analyzePart,combine,analyze,reward,prepare,advance,makeWorld,policyAction,hittingTable};
}
if(typeof module!=='undefined')module.exports=bankEngine;

};

factories["legacy/neural.js"]=function(require,module,exports){
(function(root){
'use strict';
const G=14,F=2,H=16,R=16,SCHEMA='banknet-state-small-1',MAXN=12,WARMUP=0;
const E=typeof bankEngine==='function'?bankEngine():typeof require==='function'?require('./engine.js')():null;
const big=x=>typeof x==='bigint'?x:BigInt(x),add=(a,b)=>typeof a==='bigint'||typeof b==='bigint'?big(a)+big(b):Number.isSafeInteger(a+b)?a+b:big(a)+big(b),sub=(a,b)=>typeof a==='bigint'||typeof b==='bigint'?big(a)-big(b):a-b;
const cmp=(a,b)=>a>b?1:a<b?-1:0,equal=(a,b)=>cmp(a,b)===0,logistic=x=>x>=0?1/(1+Math.exp(-Math.min(80,x))):Math.exp(Math.max(-80,x))/(1+Math.exp(Math.max(-80,x)));
function norm(x){const v=Number(x);if(Number.isFinite(v))return Math.asinh(v/100)/4;const s=big(x)<0n?-1:1,t=(s<0?-big(x):big(x)).toString();return s*(Math.log(Number(t.slice(0,12)))+(t.length-Math.min(12,t.length))*Math.LN10-Math.log(50))/4;}
function hash(seed,r,k,salt=0){let x=(seed^Math.imul(r+31,0x9e3779b1)^Math.imul(k+17,0x85ebca6b)^Math.imul(salt+9,0xc2b2ae35))>>>0;x=Math.imul(x^x>>>16,0x7feb352d);x=Math.imul(x^x>>>15,0x846ca68b);return(x^x>>>16)>>>0;}
function rng(seed){let x=seed>>>0;return()=>{x+=0x6d2b79f5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const sums=[3,4,5,6,8,9,10,11],counts=[2,2,4,4,4,4,2,2],cache=new Map();
function reachModel(goal){const key=String(goal);if(cache.has(key))return cache.get(key);let m;
 if(goal<=2048){const target=Math.max(0,Number(goal));m={goal,exact:true,table:E.hittingTable(target)};}
 else{const step=(big(goal)+511n)/512n,loEnd=Number((big(goal)+step-1n)/step),hiEnd=Number(big(goal)/step);
  const build=(end,up)=>{const v=new Float64Array(end+1);v[end]=1;for(let b=end-1;b>=0;b--){let value=0,self=0;const twice=2*b;if(twice===b)self+=6;else value+=6*(twice>=end?1:v[twice]);for(let j=0;j<8;j++){const jump=Number(up?(BigInt(sums[j])+step-1n)/step:BigInt(sums[j])/step),next=b+jump;if(next===b)self+=counts[j];else value+=counts[j]*(next>=end?1:v[next]);}v[b]=value/(36-self);}return v;};m={goal,exact:false,step,lower:build(loEnd,false),upper:build(hiEnd,true)};
 }
 if(cache.size>=96)cache.delete(cache.keys().next().value);cache.set(key,m);return m;
}
function reach(pot,goal){if(goal<=0||pot>=goal)return[1,1,1];const m=reachModel(goal);if(m.exact){const v=m.table[Number(pot)];return[v,v,1];}return[m.lower[Number(big(pot)/m.step)],m.upper[Math.min(m.upper.length-1,Number((big(pot)+m.step-1n)/m.step))],0];}
function leader(s,actor){let other=null;for(let i=0;i<s.players.length;i++)if(i!==actor&&(other===null||s.players[i].score>other))other=s.players[i].score;return other;}
function reward(scores,actor){let top=scores[0];for(const v of scores)if(v>top)top=v;if(!equal(scores[actor],top))return 0;return 1/scores.filter(v=>equal(v,top)).length;}
function oracle(s,actor=0){if(s.rolls<3||s.ended||!s.players[actor].active)return null;const me=s.players[actor],other=leader(s,actor),others=s.players.filter((_,i)=>i!==actor),active=others.filter(p=>p.active),final=s.round===s.rounds;
 if(final&&!active.length){const target=add(sub(other,me.score),1);if(add(me.score,s.pot)>other)return{action:'BANK',proven:true,lower:1,upper:1,reason:'Banking secures first place in the final round.'};const q=reach(s.pot,target),bust=reward(s.players.map(p=>p.score),actor);return{action:'ROLL',proven:true,lower:bust+(1-bust)*q[0],upper:bust+(1-bust)*q[1],reason:'Last active player in the final round: continue until banking takes a strict lead.'};}
 if(final&&active.length===1&&others.every(p=>me.score>p.score))return{action:'ROLL',proven:true,lower:1,upper:1,reason:'Keep matching the remaining opponent’s bank before the next roll to preserve the final-round lead.'};
 if(s.players.length===2){const op=others[0];if(op.active&&me.score>op.score)return{action:'ROLL',proven:true,lower:1,upper:1,reason:'Stay in, then match the opponent’s bank before the next roll to preserve the lead.'};if(!op.active&&add(me.score,s.pot)>op.score)return{action:'BANK',proven:true,lower:1,upper:1,reason:'Bank to take the lead, then match the opponent’s banks in subsequent rounds.'};}
 return null;
}
function record(p,pot,bank){observeChoice(p,bank);p.bankCount=(p.bankCount||0)+(bank?1:0);p.continueCount=(p.continueCount||0)+(bank?0:1);if(bank){const x=norm(pot);p.bankLogSum=(p.bankLogSum||0)+x;p.bankLogSq=(p.bankLogSq||0)+x*x;p.lastBankPot=pot;}p._belief=null;}
function oneStep(pot,target){if(target<=0)return 1;let wins=0;for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)if(a+b!==7&&(a===b?add(pot,pot):add(pot,a+b))>=target)wins++;return wins/36;}
const featureTables=new Map();
function featureReach(pot,goal){if(goal<=0||pot>=goal)return[1,1,1];if(goal>16384)return reach(pot,goal);const key=String(goal);let table=featureTables.get(key);if(!table){table=E.hittingTable(Number(goal));if(featureTables.size>=32)featureTables.delete(featureTables.keys().next().value);featureTables.set(key,table);}const p=table[Number(pot)];return[p,p,1];}
function scoreNorm(x){const v=Number(x);return Number.isFinite(v)?Math.asinh(v/150)/4:norm(x)-Math.sign(v)*Math.log(1.5)/4;}
function observeChoice(p,bank){const key=bank?'compactBanks':'compactContinues';p[key]=(p[key]||0)+1;}
function catchUp(s,actor=0){let highest=null;for(let i=0;i<s.players.length;i++)if(i!==actor&&s.players[i].active&&(highest===null||s.players[i].score>highest))highest=s.players[i].score;if(highest===null)return[0,0,1];const banked=add(s.players[actor].score,s.pot),target=sub(banked,highest);return featureReach(s.pot,target);}
function upgrade(data){return data;}
function features(s,actor=0){const n=s.players.length;if(n<2||n>12)throw Error('Neural tables support 2–12 players.');const me=s.players[actor],other=leader(s,actor),gap=sub(other,me.score),target=add(gap,1),q=featureReach(s.pot,target),active=s.players.filter(p=>p.active).length,remaining=s.rounds-s.round+1,safePot=s.safePot,catching=catchUp(s,actor);
 const globals=Float32Array.from([norm(s.pot),.1*s.rounds-1,remaining/20,.2*n-.6,(active-1)/(n-1),Math.asinh(Math.max(0,s.rolls-3))/4,scoreNorm(gap),q[0],q[1],oneStep(s.pot,target),safePot===undefined||safePot===null?-1:Number(safePot)/210,s.players.some(p=>!p.active)?1:0,catching[0],catching[1]]);
 const opponents=new Float32Array(11*F);for(let j=0;j<11;j++)opponents.set([0,-1],j*F);const rivals=s.players.filter((p,i)=>i!==actor).sort((a,b)=>cmp(b.score,a.score)||Number(b.active)-Number(a.active));
 for(let j=0;j<rivals.length;j++){const p=rivals[j];opponents.set([scoreNorm(sub(p.score,me.score)),p.active?1:0],j*F);}
 if(!globals.every(Number.isFinite)||!opponents.every(Number.isFinite))throw Error('Invalid compact neural features.');return{g:globals,o:opponents,n:n-1};
}

const INPUT=G+11*F,shapes=[[INPUT,H],[H,1],[INPUT,H],[H,1]];
const networks=[{name:'Small',width:16,schema:SCHEMA,parameters:1218},{name:'Normal',width:32,schema:'banknet-state-normal-1',parameters:2434},{name:'Large',width:128,schema:'banknet-state-large-1',parameters:9730}];
function networkShapes(width){if(!networks.some(n=>n.width===width))throw Error('Unsupported network size.');return[[INPUT,width],[width,1],[INPUT,width],[width,1]];}
const PARAMETERS=shapes.reduce((v,[i,o])=>v+i*o+o,0);
function warmup(model){return false;}
function create(seed=1,width=H){const selected=networks.find(n=>n.width===width);if(!selected)throw Error('Unsupported network size.');const random=rng(seed),layers=networkShapes(width).map(([input,output])=>{const w=new Float32Array(input*output),b=new Float32Array(output),scale=Math.sqrt(6/(input+output));for(let i=0;i<w.length;i++)w[i]=(2*random()-1)*scale*(output===1?.1:1);return{input,output,w,b};});layers[0].w.fill(0,0,INPUT);layers[0].w[0]=2;layers[0].b[0]=-2*norm(300);layers[1].w.fill(0);layers[1].w[0]=4;layers[3].w.fill(0);return{schema:selected.schema,updates:0,games:0,samples:0,layers};}
function dense(layer,x,tanh){const y=new Float32Array(layer.output);for(let j=0;j<layer.output;j++){let z=layer.b[j],offset=j*layer.input;for(let i=0;i<layer.input;i++)z+=layer.w[offset+i]*x[i];y[j]=tanh?Math.tanh(z):z;}return y;}
function forward(model,x,keep=false){const input=new Float32Array(INPUT);input.set(x.g);input.set(x.o,G);const a=dense(model.layers[0],input,true),az=dense(model.layers[1],a,false),vhidden=dense(model.layers[2],input,true),vz=dense(model.layers[3],vhidden,false),p=logistic(az[0]),v=logistic(vz[0]-Math.log(x.n));return{p,v,...(keep?{input,a,vhidden,az,vz}: {})};}
function gradients(model){return model.layers.map(l=>({w:new Float32Array(l.w.length),b:new Float32Array(l.b.length)}));}
function backDense(layer,grad,x,y,dy,tanh){const dx=new Float32Array(layer.input);for(let j=0;j<layer.output;j++){const d=dy[j]*(tanh?1-y[j]*y[j]:1),offset=j*layer.input;grad.b[j]+=d;for(let i=0;i<layer.input;i++){grad.w[offset+i]+=d*x[i];dx[i]+=layer.w[offset+i]*d;}}return dx;}
function backward(model,grad,c,dz){const da=backDense(model.layers[1],grad[1],c.a,c.az,[dz[0]],false);backDense(model.layers[0],grad[0],c.input,c.a,da,true);const dv=backDense(model.layers[3],grad[3],c.vhidden,c.vz,[dz[1]],false);backDense(model.layers[2],grad[2],c.input,c.vhidden,dv,true);}
function pack(model){return{schema:model.schema,updates:model.updates||0,games:model.games||0,samples:model.samples||0,layers:model.layers.map(l=>({input:l.input,output:l.output,w:Array.from(l.w),b:Array.from(l.b)}))};}
function unpack(data){const selected=networks.find(n=>n.schema===data?.schema),expected=selected?networkShapes(selected.width):[];for(const k of ['updates','games','samples'])if(!Number.isSafeInteger(data?.[k]??0)||(data?.[k]??0)<0)throw Error('Invalid model counters.');if(!selected||!Array.isArray(data.layers)||data.layers.length!==expected.length)throw Error('This network uses a different architecture. This 36-input version starts fresh; import earlier networks as Old scripts references.');const model={schema:selected.schema,updates:data.updates||0,games:data.games||0,samples:data.samples||0,layers:[]};for(let k=0;k<expected.length;k++){const l=data.layers[k],[input,output]=expected[k];if(l.input!==input||l.output!==output||l.w?.length!==input*output||l.b?.length!==output||!l.w.every(Number.isFinite)||!l.b.every(Number.isFinite))throw Error('Invalid model weights.');const w=Float32Array.from(l.w),b=Float32Array.from(l.b);if(!w.every(Number.isFinite)||!b.every(Number.isFinite))throw Error('Weights exceed float32 range.');model.layers.push({input,output,w,b});}return model;}
function infer(model,s,actor=0){const exact=oracle(s,actor),r=forward(model,features(s,actor));return{action:exact?.action||(r.p>=.5?'BANK':'ROLL'),bankPolicy:r.p,value:r.v,proven:exact||null,updates:model.updates||0};}
function freshPlayer(name){return{name,score:0,active:true,banked:0,style:'learn',evidence:E.bases.map(()=>0),modelVersion:E.modelVersion,modelEvidence:E.models.map(()=>0),observations:0,modelObservations:0};}
class Game{
 constructor(seed,n,rounds){if(n<2||n>12||!Number.isInteger(n)||!Number.isInteger(rounds)||rounds<1)throw Error('Invalid game setup.');this.seed=seed>>>0;this.players=Array.from({length:n},(_,i)=>freshPlayer('Player '+(i+1)));this.rounds=rounds;this.round=1;this.finished=false;this.ended=false;this.events=0;this.beginRound();}
 face(){let attempt=0,u;do{u=hash(this.seed,this.round,this.rolls,701+attempt++);}while(u>=4294967292);return u%36;}
 observe(i,bank){if(this.trackHistory===false){observeChoice(this.players[i],bank);return;}const p=this.players[i];record(p,this.pot,bank);const scores=this.players.map(p=>Number(p.score)),context={active:this.players.map(p=>p.active),banked:this.players.map(p=>Number(p.banked)),lastBank:this.lastBank};if(Number.isFinite(Number(this.pot))&&scores.every(Number.isFinite))E.observe(p,Number(this.pot),scores,i,this.rounds-this.round+1,bank,context);}
 roll(){const f=this.face(),a=Math.floor(f/6)+1,b=f%6+1,sum=a+b,safe=this.rolls<3;this.pot=safe?add(this.pot,sum===7?70:sum):sum===7?0:a===b?add(this.pot,this.pot):add(this.pot,sum);this.rolls++;if(this.rolls===3)this.safePot=this.pot;this.lastBank=-1;return!safe&&sum===7;}
 beginRound(){this.pot=0;this.rolls=0;this.lastBank=-1;for(const p of this.players){p.active=true;p.banked=0;}for(let k=0;k<3;k++)this.roll();this.pending=this.players.map((_,i)=>i);this.cursor=hash(this.seed,this.round,this.rolls,41)%this.players.length;this.seek();}
 seek(){if(!this.pending.length){if(this.players.some(p=>p.active)){for(let i=0;i<this.players.length;i++)if(this.players[i].active)this.observe(i,false);const bust=this.roll();if(!bust){this.pending=this.players.flatMap((p,i)=>p.active?[i]:[]);this.cursor=hash(this.seed,this.round,this.rolls,41)%this.players.length;return this.seek();}}
  if(this.round===this.rounds){this.finished=true;this.actor=-1;return;}this.round++;return this.beginRound();}
  for(let k=0;k<this.players.length;k++){const i=this.cursor;this.cursor=(this.cursor+1)%this.players.length;if(this.pending.includes(i)){this.actor=i;return;}}throw Error('Invalid action window.');}
 step(bank){if(this.finished)throw Error('Game is finished.');const i=this.actor,p=this.players[i];if(!p.active||this.rolls<3)throw Error('Illegal action.');this.events++;if(bank){this.observe(i,true);p.score=add(p.score,this.pot);p.banked=this.pot;p.active=false;this.lastBank=i;this.pending=this.players.flatMap((p,j)=>p.active?[j]:[]);}else this.pending=this.pending.filter(j=>j!==i);this.seek();}
 returns(){return this.players.map((_,i)=>reward(this.players.map(p=>p.score),i));}
}
function teacher(s,actor=0){const proof=oracle(s,actor);if(proof)return proof.action==='BANK';if(!Number.isFinite(Number(s.pot))||s.players.some(p=>!Number.isFinite(Number(p.score)))){const target=add(sub(leader(s,actor),s.players[actor].score),1);if(s.round===s.rounds&&s.pot<target)return false;return s.pot>=Math.max(100,Math.min(1400,24*s.players.length*Math.sqrt(s.rounds)));}const ids=[actor,...s.players.map((_,i)=>i).filter(i=>i!==actor)],ordered={...s,pot:Number(s.pot),lastBank:ids.indexOf(s.lastBank),players:ids.map(i=>({...s.players[i],score:Number(s.players[i].score),banked:Number(s.players[i].banked)}))},t=Math.max(100,Math.min(1400,24*s.players.length*Math.sqrt(s.rounds)));return E.policyAction(E.prepare(ordered),{threshold:t,future:t,adaptive:true,competitive:true,reactive:true,patient:false})===0;}
function heuristic(s,actor,kind,base,random){const me=s.players[actor],other=leader(s,actor),gap=Number(sub(other,me.score)),remaining=s.rounds-s.round+1;if(kind==='random')return random()<.15;if(kind==='fixed')return s.pot>=base;if(kind==='photo'){if(gap<0&&remaining<=3)return true;return s.pot>=Math.max(remaining===1&&gap>0?gap+1:0,gap<=-150?100:gap>0?300:200);}if(kind==='matcher'){const proof=oracle(s,actor);if(proof)return proof.action==='BANK';if(s.lastBank>=0&&add(me.score,s.pot)>other)return true;if(s.players.some((p,i)=>i!==actor&&p.active))return false;return s.pot>=base;}if(kind==='teacher')return teacher(s,actor);let threshold=base*Math.max(.4,Math.min(5,1+gap/((kind==='chaser'?100:180)*Math.sqrt(remaining))));if(kind==='reactive'&&s.lastBank>=0)threshold=Math.min(threshold,Number(s.pot));if(remaining===1&&add(me.score,s.pot)<=other)return false;return s.pot>=threshold;}
root.BankNet={G,F,H,R,SCHEMA,MAXN,WARMUP,PARAMETERS,networks,networkShapes,featureReach,catchUp,upgrade,oneStep,observeChoice,warmup,E,add,sub,cmp,equal,norm,hash,rng,reach,oracle,features,create,forward,gradients,backward,pack,unpack,infer,record,Game,teacher,heuristic,shapes,reward};
if(typeof module!=='undefined')module.exports=root.BankNet;
})(typeof globalThis!=='undefined'?globalThis:this);

};

factories["legacy/legacy-neural.js"]=function(require,module,exports){
(function(root){
'use strict';
const G=44,F=32,H=48,R=96,SCHEMA='banknet-2',MAXN=12,WARMUP=8192;
const E=typeof bankEngine==='function'?bankEngine():typeof require==='function'?require('./engine.js')():null;
const big=x=>typeof x==='bigint'?x:BigInt(x),add=(a,b)=>typeof a==='bigint'||typeof b==='bigint'?big(a)+big(b):Number.isSafeInteger(a+b)?a+b:big(a)+big(b),sub=(a,b)=>typeof a==='bigint'||typeof b==='bigint'?big(a)-big(b):a-b;
const cmp=(a,b)=>a>b?1:a<b?-1:0,equal=(a,b)=>cmp(a,b)===0,logistic=x=>x>=0?1/(1+Math.exp(-Math.min(80,x))):Math.exp(Math.max(-80,x))/(1+Math.exp(Math.max(-80,x)));
function norm(x){const v=Number(x);if(Number.isFinite(v))return Math.asinh(v/100)/4;const s=big(x)<0n?-1:1,t=(s<0?-big(x):big(x)).toString();return s*(Math.log(Number(t.slice(0,12)))+(t.length-Math.min(12,t.length))*Math.LN10-Math.log(50))/4;}
function hash(seed,r,k,salt=0){let x=(seed^Math.imul(r+31,0x9e3779b1)^Math.imul(k+17,0x85ebca6b)^Math.imul(salt+9,0xc2b2ae35))>>>0;x=Math.imul(x^x>>>16,0x7feb352d);x=Math.imul(x^x>>>15,0x846ca68b);return(x^x>>>16)>>>0;}
function rng(seed){let x=seed>>>0;return()=>{x+=0x6d2b79f5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const sums=[3,4,5,6,8,9,10,11],counts=[2,2,4,4,4,4,2,2],cache=new Map();
function reachModel(goal){const key=String(goal);if(cache.has(key))return cache.get(key);let m;
 if(goal<=2048){const target=Math.max(0,Number(goal));m={goal,exact:true,table:E.hittingTable(target)};}
 else{const step=(big(goal)+511n)/512n,loEnd=Number((big(goal)+step-1n)/step),hiEnd=Number(big(goal)/step);
  const build=(end,up)=>{const v=new Float64Array(end+1);v[end]=1;for(let b=end-1;b>=0;b--){let value=0,self=0;const twice=2*b;if(twice===b)self+=6;else value+=6*(twice>=end?1:v[twice]);for(let j=0;j<8;j++){const jump=Number(up?(BigInt(sums[j])+step-1n)/step:BigInt(sums[j])/step),next=b+jump;if(next===b)self+=counts[j];else value+=counts[j]*(next>=end?1:v[next]);}v[b]=value/(36-self);}return v;};m={goal,exact:false,step,lower:build(loEnd,false),upper:build(hiEnd,true)};
 }
 if(cache.size>=96)cache.delete(cache.keys().next().value);cache.set(key,m);return m;
}
function reach(pot,goal){if(goal<=0||pot>=goal)return[1,1,1];const m=reachModel(goal);if(m.exact){const v=m.table[Number(pot)];return[v,v,1];}return[m.lower[Number(big(pot)/m.step)],m.upper[Math.min(m.upper.length-1,Number((big(pot)+m.step-1n)/m.step))],0];}
function leader(s,actor){let other=null;for(let i=0;i<s.players.length;i++)if(i!==actor&&(other===null||s.players[i].score>other))other=s.players[i].score;return other;}
function reward(scores,actor){let top=scores[0];for(const v of scores)if(v>top)top=v;if(!equal(scores[actor],top))return 0;return 1/scores.filter(v=>equal(v,top)).length;}
function oracle(s,actor=0){if(s.rolls<3||s.ended||!s.players[actor].active)return null;const me=s.players[actor],other=leader(s,actor),others=s.players.filter((_,i)=>i!==actor),active=others.filter(p=>p.active),final=s.round===s.rounds;
 if(final&&!active.length){const target=add(sub(other,me.score),1);if(add(me.score,s.pot)>other)return{action:'BANK',proven:true,lower:1,upper:1,reason:'Banking secures first place in the final round.'};const q=reach(s.pot,target),bust=reward(s.players.map(p=>p.score),actor);return{action:'ROLL',proven:true,lower:bust+(1-bust)*q[0],upper:bust+(1-bust)*q[1],reason:'Last active player in the final round: continue until banking takes a strict lead.'};}
 if(final&&active.length===1&&others.every(p=>me.score>p.score))return{action:'ROLL',proven:true,lower:1,upper:1,reason:'Keep matching the remaining opponent’s bank before the next roll to preserve the final-round lead.'};
 if(s.players.length===2){const op=others[0];if(op.active&&me.score>op.score)return{action:'ROLL',proven:true,lower:1,upper:1,reason:'Stay in, then match the opponent’s bank before the next roll to preserve the lead.'};if(!op.active&&add(me.score,s.pot)>op.score)return{action:'BANK',proven:true,lower:1,upper:1,reason:'Bank to take the lead, then match the opponent’s banks in subsequent rounds.'};}
 return null;
}
function record(p,pot,bank){p.bankCount=(p.bankCount||0)+(bank?1:0);p.continueCount=(p.continueCount||0)+(bank?0:1);if(bank){const x=norm(pot);p.bankLogSum=(p.bankLogSum||0)+x;p.bankLogSq=(p.bankLogSq||0)+x*x;p.lastBankPot=pot;}p._belief=null;}
function belief(p){const key=p.modelObservations||0;if(p._belief&&p._belief.key===key&&p._belief.families instanceof Float32Array)return p._belief;const w=E.modelWeights(p),families=new Float32Array(7);let base=0,entropy=0;for(let j=0;j<w.length;j++){families[E.models[j].f]+=w[j];base+=w[j]*Math.log(E.models[j].base);if(w[j]>0)entropy-=w[j]*Math.log(w[j]);}const value={key,families,base:base/8,entropy:entropy/Math.log(w.length)};Object.defineProperty(p,'_belief',{value,writable:true,configurable:true,enumerable:false});return value;}
function oneStep(pot,target){if(pot>=target)return 1;let wins=0;for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)if(a+b!==7&&(a===b?add(pot,pot):add(pot,a+b))>=target)wins++;return wins/36;}
function features(s,actor=0){const n=s.players.length;if(n<2||n>12)throw Error('Neural tables support 2–12 players.');const me=s.players[actor],other=leader(s,actor),target=add(sub(other,me.score),1),q=reach(s.pot,target),tie=reach(s.pot,sub(other,me.score)),scores=s.players.map(p=>p.score),active=s.players.filter(p=>p.active).length,remaining=s.rounds-s.round+1;
 let ahead=0,activeAhead=0,bankedOther=null,activeOther=null;for(let i=0;i<n;i++){if(i===actor)continue;const p=s.players[i];if(p.active&&(activeOther===null||p.score>activeOther))activeOther=p.score;if(p.score>me.score){ahead++;if(p.active)activeAhead++;}if(!p.active&&(bankedOther===null||p.score>bankedOther))bankedOther=p.score;}
 const globals=Float32Array.from([norm(s.pot),remaining/20,s.rounds/20,s.round/20,n/12,active/n,s.rolls<3?1:0,Math.asinh(s.rolls)/4,norm(me.score),norm(sub(other,me.score)),norm(sub(s.pot,target)),me.active?1:0,s.rolls>=3?1/6:0,1/6,q[0],q[1],q[2],tie[0],tie[1],oneStep(s.pot,target),add(me.score,s.pot)>other?1:0,ahead/(n-1),activeAhead/(n-1),activeOther===null?0:norm(sub(activeOther,me.score)),(s.lastBank??-1)>=0?1:0,1-ahead/(n-1),reward(scores,actor),bankedOther===null?0:norm(sub(bankedOther,me.score)),s.round===s.rounds?1:0,active===1?1:0,equal(me.score,other)?1:0,scores.filter(v=>equal(v,other)).length/n]);
 const activeRivals=s.players.filter((p,i)=>i!==actor&&p.active),bankScore=add(me.score,s.pot),potential=s.players.map((p,i)=>i===actor?bankScore:add(p.score,p.active?s.pot:0)),leadPotential=potential.filter((_,i)=>i!==actor).reduce((a,b)=>a>b?a:b),doubleQ=reach(add(s.pot,s.pot),target),meanGap=s.players.reduce((v,p,i)=>v+(i===actor?0:norm(sub(p.score,me.score))),0)/(n-1);
 const extra=[1/n,activeRivals.length/(n-1),s.players.filter((p,i)=>i!==actor&&bankScore>p.score).length/(n-1),reward(potential,actor),norm(sub(leadPotential,bankScore)),doubleQ[0],doubleQ[1],meanGap,s.players.filter((p,i)=>i!==actor&&p.active&&p.score>=me.score).length/(n-1),Math.log1p(Math.max(0,remaining-1))/Math.log(20),s.lastBank===actor?1:0,bankedOther===null?1:reach(s.pot,add(sub(bankedOther,me.score),1))[0]];
 const globalInput=new Float32Array(G);globalInput.set(globals);globalInput.set(extra,32);
 const opponents=new Float32Array((n-1)*F);let row=0;
 for(let i=0;i<n;i++)if(i!==actor){const p=s.players[i],rq=reach(s.pot,add(sub(p.score,me.score),1)),b=belief(p),banks=p.bankCount||0,observed=(p.bankCount||0)+(p.continueCount||0),mean=banks?(p.bankLogSum||0)/banks:0,std=banks?Math.sqrt(Math.max(0,(p.bankLogSq||0)/banks-mean*mean)):0;
  const x=[norm(sub(p.score,me.score)),p.active?1:0,norm(p.banked||0),p.active?1:0,s.lastBank===i?1:0,equal(p.score,other)?1:0,rq[0],rq[1],equal(p.score,me.score)?1:0,norm(sub(add(p.score,p.active?s.pot:0),add(me.score,s.pot))),Math.log1p(p.modelObservations||p.observations||0)/6,(banks+1)/(observed+2),mean,std,norm(p.lastBankPot||0),...b.families,b.base,b.entropy];
  const context={active:s.players.map(v=>v.active),banked:s.players.map(v=>Number(v.banked||0)),lastBank:s.lastBank??-1},numeric=s.players.map(v=>Number(v.score));let hazard=0,doubled=0,hazardSq=0;const weights=E.modelWeights(p);if(numeric.every(Number.isFinite)&&Number.isFinite(2*Number(s.pot)))for(let j=0;j<weights.length;j++){const h=E.modelHazard(E.models[j],Number(s.pot),numeric,i,remaining,context);hazard+=weights[j]*h;hazardSq+=weights[j]*h*h;doubled+=weights[j]*E.modelHazard(E.models[j],2*Number(s.pot),numeric,i,remaining,context);}else{hazard=.5;doubled=.5;hazardSq=.25;}
  x.push(rq[2],p.active?hazard:0,p.active?doubled:0,p.active?Math.sqrt(Math.max(0,hazardSq-hazard*hazard)):0,add(me.score,s.pot)>p.score?1:0,me.score>p.score?1:0,p.active&&p.score>=me.score?1:0,Math.min(1,(p.modelObservations||0)/30));opponents.set(x,row++*F);
 }
 if(globalInput.length!==G||!globalInput.every(Number.isFinite)||!opponents.every(Number.isFinite))throw Error('Invalid neural features.');return{g:globalInput,o:opponents,n:n-1};
}
const shapes=[[F,H],[H,H],[G,2*H],[G+5*H,R],[R,R],[R,4]];
const PARAMETERS=shapes.reduce((v,[i,o])=>v+i*o+o,0);
function warmup(model){return(model.samples||0)<WARMUP||(model.updates||0)<8;}
function create(seed=1){const random=rng(seed),layers=shapes.map(([input,output])=>{const weights=new Float32Array(input*output),bias=new Float32Array(output),scale=Math.sqrt(6/(input+output));for(let i=0;i<weights.length;i++)weights[i]=(2*random()-1)*scale;return{input,output,w:weights,b:bias};});layers[5].w.fill(0);layers[5].b[0]=-.2;return{schema:SCHEMA,updates:0,games:0,samples:0,layers};}
function dense(layer,x,tanh){const y=new Float32Array(layer.output);for(let j=0;j<layer.output;j++){let z=layer.b[j],offset=j*layer.input;for(let i=0;i<layer.input;i++)z+=layer.w[offset+i]*x[i];y[j]=tanh?Math.tanh(z):z;}return y;}
function forward(model,x,keep=false){const tokens=[];for(let j=0;j<x.n;j++){const input=x.o.subarray(j*F,(j+1)*F),a=dense(model.layers[0],input,true),raw=dense(model.layers[1],a,false),b=Float32Array.from(raw,(v,k)=>Math.tanh(v+a[k]));tokens.push({input,a,b,raw});}
 const query=dense(model.layers[2],x.g,true),attentions=[],pooled=new Float32Array(G+5*H),argmax=new Int16Array(H),active=[];pooled.set(x.g);
 for(let j=0;j<x.n;j++)if(x.o[j*F+1])active.push(j);
 for(let head=0;head<2;head++){const logits=tokens.map(t=>t.b.reduce((sum,v,k)=>sum+v*query[head*H+k],0)/Math.sqrt(H)),max=Math.max(...logits),weights=logits.map(v=>Math.exp(v-max)),total=weights.reduce((a,b)=>a+b,0);attentions.push(Float32Array.from(weights,v=>v/total));}
 for(let k=0;k<H;k++){let sum=0,max=-Infinity,index=0,activeSum=0;for(let j=0;j<x.n;j++){const v=tokens[j].b[k];sum+=v;if(v>max){max=v;index=j;}if(x.o[j*F+1])activeSum+=v;for(let h=0;h<2;h++)pooled[G+(2+h)*H+k]+=attentions[h][j]*v;}pooled[G+k]=sum/x.n;pooled[G+H+k]=max;pooled[G+4*H+k]=activeSum/Math.max(1,active.length);argmax[k]=index;}
 const a=dense(model.layers[3],pooled,true),raw=dense(model.layers[4],a,false),b=Float32Array.from(raw,(v,k)=>Math.tanh(v+a[k])),z=dense(model.layers[5],b,false),prior=Math.log(x.n),p=logistic(z[0]),v=logistic(z[1]-prior),qb=logistic(z[2]-prior),qr=logistic(z[3]-prior);return{p,v,qb,qr,...(keep?{tokens,pooled,a,b,z,argmax,n:x.n,query,attentions,active,g:x.g,o:x.o}:{} )};}
function gradients(model){return model.layers.map(l=>({w:new Float32Array(l.w.length),b:new Float32Array(l.b.length)}));}
function backDense(layer,grad,x,y,dy,tanh){const dx=new Float32Array(layer.input);for(let j=0;j<layer.output;j++){const d=dy[j]*(tanh?1-y[j]*y[j]:1),offset=j*layer.input;grad.b[j]+=d;for(let i=0;i<layer.input;i++){grad.w[offset+i]+=d*x[i];dx[i]+=layer.w[offset+i]*d;}}return dx;}
function backward(model,grad,c,dz){const db=backDense(model.layers[5],grad[5],c.b,c.z,dz,false),dr=Float32Array.from(db,(v,k)=>v*(1-c.b[k]*c.b[k])),da=backDense(model.layers[4],grad[4],c.a,c.b,dr,false);for(let k=0;k<R;k++)da[k]+=dr[k];const dp=backDense(model.layers[3],grad[3],c.pooled,c.a,da,true),dt=Array.from({length:c.n},()=>new Float32Array(H)),dq=new Float32Array(2*H);
 for(let j=0;j<c.n;j++)for(let k=0;k<H;k++)dt[j][k]=dp[G+k]/c.n+(c.argmax[k]===j?dp[G+H+k]:0)+(c.o[j*F+1]?dp[G+4*H+k]/Math.max(1,c.active.length):0);
 for(let h=0;h<2;h++){const weights=c.attentions[h],dw=new Float32Array(c.n);let mean=0;for(let j=0;j<c.n;j++){for(let k=0;k<H;k++){dw[j]+=dp[G+(2+h)*H+k]*c.tokens[j].b[k];dt[j][k]+=weights[j]*dp[G+(2+h)*H+k];}mean+=weights[j]*dw[j];}for(let j=0;j<c.n;j++){const d=weights[j]*(dw[j]-mean)/Math.sqrt(H);for(let k=0;k<H;k++){dq[h*H+k]+=d*c.tokens[j].b[k];dt[j][k]+=d*c.query[h*H+k];}}}
 backDense(model.layers[2],grad[2],c.g,c.query,dq,true);
 for(let j=0;j<c.n;j++){const t=c.tokens[j],dr=Float32Array.from(dt[j],(v,k)=>v*(1-t.b[k]*t.b[k])),da=backDense(model.layers[1],grad[1],t.a,t.b,dr,false);for(let k=0;k<H;k++)da[k]+=dr[k];backDense(model.layers[0],grad[0],t.input,t.a,da,true);}}
function pack(model){return{schema:SCHEMA,updates:model.updates||0,games:model.games||0,samples:model.samples||0,layers:model.layers.map(l=>({input:l.input,output:l.output,w:Array.from(l.w),b:Array.from(l.b)}))};}
function unpack(data){for(const k of ['updates','games','samples'])if(!Number.isSafeInteger(data?.[k]??0)||(data?.[k]??0)<0)throw Error('Invalid model counters.');if(data?.schema!==SCHEMA||!Array.isArray(data.layers)||data.layers.length!==shapes.length)throw Error('This network uses a different architecture. Bank Net 2 needs a new training run.');const model={schema:SCHEMA,updates:data.updates||0,games:data.games||0,samples:data.samples||0,layers:[]};for(let k=0;k<shapes.length;k++){const l=data.layers[k],[input,output]=shapes[k];if(l.input!==input||l.output!==output||l.w?.length!==input*output||l.b?.length!==output||!l.w.every(Number.isFinite)||!l.b.every(Number.isFinite))throw Error('Invalid model weights.');const w=Float32Array.from(l.w),b=Float32Array.from(l.b);if(!w.every(Number.isFinite)||!b.every(Number.isFinite))throw Error('Weights exceed float32 range.');model.layers.push({input,output,w,b});}return model;}
function infer(model,s,actor=0){const exact=oracle(s,actor),r=forward(model,features(s,actor));return{action:exact?.action||(r.p>=.5?'BANK':'ROLL'),bankPolicy:r.p,value:r.v,bankValue:r.qb,rollValue:r.qr,proven:exact||null,updates:model.updates||0};}
function freshPlayer(name){return{name,score:0,active:true,banked:0,style:'learn',evidence:E.bases.map(()=>0),modelVersion:E.modelVersion,modelEvidence:E.models.map(()=>0),observations:0,modelObservations:0};}
class Game{
 constructor(seed,n,rounds){if(n<2||n>12||!Number.isInteger(n)||!Number.isInteger(rounds)||rounds<1)throw Error('Invalid game setup.');this.seed=seed>>>0;this.players=Array.from({length:n},(_,i)=>freshPlayer('Player '+(i+1)));this.rounds=rounds;this.round=1;this.finished=false;this.ended=false;this.events=0;this.beginRound();}
 face(){let attempt=0,u;do{u=hash(this.seed,this.round,this.rolls,701+attempt++);}while(u>=4294967292);return u%36;}
 observe(i,bank){const p=this.players[i];record(p,this.pot,bank);const scores=this.players.map(p=>Number(p.score)),context={active:this.players.map(p=>p.active),banked:this.players.map(p=>Number(p.banked)),lastBank:this.lastBank};if(Number.isFinite(Number(this.pot))&&scores.every(Number.isFinite))E.observe(p,Number(this.pot),scores,i,this.rounds-this.round+1,bank,context);}
 roll(){const f=this.face(),a=Math.floor(f/6)+1,b=f%6+1,sum=a+b,safe=this.rolls<3;this.pot=safe?add(this.pot,sum===7?70:sum):sum===7?0:a===b?add(this.pot,this.pot):add(this.pot,sum);this.rolls++;this.lastBank=-1;return!safe&&sum===7;}
 beginRound(){this.pot=0;this.rolls=0;this.lastBank=-1;for(const p of this.players){p.active=true;p.banked=0;}for(let k=0;k<3;k++)this.roll();this.pending=this.players.map((_,i)=>i);this.cursor=hash(this.seed,this.round,this.rolls,41)%this.players.length;this.seek();}
 seek(){if(!this.pending.length){if(this.players.some(p=>p.active)){for(let i=0;i<this.players.length;i++)if(this.players[i].active)this.observe(i,false);const bust=this.roll();if(!bust){this.pending=this.players.flatMap((p,i)=>p.active?[i]:[]);this.cursor=hash(this.seed,this.round,this.rolls,41)%this.players.length;return this.seek();}}
  if(this.round===this.rounds){this.finished=true;this.actor=-1;return;}this.round++;return this.beginRound();}
  for(let k=0;k<this.players.length;k++){const i=this.cursor;this.cursor=(this.cursor+1)%this.players.length;if(this.pending.includes(i)){this.actor=i;return;}}throw Error('Invalid action window.');}
 step(bank){if(this.finished)throw Error('Game is finished.');const i=this.actor,p=this.players[i];if(!p.active||this.rolls<3)throw Error('Illegal action.');this.events++;if(bank){this.observe(i,true);p.score=add(p.score,this.pot);p.banked=this.pot;p.active=false;this.lastBank=i;this.pending=this.players.flatMap((p,j)=>p.active?[j]:[]);}else this.pending=this.pending.filter(j=>j!==i);this.seek();}
 returns(){return this.players.map((_,i)=>reward(this.players.map(p=>p.score),i));}
}
function teacher(s,actor=0){const proof=oracle(s,actor);if(proof)return proof.action==='BANK';if(!Number.isFinite(Number(s.pot))||s.players.some(p=>!Number.isFinite(Number(p.score)))){const target=add(sub(leader(s,actor),s.players[actor].score),1);if(s.round===s.rounds&&s.pot<target)return false;return s.pot>=Math.max(100,Math.min(1400,24*s.players.length*Math.sqrt(s.rounds)));}const ids=[actor,...s.players.map((_,i)=>i).filter(i=>i!==actor)],ordered={...s,pot:Number(s.pot),lastBank:ids.indexOf(s.lastBank),players:ids.map(i=>({...s.players[i],score:Number(s.players[i].score),banked:Number(s.players[i].banked)}))},t=Math.max(100,Math.min(1400,24*s.players.length*Math.sqrt(s.rounds)));return E.policyAction(E.prepare(ordered),{threshold:t,future:t,adaptive:true,competitive:true,reactive:true,patient:false})===0;}
function heuristic(s,actor,kind,base,random){const me=s.players[actor],other=leader(s,actor),gap=Number(sub(other,me.score)),remaining=s.rounds-s.round+1;if(kind==='random')return random()<.15;if(kind==='fixed')return s.pot>=base;if(kind==='photo'){if(gap<0&&remaining<=3)return true;return s.pot>=Math.max(remaining===1&&gap>0?gap+1:0,gap<=-150?100:gap>0?300:200);}if(kind==='matcher'){const proof=oracle(s,actor);if(proof)return proof.action==='BANK';if(s.lastBank>=0&&add(me.score,s.pot)>other)return true;if(s.players.some((p,i)=>i!==actor&&p.active))return false;return s.pot>=base;}if(kind==='teacher')return teacher(s,actor);let threshold=base*Math.max(.4,Math.min(5,1+gap/((kind==='chaser'?100:180)*Math.sqrt(remaining))));if(kind==='reactive'&&s.lastBank>=0)threshold=Math.min(threshold,Number(s.pot));if(remaining===1&&add(me.score,s.pot)<=other)return false;return s.pot>=threshold;}
root.LegacyBankNet={G,F,H,R,SCHEMA,MAXN,WARMUP,PARAMETERS,warmup,E,add,sub,cmp,equal,norm,hash,rng,reach,oracle,features,create,forward,gradients,backward,pack,unpack,infer,record,Game,teacher,heuristic,shapes,reward};
if(typeof module!=='undefined')module.exports=root.LegacyBankNet;
})(typeof globalThis!=='undefined'?globalThis:this);

};

factories["memory_features.js"]=function(require,module,exports){
'use strict';
// Public observations only: a bank is visible immediately; continuing is only
// recorded when everyone has stayed in and the next roll is about to occur.
// Hook observe(), never the internal polling cursor or a hidden declined step.
const N=require('./legacy/neural.js'),Rich=require('./legacy/legacy-neural.js');
const SCHEMA='bankforge-set-memory-1',SLOTS=7,CURRENT=14,EVENTS=16,F=12,ROW=CURRENT+1+EVENTS*(F+1),INPUTS=48+SLOTS*ROW;
const CURRENT_COLUMNS=[0,1,2,3,4,5,6,7,8,9,24,28,29,30];
const {norm,add,sub,equal,reach}=Rich;
function reward(scores,actor){const top=scores.reduce((a,b)=>a>b?a:b);return equal(scores[actor],top)?1/scores.filter(v=>equal(v,top)).length:0;}
function oneStep(pot,target){if(pot>=target)return 1;let wins=0;for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)if(a+b!==7&&(a===b?add(pot,pot):add(pot,a+b))>=target)wins++;return wins/36;}
// Same public state/risk features as the prior attention model, without computing
// its heuristic-family posterior, aggregate bank statistics or hazard estimates.
function state(s,actor){
 const n=s.players.length,me=s.players[actor],others=s.players.filter((_,i)=>i!==actor),other=others.reduce((v,p)=>p.score>v?p.score:v,others[0].score);
 const target=add(sub(other,me.score),1),q=reach(s.pot,target),tie=reach(s.pot,sub(other,me.score));
 const scores=s.players.map(p=>p.score),active=s.players.filter(p=>p.active).length,remaining=s.rounds-s.round+1;
 let ahead=0,activeAhead=0,bankedOther=null,activeOther=null;
 for(const p of others){if(p.active&&(activeOther===null||p.score>activeOther))activeOther=p.score;if(p.score>me.score){ahead++;if(p.active)activeAhead++;}if(!p.active&&(bankedOther===null||p.score>bankedOther))bankedOther=p.score;}
 const globals=[norm(s.pot),remaining/20,s.rounds/20,s.round/20,n/12,active/n,s.rolls<3?1:0,Math.asinh(s.rolls)/4,norm(me.score),norm(sub(other,me.score)),norm(sub(s.pot,target)),me.active?1:0,s.rolls>=3?1/6:0,1/6,q[0],q[1],q[2],tie[0],tie[1],oneStep(s.pot,target),add(me.score,s.pot)>other?1:0,ahead/(n-1),activeAhead/(n-1),activeOther===null?0:norm(sub(activeOther,me.score)),s.lastBank>=0?1:0,1-ahead/(n-1),reward(scores,actor),bankedOther===null?0:norm(sub(bankedOther,me.score)),s.round===s.rounds?1:0,active===1?1:0,equal(me.score,other)?1:0,scores.filter(v=>equal(v,other)).length/n];
 const activeRivals=others.filter(p=>p.active),bankScore=add(me.score,s.pot),potential=s.players.map((p,i)=>i===actor?bankScore:add(p.score,p.active?s.pot:0));
 const leadPotential=potential.filter((_,i)=>i!==actor).reduce((a,b)=>a>b?a:b),doubleQ=reach(add(s.pot,s.pot),target),meanGap=others.reduce((v,p)=>v+norm(sub(p.score,me.score)),0)/(n-1);
 globals.push(1/n,activeRivals.length/(n-1),others.filter(p=>bankScore>p.score).length/(n-1),reward(potential,actor),norm(sub(leadPotential,bankScore)),doubleQ[0],doubleQ[1],meanGap,activeRivals.filter(p=>p.score>=me.score).length/(n-1),Math.log1p(Math.max(0,remaining-1))/Math.log(20),s.lastBank===actor?1:0,bankedOther===null?1:reach(s.pot,add(sub(bankedOther,me.score),1))[0]);
 const x=Array.from(Float32Array.from(globals)),safe=s.safePot,total=scores.reduce((sum,v)=>add(sum,v),0);
 x.push(safe==null?-1:Number(safe)/210,safe==null?0:norm(sub(s.pot,safe)),scores.every(v=>equal(v,0))?1:0,norm(total));
 const current=others.map(p=>{const rq=reach(s.pot,add(sub(p.score,me.score),1));return Array.from(Float32Array.from([
  norm(sub(p.score,me.score)),p.active?1:0,norm(p.banked||0),p.active?1:0,s.lastBank===s.players.indexOf(p)?1:0,equal(p.score,other)?1:0,
  rq[0],rq[1],equal(p.score,me.score)?1:0,norm(sub(add(p.score,p.active?s.pot:0),add(me.score,s.pot))),rq[2],add(me.score,s.pot)>p.score?1:0,me.score>p.score?1:0,p.active&&p.score>=me.score?1:0]));});
 return {x,current};
}

function publicEvent(s,i,bank){
 const me=s.players[i],others=s.players.filter((_,j)=>j!==i),top=others.reduce((v,p)=>p.score>v?p.score:v,others[0].score);
 return [bank?1:0,Rich.norm(s.pot),(s.rounds-s.round+1)/20,s.round/20,s.players.length/12,
         s.players.filter(p=>p.active).length/s.players.length,Rich.norm(me.score),Rich.norm(N.sub(top,me.score)),
         others.filter(p=>p.score>me.score).length/others.length,s.lastBank>=0?1:0,
         N.add(me.score,s.pot)>top?1:0,s.round===s.rounds?1:0];
}
function attach(s){
 if(s.publicMemory)return;
 s.publicMemory=s.players.map(()=>[]);
 const observe=s.observe;
 s.observe=function(i,bank){
  const event=publicEvent(this,i,bank);observe.call(this,i,bank);
  const events=this.publicMemory[i];events.push(event);if(events.length>EVENTS)events.shift();
 };
}
function input(s,a){
 if(s.players.length<3||s.players.length>8)throw Error('Set-memory supports 3–8 players');
 const {x,current}=state(s,a),ids=s.players.flatMap((_,i)=>i===a?[]:[i]);
 for(let j=0;j<SLOTS;j++){
  if(j>=ids.length){x.push(...Array(ROW).fill(0));continue;}
  x.push(...current[j],1);
  const events=s.publicMemory?.[ids[j]]||[];
  for(let k=0;k<EVENTS;k++)x.push(...(k<events.length?[...events[k],1]:Array(F+1).fill(0)));
 }
 if(x.length!==INPUTS||!x.every(Number.isFinite))throw Error('Invalid public-memory features');
 return x;
}
module.exports={SCHEMA,SLOTS,CURRENT,EVENTS,F,ROW,INPUTS,CURRENT_COLUMNS,attach,input,publicEvent,state};

};

factories["position_features.js"]=function(require,module,exports){
'use strict';
// Whitelist the current position plus the public initial safe-roll pot anchor.
// No roll count, last banker, event history or inferred opponent styles.
const State=require('./memory_features.js'),N=require('./legacy/neural.js');
const E=require('./legacy/engine.js')(),tables=new Map(),MAX_EXACT=16384;
const SCHEMA='bankforge-position-attention-1';
const POWER_SCHEMA='bankforge-position-attention-2';
const CDF_SCHEMA='bankforge-position-attention-3';
// Exact, fixed game distribution, not observed opponent/game history.
const CDF_TOTAL=36**3;
const safeFaces=[];for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)safeFaces.push(a+b===7?70:a+b);
let safeCounts=new Uint32Array(211);safeCounts[0]=1;
for(let roll=0;roll<3;roll++){
 const next=new Uint32Array(211);
 for(let pot=0;pot<=70*roll;pot++)if(safeCounts[pot])for(const face of safeFaces)next[pot+face]+=safeCounts[pot];
 safeCounts=next;
}
const safeCumulative=new Uint32Array(211);let cumulative=0;
for(let pot=0;pot<=210;pot++){cumulative+=safeCounts[pot];safeCumulative[pot]=cumulative;}
if(cumulative!==CDF_TOTAL||safeCumulative[6]!==1)throw Error('Invalid exact safe-pot distribution');
function percentileSafePot(pot){
 if(pot==null)return -1;
 const value=Number(pot);if(!Number.isFinite(value))throw Error('Invalid safe pot');
 if(value<=6)return 0;if(value>=210)return 1;
 // Inclusive lower tail, with the minimum's one outcome removed at both ends.
 return (safeCumulative[Math.floor(value)]-1)/(CDF_TOTAL-1);
}
const SAFE_POT_EXPONENT=Math.log(.5)/Math.log((26-6)/(210-6));
function normalizeSafePot(pot){
 if(pot==null)return -1;
 const unit=Math.max(0,Math.min(1,(Number(pot)-6)/204));
 return Math.pow(unit,SAFE_POT_EXPONENT);
}
const exactReach=(pot,goal)=>goal<=MAX_EXACT||pot>=goal||goal<=0;
function reach(pot,goal){
 if(goal<=0||pot>=goal)return 1;
 if(goal>MAX_EXACT)return 0;
 const key=String(goal);let table=tables.get(key);
 if(!table){table=E.hittingTable(Number(goal));if(tables.size>=96)tables.delete(tables.keys().next().value);tables.set(key,table);}
 return table[Number(pot)];
}
function input(s,actor){
 if(s.players.length<3||s.players.length>8)throw Error('State-only attention supports 3–8 players');
 const snapshot={pot:s.pot,round:s.round,rounds:s.rounds,
  players:s.players.map(p=>({score:p.score,active:p.active,banked:p.banked||0})),
  rolls:3,lastBank:-1,safePot:s.safePot};
 const {x:g,current}=State.state(snapshot,actor),me=snapshot.players[actor];
 const rivals=snapshot.players.filter((_,i)=>i!==actor);
 const leader=rivals.reduce((v,p)=>p.score>v?p.score:v,rivals[0].score);
 const strictGoal=N.add(N.sub(leader,me.score),1),tieGoal=N.sub(leader,me.score);
 const strictAvailable=exactReach(snapshot.pot,strictGoal),tieAvailable=exactReach(snapshot.pot,tieGoal);
 const doubleAvailable=exactReach(N.add(snapshot.pot,snapshot.pot),strictGoal);
 let successfulFaces=0;
 for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)if(a+b!==7&&(a===b?N.add(snapshot.pot,snapshot.pot):N.add(snapshot.pot,a+b))>=strictGoal)successfulFaces++;
 g[19]=successfulFaces/36; // Survive next roll and have enough pot for a strict lead.
 // Mask bounded approximations: this schema supplies exact dice-only reach
 // probabilities where supported, or zeros plus an availability flag otherwise.
 g[14]=g[15]=strictAvailable?reach(snapshot.pot,strictGoal):0;
 g[16]=strictAvailable?1:0;
 g[17]=g[18]=tieAvailable?reach(snapshot.pot,tieGoal):0;
 g[7]=tieAvailable?1:0;g[6]=doubleAvailable?1:0;
 g[37]=g[38]=doubleAvailable?reach(N.add(snapshot.pot,snapshot.pot),strictGoal):0;
 const banked=rivals.filter(p=>!p.active);
 const bestBanked=banked.length?banked.reduce((v,p)=>p.score>v?p.score:v,banked[0].score):null;
 const bankedAvailable=bestBanked===null||exactReach(snapshot.pot,N.add(N.sub(bestBanked,me.score),1));
 g[43]=bankedAvailable?(bestBanked===null?1:reach(snapshot.pot,N.add(N.sub(bestBanked,me.score),1))):0;
 g[42]=bankedAvailable?1:0;
 // Keep only the explicitly requested public safe-pot / 210 round anchor.
 // Last-bank timing and the separate pot-since-safe feature remain disabled.
 g[24]=0;g[45]=0;
 const out=g.slice();
 for(let j=0;j<11;j++){
  const row=Array(33).fill(0);
  if(j<current.length){
   for(let k=0;k<State.CURRENT_COLUMNS.length;k++)row[State.CURRENT_COLUMNS[k]]=current[j][k];
   row[4]=0; // No last-banker identity/order.
   const goal=N.add(N.sub(rivals[j].score,me.score),1);
   row[24]=exactReach(snapshot.pot,goal)?1:0;
   row[6]=row[7]=row[24]?reach(snapshot.pot,goal):0;
   row[32]=1;
  }
  out.push(...row);
 }
 if(out.length!==411||!out.every(Number.isFinite))throw Error('Invalid position-only features');
 return out;
}
// Preserve the original schema verbatim for saved /210 models and opponents.
function powerInput(s,actor){const x=input(s,actor);x[44]=normalizeSafePot(s.safePot);return x;}
function cdfInput(s,actor){const x=input(s,actor);x[44]=percentileSafePot(s.safePot);return x;}
module.exports={SCHEMA,POWER_SCHEMA,CDF_SCHEMA,CDF_TOTAL,input,powerInput,cdfInput,normalizeSafePot,percentileSafePot,SAFE_POT_EXPONENT,MAX_EXACT};

};

factories["opponent_targets.js"]=function(require,module,exports){
'use strict';
const Memory=require('./memory_features.js');
const SCHEMA='bankforge-set-prediction-1';
// Capture only public event boundaries. Nothing here reads actor/cursor/pending,
// seat policies, random seeds or the order of internal declined decisions.
function attach(s,focal){
 if(focal<0)return null;
 const completed=[],pending=[];let banked=new Set(),dirty=false;
 function capture(){
  if(!s.players[focal].active)return;
  const ids=s.players.flatMap((_,i)=>i===focal?[]:[i]);
  const active=ids.map(i=>s.players[i].active);
  if(!active.some(Boolean))return;
  const x=Memory.input(s,focal);
  pending.push({x,ids,active});
 }
 function finish(){
  const counts=new Map();
  for(const row of pending)row.ids.forEach((id,j)=>{if(row.active[j])counts.set(id,(counts.get(id)||0)+1);});
  for(const row of pending){
   const target=Array(Memory.SLOTS).fill(-1),weight=Array(Memory.SLOTS).fill(0);
   row.ids.forEach((id,j)=>{if(row.active[j]){target[j]=banked.has(id)?1:0;weight[j]=1/counts.get(id);}});
   completed.push({x:row.x,target,weight});
  }
  pending.length=0;banked=new Set();
 }
 const observe=s.observe,seek=s.seek,roll=s.roll;
 s.observe=function(i,bank){observe.call(this,i,bank);if(bank){banked.add(i);dirty=true;}};
 s.seek=function(){
  if(dirty){dirty=false;if(this.players.some(p=>p.active))capture();else finish();}
  return seek.call(this);
 };
 s.roll=function(){
  finish();const bust=roll.call(this);
  if(this.rolls>=3&&!bust)capture();
  return bust;
 };
 capture();
 return {drain(){const rows=completed.splice(0);return rows;}};
}
module.exports={SCHEMA,attach};

};

factories["browser-features.js"]=function(require,module,exports){
const N=require('./legacy/neural.js'),Rich=require('./legacy/legacy-neural.js'),Memory=require('./memory_features.js'),Position=require('./position_features.js');
function scoreNorm(x){const v=Number(x);return Number.isFinite(v)?Math.asinh(v/150)/4:N.norm(x)-Math.sign(v)*Math.log(1.5)/4;}
function input(s,a){
 const me=s.players[a],g=Array.from(N.features(s,a).g);
 const rivals=s.players.flatMap((p,i)=>{
  if(i===a)return[];
  const banks=p.bankCount||0,continues=p.continueCount||0;
  const mean=banks?(p.bankLogSum||0)/banks:0;
  const std=banks?Math.sqrt(Math.max(0,(p.bankLogSq||0)/banks-mean*mean)):0;
  return[[scoreNorm(N.sub(p.score,me.score)),p.active?1:0,N.norm(p.banked||0),
   s.lastBank===i?1:0,(banks+1)/(banks+continues+2),Math.log1p(banks)/6,
   Math.log1p(continues)/6,mean,std,N.norm(p.lastBankPot||0),1]];
 });
 // Canonical public-feature order, independent of seat IDs or polling cursor.
 rivals.sort((a,b)=>{for(let k=0;k<11;k++)if(a[k]!==b[k])return b[k]-a[k];return 0;});
 while(rivals.length<11)rivals.push(Array(11).fill(0));
 const x=g.concat(rivals.flat());
 if(x.length!==135||!x.every(Number.isFinite))throw Error('Invalid MLP features');
 return x;
}
function attentionInput(s,a){
 const rich=Rich.features(s,a),x=Array.from(rich.g),safe=s.safePot;
 const total=s.players.reduce((sum,p)=>N.add(sum,p.score),0);
 x.push(safe==null?-1:Number(safe)/210,safe==null?0:Rich.norm(N.sub(s.pot,safe)),
        s.players.every(p=>N.equal(p.score,0))?1:0,Rich.norm(total));
 for(let j=0;j<11;j++)x.push(...(j<rich.n?[...rich.o.subarray(j*32,(j+1)*32),1]:Array(33).fill(0)));
 if(x.length!==411||!x.every(Number.isFinite))throw Error('Invalid opponent-attention features');
 return x;
}
function memoryInput(s,a){return Memory.input(s,a);}
function positionMLPInput(s,a){
 // Canonical public-state ordering gives a flattened MLP no seat-ID signal.
 // This private feature view never mutates the game or its polling order.
 const me=s.players[a],rivals=s.players.filter((_,i)=>i!==a).slice();
 rivals.sort((p,q)=>p.score>q.score?-1:p.score<q.score?1:
  Number(q.active)-Number(p.active)||((p.banked||0)>(q.banked||0)?-1:(p.banked||0)<(q.banked||0)?1:0));
 return Position.cdfInput({pot:s.pot,safePot:s.safePot,round:s.round,rounds:s.rounds,players:[me,...rivals]},0);
}

module.exports={input,attentionInput,memoryInput,positionMLPInput};
};

root.BFCore={N:load('legacy/neural.js'),Rich:load('legacy/legacy-neural.js'),Memory:load('memory_features.js'),Position:load('position_features.js'),features:load('browser-features.js'),require:load};
})(globalThis);
