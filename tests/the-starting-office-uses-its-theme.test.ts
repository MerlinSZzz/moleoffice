// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { STORAGE_PREFIX } from '../src/web/components/PresetBar.tsx'
import { KEY_PREFIX, KEY_PREFIX_BEFORE_THE_RENAME } from '../src/web/lib/renamedkeys.ts'
import { liveApp, type LiveApp } from './helpers.ts'
let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'starting-theme',viewport:{width:1440,height:900},theDevServerBecause:'The loading notice is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const scenario of [
  {name:'saved dark on a light system',saved:'dark',old:null,system:'light',expected:'dark',denied:false},
  {name:'saved light on a dark system',saved:'light',old:null,system:'dark',expected:'light',denied:false},
  {name:'automatic on a dark system',saved:'auto',old:null,system:'dark',expected:'dark',denied:false},
  {name:'the newer automatic choice over an old dark choice',saved:'auto',old:'dark',system:'light',expected:'light',denied:false},
  {name:'an unknown newer choice over an old dark choice',saved:'unknown',old:'dark',system:'light',expected:'light',denied:false},
  {name:'nothing saved on a light system',saved:null,old:null,system:'light',expected:'light',denied:false},
  {name:'pre-rename dark on a light system',saved:null,old:'dark',system:'light',expected:'dark',denied:false},
  {name:'storage refused on a dark system',saved:null,old:null,system:'dark',expected:'dark',denied:true},
] as const)it(`uses ${scenario.name} before the office answers`,async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900},colorScheme:scenario.system}),page=await context.newPage()
  let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await context.addInitScript(({scenario,key,oldKey})=>{
      if(scenario.denied)Object.defineProperty(window,'localStorage',{get(){throw new Error('Invented storage refusal')}})
      else {
        if(scenario.saved!==null)localStorage.setItem(key,scenario.saved)
        if(scenario.old!==null)localStorage.setItem(oldKey,scenario.old)
      }
      new PerformanceObserver(entries=>{
        if(entries.getEntries().some(entry=>entry.name==='first-paint'))
          (window as unknown as {firstPaintScheme:string}).firstPaintScheme=getComputedStyle(document.documentElement).colorScheme
      }).observe({type:'paint',buffered:true})
    },{scenario,key:`${STORAGE_PREFIX}theme`,oldKey:`${KEY_PREFIX_BEFORE_THE_RENAME}${STORAGE_PREFIX.slice(KEY_PREFIX.length)}theme`})
    await page.route('**/api/office/owner**',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.goto(`${app.site}/#/`,{waitUntil:'domcontentloaded'});await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.locator('.boot-loading').waitFor({timeout:10_000})
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {firstPaintScheme?:string}).firstPaintScheme),{timeout:10_000}).toBe(scenario.expected)
    expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)).toBe(scenario.expected)
    if(!scenario.denied){
      release()
      await expect.poll(()=>page.evaluate(()=>document.documentElement.hasAttribute('data-boot-theme')),{timeout:30_000}).toBe(false)
      expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)).toBe(scenario.expected)
    }
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
