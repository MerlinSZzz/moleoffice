// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chromium } from 'playwright'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
const BASE = whereIsTheWebApp()
const id=process.argv[2]; const a=process.argv[3]; const b=process.argv[4]
// A REPORT PAGE DRAWS FIVE OF THE SEVEN POSITIONS since criterion A19 of
// 3 September 2026: a reader goes no lower than the conclusion. Asking it for level 1 or 2 draws
// the conclusion, so this would print "words drawn at label that are not drawn at full" over a
// comparison of the conclusion against full. It refuses instead.
const { READER_RUNGS, isReaderRung } = await import('../src/shared/detail.ts')
for (const r of [a, b]) {
  if (!isReaderRung(r)) throw new Error(`a report page does not draw ${r}; it draws ${[...READER_RUNGS].join(', ')}`)
}
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:1440,height:1200}})
const p=await ctx.newPage()
const read=async(r)=>{
  await p.goto(`${BASE}/#/r/${id}`,{waitUntil:'domcontentloaded'})
  await p.evaluate(x=>window.localStorage.setItem('mole-office.detail',x),r)
  await p.reload({waitUntil:'load'}); await p.waitForSelector('.rd-report'); await p.waitForTimeout(600)
  return await p.evaluate(()=>{
    const body=document.querySelector('.rd-report')
    const skip=new Set()
    for(const el of body.querySelectorAll('.rd-byline, .sb-level, .sb-foot')) for(const w of (el.innerText||'').split(/\s+/)) if(w) skip.add(w)
    return {all:(body.innerText||'').split(/\s+/).filter(Boolean), furn:[...skip]}
  })
}
const A=await read(a); const B=await read(b)
await br.close()
const count=(ws)=>{const m=new Map();for(const w of ws)m.set(w,(m.get(w)??0)+1);return m}
const ca=count(A.all), cb=count(B.all)
const extra=[]
for(const [w,n] of ca){ const m=cb.get(w)??0; if(n>m) extra.push([w,n-m]) }
extra.sort((x,y)=>y[1]-x[1])
console.log(`words drawn at ${a} that are not drawn (as often) at ${b}:`)
console.log(extra.slice(0,40).map(([w,n])=>`${n}x ${JSON.stringify(w)}`).join('\n'))
