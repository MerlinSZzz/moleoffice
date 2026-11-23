// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WEB PAGE IN THE WINDOW: the form that asks for one, the box the window draws it over, and the box's bar (wave 13t,
 * package OT-B).
 *
 * THE WINDOW DRAWS THE PAGE, NOT THIS PAGE. The box is part of the shell, so the web page keeps its place while the
 * office page changes route. This page lays the box out in the body or in a column on the left or the right, and
 * tells the window where it is on the screen at every frame it moves (lib/web-page.ts). The window puts its own view
 * there, which has no office powers (src/desktop/the-web-page.mjs).
 *
 * AN OFFICE LAYER OVER THE BOX HIDES THE PAGE. The window's view is drawn above this whole page, so a menu, a dialog,
 * a composer or the chat drawn over the box would be under it. While one is, the view is hidden, and the box shows
 * the page's address in plain text.
 *
 * IN A BROWSER the form says that this is a feature of the desktop app, and opens the address in a new tab.
 */
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { THE_PLACES, theAddressMeant, whyTheAddressIsRefused } from '../../desktop/the-web-page.mjs'
import type { Place, Refusal, Said } from '../../desktop/the-web-page.mjs'
import { useLanguage } from '../lib/language.ts'
import {
  closeTheWebPageForm,
  followTheWebPage,
  theBridge,
  useTheWebPage,
  useTheWebPageForm,
  whereAWebPageOpens,
  type TheBox,
  type TheWindowsWebPage,
  type WebPageState,
} from '../lib/web-page.ts'
import { SHELL_BAND_QUERY } from '../lib/shell-layout.ts'
import { Btn, Field, TextInput } from './ui.tsx'

/** The root's mark for where the page is, which the stylesheet reads to give the body or a column to the box. */
const THE_PAGES_PLACE = 'data-web-page'

const PLACE_WORD = { body: 'webPage.place.body', left: 'webPage.place.left', right: 'webPage.place.right' } as const satisfies Record<Place, WordKey>
/** Why an address is not opened, in words. */
const REFUSAL_WORD = {
  'not-an-address': 'webPage.refused.not-an-address',
  scheme: 'webPage.refused.scheme',
  loopback: 'webPage.refused.loopback',
  'the-office': 'webPage.refused.the-office',
} as const satisfies Record<Refusal, WordKey>

/** What an address typed into the form or the bar will open, or why it will not. */
function whatItOpens(typed: string): { address: string } | { refused: ReturnType<typeof whyTheAddressIsRefused> } | null {
  const address = theAddressMeant(typed)
  if (address === null) return typed.trim() === '' ? null : { refused: 'not-an-address' }
  const refused = whyTheAddressIsRefused(address, window.location.origin)
  return refused === null ? { address } : { refused }
}

/** What the bar was told, in words. */
function saidInWords(said: Said): string {
  if ('refused' in said) return t('webPage.said.refused', { address: content(said.address), why: t(REFUSAL_WORD[said.refused]) })
  if ('failed' in said) return t('webPage.said.failed', { address: content(said.address), why: content(said.failed) })
  if (said.download === 'saved') return t('webPage.said.saved', { path: content(said.path) })
  return t(said.download === 'not-saved' ? 'webPage.said.notSaved' : 'webPage.said.interrupted', { name: content(said.name) })
}

/** The form and the box, mounted once in the shell. Each draws nothing while it is not wanted. */
export function WebPage() {
  useLanguage()
  const state = useTheWebPage()
  const form = useTheWebPageForm()
  useEffect(() => followTheWebPage(), [])
  const place = state?.open === true ? state.place : null
  useEffect(() => {
    const root = document.documentElement
    if (place === null) root.removeAttribute(THE_PAGES_PLACE)
    else root.setAttribute(THE_PAGES_PLACE, place)
    return () => root.removeAttribute(THE_PAGES_PLACE)
  }, [place])
  const bridge = theBridge()
  return (
    <>
      <style href="mole-office-web-page" precedence="default">{WEB_PAGE_CSS}</style>
      {form === null ? null : <WebPageForm key={form} state={state} />}
      {state?.open === true && bridge !== null ? <WebPageBox state={state} bridge={bridge} /> : null}
    </>
  )
}

