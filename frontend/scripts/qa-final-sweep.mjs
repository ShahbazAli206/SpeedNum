import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const BASE = process.argv[2] ?? "http://localhost:3111";
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9345;
const ROUTES = ["/workflows","/workflows/new","/team","/reporting","/import","/integrations","/admin","/admin/backups","/engagements","/engagements/new"];
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const ERROR_STRINGS = ["Could not load","No firm is linked","not connected","Something went wrong","Cannot read propert","Internal Server Error","undefined is not a function"];
async function main(){
  const chrome = spawn(CHROME,[`--remote-debugging-port=${PORT}`,"--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--user-data-dir="+(process.env.TEMP??"/tmp")+"/qa-final-sweep-profile","--window-size=1440,900","about:blank"]);
  const target = await waitForTarget();
  const socket = new WebSocket(target);
  await new Promise((res,rej)=>{socket.addEventListener("open",res,{once:true});socket.addEventListener("error",rej,{once:true});});
  let nextId=0; const pending=new Map(); const listeners=[];
  socket.addEventListener("message",(e)=>{const m=JSON.parse(e.data);if(m.id!==undefined){pending.get(m.id)?.(m);pending.delete(m.id);}else{for(const l of listeners) l(m);}});
  const send=(method,params={})=>new Promise(res=>{const id=++nextId;pending.set(id,(m)=>res(m.result??m.error));socket.send(JSON.stringify({id,method,params}));});
  let problems=[]; let currentStatus=null;
  listeners.push((m)=>{
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error"){const t=m.params.args.map(a=>a.value??a.description??"").join(" ");if(!IGNORE.some(p=>p.test(t)))problems.push(`console.error: ${t}`);}
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;const t=d.exception?.description??d.text??"unknown";if(!IGNORE.some(p=>p.test(t)))problems.push(`exception: ${t}`);}
    if(m.method==="Network.responseReceived"){if(m.params.type==="Document")currentStatus=m.params.response.status;}
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  const evaluate=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description??"threw"};return r?.result?.value;};
  const goto=async(p)=>{await send("Page.navigate",{url:`${BASE}${p}`});await sleep(1800);};
  await goto("/login");
  await evaluate(`(() => { const setVal=(el,val)=>{const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));}; setVal(document.querySelector('input[type="email"]'),${JSON.stringify(EMAIL)}); setVal(document.querySelector('input[type="password"]'),${JSON.stringify(PASSWORD)}); })()`);
  await sleep(200);
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/sign in/i.test(b.textContent||"")); if(b) b.click(); })()`);
  for (let i=0;i<15;i++){ await sleep(500); const p = await evaluate('location.pathname'); if (p!=='/login') break; }

  const results=[];
  for (const route of ROUTES){
    problems=[]; currentStatus=null;
    await goto(route);
    const bodyText = await evaluate(`document.body.textContent`);
    const matched = ERROR_STRINGS.filter(s=>bodyText && bodyText.includes(s));
    results.push({route, status: currentStatus, problems:[...problems], matched});
  }
  socket.close(); chrome.kill();
  let failures=0;
  for (const r of results){
    const clean = r.problems.length===0 && r.matched.length===0;
    if (r.status!==200 || !clean) failures+=1;
    console.log(`${clean && r.status===200 ? "ok  ":"FAIL"} ${String(r.status).padEnd(3)} ${r.route}`);
    for (const p of r.problems.slice(0,5)) console.log(`       ${p}`);
    for (const p of r.matched) console.log(`       ERROR TEXT: "${p}"`);
  }
  console.log(`\n${results.length-failures}/${results.length} routes clean`);
  process.exit(0);
}
async function waitForTarget(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const t=await r.json();const p=t.find(e=>e.type==="page");if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
main().catch(e=>{console.error(e);process.exit(2);});
