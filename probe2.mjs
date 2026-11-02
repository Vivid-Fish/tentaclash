import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const srv = createServer(async (q,r)=>{try{r.writeHead(200,{'content-type':'text/html'});r.end(await readFile('dist/index.html'));}catch(e){r.writeHead(404).end('x');}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
p.on('pageerror',e=>console.log('ERR',String(e)));
await p.goto(`http://127.0.0.1:${srv.address().port}/`,{waitUntil:'load'});
await p.evaluate(()=>{ window.__pd=0; addEventListener('pointerdown',()=>{window.__pd++;},true); });
await p.click('#start'); await p.waitForTimeout(600);
await p.click('#arm-grid .arm-card >> nth=0');
console.log('arm chosen:', await p.evaluate(()=>document.querySelector('#arm-grid .arm-card').textContent.slice(0,30)));
await p.waitForTimeout(3200);
const read = async () => p.evaluate(()=>({n:parseFloat(document.getElementById('grip-needle').style.left),f:parseFloat(document.getElementById('fuel-you').firstElementChild.style.width),pd:window.__pd, call:document.getElementById('call').textContent, round:document.getElementById('round-tag').textContent, opp:document.getElementById('opponent-tag').textContent}));
console.log('before', await read());
for (let i=0;i<6;i++){ await p.touchscreen.tap(300,700); await p.waitForTimeout(200); }
console.log('after 6 spaced taps', await read());
// now a real hold via touch: touchStart then wait
await p.touchscreen.tap(300,700);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:700}]});
await p.waitForTimeout(2000);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
console.log('after a 2s touch hold', await read());
await b.close(); srv.close();
