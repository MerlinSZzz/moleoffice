// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

type Point = {x:number;y:number}

/** A point measured by distance, clockwise around a rounded frame. */
function pointOnFrame(distance:number, width:number, height:number, radius:number):Point {
  const r=Math.min(radius,width/2,height/2)
  const horizontal=width-2*r, vertical=height-2*r, corner=Math.PI*r/2
  const perimeter=2*(horizontal+vertical)+4*corner
  let d=((distance%perimeter)+perimeter)%perimeter
  if(d<horizontal)return {x:r+d,y:0};d-=horizontal
  if(d<corner){const a=-Math.PI/2+d/r;return {x:width-r+r*Math.cos(a),y:r+r*Math.sin(a)}}d-=corner
  if(d<vertical)return {x:width,y:r+d};d-=vertical
  if(d<corner){const a=d/r;return {x:width-r+r*Math.cos(a),y:height-r+r*Math.sin(a)}}d-=corner
  if(d<horizontal)return {x:width-r-d,y:height};d-=horizontal
  if(d<corner){const a=Math.PI/2+d/r;return {x:r+r*Math.cos(a),y:height-r+r*Math.sin(a)}}d-=corner
  if(d<vertical)return {x:0,y:height-r-d};d-=vertical
  if(r===0)return {x:0,y:0}
  const a=Math.PI+d/r
  return {x:r+r*Math.cos(a),y:r+r*Math.sin(a)}
}

function timeInMilliseconds(value:string):number {
  const number=Number.parseFloat(value)
  return value.trim().endsWith('ms')?number:number*1000
}

/** Where a frame may be drawn, including the edges of scrolling and clipping ancestors. */
function roomAround(element:HTMLElement, halo:number, desired:number):number {
  const rect=element.getBoundingClientRect()
  let left=0,top=0,right=window.innerWidth,bottom=window.innerHeight
  for(let parent=element.parentElement;parent;parent=parent.parentElement) {
    const style=getComputedStyle(parent)
    const clipsX=/(auto|scroll|hidden|clip)/.test(style.overflowX),clipsY=/(auto|scroll|hidden|clip)/.test(style.overflowY)
    if(!clipsX&&!clipsY)continue
    const bounds=parent.getBoundingClientRect()
    if(clipsX){left=Math.max(left,bounds.left);right=Math.min(right,bounds.right)}
    if(clipsY){top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom)}
  }
  return Math.max(0,Math.min(desired,rect.left-left-halo,rect.top-top-halo,right-rect.right-halo,bottom-rect.bottom-halo))
}

/**
 * HOW A WAIT ENDED, and so how its light ends. Only a proven success lights the whole frame, and only a known failure
 * fades. An answer nobody proved ends plainly, the light simply goes, as it does when the part itself has gone: a wait
 * that merely ended is not a success, because a light that says it worked must mean it worked.
 */
export type LightEnd='success'|'failed'|'unknown'|'gone'

/**
 * Draw a light by distance along the frame, not by angle about its centre. The short gradients meet
 * at their ends, making a continuous fading tail even as it passes around the corners.
 */
