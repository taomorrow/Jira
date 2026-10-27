const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 const values=new Map();let sent;
 const globals={GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>values.set(k,v),GM_xmlhttpRequest:o=>{sent=JSON.parse(o.data);o.onload({status:202});}};
 const app=boot(source,{location:{pathname:'/issues/',href:'https://jira.xpaas.lenovo.com/issues/',origin:'https://jira.xpaas.lenovo.com'},globals});
 app.menus.find(m=>m.name==='Jira Monitor：邮件设置').fn();
 const form=app.body.children.at(-1).shadowRoot,field=form.querySelector('[data-email-recipients]'),enabled=form.querySelector('[data-email-enabled]');
 enabled.checked=true;field.value='one@example.com; TWO@example.com\none@example.com';form.querySelector('[data-email-save]').onclick();
 assert.deepEqual(values.get('jira-monitor-email-v1').recipients,['one@example.com','TWO@example.com']);
 field.value='bad@';form.querySelector('[data-email-save]').onclick();assert(form.querySelector('[data-email-status]').textContent.includes('保存失败'));assert.equal(values.get('jira-monitor-email-v1').recipients.length,2);
 values.set('jira-monitor-webhook','https://example.api.powerplatform.com/test');
 const reload=boot(source,{location:{pathname:'/issues/',href:'https://jira.xpaas.lenovo.com/issues/',origin:'https://jira.xpaas.lenovo.com'},globals});
 reload.storage.set('jira-monitor-batch-v5',JSON.stringify({mode:'batch',active:false,rules:[{name:'DEV',minDays:4,maxDays:5,currentStatuses:['In Progress']}],index:1,queue:[{key:'TEST-1'}],results:[{key:'TEST-1',summary:'<script>alert(1)</script>',assignee:'Person',rules:[{name:'DEV',seconds:6*86400}]}]}));
 const panel=reload.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot;await panel.querySelector('[data-teams]').onclick();
 assert(sent.email.enabled);assert.equal(sent.email.to,'one@example.com;TWO@example.com');assert(sent.email.subject.includes('TEST-1'));assert(!sent.email.bodyHtml.includes('<script>'));assert(sent.email.bodyHtml.includes('&lt;script&gt;'));assert.equal(sent.rules.length,1);
 values.set('jira-monitor-email-v1',{enabled:false,recipients:['one@example.com']});await panel.querySelector('[data-teams]').onclick();assert.equal(sent.email.enabled,false);
 console.log('PASS: email menu validates/deduplicates multiple recipients, persists across reload; webhook email payload escapes HTML; disabled email excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
