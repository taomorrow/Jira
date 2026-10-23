const vm=require('vm'),fs=require('fs'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../jiraMonitor.user.js','utf8');
class Element {
 constructor(tag){this.tag=tag;this.style={};this.children=[];this.attrs={};this.isConnected=false;}
 set innerHTML(v){throw Error('TrustedHTML required');}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...xs){for(const x of xs){this.children=this.children.filter(y=>y!==x);this.children.push(x);x.isConnected=true;}}
 attachShadow(){this.shadowRoot=new Element('shadow');return this.shadowRoot;}
 descendants(){return this.children.flatMap(x=>[x,...(x.descendants?.()||[])]);}
 querySelector(q){return this.descendants().find(x=>q.startsWith('[')&&q.slice(1,-1) in (x.attrs||{}))||null;}
 replaceChildren(){this.children=[];}
}
function boot(code,options={}){const body=new Element('body'),root=new Element('html'),menus=[];const storage=new Map();const ctx={document:{body,documentElement:root,createElement:t=>new Element(t),createTextNode:text=>({textContent:text}),querySelector:options.querySelector||(()=>null),querySelectorAll:()=>[]},location:options.location||{pathname:'/issues/',href:'https://jira.xpaas.lenovo.com/issues/?filter=-1'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},GM_registerMenuCommand:(name,fn)=>menus.push({name,fn}),setInterval:()=>0,setTimeout:()=>0,addEventListener:()=>{},console:{error:()=>{}},URL};ctx.window={};ctx.window.top=ctx.window.self=ctx.window;Object.assign(ctx,options.globals||{});vm.runInNewContext(code,ctx);return {body,root,menus,ctx,storage};}

module.exports={boot,source};
