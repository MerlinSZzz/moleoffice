// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useRef, type RefObject } from 'react'
import { THE_PERSON } from '@shared/person.ts'
import type { ChecklistsAcrossReply } from '../api.ts'
import type { AsyncState } from '../components/ui.tsx'

/** Ring the checklist press once when another participant adds an item for this reader. */
export function useChecklistArrivalRing(reading:AsyncState<ChecklistsAcrossReply>,press:RefObject<HTMLButtonElement|null>):void {
  const known=useRef<Set<string>|null>(null)
  const removeRing=useRef<(()=>void)|null>(null)
  useEffect(()=>()=>{removeRing.current?.()},[])
  useEffect(()=>{
    if(reading.status!=='ready')return
    const before=known.current
    const next=new Set<string>()
    let arrived=false
    // A READ OF ONLY THE OPEN ITEMS names each finished one in finishedItems, so the two together are every item.
    for(const list of reading.value.checklists)for(const item of [...list.items,...(list.finishedItems??[])]){
      const key=`${list.workspaceId}:${list.id}:${item.id}`
      next.add(key)
      const author=item.addedBy
      if(before!==null&&!before.has(key)&&author!==undefined&&(author.kind!=='person'||author.id!==THE_PERSON))arrived=true
    }
    known.current=next
    const element=press.current,parent=element?.parentElement
    if(!arrived||!element||!parent)return
    removeRing.current?.()
    const root=getComputedStyle(document.documentElement),box=element.getBoundingClientRect()
    const halo=Number.parseFloat(root.getPropertyValue('--motion-glow-reach'))||0
    const room=Math.max(0,Math.min(box.left-halo,box.top-halo,window.innerWidth-box.right-halo,window.innerHeight-box.bottom-halo))
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const spread=Math.min(reduced?4:12,room)
    const ring=document.createElement('span')
    ring.dataset.checklistArrival=''
    ring.setAttribute('aria-hidden','true')
    Object.assign(ring.style,{
      position:'absolute',pointerEvents:'none',zIndex:'2',boxSizing:'border-box',
      border:'var(--focus-w) solid var(--accent)',borderRadius:getComputedStyle(element).borderRadius,
      filter:root.getPropertyValue('--motion-glow').trim()||'none',
      left:`${element.offsetLeft}px`,top:`${element.offsetTop}px`,width:`${box.width}px`,height:`${box.height}px`,
    })
    parent.append(ring)
    const value=root.getPropertyValue('--motion-linger-period').trim()
    const duration=Number.parseFloat(value)*(value.endsWith('ms')?1:1000)
    const expanded={left:`${element.offsetLeft-spread}px`,top:`${element.offsetTop-spread}px`,width:`${box.width+2*spread}px`,height:`${box.height+2*spread}px`}
    let timer:number|undefined,animation:Animation|undefined
    if(reduced){Object.assign(ring.style,expanded);timer=window.setTimeout(()=>ring.remove(),duration)}
    else {
      animation=ring.animate([{opacity:1},{...expanded,opacity:0}],{duration,easing:root.getPropertyValue('--ease-out').trim(),fill:'forwards'})
      void animation.finished.then(()=>ring.remove(),()=>ring.remove())
    }
    removeRing.current=()=>{if(timer!==undefined)window.clearTimeout(timer);animation?.cancel();ring.remove()}
  },[reading,press])
}
