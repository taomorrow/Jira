const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 const placeholder='https://example.api.powerplatform.com/test';
 function create(code=source,status=403){let requests=0;const app=boot(code,{globals:{GM_getValue:(k,d)=>d,GM_setValue:()=>{},GM_xmlhttpRequest:o=>{requests++;o.onload({status});}}});
  app.storage.set('jira-monitor-batch-v5',JSON.stringify({id:'test',mode:'batch',active:false,index:1,queue:[{key:'TEST-1'}],rules:[{name:'DEV',minDays:4,maxDays:5}],results:[{key:'TEST-1',summary:'Example',assignee:'Person',rules:[{name:'DEV',seconds:86400}]}]}));
  const panel=app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot;
  return {app,panel,count:()=>requests};
 }
 const missing=create();await missing.panel.querySelector('[data-teams]').onclick();assert.equal(missing.count(),0);assert(missing.panel.querySelector('[data-notice]').textContent.includes('请在油猴菜单'));
 const configured=create(source.replace("teamsWebhookUrl: ''","teamsWebhookUrl: '"+placeholder+"'"));await configured.panel.querySelector('[data-teams]').onclick();assert.equal(configured.count(),1);const message=configured.panel.querySelector('[data-notice]').textContent;assert(message.includes('失败 1 条'));assert(message.includes('TEST-1：Webhook HTTP 403'));
 console.log('PASS: empty webhook blocks send with setup instructions; code fallback retained; final summary preserves HTTP error');
})().catch(e=>{console.error(e);process.exitCode=1;});
