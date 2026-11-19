// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real slot/CSP/worker rendering over intercepted, clearly synthetic read views.
 * Requires a fresh sandbox world and the built plugin. Never accepts the office's ports.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { firefox } from 'playwright'
import { refuseALiveOfficePort } from './fixtures/the-guarded-ports.mjs'
const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]))
assert(args['--url'] && args['--output'] && args['--browser'], 'Use --url <fresh synthetic world URL> --output <folder> --browser <Firefox executable>')
const target = new URL(args['--url'])
assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.port !== '', 'Use an explicit sandbox test port')
refuseALiveOfficePort(Number(target.port), 'Use an explicit sandbox test port')
const site = target.origin, output = args['--output']
mkdirSync(join(output, 'screenshots'), { recursive: true })
const nativeFetch=globalThis.fetch;globalThis.fetch=(url,options={})=>nativeFetch(url,{signal:AbortSignal.timeout(10000),...options})
const headers={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':'fixture-reader'}
const checks=[], errors=[], requests=[], screens=[]
const catalog=JSON.parse(readFileSync(new URL('../assets/village-catalog.json', import.meta.url),'utf8'))
const hostAttention=JSON.parse(readFileSync(new URL('./host-attention.json',import.meta.url),'utf8'))
const common={interface:'office-read/1',narrowedByPermission:null}
const projects={...common,view:'projects',projects:[{id:'garden',name:'Example Garden'},{id:'library',name:'Example Library'}]}
const names=['tuft','fringe','bun','fan','crest','helmet','waves','part','beret','knit','raincoat','apron','bowtie','backpack','roll','flower']
function hash(v){let h=2166136261;for(const c of v){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
// Deliberately choose synthetic ids that exercise all sixteen fallback looks in catalogue order.
const ids=names.map((_,i)=>{for(let n=0;;n++){const id='sample-'+i+'-'+n;if(hash(JSON.stringify(['agent',id]))%16===i)return id}})
function roster(count){
 const agents=Array.from({length:count},(_,i)=>({kind:'agent',id:ids[i]??'sample-'+i,handle:'example-'+i,name:'Example '+String(i+1).padStart(2,'0'),role:i%16===0?'supervisor':i%16===4?'supervisor':[8,9].includes(i%16)?'inspector':[10,11].includes(i%16)?'secretary':[12,13].includes(i%16)?null:'worker',retired:false,visitor:[14,15].includes(i%16),startedBy:null,createdAt:'2026-01-01 10:'+String(i).padStart(2,'0')+':00',projects:[i%2?'library':'garden'],appearance:{version:99,fixture:'standing-catalogue'},appearanceChosen:true,scale:{version:1,roleAtGeneration:'worker',value:.85},presence:[{project:i%2?'library':'garden',colour:'green',word:'Available'}]}))
 for(let i=0;i<agents.length;i++)if(agents[i].role==='worker')agents[i].startedBy={kind:'agent',id:agents[i%16<4?0:4]?.id??agents[0].id}
 return {...common,view:'people',people:[{kind:'person',id:'reader',handle:'reader',name:'Example Reader'}],agents}
}
let people=roster(16)
const details=['executing','checking','recorded_work','waiting_check','rebuttal','reporting','queued','idle','waiting_message','paused','blocked','failed','completed','task_completed','work_open','unknown']
function work(){return {...common,view:'work',work:people.agents.map((a,i)=>({id:'work-'+i,project:i%2?'library':'garden',agent:a.id,title:'Example work '+String(i+1).padStart(2,'0'),detail:details[i%16],recordedState:{state:'fixture'},doing:'Example activity',executing:i<2,association:'explicit synthetic work',updatedAt:'2026-10-15 08:00:00',runStanding:i%16===12?'closed':i%16===13?'closed unchecked':'working'}))}}
const zero={candidates:0,carried:0,leftOut:0,shortened:0}
let talk={...common,view:'talk',messages:[],last:null,more:false,subtraction:zero,leftOutGroups:[],refusal:null,withdrawn:{ids:[],last:'0',more:false,subtraction:zero,leftOutGroups:[]}}
const current=await fetch(site+'/api/plugins',{headers}).then(r=>r.json());assert.equal(current.plugins.find(p=>p.id==='office-map').state,'off')
const on=await fetch(site+'/api/plugins/office-map/switch',{method:'POST',headers,body:JSON.stringify({on:true})});assert(on.ok)
const browser=await firefox.launch({executablePath:args['--browser'],firefoxUserPrefs:{'javascript.options.wasm':false,'dom.ipc.processCount':1}})
const context=await browser.newContext({viewport:{width:1440,height:1200}})
let missing=false
await context.addInitScript(()=>{
 if(!location.pathname.startsWith('/api/plugins/office-map/files/'))return
 const realNow=Date.now;Date.now=()=>window.__walkTime??realNow();
 const trace={workers:[],requests:[],replies:[],scheduled:0,pending:new Set(),loaded:[],draws:[],labels:[],canvases:[],images:new Set()};window.__trace=trace
 const creating=document.createElement.bind(document)
 document.createElement=(name,...args)=>{const node=creating(name,...args);if(name==='canvas')trace.canvases.push(node);return node}
 const transform=CanvasRenderingContext2D.prototype.setTransform
 CanvasRenderingContext2D.prototype.setTransform=function(...args){const result=transform.call(this,...args),m=this.getTransform();this.__base=[m.a,m.d,m.e,m.f];return result}
 const text=CanvasRenderingContext2D.prototype.fillText
 CanvasRenderingContext2D.prototype.fillText=function(value,...args){if(this.canvas===document.querySelector('.map-plane canvas'))trace.labels.push(String(value));return text.call(this,value,...args)}
 const drawing=CanvasRenderingContext2D.prototype.drawImage
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLImageElement)trace.images.add(image);if(image instanceof HTMLImageElement&&/village-\d-/.test(image.src)&&args.length===8)trace.draws.push({source:new URL(image.src).pathname,args,matrix:[this.getTransform().a,this.getTransform().d,this.getTransform().e,this.getTransform().f],at:Date.now(),base:this.__base,map:this.canvas===document.querySelector('.map-plane canvas')});if(trace.draws.length>20000)trace.draws.splice(0,10000);return drawing.call(this,image,...args)}
 const Native=window.Worker;window.Worker=class extends Native{
  constructor(...args){super(...args);this.n=trace.workers.length;trace.workers.push({terminated:false});this.addEventListener('message',e=>trace.replies.push(e.data))}
  postMessage(data,...args){trace.requests.push(data);return super.postMessage(data,...args)}
  terminate(){trace.workers[this.n].terminated=true;return super.terminate()}
 }
 const raf=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window)
 window.requestAnimationFrame=fn=>{trace.scheduled++;let id=raf(t=>{trace.pending.delete(id);fn(t)});trace.pending.add(id);return id}
 window.cancelAnimationFrame=id=>{trace.pending.delete(id);cancel(id)}
})
await context.route('**/api/plugin-read/v1/**',async route=>{
 const request=route.request(), url=new URL(request.url()),view=url.pathname.split('/').at(-1);requests.push({view,method:request.method()})
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(view==='projects'?projects:view==='people'?people:view==='work'?work():talk)})
})
// Host attention is outside this map fixture. Starting its extra Node/tsx worker
// exceeds the preview command's virtual-memory limit before the plugin opens.
await context.route('**/api/attention**',route=>{
 const shape=new URL(route.request().url()).searchParams.get('shape')
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(shape==='other-projects'?{at:hostAttention.home.at,projects:[]}:shape==='home'?hostAttention.home:hostAttention.whole)})
})
await context.route('**/api/plugins/office-map/files/**',async route=>{
 if(missing&&/village-1-.*\.png$/.test(route.request().url()))await route.fulfill({status:404,body:'Synthetic missing atlas'})
 else await route.continue()
})
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
let opens=0
async function open(){
 await page.goto(site+'/?lang=en&village='+String(++opens)+'#/plugin/office-map/main',{waitUntil:'domcontentloaded'})
 const iframe=page.locator('iframe.plgp-frame');await iframe.waitFor({timeout:15000});assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts')
 const frame=await(await iframe.elementHandle()).contentFrame()
 await frame.waitForFunction(()=>window.__trace?.replies.some(r=>r.kind==='layout'),null,{polling:50,timeout:15000})
 await frame.waitForFunction(()=>document.querySelector('#art-error')?.textContent!=='Loading woodland art.'&&(shown=>shown.length===1&&shown[0].textContent.startsWith('Last read'))([...document.querySelectorAll('.read-status p')].filter(n=>n.textContent)),null,{polling:50});await new Promise(r=>setTimeout(r,150))
 return frame
}
async function layout(frame){return frame.evaluate(()=>window.__trace.replies.filter(r=>r.kind==='layout').at(-1).layout)}
async function photo(frame,name){await frame.locator('.map-overview').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,'screenshots',name+'.png'),fullPage:true});screens.push(name+'.png')}
try{
 let frame
 for(const count of [3,16,60]){
  people=roster(count);frame=await open();await frame.getByRole('button',{name:'Fit office',exact:true}).click()
  const original=await layout(frame);writeFileSync(join(output,`layout-${count}.json`),JSON.stringify(original,null,2));assert.equal(Object.keys(original.seats).length,count)
  if(count===16){
   const styles=original.houses.map(h=>h.style)
   assert(styles.some(s=>s.startsWith('A'))&&styles.some(s=>s.startsWith('B')),'Both approved house families')
   for(let i=0;i<styles.length;i++){if(i>=2)assert.notEqual(styles[i],styles[i-2]);if(i%2)assert.notEqual(styles[i],styles[i-1])}
   const repeated=await open();assert.deepEqual((await layout(repeated)).houses,original.houses);frame=repeated
   checks.push({check:'repeated sixteen-agent roster keeps exact variants, with both families and different neighbours',styles,passed:true})
  }
  assert.equal(await frame.evaluate(()=>self.origin),'null')
  assert.equal(await frame.locator('#art-error').innerText(),'')
  for(const theme of ['light','dark'])for(const quiet of [false,true]){
   await page.emulateMedia({colorScheme:theme,reducedMotion:'no-preference'})
   await frame.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme,{polling:50})
   const button=frame.getByRole('button',{name:'Quiet view',exact:true});if((await button.getAttribute('aria-pressed'))!==String(quiet))await button.click()
   await frame.evaluate(()=>{window.__trace.draws=[];window.__trace.labels=[]})
   await frame.getByRole('button',{name:'Fit office',exact:true}).click();await new Promise(r=>setTimeout(r,150));await photo(frame,`${count}-${theme}-${quiet?'quiet':'normal'}`)
   assert.deepEqual((await layout(frame)).seats,original.seats)
   assert.equal(await frame.evaluate(()=>window.__trace.pending.size),0)
   if(count===16&&!quiet){
    const draws=await frame.evaluate(()=>window.__trace.draws),labels=await frame.evaluate(()=>window.__trace.labels)
    for(const id of ['carry-fan','carry-crest','carry-helmet','cheer-bowtie','stand-backpack']){const sprite=catalog.sprites[id];assert(draws.some(d=>d.map&&d.source.includes(sprite.atlas+'-')&&d.args.slice(0,4).every((v,i)=>v===sprite.rect[i])),id)}
    for(const label of ['● Working','◇ Checking','△ Waiting','Ⅱ Paused','! Handle','✓ Done','? Unsure'])assert(labels.includes(label),'Canvas badge '+label)
   }
  }
  checks.push({check:'normal and quiet in both themes',count,houses:original.houses.length,groups:original.rooms.length,mode:await frame.locator('.map-plane canvas').getAttribute('data-mode'),passed:true})
  if(count===16){
   const draws=await frame.evaluate(()=>window.__trace.draws),scale=.80+(.85-.3)/(1.6-.3)*.12
   const nativeOrigins=[]
   for(let i=0;i<16;i++){
    const sprite=catalog.sprites['stand-'+names[i]],seat=original.seats[JSON.stringify(['agent',ids[i]])]
    const expected=[...sprite.rect,(sprite.trim[0]-sprite.anchor[0])*scale,(sprite.trim[1]-sprite.anchor[1])*scale,sprite.rect[2]*scale,sprite.rect[3]*scale]
    const matches=draws.filter(d=>d.map&&d.source.includes(sprite.atlas+'-')&&d.args.every((v,j)=>Math.abs(v-expected[j])<.0001))
    const grounds=matches.filter(d=>d.base).map(d=>({x:(d.matrix[2]-d.base[2])/d.base[0],y:(d.matrix[3]-d.base[3])/d.base[1]}))
    const correct=grounds.some(p=>Math.abs(p.x-seat.foot.x)<.01&&Math.abs(p.y-seat.foot.y)<.01)
    nativeOrigins.push({look:names[i],expected:seat.foot,grounds,correct})
    writeFileSync(join(output,'native-origin-evidence.json'),JSON.stringify(nativeOrigins,null,2))
    assert(correct,'Standing renderer frame '+names[i])
   }
   checks.push({check:'all sixteen exact atlas frames drawn at their grounded seats with the saved-scale conversion',passed:true})
   if(await frame.getByRole('button',{name:'Quiet view',exact:true}).getAttribute('aria-pressed')==='true')await frame.getByRole('button',{name:'Quiet view',exact:true}).click();await page.emulateMedia({colorScheme:'light'})
   await frame.locator('.room-navigation').evaluate(n=>n.open=true)
   const roomButtons=frame.getByRole('button',{name:'Show room',exact:false});
   for(const [kind,choose] of [['stone',h=>h.style==='A02'],['garden',h=>h.style.startsWith('B')]]){
    const house=original.houses.find(choose);assert(house,'A '+kind+' house in the sixteen-agent fixture')
    await roomButtons.nth(original.rooms.findIndex(r=>r.id===house.group)).click()
    await photo(frame,'16-close-'+kind)
   }
   if(await roomButtons.count())await roomButtons.first().click()
   for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme});await frame.waitForFunction(t=>document.documentElement.dataset.theme===t,theme,{polling:50});await photo(frame,'16-close-'+theme)
   }
   await page.emulateMedia({colorScheme:'light'})
   await frame.locator('select').selectOption('library');assert.deepEqual((await layout(frame)).seats,original.seats)
   checks.push({check:'project filter preserves seats',passed:true})
   await frame.locator('select').selectOption('');await frame.locator('input[type=search]').fill('Example 01')
   await frame.locator('.roster-panel .roster-list button').filter({hasText:'Example 01'}).first().click()
   await frame.waitForFunction(()=>document.querySelector('.detail-panel')?.textContent.includes('The saved look cannot be drawn'),null,{polling:50})
   await photo(frame,'16-standing-details')
   await frame.evaluate(()=>window.__oldDetail=document.querySelector('.standing-preview'))
   await frame.getByRole('button',{name:'Refresh',exact:true}).click()
   await frame.waitForFunction(()=>window.__oldDetail.width===1&&document.querySelector('.standing-preview')?.width===256,null,{polling:50})
   checks.push({check:'refresh releases the previous detail bitmap before replacing it',passed:true})
   await frame.evaluate(()=>window.__oldDetail=document.querySelector('.standing-preview'))
   await frame.getByRole('button',{name:'Close details',exact:true}).click()
   assert.equal(await frame.evaluate(()=>window.__oldDetail.width),1)
   checks.push({check:'closing details releases the preview bitmap',passed:true})
   await frame.locator('input[type=search]').fill('')
   await frame.getByRole('button',{name:'Fit office',exact:true}).click()
   // Local wave is an explicit preview. Quiet view cancels it and every gait drawing.
   await frame.locator('.roster-panel .roster-list button').first().click()
   await frame.getByRole('button',{name:'Preview wave',exact:true}).click()
   await photo(frame,'16-local-wave')
   await frame.getByRole('button',{name:'Quiet view',exact:true}).click()
   assert.equal(await frame.getByRole('button',{name:'Preview wave',exact:true}).getAttribute('aria-pressed'),'false')
   await frame.getByRole('button',{name:'Quiet view',exact:true}).click()
   await frame.getByRole('button',{name:'Fit office',exact:true}).click()
   for(let n=0;n<6;n++)await frame.getByRole('button',{name:'Zoom in',exact:true}).click()
   await frame.getByRole('button',{name:'Locate',exact:true}).click()
   // Populate a new baseline first; it must remain still even with message metadata.
   const contact={id:'sample-contact',at:'2026-10-15 10:00:00',project:'garden',from:{kind:'agent',id:ids[0]},to:[{kind:'agent',id:ids[1]}]}
   talk={...talk,messages:[contact],last:'2026-10-15 10:00:00~sample-contact'}
   await frame.getByRole('button',{name:'Refresh',exact:true}).click();await new Promise(r=>setTimeout(r,200))
   assert.equal(await frame.locator('.map-plane canvas').getAttribute('data-moving'),'0')
   checks.push({check:'populated return baseline does not animate',passed:true})
   talk={...talk,messages:[{...contact,id:'new-contact'}],last:'2026-10-15 10:00:01~new-contact'}
   await frame.evaluate(()=>{window.__walkTime=Date.now();window.__trace.draws=[]})
   await frame.getByRole('button',{name:'Refresh',exact:true}).click()
   await frame.waitForFunction(()=>document.querySelector('.map-plane canvas')?.dataset.moving==='1',null,{polling:20,timeout:10000})
   const started=await frame.evaluate(()=>Date.now())
   const strip=[]
   for(const [elapsed,action] of [[0,'A'],[200,'pass'],[400,'B'],[600,'pass'],[800,'A']]){
    await frame.evaluate(t=>{window.__walkTime=t;window.__trace.draws=[]},started+elapsed)
    await frame.waitForFunction(()=>window.__trace.draws.length>0,null,{polling:20})
    const draws=await frame.evaluate(()=>window.__trace.draws),sprite=catalog.sprites['walk-tuft-'+action]
    assert(draws.some(d=>d.source.includes(sprite.atlas+'-')&&d.args.slice(0,4).every((n,i)=>n===sprite.rect[i])),'Actual gait drawing '+action)
    strip.push({elapsed,action,draws:draws.filter(d=>d.args.slice(0,4).every((n,i)=>n===sprite.rect[i]))})
    await frame.locator('.map-viewport').screenshot({path:join(output,'screenshots',`walk-${elapsed}.png`)})
   }
   writeFileSync(join(output,'walk-frame-evidence.json'),JSON.stringify(strip,null,2))
   await photo(frame,'16-walk-mid-stride')
   await frame.getByRole('button',{name:'Quiet view',exact:true}).click()
   await frame.evaluate(()=>window.__trace.draws=[])
   await frame.getByRole('button',{name:'Fit office',exact:true}).click()
   await new Promise(r=>setTimeout(r,100))
   const quietDraws=await frame.evaluate(()=>window.__trace.draws)
   const activeFrames=Object.entries(catalog.sprites).filter(([id])=>/^(walk|carry|cheer|wave)-/.test(id)).map(([,f])=>f)
   assert(!quietDraws.some(d=>activeFrames.some(f=>d.source.includes(f.atlas+'-')&&d.args.slice(0,4).every((n,i)=>n===f.rect[i]))))
   assert.equal(await frame.evaluate(()=>window.__trace.pending.size),0)
   await photo(frame,'16-quiet-after-walk')
   await frame.getByRole('button',{name:'Quiet view',exact:true}).click()
   await page.emulateMedia({reducedMotion:'reduce'})
   await frame.waitForFunction(()=>document.body.textContent.includes('Reduced motion:'),null,{polling:20})
   await frame.evaluate(()=>window.__trace.draws=[])
   await frame.getByRole('button',{name:'Fit office',exact:true}).click();await new Promise(r=>setTimeout(r,100))
   assert(!(await frame.evaluate(()=>window.__trace.draws)).some(d=>activeFrames.some(f=>d.source.includes(f.atlas+'-')&&d.args.slice(0,4).every((n,i)=>n===f.rect[i]))))
   assert.equal(await frame.evaluate(()=>window.__trace.pending.size),0)
   await photo(frame,'16-reduced-motion')
   await frame.evaluate(()=>delete window.__walkTime);await page.emulateMedia({reducedMotion:'no-preference'})
   talk={...talk,messages:[],last:'2026-10-15 10:00:01~new-contact'}
   checks.push({check:'real worker route draws A/pass/B/pass and quiet/reduced motion draw only standing, with zero pending frames',passed:true})
   for(const width of [990,660,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:1200});await page.emulateMedia({colorScheme:theme})
    await frame.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme,{polling:50})
    await frame.getByRole('button',{name:'Fit office',exact:true}).click();await new Promise(r=>setTimeout(r,100))
    const size=await frame.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,surface:Number(document.querySelector('.map-plane canvas').dataset.surfaceBytes)}))
    assert(size.content<=size.viewport);assert(size.surface<=20*1024*1024)
    await photo(frame,`16-${width}-${theme}`);checks.push({check:'responsive village',width,theme,...size,passed:true})
   }
   await page.setViewportSize({width:1440,height:1200});await page.emulateMedia({colorScheme:'light'})
   await frame.evaluate(()=>dispatchEvent(new Event('pagehide')))
   assert(await frame.evaluate(()=>window.__trace.canvases.every(c=>c.width===1&&c.height===1)&&window.__trace.workers.every(w=>w.terminated)&&window.__trace.pending.size===0&&[...window.__trace.images].every(im=>im.getAttribute('src')==='')))
   checks.push({check:'pagehide releases all map, terrain and detail canvases, workers and animation frames',passed:true})
  }
 }
 missing=true;people=roster(3);frame=await open();assert((await frame.locator('#art-error').innerText()).includes('unavailable'))
 await frame.getByRole('button',{name:'Fit office',exact:true}).click();await photo(frame,'missing-atlas')
 assert.equal(Object.keys((await layout(frame)).seats).length,3)
 await frame.locator('.roster-panel .roster-list button').first().click();assert((await frame.locator('.detail-panel').innerText()).includes('Example'))
 checks.push({check:'missing atlas retains shapes, names, inspection and an honest art message',passed:true})
 assert(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[])
 writeFileSync(join(output,'browser-results.json'),JSON.stringify({checks,errors,requests,screens},null,2))
 console.log(JSON.stringify({checks,errors,screens},null,2))
}catch(error){
 console.error('Browser fixture failed before cleanup:',error);throw error
}finally{
 await browser.close()
 const off=await fetch(site+'/api/plugins/office-map/switch',{method:'POST',headers,body:JSON.stringify({on:false})});assert(off.ok)
}
