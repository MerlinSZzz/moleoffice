// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'check-again-wait',viewport:{width:1440,height:900},theDevServerBecause:'The machine reading wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const fails of [false,true])for(const reduced of fails?[false]:[false,true])it(`keeps the Check again light until the read ${fails?'fails':'answers'}, ${reduced?'reduced':'motion'}`,async()=>{
  const films=fails?undefined:process.env.W13Y_CHECK_FILMS,theme=process.env.W13Y_CHECK_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('sessions')}`);await waitForThePage(page)
    const press=page.locator('.sx-read-act .px-btn').first();await press.waitFor({timeout:30_000})
    expect(await press.textContent()).toContain(t('g6a.sessions.checkAgain'))
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — Check again',page.locator('.sx-read').first(),'Check again')
    await page.route('**/api/sessions',async route=>{const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented machine reading failure.'})}:{response:answer})})
    await press.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(async()=>{if(await lights.count()!==1)return false;const frame=await lights.boundingBox(),box=await press.boundingBox();return frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height},{timeout:10_000}).toBe(true)
    const sample=()=>lights.evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample();await page.waitForTimeout(300);const second=await sample();expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(1400)
    await lights.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const animation=animate(frames,options);document.documentElement.dataset.testCheckFade=String(animation.effect?.getTiming().duration);return animation}})
    const token=fails?'--motion-quick':'--motion-settle'
    const expected=await page.evaluate(name=>{const value=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)},token)
    release();if(!reduced)await expect.poll(()=>page.locator('html').getAttribute('data-test-check-fade'),{timeout:30_000}).toBe(String(expected))
    if(fails)await page.locator('.sx-read-failed').waitFor({timeout:30_000})
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`check-wait-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)
