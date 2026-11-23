// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW'S BRIDGE OPENS AN ACCOUNT SIGN-IN'S ADDRESS IN THE SYSTEM'S BROWSER ONLY WHEN IT IS HTTPS. Wave 13u,
 * round 242.
 *
 * The key page opens the address the sign-in door answered (src/server/lib/setting-up-an-agent-tool.ts). In the
 * desktop app it asks the window to open it in the system's browser, through one call of the web page's bridge:
 * `openHttpsOutside` in src/desktop/preload.cjs, answered by the 'web-page-https' handler in src/desktop/main.mjs,
 * which opens only what `theHttpsAddressAsked` (src/desktop/the-web-page.mjs) lets through.
 *
 *   1. `theHttpsAddressAsked` lets an https address through, written as the parser writes it, and refuses every
 *      other scheme, words that are no address, anything that is not a string, and an address over 8192 characters.
 *   2. The preload, run with the stand-in Electron of tests/the-web-pages-bridge-answers-only-the-office-page.test.ts,
 *      gives the call only on the office's own origin, and passes on the address alone.
 *   3. The handler in main.mjs asks the sender check first, then `theHttpsAddressAsked`, returns before Electron's
 *      shell when either refuses, and hands the shell the checked address and nothing else.
 *
 * WHAT IS MADE UP. The addresses are example.com and example.invalid ones, and the office address is made up. No case
 * starts Electron or opens a browser.
 */

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { theHttpsAddressAsked } from '../src/desktop/the-web-page.mjs'

/** A made-up office address, as the window has it. */
const OFFICE = 'http://127.0.0.1:4321'
const MAIN = readFileSync(new URL('../src/desktop/main.mjs', import.meta.url), 'utf8')
const PRELOAD = readFileSync(new URL('../src/desktop/preload.cjs', import.meta.url), 'utf8')

describe('1. the address the office page asks the system’s browser to open', () => {
  it('is let through when it is https, as the parser writes it', () => {
    expect(theHttpsAddressAsked('https://example.com/sign-in?code=1')).toBe('https://example.com/sign-in?code=1')
    expect(theHttpsAddressAsked('HTTPS://Example.com')).toBe('https://example.com/')
  })

  it('is refused in any other scheme', () => {
    for (const asked of ['http://example.com/', 'file:///etc/hosts', 'javascript:alert(1)', 'data:text/html,made-up', 'mailto:someone@example.invalid', 'ws://example.com/', 'wss://example.com/', 'ftp://example.com/', 'about:blank']) {
      expect(theHttpsAddressAsked(asked), asked).toBeNull()
    }
  })

  it('is refused when it is no address, or not a string', () => {
    for (const asked of ['', 'example.com', 'https//example.com', 'not an address', null, undefined, 5, {}, [], new URL('https://example.com/'), { address: 'https://example.com/' }]) {
      expect(theHttpsAddressAsked(asked), JSON.stringify(asked) ?? String(asked)).toBeNull()
    }
  })

  it('is refused when it is longer than 8192 characters', () => {
    const head = 'https://example.com/'
    expect(theHttpsAddressAsked(head + 'a'.repeat(8192 - head.length))).not.toBeNull()
    expect(theHttpsAddressAsked(head + 'a'.repeat(8193 - head.length))).toBeNull()
  })
})

type AnApi = Record<string, (...args: unknown[]) => unknown>

/** Run the preload on a page, with a stand-in Electron whose main process answers the office's origin as `answered`. */
function thePreloadOn(page: { protocol: string; origin: string }, answered: unknown) {
  const exposed: Record<string, AnApi> = {}
  const invoked: unknown[][] = []
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, api: AnApi) => { exposed[name] = api } },
    ipcRenderer: {
      sendSync: () => answered,
      invoke: (channel: string, ...args: unknown[]) => {
        invoked.push([channel, ...args])
        return Promise.resolve(true)
      },
      on: () => undefined,
    },
  }
  const require = (name: string) => {
    if (name !== 'electron') throw new Error(`the preload asked for ${name}`)
    return electron
  }
  runInNewContext(PRELOAD, { require, window: { location: page } }, { filename: 'preload.cjs' })
  return { exposed, invoked }
}

describe('2. the preload', () => {
  it('gives the call on the office’s own origin, and passes on the address alone', async () => {
    const { exposed, invoked } = thePreloadOn({ protocol: 'http:', origin: OFFICE }, OFFICE)
    const call = exposed['theWindowsWebPage']?.['openHttpsOutside']
    if (call === undefined) throw new Error('the office page was given no call to open an https address')
    expect(await call('https://example.com/sign-in', { more: 'made-up' })).toBe(true)
    expect(invoked).toEqual([['web-page-https', 'https://example.com/sign-in']])
  })

  it('gives a page on any other origin nothing', () => {
    for (const page of [{ protocol: 'https:', origin: 'https://example.com' }, { protocol: 'file:', origin: 'null' }]) {
      expect(thePreloadOn(page, OFFICE).exposed['theWindowsWebPage'], page.origin).toBeUndefined()
    }
  })
})

/** The handler in main.mjs for a channel, from `ipcMain.handle('<channel>'` to the line that ends it. */
function theHandler(channel: string): string {
  const start = MAIN.indexOf(`ipcMain.handle('${channel}'`)
  if (start < 0) throw new Error(`main.mjs has no handler for ${channel}`)
  return MAIN.slice(start, MAIN.indexOf('\n  })\n', start) + 6)
}

describe('3. the handler in main.mjs', () => {
  it('is one, inside the web page’s bridge', () => {
    expect(MAIN.split("ipcMain.handle('web-page-https'")).toHaveLength(2)
    const bridge = MAIN.slice(MAIN.indexOf('\nfunction giveTheOfficePageItsBridge('))
    expect(bridge.slice(0, bridge.indexOf('\n}\n'))).toContain(theHandler('web-page-https'))
  })

  it('asks the sender, then the address check, and hands the shell only the checked address', () => {
    const lines = theHandler('web-page-https').split('\n').map((line) => line.trim())
    expect(lines).toEqual([
      "ipcMain.handle('web-page-https', async (event, asked) => {",
      'if (!fromTheOffice(event)) return false',
      'const address = theHttpsAddressAsked(asked)',
      'if (address === null) return false',
      "const { shell } = await import('electron')",
      'await shell.openExternal(address)',
      'return true',
      '})',
      '',
    ])
  })
})
