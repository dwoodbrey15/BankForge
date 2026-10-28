'use strict';
importScripts('../vendor/tf.min.js','../shared/simulator.js','../shared/model.js','../shared/tensor-model.js','../shared/scoring.js');
let paused=false,busy=false;
const tick=()=>new Promise(r=>setTimeout(r,0)),check=()=>{if(paused)throw Error('PAUSED');};
const send=(event,data={})=>postMessage({event,...data});
const RULES={equal:'league-equal-appearances-v2',reserved:'ordered-reserved-v1',matchups:'one-reserved-at-a-time-v1'};
function validateField(field,library,custom=false){
 if(!field||!RULES[field.mode]||!Array.isArray(field.selected)||!field.selected.length)throw Error('Select an opponent pool');
 if(new Set(field.selected).size!==field.selected.length)throw Error('Duplicate opponents');
 if(field.selected.some(id=>!(/^[0-8]$/.test(id)||library[id]||(custom&&id==='learner'))))throw Error('An opponent model is missing');
 const signatures=new Set();for(const id of field.selected){const m=library[id];if(!m)continue;const signature=JSON.stringify([m.spec.schema,m.spec.width,m.spec.depth,m.action_sampling||'greedy-v1',Object.keys(m.weights).sort().map(k=>[k,m.weights[k]])]);if(signatures.has(signature))throw Error('The same model and action rule cannot occupy two opponent types');signatures.add(signature);}
 if(!Array.isArray(field.counts)||!field.counts.length||field.counts.some(n=>!Number.isInteger(n)||n<3||n>8)||new Set(field.counts).size!==field.counts.length)throw Error('Choose table sizes from 3–8');
 const reserved=field.reserved||[];if(new Set(reserved).size!==reserved.length||reserved.some(id=>!field.selected.includes(id)))throw Error('Reserved seats must be unique selected opponents');
 const capacity=field.selected.length+(custom?0:1);if(Math.max(...field.counts)>capacity)throw Error('Too few unique opponents for selected table sizes');
 if(field.mode==='matchups'){
  const order=reserved.filter(id=>!custom||id!==field.focal);if(!order.length)throw Error('One-at-a-time mode needs reserved opponents');
  if(custom&&!field.selected.includes(field.focal))throw Error('Select the custom benchmark focal engine');
  const fillers=field.selected.filter(id=>!order.includes(id)&&(!custom||id!==field.focal));if(Math.max(...field.counts)>fillers.length+2)throw Error('Not enough unique fillers for one-at-a-time tables');
 }else if(field.mode==='reserved'){
  const fillers=field.selected.filter(id=>!reserved.includes(id));if(Math.max(...field.counts)-(custom?0:1)-Math.min(Math.max(...field.counts)-(custom?0:1),reserved.length)>fillers.length)throw Error('Not enough fillers for reserved seating');
 }
}
async function collect(modelData,library,field,count,seed,training,config,custom=false){
 validateField(field,library,custom);const ids=field.selected.filter(id=>!/^\d$/.test(id)&&id!=='learner'),models=[new BFModel.Model(modelData),...ids.map(id=>new BFModel.Model(library[id]))],policies=[modelData,...ids.map(id=>library[id])];
 const networks=ids.map((id,i)=>({id,name:library[id].name,agent:i+1}));if(custom&&field.selected.includes('learner'))networks.push({id:'learner',name:'Current learner',agent:0});
 const outcomes=[],rows=[],auxiliary=[],counts=new Map(),chunk=Math.max(1,Math.min(32,config.parallel||12));
 for(let offset=0;offset<count;offset+=chunk){
  check();let response=BFSimulator.command({op:'init',seed,indices:Array.from({length:Math.min(chunk,count-offset)},(_,i)=>offset+i),pool:'custom',rosterRule:RULES[field.mode],opponents:field.selected.filter(id=>/^\d$/.test(id)).map(Number),networks,reservedOrder:field.reserved||[],playerCounts:field.counts,minPlayers:3,maxPlayers:8,rounds:config.rounds||[10,15,20],featureSchemas:models.map(m=>m.spec.schema),collectOpponentTargets:training&&models[0].a==='set-predict',customBenchmark:custom,customFocal:field.focal,binary:false});
  const trajectories=new Map();let last=performance.now();
  while(true){
   check();outcomes.push(...response.done);if(response.opponent_rows)auxiliary.push(...response.opponent_rows);
   if(!response.states.length)break;
   const actions=[];
   for(const row of response.states){
    const agent=row.agent,policy=models[agent],r=policy.forward(row.x),actor=agent>0?1048576+row.actor*1000+agent:agent,key=row.id+':'+actor,d=counts.get(key)||0;counts.set(key,d+1);
    const action=policies[agent].action_sampling==='bernoulli-counter-v2'?+(BFModel.uniform(seed,row.id,d,actor)<r.p):+(r.logit>=0);
    actions.push([row.id,action]);if(training&&agent===0){const line=trajectories.get(row.id)||[];line.push({x:row.x,action,oldlog:action?-Math.log1p(Math.exp(-Math.max(-80,r.logit))):-Math.log1p(Math.exp(Math.min(80,r.logit))),value:r.value,p:r.p,potential:BFScore.potential(row.x)});trajectories.set(row.id,line);}
   }
   response=BFSimulator.command({op:'step',actions});
   if(performance.now()-last>20){await tick();last=performance.now();}
  }
  if(training)for(const result of outcomes.slice(-Math.min(chunk,count-offset))){const line=trajectories.get(result.id);if(!line?.length)continue;
   const credit=BFScore.credits(result.scores)[result.seat],placement=BFScore.placements(result.scores)[result.seat];let terminal=config.objective==='balanced_multiple'?credit*result.n/8:config.objective==='average_placement'?placement:credit;
   const strength=config.potential?config.potentialStrength:0,rewards=line.map((r,i)=>strength*(config.gamma*(i+1<line.length?line[i+1].potential:0)-r.potential));rewards[rewards.length-1]+=terminal;
   const targets=BFScore.gae(line.map(r=>r.value),rewards,config.gamma,config.lambda);line.forEach((r,i)=>rows.push({...r,advantage:targets.advantages[i],target:targets.returns[i]}));
  }
  if(rows.length>100000||auxiliary.length>100000)throw Error('This update exceeds the phone memory budget. Reduce games per update.');
  send('progress',{phase:training?'Collecting training games':custom?'Custom benchmark':'Benchmark',done:outcomes.length,total:count});await tick();
 }
 outcomes.sort((a,b)=>a.index-b.index);return {rows,outcomes,auxiliary};
}
async function ppo(tensor,rows,aux,config,seed){
 if(!rows.length)return {samples:0,steps:0,skipped:true};const mean=rows.reduce((s,r)=>s+r.advantage,0)/rows.length,std=Math.sqrt(rows.reduce((s,r)=>s+(r.advantage-mean)**2,0)/rows.length);
 for(const r of rows)r.normalized=(r.advantage-mean)/Math.max(1e-8,std);
 const rng=BFCore.N.rng(seed),order=Array.from({length:rows.length},(_,i)=>i);let steps=0,total=0,stopped=false;
 for(let epoch=0;epoch<config.epochs;epoch++){
  for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  for(let start=0;start<order.length;start+=config.minibatch){
   check();const batch=order.slice(start,start+config.minibatch).map(i=>rows[i]),old=await tensor.predict(batch.map(r=>r.x));let kl=0;
   for(let i=0;i<batch.length;i++){const logit=old.logits[i],logp=batch[i].action?-Math.log1p(Math.exp(-Math.max(-80,logit))):-Math.log1p(Math.exp(Math.min(80,logit))),lr=logp-batch[i].oldlog;kl+=Math.exp(lr)-1-lr;}
   if(kl/batch.length>1.5*config.targetKL){stopped=true;break;}
   const auxiliary=tensor.a==='set-predict'&&aux.length?Array.from({length:Math.min(batch.length,64)},()=>aux[Math.floor(rng()*aux.length)]):[];
   const stats=await tensor.apply(()=>tf.tidy(()=>{
    const x=tf.tensor2d(batch.map(r=>r.x)),actions=tf.tensor1d(batch.map(r=>r.action)),oldlog=tf.tensor1d(batch.map(r=>r.oldlog)),adv=tf.tensor1d(batch.map(r=>r.normalized)),targets=tf.tensor1d(batch.map(r=>r.target)),oldv=tf.tensor1d(batch.map(r=>r.value)),{logits,values}=tensor.forward(x);
    const logp=actions.mul(logits).sub(tf.softplus(logits)),ratio=logp.sub(oldlog).exp(),policy=tf.minimum(ratio.mul(adv),ratio.clipByValue(1-config.clip,1+config.clip).mul(adv)).mean().neg(),clipped=oldv.add(values.sub(oldv).clipByValue(-config.valueClip,config.valueClip));
    const value=tf.maximum(values.sub(targets).square(),clipped.sub(targets).square()).mean().mul(.5),p=logits.sigmoid(),entropy=tf.softplus(logits).sub(p.mul(logits)).mean();let loss=policy.add(value.mul(config.valueCoef)).sub(entropy.mul(config.entropy));
    if(auxiliary.length)loss=loss.add(tensor.auxiliary(tf.tensor2d(auxiliary.map(r=>r.x)),tf.tensor2d(auxiliary.map(r=>r.target)),tf.tensor2d(auxiliary.map(r=>r.weight))).mul(.05));return loss;
   }),config.lr,.5);
   total+=stats.loss;steps++;send('progress',{phase:'PPO · epoch '+(epoch+1)+' / '+config.epochs,done:Math.min(start+batch.length,rows.length),total:rows.length});await tick();
  }
  if(stopped)break;
 }
 let kl=0;for(let start=0;start<rows.length;start+=config.minibatch){check();const batch=rows.slice(start,start+config.minibatch),pred=await tensor.predict(batch.map(r=>r.x));for(let i=0;i<batch.length;i++){const o=Math.min(1-1e-7,Math.max(1e-7,batch[i].p)),p=Math.min(1-1e-7,Math.max(1e-7,BFModel.sigmoid(pred.logits[i])));kl+=o*Math.log(o/p)+(1-o)*Math.log((1-o)/(1-p));}await tick();}
 return {samples:rows.length,steps,loss:total/Math.max(1,steps),kl:kl/rows.length,klStopped:stopped,rolledBack:kl/rows.length>2*config.targetKL};
}
function validConfig(c){
 for(const [key,min,max] of [['gamesPerUpdate',1,2048],['benchmarkGames',1,100000],['epochs',1,16],['minibatch',1,2048],['benchmarkEvery',1,10000],['parallel',1,32]])if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error('Invalid '+key);
 for(const [key,min,max] of [['lr',.0000001,.1],['gamma',0,1],['lambda',0,1],['clip',.01,.5],['valueClip',.01,1],['valueCoef',0,2],['entropy',0,1],['targetKL',.00001,1],['potentialStrength',0,1]])if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)throw Error('Invalid '+key);
 if(!['sole_wins','balanced_multiple','average_placement'].includes(c.objective)||!['win_rate','balanced_multiple','average_placement'].includes(c.metric))throw Error('Invalid objective or benchmark metric');
 if(!Array.isArray(c.rounds)||!c.rounds.length||c.rounds.some(n=>![10,15,20].includes(n)))throw Error('Game lengths must be 10, 15 or 20 rounds');
}
function context(config,library,spec){return JSON.stringify({schema:spec.schema,width:spec.width,depth:spec.depth,field:config.benchmark,rounds:config.rounds,metric:config.metric,benchmarkSeedMode:config.fixedBenchmarkSeed?'fixed':'rotating',benchmarkSeed:config.fixedBenchmarkSeed?config.benchmarkSeed:null,models:config.benchmark.selected.filter(id=>library[id]).map(id=>[id,library[id].action_sampling||'greedy-v1']),sampling:'bernoulli-counter-v2',scoring:'positive-split-zero-loss-v1'});}
async function backend(choice){
 if(choice!=='cpu')try{await tf.setBackend('webgl');await tf.ready();if(!tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE')||tf.env().getBool('WEBGL_FORCE_F16_TEXTURES'))throw Error('Float32 GPU rendering is unavailable');const test=tf.tidy(()=>tf.tensor1d([1,2]).square());await test.data();test.dispose();send('backend',{backend:'webgl'});return;}catch(e){send('notice',{message:'GPU backend unavailable; using CPU on this device.'});}
 await tf.setBackend('cpu');await tf.ready();send('backend',{backend:'cpu'});
}
async function run(request){
 paused=false;busy=true;let tensor,lastCheckpoint=request.checkpoint||null;
 try{
  const config=request.config,library=Object.fromEntries(request.models.map(m=>[m.id,m]));validConfig(config);validateField(config.training,library);validateField(config.benchmark,library);
  await backend(config.backend);let modelData=request.checkpoint?.model||request.model||BFModel.randomModel(config.architecture,config.width,config.depth,config.seed);BFModel.validate(modelData);tensor=new BFTensor.TensorModel(modelData);tensor.restore(request.checkpoint?.optimizer);
  let updates=request.checkpoint?.updates||0,games=request.checkpoint?.games||0,best=request.checkpoint?.best||null,bestBound=request.checkpoint?.bestBound??null,history=request.checkpoint?.history||[],snapshots=request.checkpoint?.snapshots||[];
  const definition=context(config,library,tensor.spec);if(lastCheckpoint?.selectionContext!==definition){best=null;bestBound=null;send('notice',{message:'Best selection starts fresh for this benchmark definition. Previous files remain saved in their run.'});}
  const rewardSignature=c=>JSON.stringify([c?.objective,c?.potential,c?.potentialStrength,c?.gamma]);if(lastCheckpoint&&rewardSignature(lastCheckpoint.config)!==rewardSignature(config)){tensor.resetCritic();send('notice',{message:'Training objective changed: critic and optimizer restarted; policy retained.'});}
  async function save(){const portable=await tensor.export({name:config.name,updates,games});const checkpoint={format:'bankforge-phone-run-1',id:request.runId,name:config.name,model:portable,optimizer:await tensor.optimizer(),best,bestBound,selectionContext:definition,config,updates,games,history,snapshots,updatedAt:Date.now()};lastCheckpoint=checkpoint;modelData=portable;send('checkpoint',{checkpoint});return checkpoint;}
  await save();
  while(!paused){
   const trainSeed=BFCore.N.hash(config.seed,updates,31,171),backup=await tensor.export(),backupOpt=await tensor.optimizer();
   const signature=m=>JSON.stringify([m.spec.schema,m.action_sampling||'greedy-v1',Object.keys(m.weights).sort().map(k=>[k,m.weights[k]])]),seen=new Set(Object.values(library).map(signature)),historyModels=[];
   if(config.historyEnabled)for(const snapshot of snapshots){const key=signature(snapshot);if(!seen.has(key)){seen.add(key);historyModels.push(snapshot);}}
   const trainingLibrary={...library,...Object.fromEntries(historyModels.map(m=>[m.id,m]))},trainingField={...config.training,selected:[...config.training.selected,...historyModels.map(m=>m.id)]};
   const training=await collect(modelData,trainingLibrary,trainingField,config.gamesPerUpdate,trainSeed,true,config),stats=await ppo(tensor,training.rows,training.auxiliary,config,trainSeed);
   if(stats.rolledBack){tensor.dispose();tensor=new BFTensor.TensorModel(backup);tensor.restore(backupOpt);send('notice',{message:'Update exceeded target KL; restored previous weights and optimizer.'});}
   updates++;games+=config.gamesPerUpdate;modelData=await tensor.export({name:config.name,updates,games});if(config.historyEnabled&&updates%8===0){snapshots.push({...modelData,id:'past:'+request.runId+':'+updates,name:'Past learner · '+updates});snapshots=snapshots.slice(-4);}send('update',{updates,games,stats});await save();
   if(updates%config.benchmarkEvery===0){
    const seed=config.fixedBenchmarkSeed?config.benchmarkSeed:BFCore.N.hash(config.seed,updates,config.benchmarkGames,239),test=await collect(modelData,library,config.benchmark,config.benchmarkGames,seed,false,config),report={...BFScore.summarize(test.outcomes,config.benchmark.counts),update:updates,seed,metric:config.metric,time:Date.now()},score=BFScore.metric(report.entries.learner,config.metric);
    let promoted=false;if(score.complete&&(bestBound===null||score.low>bestBound+1e-12)){bestBound=score.low;best={...modelData,validation:report};promoted=true;}
    history.push(report);send('benchmark',{report,score,promoted,bestUpdate:best?.updates});
   }
   await save();if(request.maxUpdates&&updates>=(request.checkpoint?.updates||0)+request.maxUpdates)break;await tick();
  }
  send('finished',{paused:true,updates:lastCheckpoint?.updates||0});
 }catch(e){if(e.message==='PAUSED')send('finished',{paused:true,updates:lastCheckpoint?.updates||0});else send('error',{message:e.message,stack:e.stack});}
 finally{tensor?.dispose();busy=false;}
}
async function custom(request){paused=false;busy=true;try{await backend('cpu');const library=Object.fromEntries(request.models.map(m=>[m.id,m])),config=request.config,seed=request.seed>>>0;const result=await collect(request.model,library,request.field,request.count,seed,false,config,true),report={...BFScore.summarize(result.outcomes,request.field.counts),seed,time:Date.now(),custom:true};send('customResult',{report,outcomes:result.outcomes});send('finished',{custom:true});}catch(e){send(e.message==='PAUSED'?'finished':'error',{message:e.message});}finally{busy=false;}}
onmessage=event=>{const m=event.data;if(m.type==='pause'){paused=true;return;}if(busy){send('error',{message:'A task is already running'});return;}if(m.type==='start')run(m);else if(m.type==='custom')custom(m);};
