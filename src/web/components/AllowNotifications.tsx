// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTIFICATIONS ON THIS DEVICE — THE ONE PRESS THAT LETS THE OFFICE CALL THEM HERE. A summons is the office's
 * own message and a push to every device where they pressed "allow notifications" once, with no password,
 * address or account to set up. The office's side is
 * src/server/lib/push.ts; the worker that shows a notification is public/push-worker.js.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * One sentence saying where this device stands, and the one press that moves it on: allow, or stop and send a test
 * once it is allowed. When this device cannot be told at all, the sentence says why in plain words (not an encrypted
 * page; an iPhone that needs the office on its Home Screen first; a browser without notifications) and no press is
 * drawn. Under it, the devices that are told, so they can stop one they no longer use from here.
 *
 * WHICH DEVICE IS THIS ONE is worked out on this page: the office lists devices by the first 16 hexadecimal characters
 * of the SHA-256 of each one's address, and the page hashes the address its own browser holds. No address comes back
 * from the office.
 *
 * Its own component, mounted in the Settings page with one line, as the secretary asked (JqVN46Ww53Lr), so the page's other
 * work moves around it without touching it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useState } from 'react'

import { content, t, type WordKey } from '@shared/i18n.ts'
import type { PushDevice, PushOutcome, PushState } from '@shared/push.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn, ErrorNote, Loading, Panel, ServerNote, useAsync } from './ui.tsx'

/** Where the page asks the browser to keep the worker, and what it covers: every page of the office. */
const THE_WORKER = '/push-worker.js'

export function AllowNotificationsPanel() {
  useLanguage()
  const [state] = useAsync(() => api.pushState(), [])
  if (state.status === 'loading') return <Loading what={t('settingsPanel.notify.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.notifications' }} title={t('settingsPanel.title.notifications')}>
      <style href="mole-office-allow-notifications" precedence="default">
        {ALLOW_NOTIFICATIONS_CSS}
      </style>
      <AllowNotifications first={state.value} />
    </Panel>
  )
}

/** What this device can do, before anything is asked of its browser. */
type WhatThisDeviceCan = { can: true } | { can: false; why: 'notEncrypted' | 'iphone' | 'noPush' }

/** Why this device cannot be told, in words. The English is NOTIFICATION_WORDS', read through a getter. */
const WHY_WORDS: Record<'notEncrypted' | 'iphone' | 'noPush', WordKey> = {
  notEncrypted: 'settingsPanel.notify.notEncrypted',
  iphone: 'settingsPanel.notify.iphone',
  noPush: 'settingsPanel.notify.noPush',
}

export function whatThisDeviceCan(): WhatThisDeviceCan {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { can: false, why: 'noPush' }
  if (window.isSecureContext !== true) return { can: false, why: 'notEncrypted' }
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!hasPush) return { can: false, why: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iphone' : 'noPush' }
  return { can: true }
}

const OUTCOME_WORDS: Record<PushOutcome['outcome'], WordKey> = {
  told: 'settingsPanel.notify.outcome.told',
  gone: 'settingsPanel.notify.outcome.gone',
  refused: 'settingsPanel.notify.outcome.refused',
  unreachable: 'settingsPanel.notify.outcome.unreachable',
}

/** Where this device stands. `allowed` carries the id the office lists it under. */
type Here = { is: 'checking' } | { is: 'notYet' } | { is: 'blocked' } | { is: 'allowed'; device: string }

/** The panel's body, given the office's reading. Exported so a test draws it for a device that cannot be told. */
export function AllowNotifications({ first }: { first: PushState }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [here, setHere] = useState<Here>({ is: 'checking' })
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<PushOutcome | null>(null)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const can = whatThisDeviceCan()

  // WHERE THIS DEVICE STANDS, read from its own browser once the office has answered.
  useEffect(() => {
    if (!can.can) return
    let stillHere = true
    void whereThisDeviceStands(reading).then((now) => {
      if (stillHere) setHere(now)
    })
    return () => {
      stillHere = false
    }
    // The office's reading is what changes the answer; the browser's own state is read again with it.
  }, [reading, can.can])

  const run = (what: string, work: () => Promise<void>): void => {
    setBusy(what)
    setFault(null)
    setSaid(null)
    work()
      .catch((err: unknown) => setFault({ message: errorMessage(err), fault: faultOf(err) }))
      .finally(() => setBusy(null))
  }

  const allow = (): void =>
    run(t('settingsPanel.notify.allowing'), async () => {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setHere({ is: permission === 'denied' ? 'blocked' : 'notYet' })
        return
      }
      const registration = await navigator.serviceWorker.register(THE_WORKER, { scope: '/' })
      await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      // A SUBSCRIPTION MADE WITH ANOTHER KEY is one the office can no longer sign for, so it is made again.
      if (subscription !== null && !madeWith(subscription, reading.publicKey)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64url(reading.publicKey) })
      const keys = subscription.toJSON().keys ?? {}
      const kept = await api.allowThisDevice({
        endpoint: subscription.endpoint,
        keys: { p256dh: String(keys['p256dh'] ?? ''), auth: String(keys['auth'] ?? '') },
        name: aNameForThisDevice(),
      })
      setReading(kept.state)
    })

  const stop = (device: string, thisOne: boolean): void =>
    run(t('settingsPanel.notify.stopping'), async () => {
      const after = await api.stopADevice(device)
      if (thisOne) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        await (await registration?.pushManager.getSubscription())?.unsubscribe()
      }
      setReading(after.state)
    })

  const test = (device: string): void =>
    run(t('settingsPanel.notify.testing'), async () => {
      setSaid(await api.testADevice(device))
    })

  const sentence: WordKey | null = !can.can
    ? WHY_WORDS[can.why]
    : here.is === 'checking'
      ? 'settingsPanel.notify.checking'
      : here.is === 'blocked'
        ? 'settingsPanel.notify.blocked'
        : null

  return (
    <div className="alnt">
      {sentence === null ? null : (
        <p className="alnt-here" data-fact="this-device">
          {t(sentence)}
        </p>
      )}
      {!can.can || here.is === 'checking' ? null : here.is === 'allowed' ? (
        <div className="alnt-presses">
          <Btn onClick={() => test(here.device)} disabled={busy !== null} reason={busy ?? undefined}>
            {t(settingsControlWord('settings.notifications', 'settingsPanel.notify.test'))}
          </Btn>
          <Btn variant="ghost" onClick={() => stop(here.device, true)} disabled={busy !== null} reason={busy ?? undefined}>
            {t(settingsControlWord('settings.notifications', 'settingsPanel.notify.stop'))}
          </Btn>
        </div>
      ) : (
        <div className="alnt-presses">
          <Btn onClick={allow} disabled={busy !== null} reason={busy ?? undefined}>
            {t(settingsControlWord('settings.notifications', 'settingsPanel.notify.allow'))}
          </Btn>
        </div>
      )}
      {said === null ? null : <p className="alnt-said">{t(OUTCOME_WORDS[said.outcome])}</p>}
      {said === null ? null : <ServerNote text={said.says} />}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <TheDevices devices={reading.devices} thisOne={here.is === 'allowed' ? here.device : null} busy={busy} onStop={(id) => stop(id, false)} />
    </div>
  )
}

