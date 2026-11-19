// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START-AT-LOGIN PRESS IS ON SETTINGS, WHERE NORMAL MODE FINDS IT. Wave 13t, round W18c.
 *
 * Terminal management is a developer page, and Normal mode does not show it. So on Linux a person in Normal mode had no
 * way to the press that starts the office at login. The press is now on Settings as well, in the "You" category, on a
 * panel Normal mode draws, in a browser and in the window alike. Terminal management keeps its card as it was.
 *
 *   1. Settings has the panel, in "You", after the window's shutdown panel, drawn in Normal mode and outside the window,
 *      and titled with the card's own heading. Main removed the table of where each panel is kept, so the panel has no
 *      row in it.
 *   2. In the panel the card draws no heading and no frame of its own, because the panel's fold draws the title. On its
 *      own, as Terminal management draws it, the card keeps its heading.
 *   3. On Windows and on a Mac the panel says where the window sets it, with no press, as the card does on Terminal
 *      management.
 *   4. The first line of the unit no longer names Terminal management alone. A unit the press wrote under the older first
 *      line is still the press's own: it reads as out of date and one press writes it again. A unit of that name with
 *      any other first line is still not the press's own.
 *
 * Nothing here touches a real unit, systemd or home: the cases read and write a unit in a scratch home, with a stand-in
 * systemctl and loginctl that start nothing.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - the panel's category is changed from "You" to a developer category: red, case 1;
 *   - the panel draws the card without `inAPanel`: red, case 2;
 *   - the unit's reading asks for the whole new first line instead of its beginning: red, case 4.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  START_AT_LOGIN_BACKUP_SUFFIX,
  START_AT_LOGIN_UNIT_MARK,
  readStartAtLogin,
  theStartAtLoginUnit,
  theStartAtLoginUnitPath,
  turnStartAtLoginOn,
} from '../src/config/start-at-login.mjs'
import { SETTINGS_PANELS } from '../src/shared/addresses.ts'
import type { StartAtLoginReading } from '../src/shared/start-at-login.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

const scratch = mkdtempSync(`${TEST_DATABASE_PREFIX}start-at-login-on-settings-`)
/** A made-up office for the unit to start. */
const office = { command: '/opt/made-up/mole-office', args: [], databasePath: '/srv/made-up/office.db', port: 8999, path: '/usr/bin' }

/** The first line every unit had before this round, when the press was drawn on Terminal management only. */
const THE_OLDER_FIRST_LINE = '# Written by the press "Start at login" on the Mole Office Terminal management page. A second press writes it again.'

const supplied = vi.hoisted(() => ({ reading: null as unknown }))
vi.mock('../src/web/components/ui.tsx', async (original) => {
  const real = await original<typeof import('../src/web/components/ui.tsx')>()
  // The card's one read, answered with the reading this test gives it.
  return { ...real, useAsync: () => [{ status: 'ready', value: supplied.reading }, () => {}] }
})
let card: typeof import('../src/web/components/StartAtLogin.tsx')
let settings: typeof import('../src/web/pages/SettingsPage.tsx')
let i18n: typeof import('../src/shared/i18n.ts')
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage,
    location: { hash: '#/settings', search: '' }, addEventListener: () => {}, removeEventListener: () => {} } })
  card = await import('../src/web/components/StartAtLogin.tsx')
  settings = await import('../src/web/pages/SettingsPage.tsx')
  i18n = await import('../src/shared/i18n.ts')
})
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** A stand-in systemctl for one home: systemd answers, the unit is enabled once enabled, and nothing is started. */
function aStandInSystemd(state: { enabled: boolean }): { systemctl: (args: string[]) => { code: number; out: string; err: string }; asked: string[] } {
  const asked: string[] = []
  const systemctl = (args: string[]) => {
    asked.push(args.join(' '))
    if (args[0] === 'show-environment') return { code: 0, out: 'HOME=/made-up\n', err: '' }
    if (args[0] === 'is-enabled') return { code: state.enabled ? 0 : 1, out: state.enabled ? 'enabled\n' : 'disabled\n', err: '' }
    if (args[0] === 'is-active') return { code: 3, out: 'inactive\n', err: '' }
    if (args[0] === 'daemon-reload') return { code: 0, out: '', err: '' }
    if (args[0] === 'enable') {
      state.enabled = true
      return { code: 0, out: '', err: '' }
    }
    return { code: 1, out: '', err: `The stand-in does not take: ${args.join(' ')}` }
  }
  return { systemctl, asked }
}

const noLoginctl = () => ({ code: 1, out: '', err: 'no loginctl here' })

/** A Linux reading of a press that is off, as the server would answer it. */
function aLinuxReadingThatIsOff(): StartAtLoginReading {
  const home = join(scratch, 'home-off')
  return readStartAtLogin({ home, office, platform: 'linux', user: 'sam', systemctl: aStandInSystemd({ enabled: false }).systemctl, loginctl: noLoginctl }) as StartAtLoginReading
}

/** One drawing of an element from one reading, without its style sheet. */
function drawn(element: ReturnType<typeof h>, reading: StartAtLoginReading): string {
  supplied.reading = reading
  return renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** A word as the page draws it into markup. */
function asDrawn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')
}

/** How many times `part` is in `whole`. */
function timesIn(whole: string, part: string): number {
  return whole.split(part).length - 1
}

