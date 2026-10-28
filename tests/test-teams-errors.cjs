const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 for(const status of [403,'network']){
 let calls=0;const app=boot(source,{globals:{GM_getValue:(k,d)=>k==='jira-monitor-projects-v1'?[{projectKey:'TEST',webhook:'https://example.api.powerplatform.com/test',recipients:[],autoNotify:false}]:d,GM_setValue:()=>{},GM_xmlhttpRequest:o=>{calls++;if(status==='network')o.onerror({status:0,error:'net::ERR_FAILED'});else o.onload({status});}}});
 app.storage.set('jira-monitor-batch-v5',JSON.stringify({mode:'batch',active:false,index:1,queue:[{key:'TEST-1'}],rules:[{name:'DEV',minDays:4,maxDays:5,currentStatuses:['In Progress']}],results:[{key:'TEST-1',rules:[{name:'DEV',seconds:864000}]}]}));
 const panel=app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot;await panel.querySelector('[data-teams]').onclick();assert.equal(calls,1);const error=panel.querySelector('[data-teams-errors]').textContent;assert(error.includes(status==='network'?'net::ERR_FAILED':'HTTP 403'));assert(panel.querySelector('[data-notice]').textContent.includes('失败 1 条'));
 }
 console.log('PASS: project requests preserve HTTP and network errors, no implicit retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
