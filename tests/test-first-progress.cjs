const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../jiraMonitor.user.js','utf8');
const config=source.slice(source.indexOf('  const CONFIG'),source.indexOf('  // ================= 规则配置结束'));
const funcs=source.slice(source.indexOf('  const norm='),source.indexOf('  const STORE'));
const ctx={TextEncoder};vm.createContext(ctx);vm.runInContext(config+funcs+';globalThis.api={CONFIG,evaluateHistory};',ctx);
const {CONFIG,evaluateHistory}=ctx.api;const now=Date.parse('2026-10-22T10:00:00Z'),first=now-2*86400000;
const events=[{to:'In Progress',at:now-360000,order:4},{to:'Ready For Test',at:now-420000,order:3},{to:'In Progress',at:now-480000,order:2},{to:'Ready For Test',at:now-540000,order:1},{to:'In Progress',at:first,order:0}];
for(const r of evaluateHistory(events,'In Progress',CONFIG.rules,now)){assert.equal(r.seconds,172800);assert.equal(r.startAt,new Date(first).toISOString());assert(r.details.includes('首次'));}
const testing=evaluateHistory([...events,{to:'Testing',at:now-1000,order:5}],'Testing',CONFIG.rules,now);assert.equal(testing[0].seconds,null);assert.equal(testing[1].seconds,172800);
for(const r of evaluateHistory([...events,{to:'Completed',at:now-100000,order:5}],'In Progress',CONFIG.rules,now))assert.equal(r.seconds,null);
for(const r of evaluateHistory([],'In Progress',CONFIG.rules,now))assert.equal(r.status,'未发现起始记录');
console.log('PASS: first of three In Progress events selected despite reverse order; rework retained; current scope and completion exclusions preserved');
