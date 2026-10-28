(function(root){'use strict';
function credits(scores){const s=scores.map(BigInt),top=s.reduce((a,b)=>a>b?a:b);if(top===0n)return s.map(()=>0);const n=s.filter(v=>v===top).length;return s.map(v=>v===top?1/n:0);}
function placements(scores){const s=scores.map(BigInt);if(s.every(v=>v===0n))return s.map(()=>0);return s.map(v=>(s.filter(x=>x<v).length+.5*(s.filter(x=>x===v).length-1))/(s.length-1));}
function potential(x){const width=x.length===135?11:x.length===411?33:223,offset=x.length===135?14:48,mask=x.length===135?10:x.length===411?32:14;let n=0,s=0;for(let i=offset;i<x.length;i+=width)if(x[i+mask]>.5){s-=Math.tanh(2*x[i]);n++;}return s/Math.max(n,1);}
function gae(values,rewards,gamma=1,lambda=.95){let a=0;const advantages=[],returns=[];for(let i=values.length-1;i>=0;i--){const next=i+1<values.length?values[i+1]:0,delta=rewards[i]+gamma*next-values[i];a=delta+gamma*lambda*a;advantages[i]=a;returns[i]=a+values[i];}return {advantages,returns};}
function wilson(mean,n){if(!n)return [0,1];const z=1.959963984540054,z2=z*z,den=1+z2/n,center=(mean+z2/(2*n))/den,half=z*Math.sqrt(mean*(1-mean)/n+z2/(4*n*n))/den;return [Math.max(0,center-half),Math.min(1,center+half)];}
function entry(){return {tables:0,credit:0,placement:0,bySize:{}};}
function summarize(outcomes,counts=[3,4,5,6,7,8]){
 const entries={},sizes={};for(const row of outcomes){const credit=credits(row.scores),rank=placements(row.scores);row.shares=credit;row.win=row.seat>=0?credit[row.seat]:null;for(const p of [...(row.participants||[]),...(row.opponents||[])])p.win=credit[p.seat];const champions=(row.opponents||[]).filter(p=>p.type===8);if(champions.length)row.champ=champions.reduce((s,p)=>s+p.win,0)/champions.length;
  row.participants?.forEach((p,i)=>{const key=p.type==='learner'?'learner':String(p.type),v=entries[key]||(entries[key]=entry()),n=String(row.n),cell=v.bySize[n]||(v.bySize[n]=entry());v.tables++;v.credit+=credit[i];v.placement+=rank[i];cell.tables++;cell.credit+=credit[i];cell.placement+=rank[i];if(p.name)v.name=p.name;});
 }
 for(const v of Object.values(entries)){
  v.winRate=v.credit/v.tables;v.placement/=v.tables;v.winCI=wilson(v.winRate,v.tables);v.rankCI=[Math.max(0,v.placement-Math.sqrt(Math.log(40)/(2*v.tables))),Math.min(1,v.placement+Math.sqrt(Math.log(40)/(2*v.tables)))];
  let s=0,variance=0,complete=true;for(const n of counts){const cell=v.bySize[n];if(!cell){complete=false;continue;}cell.winRate=cell.credit/cell.tables;cell.placement/=cell.tables;s+=n*cell.winRate;variance+=n*n/cell.tables;}
  v.multiple=complete?s/counts.length:null;const half=Math.sqrt(.5*Math.log(40)*variance/counts.length**2),max=counts.reduce((a,b)=>a+b,0)/counts.length;v.multipleCI=complete?[Math.max(0,v.multiple-half),Math.min(max,v.multiple+half)]:[0,max];
 }
 return {tables:outcomes.length,entries,counts,scoring_rule:'positive-split-zero-loss-v1'};
}
function metric(entry,kind){if(!entry)return {mean:null,low:0,high:1,complete:false,n:0};const mean=kind==='balanced_multiple'?entry.multiple:kind==='average_placement'?entry.placement:entry.winRate,ci=kind==='balanced_multiple'?entry.multipleCI:kind==='average_placement'?entry.rankCI:entry.winCI;return {mean,low:ci[0],high:ci[1],complete:mean!==null,n:entry.tables};}
root.BFScore={credits,placements,potential,gae,wilson,summarize,metric};if(typeof module!=='undefined')module.exports=root.BFScore;
})(globalThis);
