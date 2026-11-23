// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SETTINGS DRAWS ONE LINE FOR EACH CODING TOOL, WITH ITS SET UP PRESS. Wave 13u, round 242.
 *
 * The keys section of Settings (src/web/components/KeysPanel.tsx), which only a developer sees, once drew each
 * runtime's own key as a read-only row that said set, not set or not looked at, and that the office passes no key.
 * Those rows are gone, and a panel of its own that a person in normal mode sees
 * (src/web/components/settings/CodingToolsPanel.tsx) draws one line for each agent tool the office runs:
 *   - where its program is on the PATH the office's terminals get, or not installed;
 *   - whether it is signed in: yes, no, or not readable with the short word for why, and being read or not read while
 *     the read has no answer;
 *   - one Set up press, and after it the sentence saying which secretary the ask went to and why, or what failed.
 * The rows it replaced are gone from every language's words.
 *
 * HOW IT IS DRAWN HERE. The line as drawn, `TheCodingToolLine`, reads nothing and sends nothing, so each case hands it
 * a made-up tool, a sign-in state and a press's answer, and reads the markup React writes. `CodingToolLines` draws the
 * list with each line's own read, which has no answer while drawn once on the server, so each line says being read.
 * No tool runs and no door is asked.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { HarnessReading, SignedIn, TheSetUpSent, WhyThisSecretary } from '../src/shared/harnesses.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import type { SettingsPanelDeclaration } from '../src/shared/settings-declaration.ts'

type ThePanel = typeof import('../src/web/components/settings/CodingToolsPanel.tsx')
let panel: ThePanel
let i18n: typeof import('../src/shared/i18n.ts')
let declaration: typeof import('../src/shared/settings-declaration.ts')

/** The six word keys of the rows the lines replaced. */
const THE_REMOVED_KEYS = [
  'settingsPanel.keys.toolsHeading',
  'settingsPanel.keys.runtime.claudeCode.provider',
  'settingsPanel.keys.runtime.codex.provider',
  'settingsPanel.keys.runtime.opencode.provider',
  'settingsPanel.keys.nobodyLooked',
  'settingsPanel.keys.askedWith',
] as const

/** A made-up folder holding the made-up programs: no path of this machine. */
const A_MADE_UP_FOLDER = '/made-up/bin'

// THE PANEL IS IMPORTED ONCE, with time to be transformed. The runner's environment is node and this project has ruled
// out jsdom, so a window stand-in is installed before the modules are imported, as tests/a-panel-that-asks-for-a-tone-gets-one.test.ts does.
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '#/settings/codingtools', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
  panel = await import('../src/web/components/settings/CodingToolsPanel.tsx')
  i18n = await import('../src/shared/i18n.ts')
  declaration = await import('../src/shared/settings-declaration.ts')
}, 60_000)

/** A word in the page's language, as React writes it into markup. */
function drawn(key: WordKey, values?: Record<string, string>): string {
  return i18n.t(key, values).replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** One made-up agent tool as the agent tools list answers it, its program at `path` or not installed. */
function aTool(id: string, name: string, path: string | null): HarnessReading {
  return {
    id,
    name,
    program: id,
    install: null,
    noInstall: null,
    installed: { path, version: path === null ? 'Example: not found on the PATH.' : '1.0.0', versionWasRead: path !== null },
    newest: { read: false, version: null, from: 'https://registry.example.invalid/', why: 'Example: not read.', readAt: '2026-11-22T06:00:00.000Z' },
    newer: path === null ? { answer: 'unknown', why: 'notInstalled' } : { answer: 'unknown', why: 'newestUnread' },
    beingReadAgain: { installed: null, newest: null },
  }
}

const CODEX = aTool('codex', 'Codex', `${A_MADE_UP_FOLDER}/codex`)
const OPENCODE = aTool('opencode', 'OpenCode', null)

type TheLine = Parameters<ThePanel['TheCodingToolLine']>[0]

/** One line drawn, with the sign-in read and the press as each case gives them. */
function aLine(given: Partial<TheLine>): string {
  const props: TheLine = { one: CODEX, signIn: { status: 'loading' }, pressing: false, sent: null, refused: null, onSetUp: () => {}, ...given }
  return renderToStaticMarkup(h(panel.TheCodingToolLine, props))
}

const signedIn = (answer: SignedIn): TheLine['signIn'] => ({ status: 'ready', value: { signedIn: answer } })
const sentTo = (why: WhyThisSecretary): TheSetUpSent => ({ harness: 'codex', secretary: { id: 'example-registry-id', name: 'example-secretary' }, why, message: 'example-message' })

/** Every element in a tree a component returned, the tree itself first. */
function everyElement(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(everyElement)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...everyElement(node.props['children'] as ReactNode)]
}

