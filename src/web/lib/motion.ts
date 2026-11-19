// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useLayoutEffect, useState } from 'react'

/** A jump is immediate when the reader asks for reduced motion. */
export function behaviorForJump():ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

const jumping = new WeakMap<Element, () => void>()

/**
 * Mark the destination once the scroll settles; a reduced-motion jump marks it immediately.
 *
 * WITH REDUCED MOTION THE MARK IS STILL AND THEN FADES. Nothing moves and nothing is animated while it is shown.
 * For the first half of the linger period the wash and its edge are held as they are; in the second half their
 * colours change back to the element's own, and at the end of the period the element's own style is put back.
 * Only colours change: the edge keeps its width while it fades to clear, so nothing shrinks or moves.
 *
 * THE FADE'S TRANSITION IS SET AS IMPORTANT. Under reduced motion the stylesheet cuts every transition to nothing
 * (styles.css), and that rule is about things that move. A change of colour does not move, and without this the
 * mark would vanish at once instead of fading.
 */
export function washJumpTarget(target:HTMLElement):void {
  jumping.get(target)?.()
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let timer=0,animation:Animation|null=null,started=false
  const previousBackground=target.style.backgroundColor,previousShadow=target.style.boxShadow
  const previousTransition=target.style.getPropertyValue('transition'),previousTransitionPriority=target.style.getPropertyPriority('transition')
  const clean=()=>{
    window.clearTimeout(timer)
    window.removeEventListener('scrollend',start,true)
    animation?.cancel()
    if(reduced&&started){target.style.backgroundColor=previousBackground;target.style.boxShadow=previousShadow;target.style.setProperty('transition',previousTransition,previousTransitionPriority)}
    jumping.delete(target)
  }
  const start=()=>{
    if(started)return
    started=true
    window.clearTimeout(timer)
    window.removeEventListener('scrollend',start,true)
    if(!target.isConnected){jumping.delete(target);return}
    const root=getComputedStyle(document.documentElement),style=getComputedStyle(target)
    const durationWord=root.getPropertyValue('--motion-linger-period').trim()
    const duration=Number.parseFloat(durationWord)*(durationWord.endsWith('ms')?1:1000)
    const wash=root.getPropertyValue('--accent-soft').trim(),edge=root.getPropertyValue('--accent').trim(),width=root.getPropertyValue('--focus-w').trim()
    if(reduced){
      const ownBackground=style.backgroundColor,half=duration/2
      target.style.setProperty('transition','none','important')
      target.style.backgroundColor=wash
      target.style.boxShadow=`inset 0 0 0 ${width} ${edge}`
      timer=window.setTimeout(()=>{
        target.style.setProperty('transition',`background-color ${String(half)}ms linear, box-shadow ${String(half)}ms linear`,'important')
        target.style.backgroundColor=ownBackground
        target.style.boxShadow=`inset 0 0 0 ${width} transparent`
        timer=window.setTimeout(clean,half)
      },half)
    }else{
      animation=target.animate([{backgroundColor:wash,boxShadow:`inset 0 0 0 ${width} ${edge}`},{backgroundColor:style.backgroundColor,boxShadow:style.boxShadow}],{duration,easing:root.getPropertyValue('--ease-out').trim()})
      void animation.finished.then(()=>{jumping.delete(target)},()=>{})
    }
  }
  jumping.set(target,clean)
  if(reduced)start()
  else {window.addEventListener('scrollend',start,true);timer=window.setTimeout(start,700)}
}

/** Keep a closing panel mounted only for the shared closing duration. */
export function usePanelPresence(open:boolean):boolean {
  const [present,setPresent]=useState(open)
  useLayoutEffect(()=>{
    if(open){setPresent(true);return}
    if(!present)return
    const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim()
    const duration=Number.parseFloat(value)*(value.endsWith('ms')?1:1000)
    if(duration===0){setPresent(false);return}
    const timer=window.setTimeout(()=>setPresent(false),duration)
    return ()=>window.clearTimeout(timer)
  },[open,present])
  return open||present
}
