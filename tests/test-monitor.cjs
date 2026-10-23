const {boot,source}=require('./helpers.cjs');
const assert=require('assert');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let interval,calls=0,posts=0,overview=false;const payloads=[];const notices=new Map();
 const location={pathname:'/browse/TEST-1',href:'https://jira.xpaas.lenovo.com/browse/TEST-1?filter=-1',origin:'https://jira.xpaas.lenovo.com'};
 const code=source.replace('fridayAdjustment: {enabled:true','fridayAdjustment: {enabled:false');
 const app=boot(code,{location,querySelector:q=>overview&&q.includes('#issuetable')?{}:null,globals:{AbortController,clearTimeout,TextEncoder,setInterval:fn=>{interval=fn;},GM_getValue:(k,d)=>k==='jira-monitor-auto-notify'?true:k==='jira-monitor-webhook'?'https://example.api.powerplatform.com/test':notices.get(k)||d,GM_setValue:(k,v)=>notices.set(k,v),GM_xmlhttpRequest:o=>{posts++;const p=JSON.parse(o.data);payloads.push(p);o.onload({status:202});},fetch:async()=>{calls++;return {ok:true,json:async()=>({fields:{summary:'Example',assignee:{displayName:'Person'},status:{name:'In Progress'}},changelog:{total:1,histories:[{id:'1',created:new Date(Date.now()-4.2*86400000).toISOString(),items:[{field:'status',toString:'In Progress'}]}]}})};}}});
 await tick();assert.equal(calls,1);assert.equal(posts,1);assert(payloads[0].rules.every(r=>r.sla!=='符合预期'));
 const read=k=>JSON.parse(app.storage.get(k)||'null');
 assert.equal(read('jira-monitor-detail-v5').phase,'done');
 const host=app.root.children.find(x=>x.id==='jira-duration-panel-host');
 await host.shadowRoot.querySelector('[data-teams]').onclick();await host.shadowRoot.querySelector('[data-teams]').onclick();
 assert.equal(posts,3);assert.equal(payloads[1].rules.length,2);assert(payloads[1].rules.some(r=>r.sla==='符合预期'));
 interval();await tick();assert.equal(calls,1);
 // Batch results survive independent detail analysis, and active/paused batches suppress detail autostart.
 const batch={id:'batch',mode:'batch',active:false,paused:true,phase:'list',rules:[],index:1,queue:[{key:'OLD-1'},{key:'OLD-2'}],results:[{key:'OLD-1',rules:[]}],listUrl:'https://jira.xpaas.lenovo.com/issues/'};
 app.storage.set('jira-monitor-batch-v5',JSON.stringify(batch));
 location.pathname='/browse/TEST-2';location.href=location.origin+location.pathname;interval();await tick();assert.equal(calls,1);
 batch.paused=false;batch.phase='done';app.storage.set('jira-monitor-batch-v5',JSON.stringify(batch));interval();await tick();assert.equal(calls,2);assert.equal(read('jira-monitor-batch-v5').results[0].key,'OLD-1');
 overview=true;location.pathname='/issues/';location.href=location.origin+'/issues/';interval();await tick();assert.equal(calls,2);
 // No requests and no active scan on a fresh overview page.
 const list=boot(code,{globals:{fetch:()=>{throw Error('overview must not auto-fetch');}}});
 assert(!list.storage.get('jira-monitor-batch-v5'));
 console.log('PASS: detail auto-analysis once per route; shared notification; paused batch not hijacked; batch results preserved; overview requires manual start');
})().catch(error=>{console.error(error);process.exitCode=1;});
