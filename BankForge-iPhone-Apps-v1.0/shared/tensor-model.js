/* Differentiable counterparts of the desktop actor/critic networks. */
(function(root){'use strict';let serial=0;
class TensorModel{
 constructor(data){BFModel.validate(data);this.spec=data.spec;this.a=BFModel.SCHEMAS[data.spec.schema];this.vars={};this.m={};this.v={};this.step=0;this.id=++serial;
  for(const [key,shape] of Object.entries(BFModel.shapes(data.spec)))this.vars[key]=tf.tidy(()=>tf.variable(tf.tensor(data.weights[key],shape,'float32'),true,'bf'+this.id+'_'+key.replaceAll('.','_')));
 }
 linear(x,p){const shape=x.shape,w=this.vars[p+'.weight'],b=this.vars[p+'.bias'];return tf.matMul(x.reshape([-1,shape.at(-1)]),w,false,true).add(b).reshape(shape.slice(0,-1).concat(w.shape[0]));}
 norm(x,p){const mean=x.mean(-1,true),variance=x.sub(mean).square().mean(-1,true);return x.sub(mean).div(variance.add(1e-5).sqrt()).mul(this.vars[p+'.weight']).add(this.vars[p+'.bias']);}
 silu(x){return x.mul(x.sigmoid());}
 residual(x,p){return this.norm(x.add(this.linear(this.silu(x),p+'.linear')),p+'.norm');}
 sequence(x,p,depth){let y=this.silu(this.norm(this.linear(x,p+'.0'),p+'.1'));for(let i=1;i<depth;i++)y=this.residual(y,p+'.'+(i+2));return y;}
 remembered(rows,mask){
  const b=rows.shape[0],h=this.spec.width/2,events=rows.slice([0,0,15],[-1,-1,-1]).reshape([-1,16,13]),n=b*7;
  const valid=events.slice([0,0,12],[-1,-1,1]).squeeze([-1]).greater(.5).logicalAnd(mask.reshape([-1,1]));let state=tf.zeros([n,h]),selected=tf.zeros([n,h]);
  for(let t=0;t<16;t++){
   const yes=valid.slice([0,t],[-1,1]),x=events.slice([0,t,0],[-1,1,12]).squeeze([1]).mul(yes.toFloat());
   const gi=tf.matMul(x,this.vars['memory.weight_ih_l0'],false,true).add(this.vars['memory.bias_ih_l0']);
   const gh=tf.matMul(state,this.vars['memory.weight_hh_l0'],false,true).add(this.vars['memory.bias_hh_l0']);
   const [ir,iz,inn]=tf.split(gi,3,1),[hr,hz,hn]=tf.split(gh,3,1),r=ir.add(hr).sigmoid(),z=iz.add(hz).sigmoid(),next=inn.add(r.mul(hn)).tanh().mul(tf.scalar(1).sub(z)).add(z.mul(state));
   state=next;selected=tf.where(yes.tile([1,h]),state,selected);
  }
  const any=valid.any(1,true).toFloat();return this.norm(selected,'memory_norm').mul(any).reshape([b,7,h]);
 }
 relation(tokens,mask,index){const p='relations.'+index,b=tokens.shape[0],n=tokens.shape[1],w=this.spec.width,h=w/2;
  const qkv=this.linear(this.norm(tokens,p+'.norm1'),p+'.qkv').reshape([b,n,3,2,h]).transpose([2,0,3,1,4]),[q,k,v]=tf.unstack(qkv,0),m=mask.toFloat().reshape([b,1,1,n]);
  let weights=tf.matMul(q,k,false,true).div(Math.sqrt(h)).add(tf.scalar(1).sub(m).mul(-1e9)).softmax(-1).mul(m);weights=weights.div(weights.sum(-1,true).maximum(1e-8));
  const joined=tf.matMul(weights,v).transpose([0,2,1,3]).reshape([b,n,w]),y=tokens.add(this.linear(joined,p+'.projection'));
  return y.add(this.linear(this.silu(this.linear(this.norm(y,p+'.norm2'),p+'.feed.0')),p+'.feed.2')).mul(mask.toFloat().expandDims(-1));
 }
 tokens(x){const b=x.shape[0],a=this.a,w=this.spec.width,mem=BFModel.memory(a),n=mem?7:11,columns=mem?14:32,stride=mem?223:33;
  const g=x.slice([0,0],[-1,48]),rows=x.slice([0,48],[-1,-1]).reshape([b,n,stride]),mask=rows.slice([0,0,columns],[-1,-1,1]).squeeze([-1]).greater(.5);
  const current=rows.slice([0,0,0],[-1,-1,columns]).mul(mask.toFloat().expandDims(-1)),features=mem?tf.concat([current,this.remembered(rows,mask)],-1):current;
  let tokens=this.sequence(features,'encoder',BFModel.relation(a)?1:this.spec.depth);
  if(BFModel.relation(a)||mem)tokens=tokens.mul(mask.toFloat().expandDims(-1));
  if(BFModel.relation(a))for(let i=0;i<this.spec.depth-1;i++)tokens=this.relation(tokens,mask,i);
  return {g,current,mask,tokens};
 }
 forward(x){const a=this.a,w=this.spec.width,b=x.shape[0],d=this.spec.depth;let z;
  if(BFModel.mlp(a)){z=x;for(let i=0;i<d;i++)z=this.silu(this.norm(this.linear(z,'trunk.'+(i*3)),'trunk.'+(i*3+1)));}
  else{
   const {g,current,mask,tokens}=this.tokens(x),n=tokens.shape[1],mf=mask.toFloat(),active=mask.logicalAnd(current.slice([0,0,1],[-1,-1,1]).squeeze([-1]).greater(.5)),af=active.toFloat();
   const pool=m=>tokens.mul(m.expandDims(-1)).sum(1).div(m.sum(1,true).maximum(1)),mean=pool(mf),maximum=tokens.add(tf.scalar(1).sub(mf).expandDims(-1).mul(-1e9)).max(1).mul(mask.any(1,true).toFloat()),activeMean=pool(af);
   const q=this.norm(this.linear(g,'query').reshape([b,2,w]),'query_norm'),qnorm=q.div(q.square().sum(-1,true).maximum(1e-24).sqrt()),tnorm=tokens.div(tokens.square().sum(-1,true).maximum(1e-24).sqrt());
   const second=tf.where(active.any(1,true).tile([1,n]),active,mask),headMasks=tf.stack([mask,second],1).toFloat();
   let weights=tf.matMul(qnorm,tnorm,false,true).mul(Math.sqrt(w)).add(tf.scalar(1).sub(headMasks).mul(-1e9)).softmax(-1).mul(headMasks);weights=weights.div(weights.sum(-1,true).maximum(1e-8));
   const attention=tf.matMul(weights,tokens).reshape([b,2*w]);z=this.sequence(tf.concat([g,mean,maximum,attention,activeMean],1),'trunk',BFModel.relation(a)?2:d);
  }
  return {logits:this.linear(z,'policy').reshape([b]),values:this.linear(z,'value').reshape([b])};
 }
 auxiliary(x,targets,weights){const {g,current,mask,tokens}=this.tokens(x),b=x.shape[0],n=tokens.shape[1],context=this.silu(this.linear(g,'prediction_context.0')).expandDims(1).tile([1,n,1]);
  const logits=this.linear(this.silu(this.linear(tf.concat([tokens,context],-1),'opponent_head.0')),'opponent_head.2').squeeze([-1]),valid=mask.logicalAnd(current.slice([0,0,1],[-1,-1,1]).squeeze([-1]).greater(.5)).logicalAnd(targets.greaterEqual(0)).toFloat().mul(weights);
  return tf.softplus(logits).sub(targets.maximum(0).mul(logits)).mul(valid).sum().div(valid.sum().maximum(1));
 }
 async predict(rows){const out=tf.tidy(()=>this.forward(tf.tensor2d(rows,[rows.length,this.spec.inputs])));try{return {logits:Array.from(await out.logits.data()),values:Array.from(await out.values.data())};}finally{tf.dispose(out);}}
 async apply(lossFn,lr,maxNorm=.5){
  const {value,grads}=tf.variableGrads(lossFn,Object.values(this.vars));const loss=(await value.data())[0];value.dispose();
  if(!Number.isFinite(loss)){tf.dispose(grads);throw Error('Non-finite PPO loss; update canceled');}
  let total=0;for(const g of Object.values(grads)){const s=tf.tidy(()=>g.square().sum()),n=(await s.data())[0];s.dispose();total+=n;}
  const norm=Math.sqrt(total);if(!Number.isFinite(norm)){tf.dispose(grads);throw Error('Non-finite gradient; update canceled');}const scale=Math.min(1,maxNorm/(norm+1e-8));this.step++;
  for(const [key,variable] of Object.entries(this.vars)){
   const raw=grads[variable.name];if(!raw)continue;
   const next=tf.tidy(()=>{const g=raw.mul(scale),m=(this.m[key]||tf.zerosLike(g)).mul(.9).add(g.mul(.1)),v=(this.v[key]||tf.zerosLike(g)).mul(.999).add(g.square().mul(.001));variable.assign(variable.sub(m.div(1-.9**this.step).div(v.div(1-.999**this.step).sqrt().add(1e-5)).mul(lr)));return {m,v};});
   this.m[key]?.dispose();this.v[key]?.dispose();this.m[key]=next.m;this.v[key]=next.v;
  }
  tf.dispose(grads);return {loss,gradNorm:norm};
 }
 async export(data={}){const weights={};for(const [key,t] of Object.entries(this.vars))weights[key]=await t.array();return {...data,format:'bankforge-portable-1',spec:this.spec,weights,action_sampling:'bernoulli-counter-v2'};}
 async optimizer(){const m={},v={};for(const [key,t] of Object.entries(this.m))m[key]=await t.array();for(const [key,t] of Object.entries(this.v))v[key]=await t.array();return {step:this.step,m,v};}
 restore(opt){if(!opt)return;this.step=opt.step||0;for(const p of ['m','v'])for(const [key,v] of Object.entries(opt[p]||{})){if(!this.vars[key])throw Error('Optimizer parameter mismatch');this[p][key]=tf.tensor(v,this.vars[key].shape);}}
 resetCritic(){tf.tidy(()=>{this.vars['value.weight'].assign(tf.zerosLike(this.vars['value.weight']));this.vars['value.bias'].assign(tf.fill(this.vars['value.bias'].shape,.2));});for(const p of ['m','v']){tf.dispose(this[p]);this[p]={};}this.step=0;}
 dispose(){tf.dispose(this.vars);tf.dispose(this.m);tf.dispose(this.v);}
}
root.BFTensor={TensorModel};if(typeof module!=='undefined')module.exports=root.BFTensor;
})(globalThis);
