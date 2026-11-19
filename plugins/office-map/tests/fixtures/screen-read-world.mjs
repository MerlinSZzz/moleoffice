// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Database-free generated screen shell. No timing instrumentation or live defaults. */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { namedAnswer } from './screen-read-fixtures.mjs'
import { refuseALiveOfficePort } from './the-guarded-ports.mjs'
export async function screenWorld({ built }) {
  const root = resolve(built)
  const script = `
let fixture,theme='light',hold=false,reducedMotion=true,idleOutings,idleSeed,frame;
const trace=window.__screenWorld={reads:[],errors:[],pending:{},maxPerView:{}};
window.configure=value=>{fixture=value.fixture;theme=value.theme??'light';hold=value.hold??false;reducedMotion=value.reducedMotion??true;idleOutings=value.idleOutings;idleSeed=value.idleSeed};
window.openPlugin=()=>{if(!fixture?.synthetic)throw Error('Generated fixture required');frame?.remove();frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');const query=new URLSearchParams();if(hold)query.set('hold','1');if(idleOutings!==undefined)query.set('outings',idleOutings?'1':'0');if(idleSeed!==undefined)query.set('seed',String(idleSeed));frame.src='/plugin/main.html'+(query.size?'?'+query:'');document.querySelector('main').replaceChildren(frame)};
window.closePlugin=()=>{frame?.remove();frame=null};
const namedAnswer=${namedAnswer.toString()};
window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow)return;const m=event.data;if(m?.interface!=='office-read/1')return;
if(m.ask==='ready'){frame.contentWindow.postMessage({interface:'office-read/1',kind:'context',plugin:'office-map',page:'main',language:'en',theme,reducedMotion,project:'synthetic-project-0'},'*');return}
if(m.ask!=='read'){trace.errors.push('Unexpected operation');return}
const read=structuredClone(m);trace.reads.push(read);try{const sent=globalThis.__officeMapRecordRead?.(read);sent?.catch?.(()=>{})}catch{}if(trace.pending[m.view])trace.errors.push('Concurrent '+m.view);trace.pending[m.view]=m.id;trace.maxPerView[m.view]=Math.max(trace.maxPerView[m.view]??0,1);
let body,status=200;try{body=namedAnswer(fixture,m.view,m.query);if(!body)status=404}catch(error){status=400;body={error:error.message};trace.errors.push(error.message)}
delete trace.pending[m.view];frame.contentWindow.postMessage({interface:'office-read/1',kind:'answer',id:m.id,view:m.view,status,tag:null,body},'*');
});`
  const probe = `const query=new URLSearchParams(location.search);window.__officeMapScreenTest={hold:query.has('hold'),selection:[],...(query.has('outings')?{idleOutings:query.get('outings')==='1'}:{}),...(query.has('seed')?{idleSeed:Number(query.get('seed'))}:{})};Object.defineProperty(window,'__officeMapMeasure',{configurable:true,get(){return {layout:window.__officeMapScreenTest.layout}}});const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.kind==='layout')window.__officeMapScreenTest.layout=event.data.layout})}};`
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://generated.invalid').pathname
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><script src="/shell.js"></script><style>body{margin:0}iframe{width:100%;height:1000px;border:0}</style><main></main></html>'); return }
    if (path === '/shell.js' || path === '/screen-probe.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(path === '/shell.js' ? script : probe); return }
    if (!path.startsWith('/plugin/')) { res.writeHead(404).end(); return }
    const file = resolve(root, decodeURIComponent(path.slice('/plugin/'.length)))
    if (!file.startsWith(root + sep)) { res.writeHead(404).end(); return }
    try {
      const extension = extname(file)
      let bytes = readFileSync(file)
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extension] ?? 'application/octet-stream')
      if (extension === '.html') {
        bytes = Buffer.from(bytes.toString().replace('<head>', '<head><script src="/screen-probe.js"></script>'))
        const origin = `http://127.0.0.1:${server.address().port}`
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-eval' ${origin}; style-src 'unsafe-inline' ${origin}; img-src ${origin} data:; worker-src blob:; connect-src 'none'`)
      }
      res.end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const port = server.address().port
  try { refuseALiveOfficePort(port, 'Reserved port') } catch (error) { await new Promise(done => server.close(done)); throw error }
  return { url: `http://127.0.0.1:${port}`, port, close: () => new Promise(done => { server.closeAllConnections(); server.close(done) }) }
}
