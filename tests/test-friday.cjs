const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync(__dirname+'/../jiraMonitor.user.js','utf8');
const config=s.slice(s.indexOf('  const CONFIG'),s.indexOf('  // ================= 规则配置结束'));
const funcs=s.slice(s.indexOf('  const norm='),s.indexOf('  const STORE'));
const ctx={TextEncoder};vm.createContext(ctx);vm.runInContext(config+funcs+';globalThis.api={CONFIG,effectiveRule,evaluateHistory,panelDuration,resultRule,ruleText};',ctx);
const {CONFIG,effectiveRule,evaluateHistory,panelDuration,resultRule,ruleText}=ctx.api;
const thu=+new Date(2026,9,22,23,59,59),fri=+new Date(2026,9,23,17,0),sat=+new Date(2026,9,24,0,0);
for(const rule of CONFIG.rules){
 for(const [h,m,sec,shift] of [[0,0,0,0],[10,29,59,0],[10,30,0,1],[12,0,0,1],[16,59,59,1],[17,0,0,2],[23,59,59,2]]){
  const time=+new Date(2026,9,23,h,m,sec),effective=effectiveRule(rule,time);
  assert.equal(effective.fridayShiftDays,shift);assert.equal(effective.minDays,Math.max(0,rule.minDays-shift));assert.equal(effective.maxDays,Math.max(0,rule.maxDays-shift));
  assert.equal(effectiveRule(rule,new Date(time).toISOString()).fridayShiftDays,shift);
 }
}
// Friday must follow the runtime timezone rather than the fixed Beijing date.
const utc=Date.parse('2026-10-23T02:30:00Z'),local=new Date(utc),mins=local.getHours()*60+local.getMinutes();
assert.equal(effectiveRule(CONFIG.rules[0],utc).fridayShiftDays,local.getDay()===5?(mins>=1020?2:mins>=630?1:0):0);
for(const [i,baseMin,baseMax] of [[0,4,5],[1,13,14]]){
 const rule=CONFIG.rules[i];assert.equal(effectiveRule(rule,thu).maxDays,baseMax);assert.equal(effectiveRule(rule,fri).minDays,baseMin-2);assert.equal(effectiveRule(rule,fri).maxDays,baseMax-2);assert.equal(effectiveRule(rule,sat).maxDays,baseMax);
 for(const [days,level] of [[baseMin-2-.01,'normal'],[baseMin-2,'warning'],[baseMax-2,'overdue']]){
  const r=evaluateHistory([{to:'In Progress',at:fri-days*86400000,order:0}],'In Progress',CONFIG.rules,fri)[i];
  assert.equal(r.seconds,days*86400);assert.equal(panelDuration(r,rule).level,level);assert.equal(resultRule(r,rule).maxDays,baseMax-2);
  assert.equal(panelDuration(JSON.parse(JSON.stringify(r)),rule).level,level);
 }
}
assert.equal(ruleText(CONFIG.rules[0],fri),'DEV｜即将超期：4≤天数＜5；已超期：≥5天；');
assert.equal(ruleText(CONFIG.rules[1],fri),'DCT｜即将超期：13≤天数＜14；已超期：≥14天；');
CONFIG.fridayAdjustment.enabled=false;assert.equal(effectiveRule(CONFIG.rules[0],fri).maxDays,5);
console.log('PASS: Local Friday 10:30/17:00 boundaries and timezone; both KPI thresholds -0/-1/-2; unchanged elapsed time; exact levels; frozen result thresholds; Saturday reset; configurable switch');