function TheDevices({
  devices,
  thisOne,
  busy,
  onStop,
}: {
  devices: PushDevice[]
  thisOne: string | null
  busy: string | null
  onStop: (id: string) => void
}) {
  useLanguage()
  return (
    <div className="alnt-devices">
      <p className="alnt-label">{t('settingsPanel.notify.devices')}</p>
      {devices.length === 0 ? <p className="alnt-said">{t('absence.none')}</p> : null}
      <ul className="alnt-list">
        {devices.map((one) => (
          <li key={one.id} className="alnt-device" data-device={one.id}>
            <span className="alnt-what">
              <span className="alnt-name">{content(one.name)}</span>
              {one.id === thisOne ? <span className="alnt-this">{t('settingsPanel.notify.thisOne')}</span> : null}
              <span className="alnt-since">{t('settingsPanel.notify.since', { at: one.addedAt })}</span>
            </span>
            {one.id === thisOne ? null : (
              <Btn variant="ghost" onClick={() => onStop(one.id)} disabled={busy !== null} reason={busy ?? undefined}>
                {t(settingsControlWord('settings.notifications', 'settingsPanel.notify.stopThat'))}
              </Btn>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Where this device stands: allowed when its browser holds a subscription the office lists, made with its key. */
async function whereThisDeviceStands(reading: PushState): Promise<Here> {
  if (Notification.permission === 'denied') return { is: 'blocked' }
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription === null || subscription === undefined || Notification.permission !== 'granted') return { is: 'notYet' }
    if (!madeWith(subscription, reading.publicKey)) return { is: 'notYet' }
    const id = await aDeviceId(subscription.endpoint)
    return reading.devices.some((one) => one.id === id) ? { is: 'allowed', device: id } : { is: 'notYet' }
  } catch {
    return { is: 'notYet' }
  }
}

/** The id the office lists a device under: the first 16 hexadecimal characters of the SHA-256 of its address. */
export async function aDeviceId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

/** Whether a subscription was made with this public key. */
function madeWith(subscription: PushSubscription, publicKey: string): boolean {
  const key = subscription.options.applicationServerKey
  if (key === null) return false
  return toBase64url(new Uint8Array(key)) === publicKey
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const plain = atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='))
  const out = new Uint8Array(new ArrayBuffer(plain.length))
  for (let i = 0; i < plain.length; i += 1) out[i] = plain.charCodeAt(i)
  return out
}

function toBase64url(bytes: Uint8Array): string {
  let plain = ''
  for (const byte of bytes) plain += String.fromCharCode(byte)
  return btoa(plain).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A name they can tell devices apart by, such as "Firefox on Windows", from what the browser says of itself. */
export function aNameForThisDevice(agent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'A browser'
  const system = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Windows/.test(agent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(agent)
            ? 'a Mac'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'a device'
  return `${browser} on ${system}`
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const ALLOW_NOTIFICATIONS_CSS = `
.alnt { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.alnt-here { margin: 0; max-width: var(--measure-in-box); font: 600 var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text); }
.alnt-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
/* A PRESS IN THIS PANEL MAY TAKE TWO LINES. It borrows px-btn, which says nowrap, and the Greek
   sentence for allowing notifications is wider than the column, so it ran past the panel and made
   the page scroll sideways. The press stays inside its column and wraps its own words. */
.alnt-presses .px-btn { max-width: 100%; white-space: normal; }
.alnt-said { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); overflow-wrap: anywhere; }
.alnt-devices { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.alnt-label {
  margin: 0; font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.alnt-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: calc(var(--pad) / 2); }
/* ONE ROW A DEVICE: what it is wraps in the first column, and its Stop keeps the second, at every width. */
.alnt-device { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--pad); min-width: 0; font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.alnt-what { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }
.alnt-name { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.alnt-this { color: var(--accent); }
.alnt-since { color: var(--text-3); }
`