describe('the start-at-login press is on Settings, where Normal mode finds it', () => {
  it('1. Settings has the panel in "You", after the window\'s shutdown, drawn in Normal mode and in a browser', () => {
    expect(SETTINGS_PANELS).toContain('settings.startatlogin')
    expect(settings.whereThePanelIs('settings.startatlogin')).toEqual({ category: 'settingsCats.cat.you', developerOnly: false })
    expect(settings.DEVELOPER_ONLY_PANELS.has('settings.startatlogin')).toBe(false)
    expect(settings.WINDOW_ONLY_PANELS.has('settings.startatlogin')).toBe(false)
    expect(settings.TITLE_KEYS['settings.startatlogin']).toBe('startAtLogin.heading')
    // The page lists the panels of a category in the order of its table, and the press sits after the window's shutdown.
    const you = SETTINGS_PANELS.filter((panel) => settings.whereThePanelIs(panel).category === 'settingsCats.cat.you')
    expect(you.indexOf('settings.startatlogin')).toBe(you.indexOf('settings.windowshutdown') + 1)
  })

  it('2. in the panel the card draws no heading or frame of its own; on its own it keeps its heading', () => {
    const reading = aLinuxReadingThatIsOff()
    expect(reading).toMatchObject({ systemd: 'answers', unit: 'none', startsAtLogin: false })
    const heading = asDrawn(i18n.t('startAtLogin.heading'))

    const inThePanel = drawn(h(card.StartAtLoginPanel), reading)
    expect(inThePanel).toContain('data-target="uiSurface/settings.startatlogin"')
    expect(inThePanel).toContain('class="sal sal-in-a-panel"')
    expect(inThePanel).not.toContain('sal-heading')
    expect(timesIn(inThePanel, `>${heading}<`)).toBe(1)
    expect(inThePanel).toContain(asDrawn(i18n.t('startAtLogin.turnOn')))
    expect(inThePanel).toContain(asDrawn(i18n.t('startAtLogin.loginNotBoot')))

    const onItsOwn = drawn(h(card.StartAtLogin), reading)
    expect(onItsOwn).toContain('<section class="sal" aria-labelledby="sal-heading">')
    expect(onItsOwn).toContain(`<h2 class="sal-heading" id="sal-heading">${heading}</h2>`)
    expect(onItsOwn).toContain(asDrawn(i18n.t('startAtLogin.turnOn')))
  })

  it('3. on Windows and on a Mac the panel says where the window sets it, with no press', () => {
    const home = join(scratch, 'home-elsewhere')
    const windows = drawn(h(card.StartAtLoginPanel), readStartAtLogin({ home, office, platform: 'win32', user: 'sam' }) as StartAtLoginReading)
    expect(windows).toContain(asDrawn(i18n.t('startAtLogin.windows.where')))
    expect(windows).toContain(asDrawn(i18n.t('startAtLogin.windows.signOut')))
    expect(windows).not.toContain(asDrawn(i18n.t('startAtLogin.turnOn')))
    const mac = drawn(h(card.StartAtLoginPanel), readStartAtLogin({ home, office, platform: 'darwin', user: 'sam' }) as StartAtLoginReading)
    expect(mac).toContain(asDrawn(i18n.t('startAtLogin.mac.where')))
    expect(mac).not.toContain(asDrawn(i18n.t('startAtLogin.turnOn')))
  })

  it('4. a unit under the older first line is the press\'s own and is written again; any other first line is not', () => {
    // THE NEW FIRST LINE names both places the press is drawn.
    expect(START_AT_LOGIN_UNIT_MARK).toContain('Settings')
    expect(START_AT_LOGIN_UNIT_MARK).toContain('Terminal management')
    const now = theStartAtLoginUnit(office)
    expect(now.split('\n')[0]).toBe(START_AT_LOGIN_UNIT_MARK)

    // A UNIT THE PRESS WROTE BEFORE THIS ROUND: the same unit under the older first line.
    const home = join(scratch, 'home-older')
    const unitPath = theStartAtLoginUnitPath(home)
    mkdirSync(dirname(unitPath), { recursive: true })
    const older = [THE_OLDER_FIRST_LINE, ...now.split('\n').slice(1)].join('\n')
    writeFileSync(unitPath, older)
    const systemd = aStandInSystemd({ enabled: true })
    const read = () => readStartAtLogin({ home, office, platform: 'linux', user: 'sam', systemctl: systemd.systemctl, loginctl: noLoginctl })
    const before = read()
    expect(before).toMatchObject({ unit: 'out of date', startsAtLogin: true })
    expect(before.says).toBe('The office starts when you log in, but its unit is not the one the press writes for this office now; press again to write it again.')

    const pressed = turnStartAtLoginOn({ home, office, platform: 'linux', systemctl: systemd.systemctl })
    expect(pressed).toMatchObject({ ok: true, turned: 'already on' })
    expect(readFileSync(unitPath, 'utf8')).toBe(now)
    expect(readFileSync(`${unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}`, 'utf8')).toBe(older)
    expect(read()).toMatchObject({ unit: 'current', startsAtLogin: true })

    // A UNIT OF THAT NAME WITH ANY OTHER FIRST LINE is not the press's own: it is read so, and the press leaves it.
    const theirs = join(scratch, 'home-theirs')
    const theirPath = theStartAtLoginUnitPath(theirs)
    mkdirSync(dirname(theirPath), { recursive: true })
    const theirText = ['# Written by the person', ...now.split('\n').slice(1)].join('\n')
    writeFileSync(theirPath, theirText)
    const theirSystemd = aStandInSystemd({ enabled: true })
    expect(readStartAtLogin({ home: theirs, office, platform: 'linux', user: 'sam', systemctl: theirSystemd.systemctl, loginctl: noLoginctl })).toMatchObject({ unit: 'not ours' })
    expect(turnStartAtLoginOn({ home: theirs, office, platform: 'linux', systemctl: theirSystemd.systemctl })).toMatchObject({ ok: false, code: 'startAtLoginNotOurs' })
    expect(readFileSync(theirPath, 'utf8')).toBe(theirText)
  })
})
