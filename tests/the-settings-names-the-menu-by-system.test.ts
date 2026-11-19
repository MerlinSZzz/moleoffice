// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS SENTENCE NAMES THE MENU AS EACH SYSTEM NAMES IT (wave 13t, round W32, item 2).
 *
 * The window's Settings panel says what the menu's Shut down item does. On a Mac the menu is the
 * menu bar; on Windows and Linux it is the notification area. The window adds its system to the
 * user agent it gives every page, in the one place that adds the window's mark
 * (src/config/the-window-mark.mjs), and the page reads it in one place
 * (src/web/components/ShutDown.tsx).
 *
 * MUTATIONS, each red here and green again when put back:
 *   - src/web/components/ShutDown.tsx: the sentence is the notification-area one on every system,
 *     so the Mac case is red;
 *   - src/config/the-window-mark.mjs: the system named when none is given is this process's own,
 *     so case 4 is red.
 */

import { describe, expect, it } from 'vitest'

import { markEveryPageOf, theSystemOn } from '../src/config/the-window-mark.mjs'
import { t } from '../src/shared/i18n.ts'
import { theTraySentenceKey } from '../src/web/components/ShutDown.tsx'

/** A user agent as the window gives it, after `markEveryPageOf` has marked an app for this system. */
function theWindowsUserAgent(system: string): string {
  const app = { userAgentFallback: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) mole-office/1' }
  markEveryPageOf(app, system as NodeJS.Platform)
  return app.userAgentFallback
}

describe('the Settings sentence names the menu by system', () => {
  it('1. the menu bar on a Mac, the notification area on Windows and Linux', () => {
    expect(theSystemOn(theWindowsUserAgent('darwin'))).toBe('darwin')
    expect(theSystemOn(theWindowsUserAgent('win32'))).toBe('win32')
    expect(theSystemOn(theWindowsUserAgent('linux'))).toBe('linux')

    const mac = theTraySentenceKey(theWindowsUserAgent('darwin'))
    const windows = theTraySentenceKey(theWindowsUserAgent('win32'))
    const linux = theTraySentenceKey(theWindowsUserAgent('linux'))
    expect(mac).toBe('shutDown.windowOnly.trayMenuBar')
    expect(windows).toBe('shutDown.windowOnly.trayNotificationArea')
    expect(linux).toBe('shutDown.windowOnly.trayNotificationArea')
    expect(t(mac)).toContain('menu bar')
    expect(t(windows)).toContain('notification area')
    expect(t(linux)).toContain('notification area')
    expect(t(mac)).not.toBe(t(windows))
  })

  it('2. a page without the window\'s mark keeps the sentence it had', () => {
    expect(theSystemOn('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBeNull()
    expect(theTraySentenceKey('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe('shutDown.windowOnly.tray')
  })

  it('3. the one mark adds the window and its system once, and a later system replaces it', () => {
    const app = { userAgentFallback: 'an agent' }
    markEveryPageOf(app, 'linux')
    expect(app.userAgentFallback).toBe('an agent MoleOfficeWindow/1 MoleOfficeSystem/linux')
    markEveryPageOf(app, 'linux')
    expect(app.userAgentFallback).toBe('an agent MoleOfficeWindow/1 MoleOfficeSystem/linux')
    markEveryPageOf(app, 'darwin')
    expect(app.userAgentFallback).toBe('an agent MoleOfficeWindow/1 MoleOfficeSystem/darwin')
    expect(theSystemOn(app.userAgentFallback)).toBe('darwin')
  })

  it('4. with no system given, the mark names the window and no system', () => {
    const app = { userAgentFallback: 'an agent' }
    markEveryPageOf(app)
    expect(app.userAgentFallback).toBe('an agent MoleOfficeWindow/1')
    expect(theSystemOn(app.userAgentFallback)).toBeNull()
    expect(theTraySentenceKey(app.userAgentFallback)).toBe('shutDown.windowOnly.tray')
    markEveryPageOf(app, 'linux')
    markEveryPageOf(app)
    expect(app.userAgentFallback).toBe('an agent MoleOfficeWindow/1')
  })
})