function startLight(element:HTMLElement,desiredGap:number) {
  const canvas=document.createElement('canvas')
  canvas.setAttribute('aria-hidden','true')
  canvas.dataset.waitLight=''
  Object.assign(canvas.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483646',margin:'0',padding:'0',border:'0',background:'transparent',right:'auto',bottom:'auto'})
  // A modal is in the browser's top layer, above every ordinary z-index. Put its light in
  // that layer too, as a non-interactive popover, so the modal cannot cover its own frame.
  const modal=element.closest<HTMLDialogElement>('dialog:modal')
  if(modal!==null)canvas.setAttribute('popover','manual')
  document.body.append(canvas)
  if(modal!==null)canvas.showPopover()
  const context=canvas.getContext('2d')
  if(context===null){canvas.remove();return {finish:(_outcome:LightEnd)=>{}}}
  const probe=document.createElement('span')
  Object.assign(probe.style,{color:'var(--accent)',position:'fixed',visibility:'hidden'})
  document.body.append(probe)
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame=0,ended=false,lastWidth=0,lastHeight=0
  // THE LAST BOX THE LIGHT WAS DRAWN AROUND. A wait whose part is gone when its answer arrives still has a place:
  // the frame settles where it last stood, as the list's loading frame does when the rows it framed go.
  let lastBox:DOMRect|null=null,lastGap=desiredGap
  const started=performance.now()
  const paint=(now:number,whole=false,boxOverride?:DOMRect):void=>{
    const live=boxOverride===undefined
    const box=boxOverride??element.getBoundingClientRect()
    const modals=document.querySelectorAll<HTMLDialogElement>('dialog:modal')
    if((modal!==null&&modals[modals.length-1]!==modal)||box.right<0||box.bottom<0||box.left>window.innerWidth||box.top>window.innerHeight){canvas.style.visibility='hidden';return}
    canvas.style.visibility='visible'
    const root=getComputedStyle(document.documentElement),style=getComputedStyle(element)
    const halo=Number.parseFloat(root.getPropertyValue('--motion-glow-reach'))||0
    const gap=live?roomAround(element,halo,desiredGap):lastGap
    if(live){lastBox=box;lastGap=gap}
    const width=box.width+2*gap,height=box.height+2*gap,margin=halo+2
    if(width<=0||height<=0)return
    const ratio=window.devicePixelRatio||1, canvasWidth=Math.ceil((width+2*margin)*ratio),canvasHeight=Math.ceil((height+2*margin)*ratio)
    if(canvasWidth!==lastWidth||canvasHeight!==lastHeight){canvas.width=canvasWidth;canvas.height=canvasHeight;lastWidth=canvasWidth;lastHeight=canvasHeight}
    Object.assign(canvas.style,{left:`${box.left-gap-margin}px`,top:`${box.top-gap-margin}px`,width:`${width+2*margin}px`,height:`${height+2*margin}px`,filter:root.getPropertyValue('--motion-glow').trim()||'none'})
    context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width+2*margin,height+2*margin)
    context.translate(margin,margin);context.lineWidth=Number.parseFloat(root.getPropertyValue('--focus-w'))
    const corner=style.borderTopLeftRadius,cornerValue=Number.parseFloat(corner)||0
    const partRadius=corner.endsWith('%')?Math.min(box.width,box.height)*cornerValue/100:cornerValue
    const radius=Math.min(partRadius+gap,width/2,height/2)
    const perimeter=2*(width+height-4*radius)+2*Math.PI*radius
    const color=root.getPropertyValue('--accent').trim()
    if(whole||reduced.matches){
      context.strokeStyle=color;context.beginPath();context.roundRect(0,0,width,height,radius);context.stroke()
    } else {
      const lap=timeInMilliseconds(root.getPropertyValue(perimeter>1000?'--motion-lap-wide':'--motion-lap'))
      const head=((now-started)%lap)/lap*perimeter,tail=Math.max(48,Math.min(320,.3*perimeter)),headLength=16
      const alpha=(offset:number)=>offset>=-headLength?1:Math.max(0,(offset+tail+headLength)/tail)
      // Resolve the accent through the browser so the gradient takes the selected theme.
      const rgb=getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0,3).map(Number)??[0,0,0]
      for(let from=-tail-headLength;from<0;from+=2) {
        const to=Math.min(0,from+2),a=pointOnFrame(head+from,width,height,radius),b=pointOnFrame(head+to,width,height,radius)
        if(a.x===b.x&&a.y===b.y)continue
        const gradient=context.createLinearGradient(a.x,a.y,b.x,b.y)
        gradient.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha(from)})`)
        gradient.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha(to)})`)
        context.strokeStyle=gradient;context.lineCap='round';context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke()
      }
    }
  }
  const draw=(now:number):void=>{if(ended)return;paint(now);frame=requestAnimationFrame(draw)}
  frame=requestAnimationFrame(draw)
  return {finish:(outcome:LightEnd)=>{
    if(ended)return
    ended=true;cancelAnimationFrame(frame)
    if(outcome==='unknown'||outcome==='gone'||reduced.matches){probe.remove();canvas.remove();return}
    // The light is ended from a layout effect's cleanup, before React has put the rest of the
    // commit on the page, so the press may still stand where it waited. A microtask runs after
    // the commit, when the failure line exists and the press has moved with it. A part that is
    // gone by then keeps the place its light last had, and settles or fades there.
    queueMicrotask(()=>{
      if(element.isConnected)paint(performance.now(),outcome==='success')
      else if(lastBox!==null)paint(performance.now(),outcome==='success',lastBox)
      else{probe.remove();canvas.remove();return}
      probe.remove()
      const token=outcome==='success'?'--motion-settle':'--motion-quick'
      const duration=timeInMilliseconds(getComputedStyle(document.documentElement).getPropertyValue(token))
      const fade=canvas.animate([{opacity:1},{opacity:0}],{duration,easing:outcome==='success'?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,1,1)',fill:'forwards'})
      void fade.finished.then(()=>canvas.remove(),()=>canvas.remove())
    })
  }}
}

