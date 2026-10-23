// ==UserScript==
// @name         Jira Monitor
// @namespace    https://github.com/taomorrow/Jira
// @version      5.0.2
// @description  详情自动分析、总览手动批量扫描；统一DEV/DCT、周五阈值、Excel和Teams通知
// @match        https://jira.xpaas.lenovo.com/*
// @sandbox      DOM
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *.api.powerplatform.com
// @connect      *.logic.azure.com
// @homepageURL  https://github.com/taomorrow/Jira
// @supportURL   https://github.com/taomorrow/Jira/issues
// @downloadURL  https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitor.user.js
// @updateURL    https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitor.user.js
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
    // 天数<下限符合预期，下限≤天数<上限即将超期，天数≥上限已超期；1天=24小时。
    // 自动提醒只针对即将超期；手动发送不受冷却限制。
    rules: [
      {name:'DEV', description:'In Progress-Ready For Test', minDays:4, maxDays:5, currentStatuses:['In Progress'],
       startStatus:'In Progress', forbiddenAfterStart:['Ready For Test','Testing','Completed','Complete','SIT','Ready For UAT','UAT','Ready For Deploy','Deployed','Done','Cancelled']},
      {name:'DCT', description:'In Progress-( / Ready For Test / Testing)-Complete', minDays:13, maxDays:14, currentStatuses:['In Progress','Ready For Test','Testing'],
       startStatus:'In Progress', forbiddenAfterStart:['Completed','Complete','SIT','Ready For UAT','UAT','Ready For Deploy','Deployed','Done','Cancelled']},
    ],
    detailTimeoutSeconds: 90,
    scanScope: 'all', // all：全部筛选结果；page：当前分页
    panelHeightPx: 520,
    panelBottomPx: 68, // 为页面右下角的翻页按钮留出空间
  };
  // ================= 规则配置结束 =================
  if (window.top !== window.self) return;
  if (!/^\/(issues|browse)(\/|$)/.test(location.pathname)) return;
  const badge=document.createElement('div');
  badge.textContent='Jira Monitor v5.0.2 已注入，正在初始化…';
  badge.style.cssText='position:fixed!important;top:8px!important;right:12px!important;z-index:2147483647!important;background:#0052cc!important;color:white!important;padding:8px!important;font:13px Arial!important;max-width:80vw!important;white-space:pre-wrap!important';
  (document.body||document.documentElement).append(badge);
  function report(error) {
    const text='Jira Monitor v5.0.2 启动失败：'+(error?.message||error);
    badge.textContent=text;badge.style.background='#ae2a19';
    (document.body||document.documentElement).append(badge);
    const box=document.createElement('div');box.textContent=text+'。请检查代码开头 CONFIG 配置。';
    box.style.cssText='position:fixed!important;right:16px!important;top:60px!important;z-index:2147483647!important;background:white!important;color:#ae2a19!important;border:2px solid #ae2a19!important;padding:18px!important;max-width:450px!important;font:14px Arial!important';
    document.documentElement.append(box);console.error('[Jira Monitor]',error);
  }
  if(typeof GM_registerMenuCommand==='function') GM_registerMenuCommand('Jira Monitor：显示启动诊断',()=>{alert(badge.textContent+'\n页面：'+location.href);});
  try {

  // Public release: notification credentials stay in this user's userscript storage.
  if(window.top!==window.self)return;
  const WEBHOOK_SETTING='jira-monitor-webhook';
  const AUTO_SETTING='jira-monitor-auto-notify';
  try{
    CONFIG.teamsWebhookUrl=GM_getValue(WEBHOOK_SETTING,CONFIG.teamsWebhookUrl);
    CONFIG.autoNotifyApproaching=GM_getValue(AUTO_SETTING,CONFIG.autoNotifyApproaching)===true;
  }catch{}
  function supportedWebhook(value){
    try{const u=new URL(value);return u.protocol==='https:'&&(/(^|\.)api\.powerplatform\.com$/i.test(u.hostname)||/(^|\.)logic\.azure\.com$/i.test(u.hostname));}catch{return false;}
  }
  function configureTeams(){
      const value=prompt('输入你的 Teams Workflow Webhook（留空停用通知）。地址仅保存在本机油猴存储中。',CONFIG.teamsWebhookUrl||'');
      if(value===null)return;
      const url=value.trim();
      if(url&&!supportedWebhook(url)){alert('请使用 HTTPS 的 api.powerplatform.com 或 logic.azure.com 工作流地址。');return;}
      const enabled=url?confirm('是否开启“即将超期”自动通知？确定：开启；取消：仅手动发送。'):false;
      GM_setValue(WEBHOOK_SETTING,url);GM_setValue(AUTO_SETTING,enabled);
      CONFIG.teamsWebhookUrl=url;CONFIG.autoNotifyApproaching=enabled;
      alert('配置已保存，请刷新 Jira 页面生效。');
  }
  if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('Jira Monitor：Teams 设置',configureTeams);

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
  const STORE = 'jira-monitor-batch-v5';
  const DETAIL_STORE='jira-monitor-detail-v5';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const readState=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
  const isDetail=()=>/^\/browse\//i.test(location.pathname);
  const get=()=>{
    const batch=readState(STORE);
    if(batch?.active||batch?.paused)return batch;
    return isDetail()?readState(DETAIL_STORE):batch;
  };
  const save=s=>sessionStorage.setItem(s.mode==='single'?DETAIL_STORE:STORE,JSON.stringify(s));
  const keyOf = href => { try { const u=new URL(href,location.href); return u.searchParams.get('selectedIssue') || u.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/i)?.[1]; } catch { return null; } };
  function readAssignee(doc=document) {
    const clean=node=>node?.textContent?.replace(/\s+/g,' ').trim()||'';
    const value=doc.querySelector('#assignee-val, [data-field-id="assignee"] .value, [data-field="assignee"] .value');
    if(value)return clean(value.querySelector('.user-hover, [rel]')||value)||'未分配';
    const people=doc.querySelector('#peoplemodule, #people-module, .people-details')||doc;
    for(const label of people.querySelectorAll('dt, .name, label')){
      if(!/^(assignee|经办人|指派人|负责人)\s*[:：]?$/i.test(clean(label)))continue;
      const next=label.nextElementSibling;
      const field=next||label.parentElement?.querySelector('dd, .value');
      if(field)return clean(field.querySelector('.user-hover')||field)||'未分配';
    }
    return '';
  }
  const readSummary=()=>document.querySelector('#summary-val, h1[data-field="summary"], #issue-header h1')?.textContent?.trim()||'';
  function summaryLinks() {
    const root = document.querySelector('#issuetable, .issue-table, [data-testid="issue-table"]');
    if (!root) return [];
    const map = new Map();
    for (const row of root.querySelectorAll('tr, [data-issuekey]')) {
      const a = row.querySelector('td.summary a.issue-link, td.summary a, .summary a, a[data-field="summary"]') || [...row.querySelectorAll('a[href*="/browse/"]')].find(a => !/^[A-Z][A-Z0-9_]*-\d+$/i.test(a.textContent.trim()));
      const key = a && (keyOf(a.href) || row.getAttribute('data-issuekey'));
      if (key && a) map.set(key,{key,summary:a.textContent.trim(),href:a.href,anchor:a,
        currentStatus:row.querySelector('td.status .aui-lozenge, td.status .jira-issue-status-lozenge, td.status, [data-field="status"]')?.textContent?.trim()||'',
        assignee:row.querySelector('td.assignee .user-hover, td.assignee, [data-field="assignee"]')?.textContent?.replace(/\s+/g,' ').trim()||''});
    }
    return [...map.values()];
  }
  // Shadow DOM 隔离 Jira 的页面样式；挂在根节点，避免被局部页面刷新移除。
  const host=document.createElement('div');
  host.id='jira-duration-panel-host';
  host.style.cssText='display:block!important;position:fixed!important;inset:auto 16px 68px auto!important;width: min(430px, 90vw)!important;z-index:2147483647!important;visibility:visible!important;opacity:1!important';
  host.style.bottom=CONFIG.panelBottomPx+'px';
  const shadow=host.attachShadow({mode:'open'});
  const css=document.createElement('style');
  css.textContent=`
    *{box-sizing:border-box}
    button,select,textarea{font:12px Arial,sans-serif;color:#172b4d}
    button{height:27px;padding:3px 10px;border:1px solid #c1c7d0;border-radius:5px;background:#f7f8fa;cursor:pointer;white-space:nowrap}
    button:hover:not(:disabled){background:#e9f2ff;border-color:#85b8ff}
    button:disabled{opacity:.45;cursor:default}
    [data-start]{background:#0052cc;color:white;border-color:#0052cc}
    [data-actions]{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:8px 0}
    [data-actions] button{flex:0 0 auto}
    [data-fold]{height:23px;padding:2px 8px;font-size:11px}
    p{margin:8px 0;line-height:1.45;flex:0 0 auto}
    [data-config]{font-size:12px;color:#5e6c84;white-space:pre-line}
    select,textarea{border:1px solid #dfe1e6;border-radius:5px;padding:5px 7px;background:white}
    select{flex:0 0 auto;margin-bottom:5px}
    [data-progress]{font-size:12px;color:#5e6c84;margin:3px 0 8px}
    [data-totals]{background:#f0f5ff;color:#0747a6;border-radius:5px;padding:8px 9px;margin:0 0 6px;font-weight:600}
    a{color:#0052cc;text-decoration:none} a:hover{text-decoration:underline}
  `;
  shadow.append(css);
  const panel=document.createElement('section');
  shadow.append(panel);
  function mountPanel(){document.documentElement.append(host);panel.style.display='block';host.style.visibility='visible';}

  panel.style.cssText='box-sizing:border-box;position:relative;width:100%;height:min(520px,75vh);max-height:75vh;overflow:hidden;z-index:2147483647;background:#fff;color:#172b4d;border:2px solid #0052cc;border-radius:8px;padding:14px;box-shadow:0 4px 24px #0004;font:13px Arial';
  // 使用 DOM 构建，避免站点 Trusted Types 策略拒绝 innerHTML。
  const make=(tag,text,attr,parent)=>{const x=document.createElement(tag);if(text)x.textContent=text;if(attr)x.setAttribute(attr,'');parent.append(x);return x;};
  make('b','Jira Monitor v5.0.2',null,panel);
  const fold=make('button','收起','data-fold',panel);fold.style.float='right';
  const body=make('div',null,'data-body',panel);
  body.style.cssText='display:flex;flex-direction:column;height:calc(100% - 24px);min-height:0';
  panel.style.height=`min(${CONFIG.panelHeightPx}px,75vh)`;
  make('p','规则加载中…','data-config',body);
  const scope=make('select',null,'data-scope',body);
  const allOption=make('option','全部筛选结果',null,scope);allOption.value='all';
  const pageOption=make('option','仅当前分页',null,scope);pageOption.value='page';scope.value=CONFIG.scanScope;
  const jqlBox=make('textarea',null,'data-jql',body);jqlBox.placeholder='自动读取URL中的JQL；未读取到时请粘贴Advanced里的完整JQL';jqlBox.rows=2;
  jqlBox.style.cssText='width:100%;box-sizing:border-box;flex-shrink:0';
  jqlBox.value=new URL(location.href).searchParams.get('jql')||'';
  const actions=make('div',null,'data-actions',body);
  make('button','开始统计','data-start',actions);
  make('button','暂停','data-pause',actions);
  make('button','停止','data-stop',actions);
  make('button','导出 Excel','data-excel',actions);
  make('button','发送 Teams','data-teams',actions);
  make('button','Teams 设置','data-teams-settings',actions).onclick=configureTeams;
  make('p',null,'data-notice',body).style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px;overflow-y:auto';
  make('p',null,'data-teams-status',body).style.cssText='font-size:12px;color:#5e6c84';
  const errorBox=make('pre',null,'data-teams-errors',body);errorBox.hidden=true;errorBox.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0;max-height:130px;overflow-y:auto;color:#ae2a19;background:#fff1f0;padding:7px;font:12px Arial';
  make('p',null,'data-progress',body);make('p',null,'data-totals',body);const resultsBox=make('div',null,'data-results',body);
  resultsBox.style.cssText='flex:1;min-height:80px;overflow-y:auto;overscroll-behavior:contain';
  mountPanel();
  if(typeof GM_registerMenuCommand==='function') GM_registerMenuCommand('Jira Monitor：显示统计面板',()=>{mountPanel();body.hidden=false;body.style.display='flex';panel.style.height=`min(${CONFIG.panelHeightPx}px,75vh)`;});
  const el=s=>panel.querySelector(s);
  validateRules(CONFIG.rules);
  el('[data-config]').textContent=CONFIG.rules.map(r=>ruleText(r)).join('\n');
  let busy=false, epoch=0;
  function render() {
    const s=get();
    el('[data-teams-status]').textContent='Teams：'+(CONFIG.teamsWebhookUrl?'已配置':'未配置')+' · 自动通知'+(CONFIG.autoNotifyApproaching?'开启':'关闭');
    el('[data-config]').textContent=(s?.rules||CONFIG.rules).map(r=>ruleText(r)).join('\n');
    el('[data-start]').disabled=!!s?.active||teamsSending;
    el('[data-start]').textContent=s?.paused?'开始统计':keyOf(location.href)&&!onOverview()?'重新分析':'开始统计';
    el('[data-pause]').disabled=!s?.active;
    el('[data-stop]').disabled=!s?.active&&!s?.paused;
    el('[data-teams]').disabled=!!s?.active||teamsSending||!s?.results?.some(item=>item.rules?.some(r=>Number.isFinite(r.seconds)));
    scope.disabled=!!(s?.active||s?.paused);jqlBox.disabled=scope.disabled;
    scope.hidden=!!keyOf(location.href)&&!onOverview();jqlBox.hidden=true;
    el('[data-progress]').textContent=s ? `${s.paused?'已暂停':s.active?'运行中':'已结束/停止'} · ${s.index}/${s.queue.length} · ${s.message||''}` : (keyOf(location.href)?'详情页正在自动分析':'点击开始统计当前总览页');
    const box=el('[data-results]'),oldScroll=box.scrollTop;box.replaceChildren();
    if(!s){el('[data-totals]').textContent=CONFIG.rules.map(rule=>`${rule.name} 即将超期：0`).join('；');return;}
    const rules=s.rules||CONFIG.rules;
    const summary=el('[data-totals]');
    summary.textContent=rules.map(rule=>{
      const count=s.results.filter(item=>{
        const r=item.rules?.find(result=>result.name===rule.name);
        return panelDuration(r,rule).level==='warning';
      }).length;
      return `${rule.name} 即将超期：${count}`;
    }).join('；');
    for(const item of s.results){
      const div=document.createElement('div'),a=document.createElement('a');a.href='/browse/'+item.key;a.target='_blank';a.rel='noopener';a.textContent=item.key;
      div.append(a,document.createTextNode(' · '+(item.assignee||'未读取到经办人')));
      if(item.rules){
        for(const result of item.rules){
          const rule=rules.find(r=>r.name===result.name)||{};
          const display=panelDuration(result,rule),span=document.createElement('span');
          span.textContent=result.name+' '+display.text;
          if(display.level==='overdue')span.style.cssText='color:#d1242f;font-weight:700';
          else if(display.level==='normal')span.style.cssText='color:#16803c;font-weight:700';
          else if(display.level==='warning')span.style.cssText='color:#b58100;font-weight:700;background:#fff7bd;padding:1px 3px';
          div.append(document.createTextNode(' · '),span);
        }
      }else div.append(document.createTextNode(' · '+item.status+' · '+(item.details||'—')));
      div.style.cssText='border-top:1px solid #ddd;padding:5px 0';box.append(div);
    }
    box.scrollTop=oldScroll;
  }
  function hasTeamsAlert(item,rulesConfig=CONFIG.rules){
    return item.rules?.some(r=>{
      const rule=rulesConfig.find(x=>x.name===r.name);
      return rule&&['warning','overdue'].includes(panelDuration(r,rule).level);
    })||false;
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
  function safeError(error){
    return String(error?.message||error||'未知错误').replace(/https?:\/\/[^\s<>"']+/g,'[已隐藏地址]').replace(/([?&]sig=)[^&\s]+/gi,'$1[隐藏]').slice(0,1200);
  }
  function showTeamsError(text){
    const box=el('[data-teams-errors]');box.textContent=safeError(text);box.hidden=false;
  }
  function postTeams(payload){
    return new Promise((resolve,reject)=>{
      if(!CONFIG.teamsWebhookUrl){reject(new Error('未配置 Webhook：点击面板上的「Teams 设置」'));return;}
      if(!supportedWebhook(CONFIG.teamsWebhookUrl)){reject(new Error('Webhook 地址不受支持，请重新配置'));return;}
      if(typeof GM_xmlhttpRequest!=='function'){reject(new Error('GM_xmlhttpRequest 不可用，请确认只启用一份 Jira Monitor 并重新保存脚本权限'));return;}
      try{GM_xmlhttpRequest({method:'POST',url:CONFIG.teamsWebhookUrl,headers:{'Content-Type':'application/json'},data:JSON.stringify(payload),timeout:30000,anonymous:true,
        onload:r=>{
          if(r.status>=200&&r.status<300){resolve();return;}
          let detail='';try{const body=JSON.parse(r.responseText||'{}');detail=body.error?.message||body.message||'';}catch{detail=(r.responseText||'').slice(0,600);}
          reject(new Error('Webhook HTTP '+r.status+(detail?'：'+safeError(detail):'')));
        },
        onerror:r=>reject(new Error('Webhook 网络请求失败'+(r?.status?'，HTTP '+r.status:'')+'；检查油猴跨域授权、公司网络/代理及地址是否有效')),
        onabort:()=>reject(new Error('Webhook 请求被中止')),
        ontimeout:()=>reject(new Error('Webhook 请求超时，发送结果未知，请先检查工作流运行记录再重试'))});}
      catch(error){reject(new Error('油猴请求未发出：'+safeError(error)));}
    });
  }

  let teamsSending=false;
  function notice(text){el('[data-notice]').textContent=text;}
  async function sendOverviewItem(item,rules,automatic){
    const run=async()=>{
      const payload=teamsPayload(item,rules,automatic);
      if(!payload.rules.length)return 'skipped';
      if(automatic&&(!CONFIG.autoNotifyApproaching||!CONFIG.teamsWebhookUrl))return 'skipped';
      if(automatic&&!payload.rules.some(r=>r.level==='warning'))return 'skipped';
      if(automatic){
        if(typeof GM_getValue!=='function'||typeof GM_setValue!=='function')throw new Error('请保存新版脚本并刷新以启用通知去重权限');
        const key='jira-monitor-teams-cooldown-v1:'+item.key+':'+CONFIG.teamsWebhookUrl;
        if(GM_getValue(key,null)?.until>Date.now())return 'suppressed';
        const hours=Number(CONFIG.notificationCooldownHours);
        if(!Number.isFinite(hours)||hours<=0)throw new Error('notificationCooldownHours 必须大于0');
        GM_setValue(key,{until:Date.now()+hours*3600000,state:'submitted'});
      }
      await postTeams(payload);return 'submitted';
    };
    if(typeof navigator!=='undefined'&&navigator.locks?.request)return navigator.locks.request('jira-monitor-teams-notify',run);
    return run();
  }
  async function autoNotifyOverview(item,rules){
    try{const state=await sendOverviewItem(item,rules,true);if(state==='submitted')notice(item.key+' 自动通知已提交');}
    catch(error){const text=item.key+' 自动通知失败：'+safeError(error);notice(text);showTeamsError(text+'；自动冷却记录保留，请核对工作流。');}
  }
  el('[data-teams]').onclick=async()=>{
    const s=get();if(teamsSending||s?.active)return;
    const items=(s?.results||[]).filter(item=>item.rules?.some(r=>Number.isFinite(r.seconds)));
    if(!items.length){notice('没有有效计时结果，无需发送');return;}
    if(!CONFIG.teamsWebhookUrl){const text='未发送：点击面板「Teams 设置」填写 Webhook，保存后刷新页面';notice(text);showTeamsError(text);return;}
    if(!supportedWebhook(CONFIG.teamsWebhookUrl)){const text='未发送：Webhook 地址不受支持，请通过「Teams 设置」重新配置';notice(text);showTeamsError(text);return;}
    el('[data-teams-errors]').hidden=true;el('[data-teams-errors]').textContent='';
    teamsSending=true;render();let success=0,failed=0;const errors=[];
    for(const item of items){
      notice('正在发送 '+item.key+'…');
      try{await sendOverviewItem(item,s.rules||CONFIG.rules,false);success++;}catch(error){failed++;errors.push(item.key+'：'+safeError(error));notice(errors[errors.length-1]);showTeamsError(errors.join('\n'));}
    }
    teamsSending=false;notice('Teams 已提交 '+success+' 条，失败 '+failed+' 条（工作流接收不代表投递完成）'+(errors.length?'\n'+errors.join('\n'):''));render();
  };
  function update(message) {const s=get();if(s?.active){s.message=message;save(s);render();}}
  function valid(id, token) { const s=get();if(!s?.active || s.id!==id || token!==epoch)throw new Error('CANCELLED');return s; }
  function tabLink(){return [...document.querySelectorAll('a,button,[role="tab"]')].find(x=>/^history$/i.test(x.textContent.trim()));}
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
      }while(startAt<100000);
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
  async function allIssues(id,token){
    const checkpoint=valid(id,token).collection;
    let jql=checkpoint?.jql||jqlBox.value.trim()||new URL(location.href).searchParams.get('jql')||document.querySelector('#jql, textarea[name="jql"]')?.value||'';
    if(!jql){const filter=new URL(location.href).searchParams.get('filter');if(/^\d+$/.test(filter||'')){jql=(await api('/rest/api/2/filter/'+filter)).jql||'';}}
    if(!jql)throw new Error('无法确定完整筛选条件，请在面板粘贴 Advanced 的完整 JQL，再重新开始；没有退回到只扫描当前页');
    let startAt=checkpoint?.startAt||0,total=checkpoint?.total??null;
    const found=new Map((checkpoint?.issues||[]).map(x=>[x.key,x]));
    const initial=valid(id,token);initial.collection={jql,startAt,total,issues:[...found.values()]};save(initial);
    while(total===null||startAt<total){
      valid(id,token);
      const page=await api('/rest/api/2/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jql,startAt,maxResults:100,fields:['summary','status','assignee']})});
      valid(id,token);
      if(!Array.isArray(page.issues)||!Number.isInteger(page.total))throw new Error('搜索分页返回格式异常');
      if(total!==null&&total!==page.total)throw new Error('收集时筛选数量变化，请重新扫描');total=page.total;
      if(!page.issues.length&&startAt<total)throw new Error('搜索分页提前结束，未取得全部工单');
      for(const issue of page.issues)found.set(issue.key,issue);
      startAt+=page.issues.length;
      const state=valid(id,token);state.collection={jql,startAt,total,issues:[...found.values()]};save(state);
      update(`收集全部筛选结果：${startAt}/${total}`);
    }
    if(found.size!==total)throw new Error('搜索分页存在重复或遗漏，请重试');
    const rules=valid(id,token).rules;
    const queue=[...found.values()].filter(x=>rules.some(r=>r.currentStatuses.map(norm).includes(norm(x.fields?.status?.name)))).map(x=>({key:x.key,summary:x.fields?.summary||'',currentStatus:x.fields?.status?.name||'',assignee:x.fields?.assignee===null?'未分配':x.fields?.assignee?.displayName||'',href:location.origin+'/browse/'+x.key}));
    return {queue,total,jql};
  }
  async function continueCollection(){
    const before=get();if(!before?.active||before.phase!=='collecting'||busy)return;
    const id=before.id,token=epoch;busy=true;
    try{
      const {queue,total,jql}=await allIssues(id,token);const state=valid(id,token);
      Object.assign(state,{queue,total,jql,phase:'list',message:`全部${total}条，符合状态范围${queue.length}条`});delete state.collection;save(state);
    }catch(e){if(e.message!=='CANCELLED'){const state=get();if(state?.id===id&&state.active&&token===epoch){state.active=false;state.paused=false;state.message=e.message;save(state);}}}
    finally{if(token===epoch)busy=false;render();}
    if(token===epoch)pump();
  }
  async function inspect(id,token){
    const state=valid(id,token);
    // 批量扫描保持可见的History定位；独立详情直接使用同一REST读取和计算逻辑。
    if(state.mode!=='single'){
      const end=Date.now()+CONFIG.detailTimeoutSeconds*1000;let tab;
      while(Date.now()<end){valid(id,token);tab=tabLink();if(tab)break;document.querySelector('#activitymodule')?.scrollIntoView({block:'center'});await sleep(500);}
      if(!tab)throw new Error('未找到 History 标签');
      tab.scrollIntoView({block:'center'});tab.click();update('已点击 History，读取状态变化的精确时间…');await sleep(1000);valid(id,token);
    }
    // made changes 的相对时间会舍入；读取同一 History 的 REST created 时间，避免把 Yesterday/17 minutes ago 当成精确日期。
    const data=await issueHistory(keyOf(location.href));
    const s=valid(id,token),now=Date.now();
    return {checkedAt:now,assigneeEmail:data.assigneeEmail,assigneeAccount:data.assigneeAccount,rules:evaluateHistory(data.events,data.status,s.rules,now),assignee:data.assignee||readAssignee()||s.queue[s.index]?.assignee||'',summary:data.summary,currentStatus:data.status,source:data.source};
  }
  function onOverview(){
    return /^\/issues(?:\/|$)/.test(location.pathname)&&!!document.querySelector('#issuetable, .issue-table, [data-testid="issue-table"]');
  }
  function pageStamp(){return summaryLinks().map(x=>x.key).join('|');}
  function pageBounds(){
    const match=(document.body.innerText||'').match(/Showing results\s+([\d,]+)\s*[-–]\s*([\d,]+)\s+of\s+([\d,]+)/i);
    return match?{start:Number(match[1].replace(/,/g,'')),end:Number(match[2].replace(/,/g,'')),total:Number(match[3].replace(/,/g,''))}:null;
  }
  function nextPageControl(){
    const links=[...document.querySelectorAll('.pagination a, .pagination button, .aui-nav-pagination a, .aui-nav-pagination button, a[rel="next"], a[aria-label], a[title], a[href*="startIndex="], a[href*="startAt="], a[href*="pager/start="]')];
    const enabled=x=>!x.disabled&&x.getAttribute('aria-disabled')!=='true'&&!x.closest('.disabled, .aui-nav-disabled, [aria-disabled="true"]')&&x.getClientRects().length;
    const explicit=links.find(x=>enabled(x)&&(/^(next|next page|下一页|下页|›|»|>)$/i.test(x.textContent.trim())||/next|下一页/i.test((x.getAttribute('aria-label')||'')+' '+(x.getAttribute('title')||''))||x.getAttribute('rel')==='next'));
    if(explicit)return explicit;
    const bounds=pageBounds();
    if(bounds&&bounds.end<bounds.total){
      const target=Math.floor((bounds.start-1)/(bounds.end-bounds.start+1))+2;
      const numeric=[...document.querySelectorAll('.pagination a, .aui-nav-pagination a, a[href]')].find(x=>enabled(x)&&x.textContent.trim()===String(target)&&new URL(x.href,location.href).pathname.startsWith('/issues'));
      if(numeric)return numeric;
    }
    return null;
  }
  function appendPage(state){
    const stamp=pageStamp();if(!stamp)throw new Error('当前分页列表尚未加载');
    if((state.visitedPages||[]).includes(stamp))throw new Error('翻页后出现已扫描的相同列表，暂停以防重复扫描');
    const rows=summaryLinks(),seen=new Set(state.queue.map(x=>x.key));
    const eligible=rows.filter(x=>!seen.has(x.key)&&(!x.currentStatus||state.rules.some(r=>r.currentStatuses.map(norm).includes(norm(x.currentStatus)))));
    state.queue.push(...eligible.map(({anchor,...x})=>x));
    state.visitedPages=[...(state.visitedPages||[]),stamp];state.listUrl=location.href;state.phase='list';state.pageNumber=(state.pageNumber||0)+1;
    state.total=pageBounds()?.total??state.total;state.message=`第${state.pageNumber}页，新增${eligible.length}条符合范围的工单`;save(state);
  }
  function advancePage(state){
    const next=nextPageControl(),bounds=pageBounds();
    if(!next){
      if(bounds&&bounds.end<bounds.total)throw new Error('列表还有下一页但未识别到翻页按钮，请暂停后检查右下角页码');
      state.active=false;state.phase='done';state.message=`已完成${state.pageNumber}页，已统计${state.index}条符合范围的工单`;save(state);return;
    }
    state.phase='paging';state.pagingFrom=pageStamp();state.pagingSince=Date.now();state.nextPageUrl=next.href||null;state.message='当前页完成，点击右下角下一页…';save(state);render();
    next.scrollIntoView({block:'center'});next.click();
    const id=state.id,from=state.pagingFrom;
    setTimeout(()=>{const x=get();if(x?.active&&x.id===id&&x.phase==='paging'&&x.pagingFrom===from&&pageStamp()===from&&x.nextPageUrl)location.assign(x.nextPageUrl);},2000);
  }
  function listIdentity(href){
    const u=new URL(href);for(const key of ['selectedIssue','focusedCommentId','focusedId'])u.searchParams.delete(key);u.hash='';u.searchParams.sort();return u.origin+u.pathname.replace(/\/$/,'')+'?'+u.searchParams;
  }
  function back(s) {
    // History 标签自身可能增加历史项。先浏览器返回，再确保恢复保存的总览。
    if(s.backAt&&Date.now()-s.backAt<2500)return;
    s.backAt=Date.now();save(s);update('本条已保存，返回总览后自动继续…');
    const id=s.id;history.back();
    setTimeout(()=>{
      const x=get();if(!x?.active||x.id!==id||x.phase!=='returning')return;
      if(!onOverview())location.replace(x.listUrl);else pump();
    },1800);
  }
  async function pump() {
    if(busy)return;
    let s=get();if(!s?.active){render();return;}
    if(s.phase==='collecting'){continueCollection();return;}
    busy=true;const token=epoch;
    try {
      if(s.domPaging&&s.phase==='paging'){
        const stamp=pageStamp();
        if(onOverview()&&stamp&&stamp!==s.pagingFrom){appendPage(s);return;}
        if(Date.now()-s.pagingSince>30000){s.active=false;s.paused=true;s.message='翻页30秒未完成；请手动翻到下一页后点击开始统计继续';save(s);}
        return;
      }
      const current=s.phase==='returning'&&onOverview()?null:keyOf(location.href);
      if(current){
        if(s.phase==='returning'){back(s);return;}
        const item=s.queue[s.index];
        if(!item || current!==item.key){s.active=false;s.message='当前打开的 Jira 与待扫描条目不符，已停止';save(s);return;}
        s.phase='reading';save(s);update(`正在读取 ${item.key} 的 History…`);
        let result;
        try{result=await inspect(s.id,token);}catch(e){if(e.message==='CANCELLED')return;result={status:'读取失败',max:null,details:e.message};}
        s=valid(s.id,token);
        s.results.push({...item,summary:readSummary()||item.summary,assignee:readAssignee()||item.assignee||'',...result});s.index++;
        save(s);await autoNotifyOverview(s.results[s.results.length-1],s.rules);s=valid(s.id,token);
        if(s.mode==='single'){
          s.active=false;s.phase='done';s.message=`${item.key} 本条统计完成`;save(s);render();return;
        }
        s.phase='returning';save(s);render();await sleep(800);valid(s.id,token);back(s);return;
      }
      if(!/^\/issues(?:\/|$)/.test(location.pathname))return;
      if(listIdentity(location.href)!==listIdentity(s.listUrl)){
        if(s.phase==='returning'){location.replace(s.listUrl);return;}
        s.active=false;s.message='总览筛选改变，已停止以防扫描错误列表';save(s);return;
      }
      if(s.phase==='reading'){s.active=false;s.message='读取中离开了详情页，已停止；可重新开始';save(s);return;}
      if(s.domPaging&&s.index>=s.queue.length){advancePage(s);return;}
      if(s.index>=s.queue.length){s.active=false;s.phase='done';s.message=s.scope==='all'?`全部筛选${s.total}条，符合范围${s.queue.length}条，已全部完成`:'当前分页范围内统计完成（未扫描其它分页）';save(s);return;}
      const item=s.queue[s.index];
      // 返回后等待 Jira 恢复表格，再重新定位 Summary，避免使用旧 DOM。
      let link;
      for(let n=0;n<(s.scope==='all'?1:40);n++){valid(s.id,token);link=summaryLinks().find(x=>x.key===item.key);if(link)break;await sleep(500);}
      if(!link&&s.scope==='all'){
        const anchor=document.createElement('a');anchor.href=item.href;anchor.textContent=item.summary||item.key;
        anchor.style.cssText='display:block;padding:4px';el('[data-progress]').append(anchor);
        link={...item,anchor};
      }
      if(!link){s=valid(s.id,token);s.active=false;s.message=`未找到 ${item.key} 的 Summary，已停止；请确认总览列表未改变`;save(s);return;}
      s=valid(s.id,token);s.phase='opening';s.backAt=0;s.message=`点击 ${item.key} 的 Summary（${s.index+1}/${s.queue.length}）`;save(s);render();
      link.anchor.scrollIntoView({block:'center'});await sleep(500);valid(s.id,token);
      // 强制同一标签打开，让 history.back() 能返回原总览。
      link.anchor.removeAttribute('target');
      // 保留真正的 Summary 点击，但阻止 Jira 的 SPA 点击拦截，使用同标签原生链接跳转。
      const nativeClick=event=>event.stopImmediatePropagation();
      link.anchor.addEventListener('click',nativeClick,{capture:true,once:true});
      link.anchor.click();
      await sleep(2000);valid(s.id,token);
      if(!keyOf(location.href))location.assign(link.href);
    }catch(e){if(e.message!=='CANCELLED'){const x=get();if(x){x.active=false;if(x.domPaging)x.paused=true;x.message=e.message;save(x);}}}
    finally{if(token===epoch)busy=false;render();}
  }
  scope.onchange=render;
  el('[data-start]').onclick=async()=>{
    const previous=get();if(previous?.active||teamsSending)return;
    if(previous?.paused){
      epoch++;busy=false;
      previous.active=true;previous.paused=false;previous.backAt=0;previous.pagingSince=Date.now();previous.message='继续扫描，保留已完成进度';
      scope.value=previous.scope||scope.value;jqlBox.value=previous.jql||previous.collection?.jql||jqlBox.value;
      if(onOverview()&&previous.phase==='reading')previous.phase='list';
      if(previous.domPaging&&previous.phase==='paging'&&onOverview()&&pageStamp()===previous.pagingFrom)previous.phase='list';
      save(previous);render();
      if(previous.phase==='collecting'){continueCollection();return;}
      const pending=previous.queue[previous.index],current=onOverview()?null:keyOf(location.href);
      if(previous.mode==='single'&&pending&&current!==pending.key){location.assign(pending.href);return;}
      if(previous.mode==='batch'&&previous.phase!=='returning'&&current&&current!==pending?.key){previous.phase='list';save(previous);location.replace(previous.listUrl);return;}
      pump();return;
    }
    const current=onOverview()?null:keyOf(location.href);
    if(current){
      save({id:String(Date.now()),mode:'single',active:true,rules:JSON.parse(JSON.stringify(CONFIG.rules)),queue:[{key:current,summary:readSummary(),href:location.href}],index:0,results:[],phase:'reading',message:`开始统计 ${current}`});
      render();pump();return;
    }
    if(scope.value==='all'){
      const state={id:String(Date.now()),active:true,mode:'batch',scope:'all',domPaging:true,rules:JSON.parse(JSON.stringify(CONFIG.rules)),listUrl:location.href,queue:[],index:0,results:[],phase:'list',visitedPages:[],pageNumber:0};
      try{appendPage(state);}catch(error){alert(error.message);return;}render();pump();return;
    }
    const links=summaryLinks().filter(item=>!item.currentStatus||CONFIG.rules.some(r=>r.currentStatuses.map(norm).includes(norm(item.currentStatus))));
    if(!links.length){alert('未找到 Summary 链接，请切换到截图中的列表视图并等待加载完成。');return;}
    save({id:String(Date.now()),active:true,mode:'batch',scope:'page',rules:JSON.parse(JSON.stringify(CONFIG.rules)),listUrl:location.href,queue:links.map(({anchor,...item})=>item),index:0,results:[],phase:'list',message:`已记录当前页 ${links.length} 条 Jira`});render();pump();
  };
  el('[data-pause]').onclick=()=>{
    const s=get();if(!s?.active)return;
    s.active=false;s.paused=true;s.message='已保留进度，点击开始统计继续';save(s);
    epoch++;busy=false;render();
  };
  el('[data-stop]').onclick=()=>{
    const s=get();if(s){s.active=false;s.paused=false;s.phase='stopped';s.message='本轮已结束，结果可导出；再次开始将新建扫描';save(s);}
    epoch++;busy=false;render();
  };
  el('[data-fold]').onclick=()=>{const folded=body.style.display==='none';body.style.display=folded?'flex':'none';panel.style.height=folded?`min(${CONFIG.panelHeightPx}px,75vh)`:'auto';};
  function exportRows(){
    const s=get(),rules=s?.rules||CONFIG.rules;
    const rows=[{values:['Jira','Summary','Assignee','当前状态','规则','KPI下限天','KPI上限天','计时结果','Duration秒','Duration天','开始时间(北京时间 UTC+08:00)','扫描时间(北京时间 UTC+08:00)','时间来源','明细/错误'],level:'header'}];
    for(const item of s?.results||[])for(const rule of rules){
      const r=item.rules?.find(x=>x.name===rule.name),d=panelDuration(r,rule),effective=resultRule(r,rule);
      rows.push({level:d.level,jiraUrl:'https://jira.xpaas.lenovo.com/browse/'+encodeURIComponent(item.key),values:[item.key,item.summary,item.assignee||'',item.currentStatus||r?.currentStatus||'',rule.name,effective.minDays,effective.maxDays,r&&Number.isFinite(r.seconds)?d.text:r?.status||item.status,Number.isFinite(r?.seconds)?Number(r.seconds.toFixed(2)):'',r&&Number.isFinite(r.seconds)?Number(dayText(r.seconds)):'',beijingTime(r?.startAt),beijingTime(r?.checkedAt),r?.startAt?'History REST fetch 精确时间':'',(r?.details||item.details||'')+(r?.fridayShiftDays?'；周五KPI上下限提前'+r.fridayShiftDays+'天':'')]});
    }return rows;
  }
  function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
  el('[data-excel]').onclick=()=>download(new Blob([makeXlsx(exportRows())],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Jira Monitor.xlsx');
  let detailRoute='';
  function autoDetail(){
    const batch=readState(STORE);
    if(batch?.active||batch?.paused||teamsSending)return;
    if(!isDetail()){
      if(detailRoute){epoch++;busy=false;detailRoute='';const previous=readState(DETAIL_STORE);if(previous?.active){previous.active=false;previous.phase='stopped';previous.message='离开详情，分析已取消';save(previous);}}
      return;
    }
    const key=keyOf(location.href);if(!key||detailRoute===key)return;
    epoch++;busy=false;detailRoute=key;
    save({id:String(Date.now())+'-'+epoch,mode:'single',active:true,rules:JSON.parse(JSON.stringify(CONFIG.rules)),queue:[{key,summary:readSummary(),href:location.href}],index:0,results:[],phase:'reading',message:'正在自动分析 '+key});
    render();void pump();
  }
  addEventListener('pagehide',()=>{epoch++;busy=false;});
  addEventListener('pageshow',()=>{epoch++;busy=false;autoDetail();render();setTimeout(pump,800);});
  addEventListener('popstate',()=>{autoDetail();render();});
  setInterval(()=>{autoDetail();if(!host.isConnected)mountPanel();if(!badge.isConnected)document.documentElement.append(badge);pump();},1500);
  render();badge.textContent='Jira Monitor v5.0.2 已启动 · 点击显示面板';badge.onclick=()=>{mountPanel();body.hidden=false;body.style.display='flex';panel.style.height=`min(${CONFIG.panelHeightPx}px,75vh)`;};autoDetail();setTimeout(pump,800);
  } catch(error) { report(error); }
})();
