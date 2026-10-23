const {boot,source}=require('./helpers.cjs');
const assert=require('assert');
(async()=>{
 let code=source.replace('};autoDetail();setTimeout(pump,800);','};setTimeout(pump,800);').replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = () => Promise.resolve();');
 let a=code.indexOf('  function summaryLinks()'),b=code.indexOf('  // Shadow DOM',a);
 code=code.slice(0,a)+'  function summaryLinks(){return globalThis.testLinks;}\n'+code.slice(b);
 a=code.indexOf('  async function inspect(');b=code.indexOf('  function onOverview(',a);
 code=code.slice(0,a)+"  async function inspect(){return {rules:[]};}\n"+code.slice(b);
 code=code.replace('  } catch(error) { report(error); }','  globalThis.testPump=pump;\n  } catch(error) { report(error); }');
 const location={pathname:'/browse/CSP-1',href:'https://jira.xpaas.lenovo.com/browse/CSP-1'};
 let backCount=0,clicked=0;
 const links=[{key:'CSP-2',href:'https://jira.xpaas.lenovo.com/browse/CSP-2',summary:'Second',anchor:{scrollIntoView(){},removeAttribute(){},addEventListener(){},click(){clicked++;location.href='https://jira.xpaas.lenovo.com/browse/CSP-2';location.pathname='/browse/CSP-2';}}}];
 const app=boot(code,{location,querySelector:q=>q.startsWith('#issuetable')&&location.pathname==='/issues/'?{}:null,globals:{testLinks:links,history:{back(){backCount++;location.pathname='/issues/';location.href='https://jira.xpaas.lenovo.com/issues/?filter=-1&selectedIssue=CSP-1#activity';}}}});
 const rules=[{name:'DEV',minDays:2.5,maxDays:4.5,currentStatuses:['In Progress'],startStatus:'In Progress',forbiddenAfterStart:[]}];
 app.storage.set('jira-monitor-batch-v5',JSON.stringify({id:'test',active:true,mode:'batch',listUrl:'https://jira.xpaas.lenovo.com/issues/?filter=-1',phase:'returning',rules,index:1,queue:[{key:'CSP-1'},{key:'CSP-2'}],results:[{key:'CSP-1',rules:[]}]}));
 await app.ctx.testPump();assert.equal(backCount,1);
 await app.ctx.testPump();assert.equal(clicked,1,'返回后必须自动点击下一条 Summary');
 await app.ctx.testPump();assert.equal(backCount,2);
 await app.ctx.testPump();
 const result=JSON.parse(app.storage.get('jira-monitor-batch-v5'));assert.equal(result.active,false);assert.equal(result.phase,'done');assert.equal(result.index,2);assert.equal(result.results.length,2);
 // 全量队列中的下一条可能不在当前分页，必须使用已保存的 Summary 链接继续。
 links.length=0;
 const create=app.ctx.document.createElement;
 app.ctx.document.createElement=tag=>{
   const node=create(tag);
   if(tag==='a')Object.assign(node,{scrollIntoView(){},removeAttribute(){},addEventListener(){},click(){clicked++;location.href=this.href;location.pathname=new URL(this.href).pathname;}});
   return node;
 };
 app.storage.set('jira-monitor-batch-v5',JSON.stringify({id:'all',active:true,mode:'batch',scope:'all',total:470,listUrl:'https://jira.xpaas.lenovo.com/issues/?filter=-1',phase:'returning',rules,index:1,queue:[{key:'CSP-1'},{key:'CSP-2',summary:'Second page issue',href:'https://jira.xpaas.lenovo.com/browse/CSP-2'}],results:[{key:'CSP-1',rules:[]}]}));
 await app.ctx.testPump();assert.equal(clicked,2,'跨分页工单不在当前表格时也必须自动打开');
 await app.ctx.testPump();await app.ctx.testPump();
 const all=JSON.parse(app.storage.get('jira-monitor-batch-v5'));assert.equal(all.active,false);assert.equal(all.index,2);assert(all.message.includes('全部筛选470条'));
 console.log('PASS: detail → back → next Summary → complete; all-result queue continues when next issue is absent from current page');
})().catch(e=>{console.error(e);process.exitCode=1;});