/** Keep one delayed light with the part whose answer is being waited for, and end it as `ended` says. */
export function useWaitingLight(target:RefObject<HTMLElement|null>,waiting:boolean,ended:LightEnd,gap=2):void {
  // Set before the cleanup below runs, so it can tell a wait that ended from a part that went or was replaced mid-wait,
  // and say how the wait ended.
  const stillWaiting=useRef(waiting),ending=useRef(ended)
  useLayoutEffect(()=>{stillWaiting.current=waiting;ending.current=ended},[waiting,ended])
  useEffect(()=>{
    if(!waiting||target.current===null)return
    const element=target.current
    let light:ReturnType<typeof startLight>|null=null
    const delay=timeInMilliseconds(getComputedStyle(document.documentElement).getPropertyValue('--motion-delay'))
    const timer=window.setTimeout(()=>{if(element.isConnected)light=startLight(element,gap)},delay)
    return ()=>{window.clearTimeout(timer);light?.finish(!stillWaiting.current&&element.isConnected?ending.current:'gone')}
  },[target,waiting,gap])
}

/** A part can keep this hook mounted across its answer and name a success, a failure or an unknown answer explicitly. */
export function useLoadingLight(target:RefObject<HTMLElement|null>,status:'loading'|'ready'|'error'|'unknown'|'gone',gap=6,suppressForNavigation=false):void {
  const answer=useRef(status)
  answer.current=status
  useLayoutEffect(()=>{
    if(status!=='loading'||target.current===null)return
    const element=target.current
    let light:ReturnType<typeof startLight>|null=null
    const delay=timeInMilliseconds(getComputedStyle(document.documentElement).getPropertyValue('--motion-delay'))
    const timer=window.setTimeout(()=>{if(element.isConnected&&!(suppressForNavigation&&document.documentElement.hasAttribute('data-navigation-wait')))light=startLight(element,gap)},delay)
    return ()=>{
      window.clearTimeout(timer)
      light?.finish(answer.current==='ready'?'success':answer.current==='error'?'failed':answer.current==='unknown'?'unknown':'gone')
    }
  },[target,status,gap,suppressForNavigation])
}

// A foreground press already has its own light. Background refresh marks stay available to the
// failure strip, but their shell light must not give the same wait a second sign.
let foregroundWaits = 0
const foregroundListeners = new Set<() => void>()
export const foregroundWait = (): boolean => foregroundWaits > 0
export function subscribeForegroundWait(listener: () => void): () => void {
  foregroundListeners.add(listener)
  return () => { foregroundListeners.delete(listener) }
}
export function useForegroundWait(waiting: boolean): void {
  useLayoutEffect(() => {
    if (!waiting) return
    foregroundWaits += 1
    foregroundListeners.forEach(listener => listener())
    return () => { foregroundWaits -= 1; foregroundListeners.forEach(listener => listener()) }
  }, [waiting])
}
