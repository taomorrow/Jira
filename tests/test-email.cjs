const {boot,source}=require('./helpers.cjs');const assert=require('assert');
const code=source.replace("  addEventListener('pagehide'","  globalThis.mailApi={parseEmailRecipients,emailPayload};\n  addEventListener('pagehide'");const app=boot(code),{parseEmailRecipients,emailPayload}=app.ctx.mailApi;
assert.equal(parseEmailRecipients('one@example.com; ONE@example.com\ntwo@example.com').length,2);assert.throws(()=>parseEmailRecipients('bad@'),/无效/);
const mail=emailPayload({key:'CSP-1',summary:'<script>',assignee:'Person'},[{name:'DEV',sla:'已超期',days:6}],'text','https://example.com',{recipients:['first@example.com','second@example.com']});
assert.equal(mail.to,'first@example.com;second@example.com');assert(!mail.bodyHtml.includes('<script>'));assert(mail.bodyHtml.includes('&lt;script&gt;'));assert.equal(emailPayload({},[],'','',null).enabled,false);console.log('PASS: multi-recipient validation/dedup, project email HTML escaping and unset target disabled');
