const {boot,source}=require('./helpers.cjs');const assert=require('assert');
const key='jira-monitor-webhook',url='https://example.api.powerplatform.com/test';
function launch(code,values){const writes=[];const app=boot(code,{globals:{GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>{writes.push(k);values.set(k,v);}}});return {app,writes,panel:app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot};}
const stored=new Map([[key,url]]);let run=launch(source,stored);assert.equal(stored.get(key),url);assert(!run.writes.includes(key));assert(run.panel.querySelector('[data-teams-status]').textContent.includes('已配置'));
run=launch(source,stored);assert.equal(stored.get(key),url);assert(!run.writes.includes(key));
const legacy=source.replace("teamsWebhookUrl: ''","teamsWebhookUrl: '"+url+"'");const values=new Map();launch(legacy,values);assert.equal(values.get(key),url);launch(source,values);assert.equal(values.get(key),url);
const disabled=new Map([[key,'']]);launch(legacy,disabled);assert.equal(disabled.get(key),'');
assert(run.panel.querySelector('[data-friday-note]').style.cssText.includes('color:#de350b'));
console.log('PASS: saved webhook survives reload/update; legacy fallback persisted; deliberate empty value respected; red Friday note');
