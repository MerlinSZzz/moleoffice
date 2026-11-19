// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useRef, useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import type { PrivateLoginCapability, PrivateLoginReason, PrivateLoginState } from '@shared/private-sandbox-login.ts'
import { api, faultOf } from '../api.ts'
import { PRIVATE_LOGIN_REASONS } from '../../config/private-sandbox-login.mjs'
import { useLanguage } from '../lib/language.ts'

const random = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
const refusal = (reason: PrivateLoginReason) => t(`server.privateLogin${reason}` as WordKey)
const safeReason = (err: unknown): PrivateLoginReason => { const code = faultOf(err)?.code; const reason = typeof code === 'string' && code.startsWith('privateLogin') ? code.slice('privateLogin'.length) : ''; return PRIVATE_LOGIN_REASONS.includes(reason as PrivateLoginReason) ? reason as PrivateLoginReason : 'Unavailable' }
const active = (state: PrivateLoginState | null) => state?.state === 'waiting' || state?.state === 'saving'

/** Private codes live only in this unretained field and the dedicated request body. */
export function AddSandboxLogin() {
  useLanguage()
  const [binding, setBinding] = useState(random)
  const [capability, setCapability] = useState<PrivateLoginCapability | null>(null)
  const [state, setState] = useState<PrivateLoginState | null>(null)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<PrivateLoginReason | null>(null)
  const [popupFailed, setPopupFailed] = useState(false)
  const codeField = useRef<HTMLInputElement>(null)
  const current = useRef<PrivateLoginState | null>(null)
  const inFlight = useRef(false)
  useEffect(() => { let here = true; void api.privateLoginCapability(binding).then(value => { if (here) setCapability(value) }).catch((err: unknown) => { if (here) setFault(safeReason(err)) }); return () => { here = false } }, [binding])
  useEffect(() => { current.current = state }, [state])
  useEffect(() => {
    if (!active(state)) return
    let here = true
    let reading = false
    const timer = setInterval(() => {
      if (reading) return
      reading = true
      void api.privateLoginStatus(binding, state!).then(value => { if (here) setState(value) }).catch((err: unknown) => { if (here) { setFault(safeReason(err)); clearInterval(timer) } }).finally(() => { reading = false })
    }, 1000)
    return () => { here = false; clearInterval(timer) }
  }, [binding, state?.attempt, state?.state])
  useEffect(() => {
    const disconnect = () => { const value = current.current; if (active(value)) void api.privateLoginDisconnect(binding, value!).catch(() => {}) }
    window.addEventListener('pagehide', disconnect)
    return () => { window.removeEventListener('pagehide', disconnect); disconnect(); if (codeField.current) codeField.current.value = '' }
  }, [binding])
  const act = async (work: () => Promise<PrivateLoginState>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setFault(null)
    try { const value = await work(); setState(value); current.current = value } catch (err) { setFault(safeReason(err)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const open = async () => {
    if (!state || inFlight.current) return
    // Reserve the popup during the press. A blocked popup consumes no authorization link.
    const popup = window.open('about:blank', '_blank')
    if (popup === null) { setPopupFailed(true); return }
    popup.opener = null
    setPopupFailed(false); inFlight.current = true; setBusy(true)
    try { const { url } = await api.privateLoginSignIn(binding, state); popup.location.replace(url) }
    catch (err) { popup.close(); setFault(safeReason(err)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="private-login" aria-label={t(settingsControlWord('settings.keys', 'privateLogin.add'))}>
    <style href="private-sandbox-login" precedence="default">{CSS}</style>
    <button type="button" className="keys-press" disabled={busy || capability?.available !== true || state !== null || fault === 'PoolUnknown'} onClick={() => void act(() => api.privateLoginStart(binding, capability!.generation!, random()))}>{t(settingsControlWord('settings.keys', 'privateLogin.add'))}</button>
    {capability?.available === false ? <p className="private-login-note">{refusal('Unavailable')}</p> : null}
    {state ? <div className="private-login-panel" role="region" aria-label={t('privateLogin.signIn')}>
      <h4>{t('privateLogin.signIn')}</h4>
      <p aria-live="polite">{state.state === 'added' ? t('privateLogin.added') : state.state === 'saving' ? t('privateLogin.saving') : state.state === 'cancelled' ? refusal('Cancelled') : state.reason ? refusal(state.reason) : t('privateLogin.waiting')}</p>
      {state.state === 'added' ? <p><span>{t('privateLogin.letter', { letter: state.letter! })}</span> <code>{state.sha12}</code></p> : null}
      {state.canOpen ? <button type="button" className="keys-press" disabled={busy} onClick={() => void open()}>{t(settingsControlWord('settings.keys', 'privateLogin.open'))}</button> : null}
      {popupFailed ? <p className="private-login-note">{t('privateLogin.popup')}</p> : null}
      {state.code ? <form onSubmit={event => { event.preventDefault(); const value = codeField.current?.value ?? ''; if (codeField.current) codeField.current.value = ''; if (value) void act(() => api.privateLoginCode(binding, state, value)) }} autoComplete="off">
        <label>{t(settingsControlWord('settings.keys', 'privateLogin.code'))}<input ref={codeField} type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={busy} aria-label={t(settingsControlWord('settings.keys', 'privateLogin.code'))} /></label>
        <button type="submit" className="keys-press" disabled={busy}>{t(settingsControlWord('settings.keys', 'privateLogin.submit'))}</button>
      </form> : null}
      {!active(state) && state.state !== 'unknown' ? <button type="button" className="keys-press" onClick={() => { current.current = null; setState(null); setFault(null); setPopupFailed(false); setCapability(null); setBinding(random()) }}>{t(settingsControlWord('settings.keys', 'privateLogin.done'))}</button> : null}
      {active(state) ? <button type="button" className="keys-press" disabled={busy} onClick={() => { if (codeField.current) codeField.current.value = ''; void act(() => api.privateLoginCancel(binding, state)) }}>{t(settingsControlWord('settings.keys', 'privateLogin.cancel'))}</button> : null}
    </div> : null}
    {fault ? <p className="private-login-note" role="alert">{refusal(fault)}</p> : null}
  </section>
}
const CSS = `
.private-login { margin-block: var(--gut); color: var(--text); font: var(--fs-1)/1.5 var(--font-ui); }
.private-login button { max-width: 100%; min-height: 2.5rem; padding: .5rem .8rem; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--text); background: var(--panel); cursor: pointer; }
.private-login button:disabled { opacity: .6; cursor: default; }
.private-login-panel { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: center; margin-top: var(--pad); padding: var(--gut); border: 1px solid var(--border); background: var(--panel); border-radius: 6px; }
.private-login-panel h4, .private-login-panel p { flex-basis: 100%; margin: 0; overflow-wrap: anywhere; }
.private-login-panel h4 { font-size: var(--fs-2); }
.private-login-panel form { display: flex; flex-wrap: wrap; gap: var(--pad); width: 100%; align-items: end; }
.private-login-panel label { display: grid; gap: .3rem; flex: 1 1 12rem; min-width: 0; }
.private-login-panel input { box-sizing: border-box; width: 100%; min-width: 0; padding: .6rem; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--bg); color: var(--text); font: inherit; }
.private-login-note { color: var(--text-2); overflow-wrap: anywhere; }
`
