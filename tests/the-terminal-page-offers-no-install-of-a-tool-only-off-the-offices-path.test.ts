// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL PAGE OFFERS NO INSTALL OF A TOOL THAT IS ONLY OFF THE OFFICE'S PATH. Wave 13u, round 242.
 *
 * The agent tools list looks for each tool's program on the PATH the office's terminals get. Where the server's start
 * did not read the user's own PATH, a tool not found there may still be installed where the user's shell finds it. So
 * the row says "not on the office's PATH" with the line saying why the user's PATH was not read beside it, and no tick
 * is drawn, so no install of it is offered. Where the user's PATH was read, the row is as it was: not found, and the
 * tick. The install command line, with the vendor's link, is drawn only where the tool is not just off the office's
 * PATH. The tool may already be installed for the user's shell, so a person who types the shown command may install it
 * twice, as an install from the page would.
 *
 * HOW IT IS READ HERE. One tool's row, `TheHarness`, is drawn with a made-up tool and each PATH reading, with the page
 * choosing tools to install, and the markup React writes is read. No tool runs and no door is asked.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { TheUsersPathAsTheDoorSaysIt } from '../src/config/the-users-own-path.mjs'
import type { HarnessReading } from '../src/shared/harnesses.ts'
import { t } from '../src/shared/i18n.ts'

type ThePanel = typeof import('../src/web/components/InstallHarnesses.tsx')
let panel: ThePanel

// THE PANEL IS IMPORTED ONCE, with time to be transformed: it brings the browser app's api and ui modules with it.
beforeAll(async () => {
  panel = await import('../src/web/components/InstallHarnesses.tsx')
}, 60_000)

/** A word as React writes it into markup. */
const asDrawn = (words: string): string => words.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A made-up tool as the agent tools list answers it, with an install command, its program at `path` or not found. */
function aTool(path: string | null): HarnessReading {
  return {
    id: 'codex',
    name: 'Codex',
    program: 'codex',
    install: { command: 'example-install codex', source: 'https://vendor.example.invalid/', read: 'https://registry.example.invalid/' },
    noInstall: null,
    installed: { path, version: path === null ? 'Example: not found on the PATH.' : '1.0.0', versionWasRead: path !== null },
    newest: { read: false, version: null, from: 'https://registry.example.invalid/', why: 'Example: not read.', readAt: '2026-11-22T06:00:00.000Z' },
    newer: path === null ? { answer: 'unknown', why: 'notInstalled' } : { answer: 'unknown', why: 'newestUnread' },
    beingReadAgain: { installed: null, newest: null },
  }
}

const NOT_READ: TheUsersPathAsTheDoorSaysIt = { read: false, from: null, shell: null, code: 'notReadAtThisStart', says: 'Example: this start did not read it.' }
const READ: TheUsersPathAsTheDoorSaysIt = { read: true, from: 'loginShell', shell: '/made-up/bin/sh', added: 2 }

/** One tool's row as the page draws it while choosing tools to install. */
function theRow(one: HarnessReading, usersPath: TheUsersPathAsTheDoorSaysIt): string {
  const offered = panel.anInstallIsOffered(one, usersPath)
  return renderToStaticMarkup(h(panel.TheHarness, { one, choosing: true, offered, usersPath, failed: false, ticked: false, onTick: () => {} }))
}

describe("the terminal page and the user's PATH", () => {
  it("draws a tool not found as not on the office's PATH, says why the user's PATH was not read, and offers no install", () => {
    const one = aTool(null)
    expect(panel.anInstallIsOffered(one, NOT_READ)).toBe(false)
    const html = theRow(one, NOT_READ)
    expect(html).toContain(asDrawn(t('harnesses.state.notOnTheOfficesPath')))
    expect(html).toContain(asDrawn(t('harnesses.usersPath.notRead', { why: t('harnesses.usersPath.notReadAtThisStart') })))
    expect(html).not.toContain(asDrawn(t('harnesses.state.notFound')))
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('example-install codex')
    expect(html).not.toContain('https://vendor.example.invalid/')
  })

  it('draws a tool not found as not found, and offers its install, once the user\'s PATH was read', () => {
    const one = aTool(null)
    expect(panel.anInstallIsOffered(one, READ)).toBe(true)
    const html = theRow(one, READ)
    expect(html).toContain(asDrawn(t('harnesses.state.notFound')))
    expect(html).not.toContain(asDrawn(t('harnesses.state.notOnTheOfficesPath')))
    expect(html).not.toContain('ih-path-unread')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('example-install codex')
    expect(html).toContain('https://vendor.example.invalid/')
  })

  it("draws a tool that was found as before, whether or not the user's PATH was read", () => {
    const one = aTool('/made-up/bin/codex')
    for (const usersPath of [NOT_READ, READ]) {
      expect(panel.anInstallIsOffered(one, usersPath)).toBe(true)
      const html = theRow(one, usersPath)
      expect(html).toContain('1.0.0')
      expect(html).not.toContain(asDrawn(t('harnesses.state.notOnTheOfficesPath')))
      expect(html).toContain('type="checkbox"')
      expect(html).toContain('example-install codex')
      expect(html).toContain('https://vendor.example.invalid/')
    }
  })
})
