const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 const origin='https://jira.xpaas.lenovo.com';let historyCalls=0;
 const links=[{href:'javascript:void(0)',textContent:'TASK-3'},{href:origin+'/browse/STORY-1',textContent:'Story'},{href:origin+'/browse/BUG-2',textContent:'Bug'},{href:origin+'/browse/STORY-1',textContent:'duplicate'},{href:'https://other.example/browse/OTHER-1',textContent:'external'}];
 const app=boot(source,{location:{pathname:'/secure/Dashboard.jspa',href:origin+'/secure/Dashboard.jspa?selectPageId=48935',origin},globals:{AbortController,clearTimeout,fetch:async path=>{historyCalls++;return {ok:true,json:async()=>({fields:{summary:'Example',status:{name:'In Progress'},issuetype:{name:path.includes('STORY-1')?'Story':'Bug'},assignee:null},changelog:{total:1,histories:[{created:new Date(Date.now()-86400000).toISOString(),items:[{field:'status',toString:'In Progress'}]}]}})};}}});
 app.ctx.document.querySelectorAll=q=>q==='a, [data-issue-key], [data-issuekey]' ?links:[];
 const panel=app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot;assert(panel);assert.equal(historyCalls,0);
 await panel.querySelector('[data-start]').onclick();const state=JSON.parse(app.storage.get('jira-monitor-batch-v5'));
 assert.equal(state.phase,'done');assert.equal(state.queue.length,3);assert.equal(state.results.length,3);assert.equal(state.results[1].key,'STORY-1');assert.equal(state.skipped,0);assert.equal(historyCalls,3);assert(panel.querySelector('[data-scope]').hidden);
 console.log('PASS: Dashboard URL initializes, waits for manual start, deduplicates, excludes foreign links ; all issue types included');
})().catch(e=>{console.error(e);process.exitCode=1;});
