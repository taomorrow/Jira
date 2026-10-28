const {boot,source}=require('./helpers.cjs');const assert=require('assert');
const values=new Map([['jira-monitor-webhook','https://legacy.api.powerplatform.com/test'],['jira-monitor-email-v1',{enabled:true,recipients:['old@example.com']}],['jira-monitor-auto-notify',true]]);
const globals={GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>values.set(k,v)};
const app=boot(source,{globals});app.menus.find(m=>m.name==='Jira Monitor：配置中心').fn();const form=app.body.children.at(-1).shadowRoot;
form.querySelector('[data-legacy-key]').value='CSP';form.querySelector('[data-project-import]').onclick();form.querySelector('[data-project-save]').onclick();
assert.equal(values.get('jira-monitor-projects-v1')[0].webhook,values.get('jira-monitor-webhook'));assert.equal(values.get('jira-monitor-projects-v1')[0].recipients[0],'old@example.com');assert.equal(values.get('jira-monitor-projects-v1')[0].autoNotify,true);
const before=JSON.stringify(values.get('jira-monitor-projects-v1'));boot(source,{globals});assert.equal(JSON.stringify(values.get('jira-monitor-projects-v1')),before);
assert.equal(values.get('jira-monitor-webhook'),'https://legacy.api.powerplatform.com/test');console.log('PASS: explicit legacy import to one project, old values untouched, project settings survive reload');
