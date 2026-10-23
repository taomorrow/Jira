// ==UserScript==
// @name         Jira Monitor Detail
// @namespace    https://github.com/taomorrow/Jira
// @version      1.7.1
// @description  打开 Jira 详情自动分析 DEV/DCT，使用 History 精确时间，支持彩色 Excel
// @match        https://jira.xpaas.lenovo.com/*
// @sandbox      DOM
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      *.api.powerplatform.com
// @connect      *.logic.azure.com
// @homepageURL  https://github.com/taomorrow/Jira
// @supportURL   https://github.com/taomorrow/Jira/issues
// @downloadURL  https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitorDetail.user.js
// @updateURL    https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitorDetail.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  // ================= 只需修改这里的规则配置 =================
  const CONFIG = {
    fridayAdjustment: {enabled:true, subtractDays:2}, // 北京时间周五，所有KPI上下限提前2天
    // 即将超期 自动通知；收件人由此 Webhook 的个人聊天工作流决定。
    autoNotifyApproaching: false, // false：只手动发送
    notificationCooldownHours: 24, // 同一工单24小时内最多提交一次（仅自动发送；手动发送不限次数）
    mentionAssignee: true, // Jira 返回邮箱或下方映射存在时，构造真正的 @提及
    teamsMentionUsers: {}, // 'jira账号': {id:'Teams登录邮箱或Entra用户ID', name:'姓名'}
    teamsWebhookUrl: '',
    // minDays：即将超期起点（含）；maxDays：已超期起点（含）。
    // 小于下限符合预期，下限≤天数<上限即将超期，天数≥上限已超期。1天=24小时。
    // 颜色：符合预期绿色、即将超期黄色、已超期红色。
    rules: [
      {name:'DEV', description:'In Progress-Ready For Test', minDays:4, maxDays:5, currentStatuses:['In Progress'],
       startStatus:'In Progress', forbiddenAfterStart:['Ready For Test','Testing','Completed','Complete','SIT','Ready For UAT','UAT','Ready For Deploy','Deployed','Done','Cancelled']},
      {name:'DCT', description:'In Progress-( / Ready For Test / Testing)-Complete', minDays:13, maxDays:14, currentStatuses:['In Progress','Ready For Test','Testing'],
       startStatus:'In Progress', forbiddenAfterStart:['Completed','Complete','SIT','Ready For UAT','UAT','Ready For Deploy','Deployed','Done','Cancelled']},
    ],
    panelHeightPx: 520,
    panelBottomPx: 68,
  };
  // ================= 规则配置结束 =================

  // Public release: notification credentials stay in this user's userscript storage.
  if(window.top!==window.self)return;
  const WEBHOOK_SETTING='jira-monitor-webhook';
  const AUTO_SETTING='jira-monitor-auto-notify';
  try{
    CONFIG.teamsWebhookUrl=GM_getValue(WEBHOOK_SETTING,'');
    CONFIG.autoNotifyApproaching=GM_getValue(AUTO_SETTING,false)===true;
  }catch{}
  function supportedWebhook(value){
    try{const u=new URL(value);return u.protocol==='https:'&&(/(^|\.)api\.powerplatform\.com$/i.test(u.hostname)||/(^|\.)logic\.azure\.com$/i.test(u.hostname));}catch{return false;}
  }
  if(typeof GM_registerMenuCommand==='function'){
    GM_registerMenuCommand('Teams：配置 Webhook / 自动通知',()=>{
      const value=prompt('输入你的 Teams Workflow Webhook（留空停用通知）。地址仅保存在本机油猴存储中。',CONFIG.teamsWebhookUrl||'');
      if(value===null)return;
      const url=value.trim();
      if(url&&!supportedWebhook(url)){alert('请使用 HTTPS 的 api.powerplatform.com 或 logic.azure.com 工作流地址。');return;}
      const enabled=url?confirm('是否开启“即将超期”自动通知？确定：开启；取消：仅手动发送。'):false;
      GM_setValue(WEBHOOK_SETTING,url);GM_setValue(AUTO_SETTING,enabled);
      CONFIG.teamsWebhookUrl=url;CONFIG.autoNotifyApproaching=enabled;
      alert('配置已保存，请刷新 Jira 页面生效。');
    });
  }

  const norm=s=>String(s||'').replace(/[_\s-]+/g,' ').trim().toUpperCase();
  function validateRules(rules){
    const names=new Set();
    if(!Array.isArray(rules)||!rules.length)throw new Error('至少配置一条规则');
    for(const r of rules){
      if(!r.name||names.has(r.name))throw new Error('规则名称必须唯一');names.add(r.name);
      if(!Number.isFinite(r.minDays)||!Number.isFinite(r.maxDays)||r.minDays<0||r.maxDays<=r.minDays)throw new Error(r.name+'：KPI 下限/上限无效，要求 0 ≤ 下限 < 上限');
      if(!Array.isArray(r.currentStatuses)||!r.currentStatuses.length||!r.startStatus||!Array.isArray(r.forbiddenAfterStart))throw new Error(r.name+'：状态配置无效');
    }
  }
  const dayText=n=>n===null?'':(n/86400).toFixed(2);
  function effectiveRule(rule,scanTime){
    const ms=typeof scanTime==='number'?scanTime:Date.parse(scanTime);
    const friday=Number.isFinite(ms)&&new Date(ms+8*3600000).getUTCDay()===5;
    const adjustment=CONFIG.fridayAdjustment;
    const shift=adjustment?.enabled&&friday?adjustment.subtractDays:0;
    return {...rule,minDays:Math.max(0,rule.minDays-shift),maxDays:Math.max(0,rule.maxDays-shift),fridayShiftDays:shift};
  }
  function resultRule(result,rule){
    if(Number.isFinite(result?.effectiveMinDays)&&Number.isFinite(result?.effectiveMaxDays))return {...rule,minDays:result.effectiveMinDays,maxDays:result.effectiveMaxDays};
    return result?.checkedAt?effectiveRule(rule,result.checkedAt):rule;
  }
  const ruleText=(base,scanTime=Date.now())=>{
    const r=effectiveRule(base,scanTime);
    return `${r.name}: ${r.description||r.currentStatuses.join(' / ')}｜ ${r.minDays}≤天数<${r.maxDays} 即将超期；≥${r.maxDays}天 已超期${r.fridayShiftDays?'（周五提前'+r.fridayShiftDays+'天）':''}`;
  };
  function panelDuration(result,rule){
    rule=resultRule(result,rule);
    if(!result||!Number.isFinite(result.seconds))return {level:'unknown',text:result?.status||'未读取到'};
    const days=result.seconds/86400,duration=dayText(result.seconds)+'天';
    if(days>=rule.maxDays){const excess=(days-rule.maxDays).toFixed(2);return {level:'overdue',text:duration+'（已超期 '+excess+' 天）'};}
    if(days>=rule.minDays&&days<rule.maxDays)return {level:'warning',text:duration+'（即将超期）'};
    return {level:'normal',text:duration+'（符合预期）'};
  }
  // 北京时间只用于表示同一时刻；计算使用绝对时间戳，不给 Duration 额外加8小时。
  function beijingTime(value){
    if(value===null||value===undefined||value==='')return '';
    const ms=typeof value==='number'?value:Date.parse(value);
    if(!Number.isFinite(ms))return '';
    return new Date(ms+8*3600000).toISOString().replace('T',' ').replace('Z',' +08:00');
  }
  function evaluateHistory(events,currentStatus,rules,now){
    const sorted=[...events].sort((a,b)=>a.at-b.at||a.order-b.order);
    return rules.map(originalRule=>{
      const rule=effectiveRule(originalRule,now);
      const base={name:rule.name,seconds:null,currentStatus,checkedAt:new Date(now).toISOString(),effectiveMinDays:rule.minDays,effectiveMaxDays:rule.maxDays,fridayShiftDays:rule.fridayShiftDays};
      if(!rule.currentStatuses.map(norm).includes(norm(currentStatus)))return {...base,status:'不在统计范围',details:'当前状态：'+currentStatus};
      const index=sorted.findLastIndex(e=>norm(e.to)===norm(rule.startStatus));
      if(index<0)return {...base,status:'未发现起始记录',details:'History 中无进入 '+rule.startStatus+' 的记录'};
      const start=sorted[index];
      if(sorted.slice(index+1).some(e=>rule.forbiddenAfterStart.map(norm).includes(norm(e.to))))return {...base,status:'后续流程已发生',details:'最近进入 In Progress 后存在禁止的后续状态'};
      if(!Number.isFinite(start.at)||start.at>now)return {...base,status:'读取失败',details:'起始时间无效或晚于当前系统时间'};
      const elapsed=(now-start.at)/1000;
      return {...base,status:'已统计',seconds:elapsed,inRange:elapsed>=rule.minDays*86400&&elapsed<rule.maxDays*86400,startAt:new Date(start.at).toISOString(),details:'最近 New: '+rule.startStatus+'；当前系统时间减起始时间；来源：'+(start.source||'History REST 精确时间')};
    });
  }
  function makeXlsx(rows){
    const esc=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const enc=new TextEncoder();
    const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols><col min="1" max="14" width="25" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.values.map((v,j)=>{
      const c=String.fromCharCode(65+j)+(i+1),style=i>0&&(j===8||j===9)?({warning:5,overdue:6}[r.level]||4):({header:1,warning:2,overdue:3}[r.level]||0);
      return typeof v==='number'&&Number.isFinite(v)?`<c r="${c}" s="${style}"><v>${v}</v></c>`:`<c r="${c}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')+'</row>').join('')+'</sheetData><hyperlinks>'+rows.map((row,i)=>row.jiraUrl?`<hyperlink ref="A${i+1}" r:id="jira${i}"/>`:'').join('')+'</hyperlinks></worksheet>';
    const files={
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Jira KPI" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/></font><font><b/><color rgb="FF9C0006"/><sz val="11"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="2" fontId="2" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
      'xl/worksheets/sheet1.xml':sheet,
      'xl/worksheets/_rels/sheet1.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rows.map((row,i)=>row.jiraUrl?`<Relationship Id="jira${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(row.jiraUrl)}" TargetMode="External"/>`:'').join('')+'</Relationships>',
    };
    const chunks=[],central=[];let offset=0;
    const header=n=>new Uint8Array(n),u16=(a,p,n)=>new DataView(a.buffer).setUint16(p,n,true),u32=(a,p,n)=>new DataView(a.buffer).setUint32(p,n>>>0,true);
    for(const [name,text] of Object.entries(files)){
      const path=enc.encode(name),data=enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+text);
      let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
      const local=header(30);u32(local,0,0x04034b50);u16(local,4,20);u32(local,14,crc);u32(local,18,data.length);u32(local,22,data.length);u16(local,26,path.length);
      chunks.push(local,path,data);
      const c=header(46);u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u32(c,16,crc);u32(c,20,data.length);u32(c,24,data.length);u16(c,28,path.length);u32(c,42,offset);central.push(c,path);offset+=local.length+path.length+data.length;
    }
    const size=central.reduce((n,a)=>n+a.length,0),end=header(22);u32(end,0,0x06054b50);u16(end,8,Object.keys(files).length);u16(end,10,Object.keys(files).length);u32(end,12,size);u32(end,16,offset);
    const all=[...chunks,...central,end],out=new Uint8Array(all.reduce((n,a)=>n+a.length,0));let at=0;for(const a of all){out.set(a,at);at+=a.length;}return out;
  }
  async function api(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{const res=await fetch(path,{...options,credentials:'same-origin',headers:{Accept:'application/json',...(options.headers||{})},signal:controller.signal});if(!res.ok)throw new Error('Jira HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
  }
  async function issueHistory(key){
    const data=await api('/rest/api/2/issue/'+encodeURIComponent(key)+'?fields=assignee,status,summary&expand=changelog');
    let histories=data.changelog?.histories;
    if(!Array.isArray(histories))throw new Error('接口未返回 changelog');
    const total=data.changelog.total;
    if(!Number.isInteger(total)||data.changelog.startAt>0||histories.length<total){
      histories=[];let startAt=0;
      do{
        const page=await api('/rest/api/2/issue/'+encodeURIComponent(key)+'/changelog?startAt='+startAt+'&maxResults=100');
        const batch=page.values||page.histories;
        if(!Array.isArray(batch)||!Number.isInteger(page.total)||!batch.length&&startAt<page.total)throw new Error('历史分页不完整');
        histories.push(...batch);startAt+=batch.length;
        if(startAt>=page.total)break;
      if(startAt>=100000)throw new Error("历史记录超过安全读取上限，无法保证完整分析");
      }while(true);
    }
    const seen=new Set(),events=[];
    for(const h of histories){
      if(h.id&&seen.has(h.id))continue;if(h.id)seen.add(h.id);
      for(const item of h.items||[]){
        if(norm(item.field)!=='STATUS')continue;
        const at=Date.parse(h.created);
        if(!Number.isFinite(at))throw new Error('History 精确时间解析失败：'+h.created);
        events.push({to:item.toString,from:item.fromString,at,historyId:h.id,source:'History REST fetch 精确时间',order:events.length});
      }
    }
    const fields=data.fields||{};
    if(!fields.status?.name)throw new Error('无法读取当前状态');
    return {events,assigneeEmail:fields.assignee?.emailAddress||'',assigneeAccount:fields.assignee?.name||fields.assignee?.key||fields.assignee?.accountId||'',status:fields.status.name,assignee:fields.assignee===null?'未分配':fields.assignee?.displayName||'',summary:fields.summary||'',source:'Jira History REST fetch 精确时间'};
  }

  const detailKey=()=>location.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)(?=$|[^A-Z0-9_-])/i)?.[1]?.toUpperCase()||'';
  if(window.top!==window.self)return;
  const host=document.createElement('div');host.id='jira-detail-analysis-host';
  host.hidden=!detailKey();
  document.documentElement.append(host);
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.textContent=`:host{all:initial}*{box-sizing:border-box}.panel{position:fixed;right:16px;bottom:${CONFIG.panelBottomPx}px;width:min(430px,94vw);max-height:min(${CONFIG.panelHeightPx}px,80vh);overflow:auto;z-index:2147483647;background:white;color:#172b4d;border:2px solid #1664ec;border-radius:9px;box-shadow:0 5px 24px #0003;padding:13px;font:13px/1.6 Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center}button{font:12px Arial;padding:5px 9px;cursor:pointer;background:#f4f6fa;color:#172b4d;border:1px solid #c7cedb;border-radius:4px}button:disabled{opacity:.5;cursor:default}.rules{white-space:pre-line;color:#62718a;margin:8px 0}.actions{display:flex;gap:6px}.message{margin:9px 0;color:#62718a}.row{border-top:1px solid #ddd;padding:8px 0}.warning{color:#b58100;font-weight:700;background:#fff7bd;padding:1px 3px}.normal{color:#16803c;font-weight:700}.overdue{color:#d1242f;font-weight:700}a{color:#1664ec}.meta{overflow-wrap:anywhere}.time{color:#62718a;font-size:12px}`;
  shadow.append(style);
  function node(tag,text,parent,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(parent)parent.append(e);return e;}
  const panel=node('section',undefined,shadow,'panel'),head=node('header',undefined,panel);
  node('strong','jiraMonitorDetail',head);
  const fold=node('button','收起',head),content=node('div',undefined,panel);
  fold.onclick=()=>{content.hidden=!content.hidden;fold.textContent=content.hidden?'展开':'收起';};
  const rulesDescription=node('div',CONFIG.rules.map(r=>ruleText(r)).join('\n'),content,'rules');
  const actions=node('div',undefined,content,'actions'),retry=node('button','重新分析',actions),excel=node('button','导出 Excel',actions),notify=node('button','发送 Teams',actions);
  const message=node('div','正在初始化…',content,'message'),result=node('div',undefined,content);
  let item=null,sequence=0,lastKey='';
  excel.disabled=true;notify.disabled=true;
  let sending=false;
  const NOTICE_STORE='jira-detail-teams-cooldown-v2:';
  function notificationKey(current){return NOTICE_STORE+current.key+':'+CONFIG.teamsWebhookUrl;}
  function readNotice(key){
    if(typeof GM_getValue!=='function')throw new Error('通知去重权限未生效，请保存新版油猴脚本并刷新页面');
    return GM_getValue(key,null);
  }
  function writeNotice(key,value){GM_setValue(key,value);}
  function autoNotify(){
    if(CONFIG.autoNotifyApproaching&&CONFIG.teamsWebhookUrl&&item&&item.rules.some(r=>{
      const rule=CONFIG.rules.find(x=>x.name===r.name);
      return rule&&panelDuration(r,rule).level==='warning';
    }))void sendTeams(true);
  }
  function render(){
    result.replaceChildren();if(!item)return;
    rulesDescription.textContent=CONFIG.rules.map(r=>ruleText(r,item.checkedAt)).join('\n');
    const meta=node('div',undefined,result,'meta'),link=node('a',item.key,meta);
    link.href=location.origin+'/browse/'+encodeURIComponent(item.key);link.target='_blank';link.rel='noopener noreferrer';
    node('span',' · '+(item.assignee||'未读取到负责人'),meta);
    node('div',item.summary,result,'meta');
    for(const rule of CONFIG.rules){
      const r=item.rules.find(r=>r.name===rule.name);
      if(r?.status==='不在统计范围')continue;
      const d=panelDuration(r,rule),row=node('div',undefined,result,'row');
      const label={normal:'符合预期',warning:'即将超期',overdue:'已超期'}[d.level];
      node('span',rule.name+' '+(label?label+' · '+dayText(r.seconds)+'天':d.text),row,d.level);
      if(r.startAt)node('div','进入 In Progress：'+beijingTime(r.startAt),row,'time');
      if(r.details&&!Number.isFinite(r.seconds))node('div',r.details,row,'time');
    }
    node('div','扫描时间：'+beijingTime(item.checkedAt),result,'time');
  }
  async function analyze(){
    const key=detailKey();if(!key)return;
    const token=++sequence;lastKey=key;item=null;result.replaceChildren();excel.disabled=true;notify.disabled=true;retry.disabled=true;
    message.hidden=false;message.textContent='正在分析 '+key+'…';
    try{
      validateRules(CONFIG.rules);
      const data=await issueHistory(key);
      if(token!==sequence||detailKey()!==key)return;
      const now=Date.now();
      item={key,summary:data.summary,assignee:data.assignee,assigneeEmail:data.assigneeEmail,assigneeAccount:data.assigneeAccount,currentStatus:data.status,checkedAt:now,rules:evaluateHistory(data.events,data.status,CONFIG.rules,now)};
      render();message.textContent='';message.hidden=true;excel.disabled=false;notify.disabled=sending;autoNotify();
    }catch(error){if(token===sequence&&detailKey()===key)message.textContent='分析失败：'+(error.message||error)+'。可点击重新分析。';}
    finally{if(token===sequence){retry.disabled=false;}}
  }
  function exportRows(){
    const rows=[{values:['Jira','Summary','Assignee','当前状态','规则','KPI下限天','KPI上限天','计时结果','Duration秒','Duration天','开始时间(北京时间 UTC+08:00)','扫描时间(北京时间 UTC+08:00)','时间来源','明细/错误'],level:'header'}];
    if(!item)return rows;
    for(const rule of CONFIG.rules){
      const r=item.rules.find(r=>r.name===rule.name),d=panelDuration(r,rule),effective=resultRule(r,rule);
      rows.push({level:d.level,jiraUrl:location.origin+'/browse/'+encodeURIComponent(item.key),values:[item.key,item.summary,item.assignee,item.currentStatus,rule.name,effective.minDays,effective.maxDays,d.text,Number.isFinite(r.seconds)?Number(r.seconds.toFixed(2)):'',Number.isFinite(r.seconds)?Number(dayText(r.seconds)):'',beijingTime(r.startAt),beijingTime(r.checkedAt),r.startAt?'History REST fetch 精确时间':'',(r.details||'')+(r.fridayShiftDays?'；周五KPI上下限提前'+r.fridayShiftDays+'天':'')]});
    }return rows;
  }

  function teamsPayload(current,rulesConfig=CONFIG.rules,automatic=true){
    const jiraUrl=location.origin+'/browse/'+encodeURIComponent(current.key);
    const rules=(current.rules||[]).filter(r=>{
      const rule=rulesConfig.find(x=>x.name===r.name);
      return rule&&Number.isFinite(r.seconds)&&(!automatic||['warning','overdue'].includes(panelDuration(r,rule).level));
    }).map(r=>{
      const rule=rulesConfig.find(x=>x.name===r.name),d=panelDuration(r,rule);
      return {name:r.name,sla:{normal:'符合预期',warning:'即将超期',overdue:'已超期'}[d.level],days:Number(dayText(r.seconds)),startTime:beijingTime(r.startAt),level:d.level};
    });
    const assigneeEmail=current.assigneeEmail||'';
    const mapped=CONFIG.teamsMentionUsers[current.assigneeAccount];
    const mention=CONFIG.mentionAssignee&&(mapped?.id?mapped:assigneeEmail?{id:assigneeEmail,name:current.assignee}:null);
    const mentionName=mention?String(mention.name||current.assignee).replace(/[<>]/g,''):'';
    const mentionText=mention?'<at>'+mentionName+'</at>':'';
    const text=[current.key,current.summary,'负责人：'+current.assignee,...rules.map(r=>r.name+'：'+r.sla+' · '+r.days.toFixed(2)+'天'),jiraUrl,'扫描时间：'+beijingTime(current.checkedAt)].join('\n');
    return {type:'message',text,jiraKey:current.key,jiraUrl,summary:current.summary,assignee:current.assignee,assigneeAccount:current.assigneeAccount,assigneeEmail,currentStatus:current.currentStatus,scanTime:beijingTime(current.checkedAt),rules,
      attachments:[{contentType:'application/vnd.microsoft.card.adaptive',contentUrl:null,content:{'$schema':'http://adaptivecards.io/schemas/adaptive-card.json',type:'AdaptiveCard',version:'1.2',msteams:{entities:mention?[{type:'mention',text:mentionText,mentioned:{id:mention.id,name:mentionName}}]:[]},body:[
        {type:'TextBlock',text:current.key,weight:'Bolder',size:'Medium',wrap:true},
        {type:'TextBlock',text:current.summary,wrap:true},
        {type:'TextBlock',text:'负责人：'+(mentionText||current.assignee),wrap:true},
        ...rules.map(r=>({type:'TextBlock',text:r.name+'：'+r.sla+' · '+r.days.toFixed(2)+'天',wrap:true,color:{normal:'Good',warning:'Warning',overdue:'Attention'}[r.level]})),
        {type:'TextBlock',text:'扫描时间：'+beijingTime(current.checkedAt),wrap:true,isSubtle:true}
      ],actions:[{type:'Action.OpenUrl',title:'打开 Jira',url:jiraUrl}]}}]};
  }
  function postTeams(payload){
    return new Promise((resolve,reject)=>{
      if(!CONFIG.teamsWebhookUrl){reject(new Error('请先在油猴菜单配置 Teams Webhook'));return;}
      if(!supportedWebhook(CONFIG.teamsWebhookUrl)){reject(new Error('Webhook 地址不受支持，请重新配置'));return;}
      if(typeof GM_xmlhttpRequest!=='function'){reject(new Error('请保存新版脚本并刷新，授予跨域请求权限'));return;}
      GM_xmlhttpRequest({method:'POST',url:CONFIG.teamsWebhookUrl,headers:{'Content-Type':'application/json'},data:JSON.stringify(payload),timeout:30000,anonymous:true,
        onload:r=>r.status>=200&&r.status<300?resolve():reject(new Error('Webhook HTTP '+r.status)),
        onerror:()=>reject(new Error('Webhook 网络请求失败')),
        ontimeout:()=>reject(new Error('Webhook 请求超时，发送结果未知，请先检查工作流运行记录再重试'))});
    });
  }
  async function sendTeams(automatic=false){
    const run=()=>sendTeamsLocked(automatic);
    // Web Locks 串行化同域标签页的“检查记录→请求→保存”，阻止并发重复。
    if(typeof navigator!=='undefined'&&navigator.locks?.request)return navigator.locks.request('jira-detail-teams-notify',run);
    return run();
  }
  async function sendTeamsLocked(automatic=false){
    if(!item||sending||detailKey()!==item.key)return;
    const current=item,token=sequence,payload=teamsPayload(current,CONFIG.rules,automatic);
    message.hidden=false;
    if(!payload.rules.length){message.textContent='当前工单无可通知的有效 DEV/DCT 计时结果。';return;}
    const noticeKey=notificationKey(current);
    if(automatic){
      let previous;
      try{previous=readNotice(noticeKey);}catch(error){message.textContent=error.message;return;}
      if(previous?.until>Date.now()){message.hidden=true;return;}
      const cooldown=Number(CONFIG.notificationCooldownHours);
      if(!Number.isFinite(cooldown)||cooldown<=0){message.textContent='notificationCooldownHours 必须大于0';return;}
      // 只有自动发送读取和写入冷却；手动发送不受冷却影响，也不延长冷却。
      try{writeNotice(noticeKey,{until:Date.now()+cooldown*3600000,state:'submitted'});}catch{message.textContent='无法保存去重记录，已取消自动发送';return;}
    }
    sending=true;notify.disabled=true;message.textContent='正在提交 Teams 通知…';
    try{
      await postTeams(payload);
      if(token===sequence){message.hidden=false;message.textContent='已提交到 Teams Webhook。若未收到，请检查工作流本次运行的发送步骤。';}
    }catch(error){if(token===sequence){message.hidden=false;message.textContent=(error.message||'发送失败')+(automatic?'。为避免重复，保留自动通知冷却记录，请先核对工作流运行记录。':'。请先核对工作流运行记录后再重试。');}}
    finally{sending=false;notify.disabled=!item;if(item&&item!==current)autoNotify();}
  }
  notify.onclick=()=>sendTeams(false);

  retry.onclick=()=>{void analyze();};
  excel.onclick=()=>{
    if(!item)return;
    const url=URL.createObjectURL(new Blob([makeXlsx(exportRows())],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;a.download='jiraMonitorDetail-'+item.key+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('显示 jiraMonitorDetail',()=>{host.hidden=false;content.hidden=false;fold.textContent='收起';});
  // 兼容同一详情页内切换工单；总览不分析，不跳转，也不调用浏览器返回。
  function route(){
    const key=detailKey();host.hidden=!key;
    if(!key){if(lastKey){sequence++;lastKey='';item=null;}return;}
    if(!host.isConnected)document.documentElement.append(host);
    if(key!==lastKey)void analyze();
  }
  addEventListener('popstate',route);addEventListener('pageshow',route);
  setInterval(route,1000);
  route();
})();
