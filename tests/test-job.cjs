const {boot,source}=require('./helpers.cjs');const assert=require('assert');
(async()=>{
 let interval,requests=0;const legacy={enabled:true,frequency:'interval',nextAt:1,jql:'project=TEST'};
 const app=boot(source,{globals:{setInterval:fn=>{interval=fn;},GM_getValue:(k,d)=>k==='jira-monitor-job-v1'?legacy:d,fetch:async()=>{requests++;throw Error('Unexpected scheduled request');}}});
 // The panel lives on documentElement in the DOM test helper.
 const panelHost=app.ctx.document.documentElement.children.find(x=>x.id==='jira-duration-panel-host');
 const shadow=panelHost.shadowRoot,body=shadow.querySelector('[data-body]'),fold=shadow.querySelector('[data-fold]');
 assert(body.style.display!=='none');assert.equal(fold.textContent,'收起');fold.onclick();assert.equal(body.style.display,'none');assert.equal(fold.textContent,'展开');fold.onclick();assert.equal(body.style.display,'flex');assert.equal(fold.textContent,'收起');
 app.menus.find(x=>x.name==='Jira Monitor：显示统计面板').fn();assert.equal(body.style.display,'flex');assert.equal(fold.textContent,'收起');
 app.menus.find(x=>x.name==='Jira Monitor：配置中心').fn();assert(!app.body.children.at(-1).shadowRoot.querySelector('[data-center-job]'));
 assert(!source.includes('function jobTick'));assert(!source.includes('旧版全局设置保留在本机，不自动套用于所有项目'));
 interval();await new Promise(r=>setImmediate(r));assert.equal(requests,0);
 console.log('PASS: default expanded panel, expand/fold/menu, removed Job settings and scheduler; legacy enabled Job does not execute');
})().catch(e=>{console.error(e);process.exitCode=1;});