/** The form: an address, and in the window where the page goes. */
function WebPageForm({ state }: { state: WebPageState | null }) {
  const where = whereAWebPageOpens()
  const open = state?.open === true ? state : null
  const [typed, setTyped] = useState(open?.address ?? '')
  const [place, setPlace] = useState<Place>(open?.place ?? 'right')
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    opener.current = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [])
  const opens = whatItOpens(typed)
  const go = async () => {
    if (opens === null || !('address' in opens) || busy) return
    setFailed(null)
    if (where === 'a new tab') {
      const tab = window.open(opens.address, '_blank')
      if (tab === null) {
        setFailed(t('webPage.form.tabBlocked'))
        return
      }
      tab.opener = null
      closeTheWebPageForm()
      return
    }
    const bridge = theBridge()
    if (bridge === null) return
    setBusy(true)
    try {
      if (await bridge.open({ address: opens.address, place })) closeTheWebPageForm()
      else setFailed(t('webPage.form.notOpened'))
    } finally {
      setBusy(false)
    }
  }
  const why =
    where === 'no bridge'
      ? t('webPage.form.noBridge')
      : opens === null
        ? t('webPage.form.noAddress')
        : 'refused' in opens && opens.refused !== null
          ? t(REFUSAL_WORD[opens.refused])
          : undefined
  return (
    <dialog ref={dialog} className="wp-form" aria-labelledby={title} data-opens={where === 'a new tab' ? 'tab' : 'window'}
      onCancel={(event) => { event.preventDefault(); if (!busy) closeTheWebPageForm() }}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); void go() }}>
        <h2 id={title}>{t('webPage.form.title')}</h2>
        {where === 'a new tab' ? <p className="wp-form-says">{t('webPage.form.desktopOnly')}</p> : null}
        {where === 'no bridge' ? <p className="wp-form-says" role="alert">{t('webPage.form.noBridge')}</p> : null}
        <Field label={t('webPage.form.address')}>
          <TextInput value={typed} onChange={(next) => { setTyped(next); setFailed(null) }} mono autoFocus />
        </Field>
        {/* WHAT MOLE OFFICE MADE OF THE WORDS: the address it will open, or why it opens none. */}
        <p className="wp-form-opens" data-part="opens">
          {opens === null ? null : 'address' in opens ? t('webPage.form.opens', { address: content(opens.address) }) : why}
        </p>
        {where === 'the window' ? (
          <fieldset className="wp-form-places">
            <legend>{t('webPage.form.place')}</legend>
            {THE_PLACES.map((one) => (
              <label key={one} className="wp-form-place">
                <input type="radio" name="mole-office-web-page-place" value={one} checked={place === one} onChange={() => setPlace(one)} />
                <span>{t(PLACE_WORD[one])}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {failed === null ? null : <p className="wp-form-failed" role="alert">{failed}</p>}
        <div className="wp-form-acts">
          <Btn onClick={closeTheWebPageForm}>{t('webPage.form.cancel')}</Btn>
          <Btn type="submit" variant="primary" disabled={why !== undefined || busy} pending={busy} {...(why === undefined ? {} : { reason: why })}>
            {where === 'a new tab' ? t('webPage.form.openInATab') : t('webPage.form.open')}
          </Btn>
        </div>
      </form>
    </dialog>
  )
}

/** The office's layers that may be drawn over the box. A modal dialog covers the whole page, wherever its box is. */
const THE_LAYERS = '.px-overlays > *, .px-overlays > * > *, dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"], .px-chat'

/** Whether an office layer is drawn over this rectangle of the screen. The box's own parts are not layers over it. */
function aLayerIsOver(area: Element, rect: DOMRect): boolean {
  for (const layer of document.querySelectorAll(THE_LAYERS)) {
    if (area.contains(layer) || layer.contains(area)) continue
    if (layer instanceof HTMLDialogElement && layer.matches(':modal')) return true
    const r = layer.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) return true
  }
  return false
}

const sameBox = (a: TheBox, b: TheBox) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * Tell the window where the box is, at every frame it has moved, and hide the page while a layer is over it or the box
 * is off the screen. The first frame always says hidden or shown, because a page that was loaded again does not know
 * what the page before it said. Answers whether the page is hidden now.
 */
function usePlacing(area: RefObject<HTMLDivElement | null>, bridge: TheWindowsWebPage): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let frame = 0
    let placed: TheBox | null = null
    let said: boolean | null = null
    const step = () => {
      frame = window.requestAnimationFrame(step)
      const element = area.current
      if (element === null) return
      const rect = element.getBoundingClientRect()
      const x = Math.max(0, rect.left)
      const y = Math.max(0, rect.top)
      const box = { x, y, width: Math.min(window.innerWidth, rect.right) - x, height: Math.min(window.innerHeight, rect.bottom) - y }
      const hide = box.width < 1 || box.height < 1 || aLayerIsOver(element, rect)
      if (hide && said !== true) void bridge.hide()
      if (!hide && (placed === null || !sameBox(placed, box))) {
        placed = box
        void bridge.place(box)
      }
      if (!hide && said !== false) void bridge.show()
      if (said !== hide) {
        said = hide
        setHidden(hide)
      }
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [area, bridge])
  return hidden
}

/** The box the window draws the page over, with the bar above it. */
function WebPageBox({ state, bridge }: { state: Extract<WebPageState, { open: true }>; bridge: TheWindowsWebPage }) {
  const area = useRef<HTMLDivElement>(null)
  const hidden = usePlacing(area, bridge)
  const [typed, setTyped] = useState(state.address)
  const [refused, setRefused] = useState<string | null>(null)
  useEffect(() => {
    setTyped(state.address)
    setRefused(null)
  }, [state.address])
  const go = () => {
    const opens = whatItOpens(typed)
    if (opens === null) return
    if ('address' in opens) void bridge.open({ address: opens.address, place: state.place })
    else if (opens.refused !== null) setRefused(t(REFUSAL_WORD[opens.refused]))
  }
  return (
    <section className="wp-box" data-place={state.place} aria-label={t('webPage.region')}>
      <form className="wp-bar" onSubmit={(event) => { event.preventDefault(); go() }}>
        <Btn size="sm" disabled={!state.canGoBack} reason={t('webPage.bar.noEarlier')} onClick={() => void bridge.back()}>{t('webPage.bar.back')}</Btn>
        <Btn size="sm" disabled={!state.canGoForward} reason={t('webPage.bar.noLater')} onClick={() => void bridge.forward()}>{t('webPage.bar.forward')}</Btn>
        <Btn size="sm" onClick={() => void bridge.reload()}>{t('webPage.bar.reload')}</Btn>
        <input className="px-input wp-address" data-mono="1" aria-label={t('webPage.bar.address')} title={state.title === '' ? undefined : content(state.title)}
          value={typed} onChange={(event) => { setTyped(event.target.value); setRefused(null) }} />
        {state.loading ? <span className="wp-state" role="status">{t('webPage.bar.loading')}</span> : null}
        <Btn size="sm" onClick={() => void bridge.openOutside()}>{t('webPage.bar.outside')}</Btn>
        <Btn size="sm" onClick={() => void bridge.close()}>{t('webPage.bar.close')}</Btn>
      </form>
      {refused === null ? null : <p className="wp-said" role="alert">{refused}</p>}
      <WhatTheWindowSaid state={state} bridge={bridge} />
      <div className="wp-area" ref={area} data-hidden={hidden ? 'yes' : 'no'}>
        {hidden ? (
          <p className="wp-hidden"><span className="wp-state">{t('webPage.bar.hidden')}</span> <span className="wp-hidden-address">{content(state.address)}</span></p>
        ) : null}
      </div>
    </section>
  )
}

/** What the bar was told, and a download's question. */
function WhatTheWindowSaid({ state, bridge }: { state: WebPageState; bridge: TheWindowsWebPage }) {
  const { said, asked } = state
  return (
    <>
      {said === null ? null : <p className="wp-said" role="status">{saidInWords(said)}</p>}
      {asked === null ? null : (
        <div className="wp-asks" role="group" aria-label={t('webPage.download.asks', { name: content(asked.name) })}>
          <p>
            <strong>{t('webPage.download.asks', { name: content(asked.name) })}</strong>{' '}
            <span className="wp-from">{t('webPage.download.from', { address: content(asked.from) })}</span>
          </p>
          <Btn size="sm" variant="primary" onClick={() => void bridge.answerDownload({ id: asked.id, save: true })}>{t('webPage.download.save')}</Btn>
          <Btn size="sm" onClick={() => void bridge.answerDownload({ id: asked.id, save: false })}>{t('webPage.download.dontSave')}</Btn>
        </div>
      )}
    </>
  )
}

const WEB_PAGE_CSS = `
/* THE BOX TAKES THE BODY, OR A COLUMN BESIDE IT. In the body, the office page is not drawn while the web page is open,
   and is still there when it is closed. */
:root[${THE_PAGES_PLACE}='body'] .shell-main > .page { display: none; }
.wp-box { display: flex; flex-direction: column; min-width: 0; position: sticky; top: 0; align-self: flex-start;
  height: 100dvh; background: var(--panel); color: var(--text); border-inline: var(--border-w) solid var(--border); }
.wp-box[data-place='body'] { flex: 1 1 auto; }
.wp-box[data-place='left'], .wp-box[data-place='right'] { flex: 0 0 min(40rem, 45%); }
.wp-box[data-place='left'] { order: -1; }
${SHELL_BAND_QUERY} {
  .wp-box { position: static; align-self: stretch; height: 70dvh; flex: 0 0 auto; }
}
.wp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); padding: var(--pad); border-bottom: var(--border-w) solid var(--border); }
/* WHERE THE BOX REACHES THE WINDOW'S RIGHT EDGE, THE BAR KEEPS ROOM AT ITS RIGHT END FOR THE CHECKLIST PRESS, which is
   fixed at the window's top right and covered Close in the body and the right column. The room is the one the top bar
   keeps (--ckw-room, in ChecklistsWindow.tsx), so the two cannot drift. With no press, the bar keeps its own padding. */
.wp-box:is([data-place='body'], [data-place='right']) > .wp-bar { padding-right: var(--ckw-room, var(--pad)); }
.wp-address { flex: 1 1 12rem; min-width: 0; }
.wp-state { color: var(--text-2); font-size: var(--fs-1); }
.wp-said { margin: 0; padding: var(--pad); color: var(--text-2); overflow-wrap: anywhere; border-bottom: var(--border-w) solid var(--border); }
.wp-asks { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); padding: var(--pad); border-bottom: var(--border-w) solid var(--border); }
.wp-asks p { margin: 0; flex: 1 1 12rem; overflow-wrap: anywhere; }
.wp-from { color: var(--text-2); }
.wp-area { flex: 1 1 auto; min-height: 0; position: relative; }
.wp-hidden { margin: 0; padding: var(--pad-lg); overflow-wrap: anywhere; }
.wp-hidden-address { font-family: var(--mono); }
.wp-form { width: min(32rem, calc(100% - 2 * var(--gut))); max-height: calc(100dvh - 2 * var(--gut)); overflow-y: auto;
  padding: var(--pad-lg); background: var(--panel); color: var(--text); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius); box-shadow: var(--elev-2); }
.wp-form::backdrop { background: color-mix(in srgb, var(--bg), transparent 25%); }
.wp-form h2 { font-size: var(--fs-4); }
.wp-form-says, .wp-form-opens { color: var(--text-2); overflow-wrap: anywhere; }
.wp-form-places { display: grid; gap: var(--pad); margin: var(--gut) 0 0; padding: 0; border: 0; }
.wp-form-place { display: flex; align-items: center; gap: var(--pad); }
.wp-form-failed { color: var(--st-failed); }
.wp-form-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--pad); margin-top: var(--gut); }
`
