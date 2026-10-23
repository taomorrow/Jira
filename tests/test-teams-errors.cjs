const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 const placeholder='https://example.api.powerplatform.com/test';
 function create(code=source,status=403){let requests=0;const app=boot(code,{globals:{GM_getValue:(k,d)=>d,GM_setValue:()=>{},GM_xmlhttpRequest:o=>{requests++;if(status==='network')o.onerror({status:0,error:'net::ERR_FAILED'});else o.onload({status});}}});
  app.storage.set('jira-monitor-batch-v5',JSON.stringify({id:'test',mode:'batch',active:false,index:1,queue:[{key:'TEST-1'}],rules:[{name:'DEV',minDays:4,maxDays:5,currentStatuses:['In Progress']}],results:[{key:'TEST-1',summary:'Example',assignee:'Person',rules:[{name:'DEV',seconds:864000}]}]}));
  const panel=app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot;
  return {app,panel,count:()=>requests};
 }
 const missing=create();await missing.panel.querySelector('[data-teams]').onclick();assert.equal(missing.count(),0);assert(missing.panel.querySelector('[data-notice]').textContent.includes('Teams 设置'));
 const configured=create(source.replace("teamsWebhookUrl: ''","teamsWebhookUrl: '"+placeholder+"'"));await configured.panel.querySelector('[data-teams]').onclick();assert.equal(configured.count(),1);const message=configured.panel.querySelector('[data-notice]').textContent;assert(message.includes('失败 1 条'));assert(message.includes('TEST-1：Webhook HTTP 403'));assert(configured.panel.querySelector('[data-teams-errors]').textContent.includes('HTTP 403'));assert.equal(configured.panel.querySelector('[data-teams-errors]').hidden,false);assert(!configured.panel.querySelector('[data-teams-settings]'));
 const network=create(source.replace("teamsWebhookUrl: ''","teamsWebhookUrl: '"+placeholder+"'"),'network');await network.panel.querySelector('[data-teams]').onclick();const diagnostic=network.panel.querySelector('[data-teams-errors]').textContent;assert(diagnostic.includes('net::ERR_FAILED'));assert(diagnostic.includes('example.api.powerplatform.com'));assert.equal(network.count(),1);assert(source.includes('@connect      api.powerplatform.com'));
 console.log('PASS: empty webhook blocks send with setup instructions; code fallback retained; final summary preserves HTTP error');
})().catch(e=>{console.error(e);process.exitCode=1;});
