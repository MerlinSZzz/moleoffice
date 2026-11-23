// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import type { WhatThePairingSays } from '@shared/pairing.ts'
import { theNameThisBrowserGivesItself } from '../pages/PairingPage.tsx'
import { ApiError, api, moleOfficeRequest } from '../api.ts'
import { useLanguage } from './language.ts'
import { theShellDrewTheAddress } from './ready.ts'
import { thisBrowserNeedsPairing, watchWhetherThisBrowserNeedsPairing } from './unpaired.ts'
import { moveThisBrowserOnce, sayTheMoveAfterTheReload, theMove } from './the-old-cookie.ts'
import { TheMoveNotice } from '../components/TheMoveNotice.tsx'

/** Replaces the whole shell when a page read is refused for an unproved browser. */
export function PairingGate({children}:{children?:ReactNode}) {
  const unpaired=useSyncExternalStore(watchWhetherThisBrowserNeedsPairing,thisBrowserNeedsPairing,()=>false)
  return unpaired?<UnpairedPage/>:children
}

export function UnpairedPage() {
  useLanguage()
  const [state,setState]=useState<WhatThePairingSays|null>(null)
  const [failed,setFailed]=useState(false)
  const [busy,setBusy]=useState(false)
  const [asked,setAsked]=useState(false)
  const [askedDevice,setAskedDevice]=useState<string|null>(null)
  const [waitSentence,setWaitSentence]=useState<string|null>(null)
  const [device]=useState(()=>theNameThisBrowserGivesItself())
  const read=useCallback(async()=>{
    try {
      const answer=await moleOfficeRequest<WhatThePairingSays>('/api/office/pairing')
      if(answer.paired){window.location.reload();return}
      // A BROWSER PAIRED BEFORE SEC-2 MOVES FIRST, ONCE A LOAD, and the next load says so (./the-old-cookie.ts).
      if(answer.mayMove&&theMove().state==='not tried'&&await moveThisBrowserOnce()){sayTheMoveAfterTheReload();window.location.reload();return}
      if(answer.waiting?.standing==='ended'){setAsked(false);setAskedDevice(null)}
      setState(answer);setFailed(false)
    }catch{setFailed(true)}
  },[])
  useEffect(()=>{theShellDrewTheAddress();void read()},[read])
  useEffect(()=>{
    if(!asked&&state?.waiting?.standing!=='pending')return
    const timer=window.setInterval(()=>{void read()},4000)
    return ()=>window.clearInterval(timer)
  },[asked,state,read])
  const send=async(local:boolean)=>{
    setBusy(true);setFailed(false);setWaitSentence(null)
    try {
      // Both presses keep the header half they are answered before this page goes on (api-parts/worlds.ts).
      if(local){await api.pairThisBrowser(device);window.location.reload();return}
      const answer=await api.askToPairThisBrowser(device)
      setAskedDevice(answer.device)
      setAsked(true)
    }catch(error){
      if(error instanceof ApiError&&error.status===429&&error.message!==''){setWaitSentence(error.message);return}
      setFailed(true)
    }finally{setBusy(false)}
  }
  const waiting=asked||state?.waiting?.standing==='pending'
  const pendingDevice=state?.waiting?.device??askedDevice
  return <main className="unpaired-page">
    <style href="mole-office-unpaired" precedence="default">{`
      .unpaired-page{min-height:100vh;display:grid;place-items:center;padding:2rem;background:var(--bg);color:var(--text);box-sizing:border-box}
      .unpaired-card{width:min(100%,34rem);padding:2rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--panel);box-sizing:border-box}
      .unpaired-card h1{font-size:1.6rem;line-height:1.2;margin:0 0 1rem}
      .unpaired-card p{line-height:1.55;margin:0 0 1rem}
      .unpaired-card button{font:inherit;padding:.7rem 1rem;border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--accent);color:var(--accent-text);cursor:pointer}
      .unpaired-card button:disabled{opacity:.6;cursor:wait}
      @media(max-width:40rem){.unpaired-page{padding:1rem}.unpaired-card{padding:1.4rem}}
    `}</style>
    <section className="unpaired-card">
      <h1>{t('pairing.unpaired.title')}</h1>
      <TheMoveNotice/>
      {failed?<><p>{t('pairing.unpaired.failed')}</p><button onClick={()=>{void read()}}>{t('pairing.unpaired.retry')}</button></>:
        state===null?<p>{t('pairing.unpaired.loading')}</p>:
        waiting?<><p>{t('pairing.unpaired.waiting')}</p>{pendingDevice?<p>{pendingDevice}</p>:null}</>:
        state.offered?<><p>{t('pairing.unpaired.onThisComputer')}</p><button disabled={busy} onClick={()=>{void send(true)}}>{t('pairing.unpaired.pairButton')}</button></>:
        state.mayAsk?<><p>{t('pairing.unpaired.ask')}</p>{waitSentence?<p role="status">{waitSentence}</p>:null}<button disabled={busy} onClick={()=>{void send(false)}}>{t('pairing.unpaired.askButton')}</button></>:
        <><p>{t('pairing.unpaired.trust')}</p><button onClick={()=>{void read()}}>{t('pairing.unpaired.retry')}</button></>}
    </section>
  </main>
}
