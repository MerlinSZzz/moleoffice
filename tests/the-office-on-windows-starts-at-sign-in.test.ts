// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ON WINDOWS STARTS AT SIGN-IN, AND SIGNING OUT STOPS IT. Wave 13t, round W12 (item 16's Windows part, the
 * owner's decision of 31 October 2026).
 *
 * In the beta an office on Windows runs from the person's sign-in to their sign-out. Nothing needs an administrator, and
 * nothing keeps the office running after sign-out. The window's own "Open at login" item sets it, as on a Mac: Electron's
 * login item, which on Windows is a value of the person's own Run key. This test stands the platform in as win32:
 *
 *   1. the window's menu offers Open at login on Windows from an installed app, and its tick says what Windows will
 *      start, which a value turned off in Startup apps is not;
 *   2. the server's reading on Windows says where it is set and that signing out stops the office, and never says on or
 *      off, because the server does not read the window's setting. A Mac and Linux are unchanged;
 *   3. the press on the page refuses on Windows, says where it is set instead, and writes nothing;
 *   4. the page, drawn from the Windows reading, says where, with no press and no Linux word. Developer mode adds the
 *      server's own sentence. A Mac's reading draws what it drew before.
 * Since round W45 the menu holds New quick note after Open, so the lists of its items here name it.
 * tests/the-quick-note-key-on-each-system.test.ts holds what that item does.
 *
 * What only Windows can show is not shown here: that a standard user can set the item (item 21), and that signing out
 * stops the office. No installed Mole Office exists on Windows before item 18, so the item is not offered there yet.
 *
 * MUTATIONS, each red here and green again when put back (out/w12/mutate-named.py, set item16):
 *   - offersOpenAtLogin offers it on a Mac only: red, case 1;
 *   - isSetToOpenAtLogin reads openAtLogin on Windows too: red, case 1;
 *   - the reading's Windows branch is taken out, so Windows reads as "Linux only": red, cases 2 and 4;
 *   - the press's refusal on Windows no longer names the item: red, case 3;
 *   - the page reads setInTheTray as false: red, case 4;
 *   - theTrayItems leaves out New quick note (round W45, after a control run of this file and the two other files
 *     that list the tray's items, which passed): red, case 1.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { readStartAtLogin, theStartAtLoginUnitPath, turnStartAtLoginOff, turnStartAtLoginOn } from '../src/config/start-at-login.mjs'
import { theQuickNoteKey } from '../src/desktop/the-quick-note.mjs'
import { isSetToOpenAtLogin, offersOpenAtLogin, theTrayItems } from '../src/desktop/the-window-on-this-system.mjs'
import type { StartAtLoginReading } from '../src/shared/start-at-login.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
const scratch = mkdtempSync(`${TEST_DATABASE_PREFIX}on-windows-sign-in-`)
const home = join(scratch, 'home')
const office = { command: '/c', args: [] } as never

const supplied = vi.hoisted(() => ({ reading: null as unknown }))
vi.mock('../src/web/components/ui.tsx', async (original) => {
  const real = await original<typeof import('../src/web/components/ui.tsx')>()
  // The card's one read, answered with the reading this test gives it.
  return { ...real, useAsync: () => [{ status: 'ready', value: supplied.reading }, () => {}] }
})
let card: typeof import('../src/web/components/StartAtLogin.tsx')
let mode: typeof import('../src/web/lib/mode.ts')
let i18n: typeof import('../src/shared/i18n.ts')
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage,
    location: { hash: '#/terminals', search: '' }, addEventListener: () => {}, removeEventListener: () => {} } })
  card = await import('../src/web/components/StartAtLogin.tsx')
  mode = await import('../src/web/lib/mode.ts')
  i18n = await import('../src/shared/i18n.ts')
})
afterEach(() => mode?.setMode('normal'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const WORDS = {
  trayOpen: 'Open',
  trayNewNote: 'New quick note',
  quickNoteKeyNotSet: (key: string) => `${key} is not set`,
  trayRestart: 'Restart',
  trayShutDown: 'Shut down',
  trayOpenAtLogin: 'Open at login',
}
const PRESSES = { open: () => {}, newNote: () => {}, restart: () => {}, shutDown: () => {}, openAtLogin: () => {} }
/** The quick-note key on Windows, as the system gave it to the window. */
const THE_KEY = { ...theQuickNoteKey('win32'), set: true }

/** The card as drawn from one reading, without its style sheet. */
function drawn(reading: StartAtLoginReading): string {
  supplied.reading = reading
  return renderToStaticMarkup(h(card.StartAtLogin)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** A word as the page draws it into markup. */
function asDrawn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')
}

describe('the office on Windows starts at sign-in', () => {
  it('1. the menu offers Open at login on Windows from an installed app, ticked by what Windows will start', () => {
    expect(offersOpenAtLogin('win32', true)).toBe(true)
    expect(offersOpenAtLogin('win32', false)).toBe(false)
    expect(offersOpenAtLogin('darwin', true)).toBe(true)
    expect(offersOpenAtLogin('linux', true)).toBe(false)

    const ids = theTrayItems(WORDS, PRESSES, { platform: 'win32', packaged: true, opensAtLogin: () => false, quickNoteKey: THE_KEY }).map((one) => one.id ?? one.type)
    expect(ids).toEqual(['open', 'newNote', 'restart', 'openAtLogin', 'separator', 'shutDown'])
    const unpacked = theTrayItems(WORDS, PRESSES, { platform: 'win32', packaged: false, opensAtLogin: () => false, quickNoteKey: THE_KEY }).map((one) => one.id ?? one.type)
    expect(unpacked).toEqual(['open', 'newNote', 'restart', 'separator', 'shutDown'])

    // A Run value turned off in Startup apps: Electron's openAtLogin still says true, and Windows will not start it.
    expect(isSetToOpenAtLogin('win32', { openAtLogin: true, executableWillLaunchAtLogin: false })).toBe(false)
    expect(isSetToOpenAtLogin('win32', { openAtLogin: true, executableWillLaunchAtLogin: true })).toBe(true)
    expect(isSetToOpenAtLogin('win32', { openAtLogin: false })).toBe(false)
    // A Mac keeps reading openAtLogin, as before.
    expect(isSetToOpenAtLogin('darwin', { openAtLogin: true })).toBe(true)
    expect(isSetToOpenAtLogin('darwin', { openAtLogin: false, executableWillLaunchAtLogin: true })).toBe(false)
  })

  it('2. the reading on Windows says where and that signing out stops the office, never on or off', () => {
    const seen = readStartAtLogin({ home, office, platform: 'win32', user: 'sam' })
    expect(seen).toMatchObject({ systemd: 'not linux', setInTheTray: true, setInTheMenuBar: false, startsAtLogin: null, enabledWord: null, activeWord: null, linger: null })
    expect(seen.says).toContain('tick "Open at login" in the menu of the Mole Office icon, in the notification area')
    expect(seen.says).toContain('Signing out of Windows stops the office')
    expect(seen.says).not.toContain('Linux only')

    expect(readStartAtLogin({ home, office, platform: 'darwin', user: 'sam' })).toMatchObject({ setInTheMenuBar: true, setInTheTray: false })
    const elsewhere = readStartAtLogin({ home, office, platform: 'freebsd', user: 'sam' })
    expect(elsewhere).toMatchObject({ setInTheMenuBar: false, setInTheTray: false })
    expect(elsewhere.says).toBe('Starting at login is built for Linux only, and this computer runs freebsd.')
    const linux = readStartAtLogin({ home, office, platform: 'linux', user: 'sam', systemctl: () => ({ code: 1, out: '', err: 'no systemd here' }) })
    expect(linux).toMatchObject({ systemd: 'no answer', setInTheMenuBar: false, setInTheTray: false })
  })

  it('3. the press refuses on Windows, says where it is set instead, and writes nothing', () => {
    for (const press of [turnStartAtLoginOn, turnStartAtLoginOff]) {
      const pressed = press({ home, office, platform: 'win32' })
      expect(pressed, press.name).toMatchObject({ ok: false, code: 'startAtLoginNotLinux' })
      const says = 'says' in pressed ? pressed.says : ''
      expect(says, press.name).toContain('in the menu of the Mole Office icon, in the notification area')
      expect(says, press.name).toContain('Nothing was written.')
    }
    expect(existsSync(theStartAtLoginUnitPath(home))).toBe(false)
    expect(existsSync(home)).toBe(false)
  })

  it('4. the page on Windows says where, with no press', () => {
    const windows = readStartAtLogin({ home, office, platform: 'win32', user: 'sam' })
    const plain = drawn(windows)
    expect(plain).toContain(asDrawn(i18n.t('startAtLogin.windows.where')))
    expect(plain).not.toContain(asDrawn(i18n.t('startAtLogin.word.notLinux')))
    expect(plain).not.toContain(asDrawn(i18n.t('startAtLogin.mac.where')))
    expect(plain).not.toContain('<button')
    expect(plain).not.toContain(asDrawn(windows.says))

    mode.setMode('inspect')
    const developer = drawn(windows)
    expect(developer).toContain(asDrawn(windows.says))
    expect(developer).toContain(asDrawn(i18n.t('startAtLogin.windows.where')))
    expect(developer).not.toContain('<button')
    mode.setMode('normal')

    // A Mac's reading draws what it drew before: where, and nothing about Windows.
    const mac = drawn(readStartAtLogin({ home, office, platform: 'darwin', user: 'sam' }))
    expect(mac).toContain(asDrawn(i18n.t('startAtLogin.mac.where')))
    expect(mac).not.toContain(asDrawn(i18n.t('startAtLogin.windows.where')))
  })
})
