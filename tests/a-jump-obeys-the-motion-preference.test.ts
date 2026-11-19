// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'jump-motion',viewport:{width:1440,height:900},theDevServerBecause:'The browser checks the jump before its production build.'})},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`a real jump ${reduced?'lands immediately':'glides'} with the ${reduced?'reduced':'ordinary'} setting`,async()=>{
  const context=await app.browser.newContext({reducedMotion:reduced?'reduce':'no-preference'})
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    const positions=await page.evaluate(async()=>{
      const modulePath='/lib/motion.ts'
      const load=new Function('path','return import(path)') as (path:string)=>Promise<{behaviorForJump:()=>ScrollBehavior}>
      const {behaviorForJump}=await load(modulePath)
      const box=document.createElement('div'),inside=document.createElement('div')
      Object.assign(box.style,{position:'fixed',left:'0',top:'0',height:'200px',width:'200px',overflow:'auto',zIndex:'10000'})
      inside.style.height='2000px';box.append(inside);document.body.append(box)
      box.scrollTo({top:1000,behavior:behaviorForJump()})
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
      const early=box.scrollTop
      await new Promise(resolve=>setTimeout(resolve,1000))
      const settled=box.scrollTop
      box.remove()
      return {early,settled}
    })
    expect(positions.settled).toBe(1000)
    if(reduced)expect(positions.early).toBe(positions.settled)
    else expect(positions.early).toBeLessThan(positions.settled)
  }finally{await context.close()}
},120_000)
