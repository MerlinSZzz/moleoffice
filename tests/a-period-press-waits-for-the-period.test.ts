// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { t } from '../src/shared/i18n.ts'
import { planPeriodPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'period-press-wait',viewport:{width:1440,height:900}})},240_000)
afterAll(async()=>{await app?.stop()})
for(const outcome of ['motion','reduced','failure'] as const)it(`keeps a ${outcome} light on the next period press`,async()=>{
  const films=outcome==='failure'?undefined:process.env.W13Y_PERIOD_FILMS,theme=process.env.W13Y_PERIOD_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:outcome==='reduced'?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${planPeriodPath('2026-W40')}`);await waitForThePage(page)
    const next=page.getByRole('link',{name:t('g8.schedulePage.next'),exact:true})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — period before',page.locator('h1.px-plan-page'),'period before')
    await page.route('**/api/planning/week/2026-W41',async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(outcome==='failure'?{status:500,headers,body:JSON.stringify({error:'An invented period failure.'})}:{response:answer})})
    await next.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${planPeriodPath('2026-W40')}`)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(async()=>{if(await lights.count()!==1)return false;const frame=await lights.boundingBox(),box=await next.boundingBox();return frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height},{timeout:10_000}).toBe(true)
    const sample=()=>lights.evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample();await page.waitForTimeout(300);const second=await sample();expect(first.some((value,i)=>value!==second[i])).toBe(outcome!=='reduced')
    if(outcome==='failure')await lights.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const animation=animate(frames,options);document.documentElement.dataset.testPeriodFade=String(animation.effect?.getTiming().duration);return animation}})
    if(films)await page.waitForTimeout(1500)
    if(outcome==='reduced')await next.evaluate(element=>{
      const changes=new MutationObserver(()=>{if(!element.isConnected){changes.disconnect();return}if(!document.querySelector('canvas[data-wait-light]'))document.documentElement.dataset.testPeriodFrameGap='yes'})
      changes.observe(document.body,{childList:true,subtree:true})
    })
    release()
    if(outcome==='failure')await expect.poll(()=>page.locator('html').getAttribute('data-test-period-fade'),{timeout:30_000}).toBe('160')
    else { await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${planPeriodPath('2026-W41')}`);await waitForThePage(page);expect(reads).toBe(1);if(films)await putTheMadeUpLabelIn(page,'Made-up data — period after',page.locator('h1.px-plan-page'),'period after') }
    if(outcome==='reduced')expect(await page.locator('html').getAttribute('data-test-period-frame-gap')).toBeNull()
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`period-${theme}-${outcome}.webm`))}
},120_000)


it('a late period answer cannot undo a newer address',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${planPeriodPath('2026-W40')}`);await waitForThePage(page)
    await page.route('**/api/planning/week/2026-W41',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.getByRole('link',{name:t('g8.schedulePage.next'),exact:true}).click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.evaluate(()=>{window.location.hash='#/records'});release();await page.waitForTimeout(500)
    expect(new URL(page.url()).hash).toBe('#/records')
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('follows the newer period press when an older answer comes later',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${planPeriodPath('2026-W40')}`);await waitForThePage(page)
    await page.route('**/api/planning/week/2026-W41',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.getByRole('link',{name:t('g8.schedulePage.next'),exact:true}).click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.getByRole('link',{name:t('g8.schedulePage.previous'),exact:true}).click()
    await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${planPeriodPath('2026-W39')}`)
    release();await page.waitForTimeout(500);expect(new URL(page.url()).hash).toBe(`#${planPeriodPath('2026-W39')}`)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('keeps modified and keyboard activation as ordinary links',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  try{
    await page.goto(`${app.site}/#${planPeriodPath('2026-W40')}`);await waitForThePage(page)
    const link=page.getByRole('link',{name:t('g8.schedulePage.next'),exact:true})
    const allowed=await link.evaluate(element=>{const states:boolean[]=[];for(const options of [{button:0,ctrlKey:true},{button:1}]){document.addEventListener('click',event=>{states.push(!event.defaultPrevented);event.preventDefault()},{once:true});element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,...options}))}return states})
    expect(allowed).toEqual([true,true]);await link.focus();await page.keyboard.press('Enter')
    await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${planPeriodPath('2026-W41')}`)
  }finally{await context.close()}
},120_000)
