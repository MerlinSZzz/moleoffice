// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { useEffect, useState, type ReactNode } from 'react'
import type { WhatThePairingSays } from '@shared/pairing.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { RouteLink, whoPath } from '../components/router.tsx'
import { THE_PERSON } from '@shared/person.ts'
import { Absence, Btn, ErrorNote, Loading, Panel, type AsyncState } from '../components/ui.tsx'
import { isTheWindow } from '../../config/the-window-mark.mjs'
/**
 * INSIDE THE STANDALONE WINDOW THE PAGE SAYS "THIS WINDOW". The window adds its mark to its user
 * agent (src/config/the-window-mark.mjs). It opens only its own machine's office, which offers
 * pairing at one press, so the words it can reach are the ones below: loading, offered, paired and
 * ended. Asking to be paired from another machine is never shown inside it.
 */
function inTheWindow(): boolean {
  return typeof navigator !== 'undefined' && isTheWindow(navigator.userAgent)
}
/**
 * THE TWO WORDS THAT LEAD TO THE PERSON'S CARD, design C of early idea B9. A paired browser is led to their own
 * card, where their browsers are, and a waiting one is told to confirm it there. Both meant another page
 * before, so they are new words rather than new meanings for the old ones.
 */
export const PAIRING_KEYS_ON_HIS_CARD = {
  go: 'w13s.pairing.goToYourCard',
  waitingAt: 'w13s.pairing.confirmOnYourCard',
} as const
export const PAIRING_WORDS = {
  get what() { return inTheWindow() ? t('w13t.pairing.window.what') : t('g4.pairing.what') },
  get onePress() { return inTheWindow() ? t('w13t.pairing.window.onePress') : t('g4.pairing.onePress') },
  get whileUnpaired() { return inTheWindow() ? t('w13t.pairing.window.whileUnpaired') : t('g4.pairing.whileUnpaired') },
  get paired() { return inTheWindow() ? t('w13t.pairing.window.paired') : t('g4.pairing.paired') },
  get press() { return inTheWindow() ? t('w13t.pairing.window.press') : t('g4.pairing.press') },
  get pressing() { return inTheWindow() ? t('w13t.pairing.window.pressing') : t('g4.pairing.pressing') },
  get go() { return t(PAIRING_KEYS_ON_HIS_CARD.go) },
  get askWhat() { return t('g4.pairing.askWhat') },
  get askUnder() { return t('g4.pairing.askUnder') },
  get ask() { return t('g4.pairing.ask') },
  get asking() { return t('g4.pairing.asking') },
  get waitingUnder() { return t('g4.pairing.waitingUnder') },
  get waitingAt() { return t(PAIRING_KEYS_ON_HIS_CARD.waitingAt) },
  get ended() { return inTheWindow() ? t('w13t.pairing.window.ended') : t('g4.pairing.ended') },
  get endedAsk() { return t('g4.pairing.endedAsk') },
  get elsewhere() { return t('g4.pairing.elsewhere') },
} as const
const TITLES = {
  get paired() { return inTheWindow() ? t('w13t.pairing.window.titlePaired') : t('g4.pairing.titlePaired') },
  get offered() { return inTheWindow() ? t('w13t.pairing.window.titleOffered') : t('g4.pairing.titleOffered') },
  get ask() { return t('g4.pairing.titleAsk') },
  get waiting() { return t('g4.pairing.titleWaiting') },
  get ended() { return inTheWindow() ? t('w13t.pairing.window.titleEnded') : t('g4.pairing.titleEnded') },
  get elsewhere() { return t('g4.pairing.titleElsewhere') },
} as const
const PAIRING_POLL_MS = 4000
const DEVICE_TAIL_KEY = 'mole-office-device-tail'
function aShortTail(): string {
  const made = (): string => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  try {
    const held = window.localStorage.getItem(DEVICE_TAIL_KEY)
    if (held !== null && /^[0-9a-f]{4}$/.test(held)) return held
    const fresh = made()
    window.localStorage.setItem(DEVICE_TAIL_KEY, fresh)
    return fresh
  } catch {
    return made()
  }
}
function whatThisBrowserIs(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : t('g4.pairing.browser')
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : t('g4.pairing.unknownSystem')
  return t('g4.pairing.browserOn', { browser, system })
}
export function theNameThisBrowserGivesItself(): string {
  return t('g4.pairing.deviceName', { browser: whatThisBrowserIs(), tail: aShortTail() })
}
/**
 * THE NAME THIS BROWSER GAVE ITSELF, read without writing, or null where it never made its tail. The person's
 * card compares it with their live browsers to mark the one they read on, so reading it must not make one.
 */
