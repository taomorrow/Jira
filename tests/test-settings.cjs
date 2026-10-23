const {boot,source}=require('./helpers.cjs');const assert=require('assert');
const key='jira-monitor-webhook',url='https://example.api.powerplatform.com/test';
function launch(code,values){const writes=[];const app=boot(code,{globals:{GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>{writes.push(k);values.set(k,v);}}});return {app,writes,panel:app.root.children.find(x=>x.id==='jira-duration-panel-host').shadowRoot};}
const stored=new Map([[key,url]]);let run=launch(source,stored);assert.equal(stored.get(key),url);assert(!run.writes.includes(key));assert(run.panel.querySelector('[data-teams-status]').textContent.includes('已配置'));
run=launch(source,stored);assert.equal(stored.get(key),url);assert(!run.writes.includes(key));
const legacy=source.replace("teamsWebhookUrl: ''","teamsWebhookUrl: '"+url+"'");const values=new Map();launch(legacy,values);assert.equal(values.get(key),url);launch(source,values);assert.equal(values.get(key),url);
const disabled=new Map([[key,'']]);launch(legacy,disabled);assert.equal(disabled.get(key),'');
assert(run.panel.querySelector('[data-friday-note]').style.cssText.includes('color:#de350b'));
console.log('PASS: saved webhook survives reload/update; legacy fallback persisted; deliberate empty value respected; red Friday note');
// Exercise the real menu -> form -> save -> reload path, rather than pre-seeding storage.
const menuValues=new Map();const configured=launch(source,menuValues);
configured.app.menus.find(m=>m.name==='Jira Monitor：Teams 设置').fn();
const dialog=configured.app.body.children.at(-1).shadowRoot;
dialog.querySelector('[data-webhook-input]').value='  '+url+'  ';
dialog.querySelector('[data-auto-input]').checked=true;
dialog.querySelector('[data-settings-save]').onclick();
assert.equal(menuValues.get(key),url);assert.equal(menuValues.get('jira-monitor-auto-notify'),true);
assert(dialog.querySelector('[data-settings-message]').textContent.includes('已保存并验证'));
assert(configured.panel.querySelector('[data-teams-status]').textContent.includes('已配置'));
assert(launch(source,menuValues).panel.querySelector('[data-teams-status]').textContent.includes('已配置'));
const failed=boot(source,{globals:{GM_getValue:(k,d)=>d,GM_setValue:()=>{throw Error('storage denied');}}});
failed.menus.find(m=>m.name==='Jira Monitor：Teams 设置').fn();const failDialog=failed.body.children.at(-1).shadowRoot;
failDialog.querySelector('[data-webhook-input]').value=url;failDialog.querySelector('[data-settings-save]').onclick();
assert(failDialog.querySelector('[data-settings-message]').textContent.includes('保存失败'));
console.log('PASS: menu save verified, takes effect immediately, survives reload; storage failures displayed');