describe('Settings draws one line for each coding tool', () => {
  it('is a panel of its own among the tools, for a person in normal mode, and its press is the person\'s alone', () => {
    const panels: readonly SettingsPanelDeclaration[] = declaration.PANELS
    const declared = panels.find((one) => one.key === 'settings.codingtools')
    expect(declared).toBeDefined()
    expect(declared?.category).toBe('tools')
    expect(declared?.developerOnly).toBe(false)
    expect(declared?.windowOnly).toBe(false)
    expect(declared?.controls.map((one) => [one.key, one.whoMayPress])).toEqual([['settingsPanel.tools.setUp', 'The person only.']])
    // THE KEYS PANEL, which only a developer sees, no longer declares the press.
    const keys = panels.find((one) => one.key === 'settings.keys')
    expect(keys?.developerOnly).toBe(true)
    expect(keys?.controls.some((one) => one.key.startsWith('settingsPanel.tools.'))).toBe(false)
  })

  it('draws one line for each tool on the list, each with its name and its Set up press', () => {
    const tools = [aTool('claude-code', 'Claude Code', `${A_MADE_UP_FOLDER}/claude`), CODEX, OPENCODE]
    const html = renderToStaticMarkup(h(panel.CodingToolLines, { harnesses: tools }))
    expect(html.match(/data-tool="/g)).toHaveLength(3)
    for (const one of tools) expect(html).toContain(`data-tool="${one.id}"`)
    expect(html.split(drawn(declaration.settingsControlWord('settings.codingtools', 'settingsPanel.tools.setUp')))).toHaveLength(4)
    // EACH LINE'S OWN SIGN-IN READ HAS NO ANSWER WHILE DRAWN ONCE, so each says it is being read.
    expect(html.split(drawn('settingsPanel.tools.beingRead'))).toHaveLength(4)
  })

  it('draws where the program is when installed, and not installed when it is not', () => {
    const installed = aLine({ one: CODEX })
    expect(installed).toContain(`<code>${A_MADE_UP_FOLDER}/codex</code>`)
    expect(installed).not.toContain(drawn('settingsPanel.tools.notInstalled'))
    const missing = aLine({ one: OPENCODE })
    expect(missing).toContain(drawn('settingsPanel.tools.notInstalled'))
    expect(missing).not.toContain('<code>')
  })

  it('draws signed in yes, no, or not readable with why, and never a guess while the read has no answer', () => {
    expect(aLine({ signIn: signedIn({ answer: 'yes', asked: 'codex login status' }) })).toContain(drawn('settingsPanel.tools.signedIn.yes'))
    expect(aLine({ signIn: signedIn({ answer: 'no', asked: 'codex login status' }) })).toContain(drawn('settingsPanel.tools.signedIn.no'))
    const notReadable = aLine({ one: OPENCODE, signIn: signedIn({ answer: 'notReadable', why: 'notInstalled', asked: null }) })
    expect(notReadable).toContain(drawn('settingsPanel.tools.signedIn.notReadable', { why: i18n.t('settingsPanel.tools.signedIn.notInstalled') }))
    const beingRead = aLine({ signIn: { status: 'loading' } })
    expect(beingRead).toContain(drawn('settingsPanel.tools.beingRead'))
    const notRead = aLine({ signIn: { status: 'error', message: 'Example: the read failed.', fault: null } })
    expect(notRead).toContain(drawn('settingsPanel.tools.notRead'))
    for (const unanswered of [beingRead, notRead]) {
      expect(unanswered).not.toContain(`>${drawn('settingsPanel.tools.signedIn.yes')}<`)
      expect(unanswered).not.toContain(`>${drawn('settingsPanel.tools.signedIn.no')}<`)
    }
  })

  it('says which secretary the press went to and why, in one sentence for each reason', () => {
    const reasons: Record<WhyThisSecretary, WordKey> = {
      holdsTheDuty: 'settingsPanel.tools.sent.holdsTheDuty',
      theOnlySecretary: 'settingsPanel.tools.sent.theOnlySecretary',
      writtenToLast: 'settingsPanel.tools.sent.writtenToLast',
      registeredFirst: 'settingsPanel.tools.sent.registeredFirst',
    }
    for (const [why, key] of Object.entries(reasons) as [WhyThisSecretary, WordKey][]) {
      const html = aLine({ sent: sentTo(why) })
      expect(html).toContain(drawn(key, { name: 'example-secretary' }))
      expect(html).toContain('role="status"')
      expect(html).not.toContain('role="alert"')
    }
  })

  it('says what failed in one line when the press was refused', () => {
    const html = aLine({ refused: 'Example: no secretary is registered.' })
    expect(html).toContain(drawn('settingsPanel.tools.notSent', { why: 'Example: no secretary is registered.' }))
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).not.toContain('role="status"')
  })

  it('sends through the press it is handed, and through nothing else', () => {
    const onSetUp = (): void => {}
    const tree = panel.TheCodingToolLine({ one: CODEX, signIn: { status: 'loading' }, pressing: false, sent: null, refused: null, onSetUp })
    const presses = everyElement(tree).filter((one) => typeof one.props['onClick'] === 'function')
    expect(presses).toHaveLength(1)
    expect(presses[0]?.props['onClick']).toBe(onSetUp)
  })

  it('leaves the rows it replaced in no language', () => {
    for (const [language, words] of Object.entries(i18n.WORD_LISTS)) {
      for (const key of THE_REMOVED_KEYS) expect(Object.hasOwn(words, key), `${language} still holds ${key}`).toBe(false)
    }
    // THE WORD FILES THEMSELVES, besides the lists they are joined into. A made-from file is the record of what each
    // translation was made from, and a key whose English is gone is read by nothing there.
    const folder = join(import.meta.dirname, '../src/shared/words')
    for (const file of readdirSync(folder).filter((name) => name.endsWith('.ts') && !name.endsWith('made-from.ts'))) {
      const text = readFileSync(join(folder, file), 'utf8')
      for (const key of THE_REMOVED_KEYS) expect(text.includes(`'${key}'`), `${file} still holds ${key}`).toBe(false)
    }
  })
})