export function theNameThisBrowserGaveItself(): string | null {
  const held = ((): string | null => {
    try {
      return window.localStorage.getItem(DEVICE_TAIL_KEY)
    } catch {
      return null
    }
  })()
  if (held === null || !/^[0-9a-f]{4}$/.test(held)) return null
  return t('g4.pairing.deviceName', { browser: whatThisBrowserIs(), tail: held })
}
export function PairingPage({
  said,
  onPaired,
}: {
  said: AsyncState<WhatThePairingSays>
  onPaired: () => void
}) {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [deviceName] = useState(() => theNameThisBrowserGivesItself())
  const pending = said.status === 'ready' && said.value.waiting?.standing === 'pending'
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => onPaired(), PAIRING_POLL_MS)
    return () => clearInterval(timer)
  }, [pending, onPaired])
  if (said.status === 'loading') return <Loading what={inTheWindow() ? t('w13t.pairing.window.loading') : t('g4.pairing.loading')} />
  if (said.status === 'error') return <ErrorNote message={said.message} fault={said.fault} />
  const state = said.value
  const waiting = state.waiting
  const ended = waiting !== null && waiting.standing === 'ended'
  const pair = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .pairThisBrowser(deviceName)
      .then(() => {
        setBusy(false)
        onPaired()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  const ask = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .askToPairThisBrowser(deviceName)
      .then(() => {
        setBusy(false)
        onPaired()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  const loopbackPress = (label: string): ReactNode => (
    <>
      <p className="pair-say">{PAIRING_WORDS.onePress}</p>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <Btn onClick={pair} disabled={busy} reason={busy ? PAIRING_WORDS.pressing : undefined}>
        {label}
      </Btn>
    </>
  )
  const askPress = (label: string): ReactNode => (
    <>
      <p className="pair-say">{PAIRING_WORDS.askWhat}</p>
      <p className="pair-say">{PAIRING_WORDS.askUnder}</p>
      <p className="pair-device">{deviceName}</p>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <Btn onClick={ask} disabled={busy} reason={busy ? PAIRING_WORDS.asking : undefined}>
        {label}
      </Btn>
    </>
  )
  const title = state.paired
    ? TITLES.paired
    : pending
      ? TITLES.waiting
      : ended
        ? TITLES.ended
        : state.offered
          ? TITLES.offered
          : state.mayAsk
            ? TITLES.ask
            : TITLES.elsewhere
  let body: ReactNode
  if (state.paired) {
    body = (
      <>
        <p className="pair-say">{PAIRING_WORDS.paired}</p>
        <RouteLink to={whoPath('person', THE_PERSON)} className="pair-go">
          {PAIRING_WORDS.go}
        </RouteLink>
      </>
    )
  } else if (pending) {
    body = (
      <>
        <p className="pair-say">{PAIRING_WORDS.waitingUnder}</p>
        <p className="pair-device">{waiting?.device || <Absence />}</p>
        <p className="pair-say">{PAIRING_WORDS.waitingAt}</p>
      </>
    )
  } else if (ended) {
    body = (
      <>
        <p className="pair-say">{PAIRING_WORDS.ended}</p>
        {state.offered ? (
          loopbackPress(PAIRING_WORDS.press)
        ) : state.mayAsk ? (
          askPress(PAIRING_WORDS.endedAsk)
        ) : (
          <p className="pair-say">{PAIRING_WORDS.elsewhere}</p>
        )}
      </>
    )
  } else if (state.offered) {
    body = (
      <>
        <p className="pair-say">{PAIRING_WORDS.what}</p>
        <p className="pair-say">{PAIRING_WORDS.whileUnpaired}</p>
        {loopbackPress(PAIRING_WORDS.press)}
      </>
    )
  } else if (state.mayAsk) {
    body = askPress(PAIRING_WORDS.ask)
  } else {
    body = <p className="pair-say">{PAIRING_WORDS.elsewhere}</p>
  }
  return (
    <div className="pair">
      <style href="mole-office-pairing" precedence="default">
        {PAIRING_CSS}
      </style>
      <header className="pair-head">
        <h1 className="pair-title" data-title-is="its-label">{t('g4.pairing.title')}</h1>
      </header>
      <Panel titleIs="label" declares={{ surface: 'pairing' }} title={title}>
        {body}
      </Panel>
    </div>
  )
}
const PAIRING_CSS = `
.pair { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.pair-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }
.pair-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); }
/* A Chinese panel title reads as a heading too. The light look draws panel titles in the monospace
   font, in capitals, at body size; Chinese has no capitals, and that font has no Chinese of its own,
   so the title fell back to a plain body face (a review of round 9 of wave 13t). Here it takes
   the interface font, which has Chinese bold, and never less than the prose size. */
.pair .px-panel-title:lang(zh) { font-family: var(--font-ui); font-size: max(var(--panel-title-size), var(--fs-3)); }
.pair-say { margin: 0 0 var(--pad); max-width: var(--measure-in-box); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); text-wrap: pretty; }
.pair-device { margin: 0 0 var(--pad); max-width: var(--measure-in-box); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.pair-go {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.pair-go:hover { background: var(--hover); }
`
