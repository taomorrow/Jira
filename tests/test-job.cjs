const {boot,source}=require('./helpers.cjs');const vm=require('vm'),assert=require('assert');
const start=source.indexOf('  function nextJobTime'),end=source.indexOf('  function jobConfig',start),ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';globalThis.next=nextJobTime;',ctx);
const fri=Date.parse('2026-10-23T02:00:00Z');assert.equal(new Date(ctx.next({frequency:'weekdays',time:'09:00'},fri)).toISOString(),'2026-10-26T01:00:00.000Z');assert.equal(ctx.next({frequency:'interval',intervalMinutes:120},fri),fri+7200000);
(async()=>{
 let interval,requests=0;const values=new Map([['jira-monitor-job-v1',{enabled:true,frequency:'interval',intervalMinutes:120,time:'09:00',jql:'project=TEST',nextAt:1}]]);
 const app=boot(source,{globals:{AbortController,clearTimeout,setInterval:fn=>{interval=fn;},GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>values.set(k,v),navigator:{locks:{request:async(name,options,fn)=>fn({name})}},fetch:async path=>{requests++;return {ok:true,json:async()=>path==='/rest/api/2/search'?{total:1,issues:[{key:'TEST-1',fields:{summary:'Test',status:{name:'In Progress'}}}]}:{fields:{summary:'Test',status:{name:'In Progress'},assignee:null},changelog:{total:1,histories:[{created:new Date(Date.now()-86400000).toISOString(),items:[{field:'status',toString:'In Progress'}]}]}}};}}});
 assert(app.menus.some(m=>m.name==='Jira Monitor：配置中心'));
 interval();for(let n=0;n<15;n++)await new Promise(r=>setImmediate(r));
 const state=JSON.parse(app.storage.get('jira-monitor-batch-v5'));assert.equal(state.phase,'done',state.message);assert.equal(state.index,1);assert.equal(state.results.length,1);assert(state.results[0].rules[0].seconds>0);assert.equal(requests,2);assert(values.get('jira-monitor-job-v1').nextAt>Date.now());
 interval();await new Promise(r=>setImmediate(r));assert.equal(requests,2);
 console.log('PASS: Beijing weekday/interval scheduling; job menu; full REST scan; saved next run prevents repeat');
})().catch(e=>{console.error(e);process.exitCode=1;});
