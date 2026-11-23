// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S CARD SAYS HOW AN AGENT TOOL IS SET UP, IN ENGLISH AND IN CHINESE, IN THE OWNER'S ORDER.
 * Wave 13u, round 242.
 *
 * The person asked that setting up an agent tool take only his ask, then typing and confirming. The coordinator's
 * design gives the secretary's card one short section for it, in this order: the person asks; the secretary reads
 * whether the tool is installed, where, its version and whether it is signed in; it installs only on his ask; it leads
 * him to the key page or the sign-in; he only types the key and confirms. The section also says that the secretary
 * never asks for a key in chat, that a pasted key gets one line saying where it goes and a lead to the key page, and
 * that the lead is a page lead for exactly that tool and provider. The card is src/config/roles.json; the office copies
 * it onto its own words records, so this reads the shipped file.
 *
 *   1. THE SECTION. The secretary's practice text has one section headed for setting up an agent tool, in each
 *      language, and it is the last section.
 *   2. THE ORDER. Its numbered lines, 1 to 5, say the five steps in the owner's order, in each language.
 *   3. THE KEY IS NEVER ASKED FOR IN CHAT. A later line says so, and says a pasted key gets one line and a lead to the
 *      key page.
 *   4. THE LEAD. The section's example is a page lead, and every address the section names is one of the key page's
 *      addresses, all five are named, and the server's lead check takes each as a page the app has.
 *   5. THE PRESS. Step 3 names the administrator's own press by the word the Coding tools panel draws on it, in each
 *      language. The word is read from the word lists, not copied here.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'
import { SET_UP_WAYS, setUpPath } from '../src/shared/setting-up-a-tool.ts'

interface ACard { name: string; inPractice?: { en: string; zh: string } }

function theSecretarysPractice(): { en: string; zh: string } {
  const declared = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as { cards?: ACard[] } | ACard[]
  const cards = Array.isArray(declared) ? declared : (declared.cards ?? [])
  const practice = cards.find((card) => card.name === 'secretary')?.inPractice
  if (practice === undefined) throw new Error('src/config/roles.json has no secretary card with a practice text.')
  return practice
}

const HEADING = { en: '**Setting up an agent tool**', zh: '**设置编程工具**' } as const

/** Each language's words for the five steps, one per numbered line, in the owner's order. */
const THE_STEPS = {
  en: [
    'The administrator asks for an agent tool',
    'whether the tool is installed, where its program is, its version and whether it is signed in',
    'installs a missing tool only when the administrator asked for it',
    'leads the administrator to the page for exactly that tool and provider',
    'The administrator only types the key',
  ],
  zh: [
    '管理员提出要一个编程工具',
    '装了没有、程序在哪里、版本是多少、登录了没有',
    '只有管理员要了，它才安装缺少的工具',
    '把管理员带到正好是那个工具和那个服务商的页面',
    '管理员只需输入密钥',
  ],
} as const

/** How step 3 names the administrator's own press, given the word the panel draws on it, in each language. */
const THE_PRESS_NAMED = {
  en: (word: string) => `${word} press`,
  zh: (word: string) => `按“${word}”`,
} as const

/** The word the Coding tools panel draws on each tool's set-up press, read from the word lists. */
const THE_PANELS_PRESS = {
  en: sayInEnglish('settingsPanel.tools.setUp'),
  zh: createI18n('zh').t('settingsPanel.tools.setUp'),
} as const

/** The section's words that the key is never asked for in chat, and what a pasted key gets. */
const NEVER_IN_CHAT = {
  en: ['never asks for a key in chat', 'pastes one, it answers in one line', 'leads to that page'],
  zh: ['从不在聊天里要密钥', '贴来一个密钥时，它用一句话说明', '带管理员去那个页面'],
} as const

/** The section of one language's practice text, from its heading to the next heading or the end. */
function theSection(text: string, heading: string): string {
  const at = text.indexOf(heading)
  expect(at, `the practice text has no section headed ${heading}`).toBeGreaterThanOrEqual(0)
  expect(text.indexOf(heading, at + 1), `the practice text has two sections headed ${heading}`).toBe(-1)
  const next = text.indexOf('\n**', at + heading.length)
  return next < 0 ? text.slice(at) : text.slice(at, next)
}

function theNumberedLines(section: string): string[] {
  return section.split('\n').filter((line) => /^\d+\. /.test(line))
}

describe('the secretary card says how an agent tool is set up', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`1. ${language}: has one section for it, the last`, () => {
      const text = theSecretarysPractice()[language]
      const section = theSection(text, HEADING[language])
      expect(text.endsWith(section), 'the section is not the last one in the practice text').toBe(true)
    })

    it(`2. ${language}: says the five steps in the owner's order, one numbered line each`, () => {
      const lines = theNumberedLines(theSection(theSecretarysPractice()[language], HEADING[language]))
      THE_STEPS[language].forEach((words, index) => {
        const line = lines[index] ?? ''
        expect(line.startsWith(`${String(index + 1)}. `), `line ${String(index + 1)} is not numbered ${String(index + 1)}`).toBe(true)
        expect(line, `line ${String(index + 1)} does not say step ${String(index + 1)}`).toContain(words)
      })
    })

    it(`3. ${language}: says a key is never asked for in chat, after the five steps`, () => {
      const lines = theNumberedLines(theSection(theSecretarysPractice()[language], HEADING[language]))
      const said = lines.slice(5).join('\n')
      for (const words of NEVER_IN_CHAT[language]) expect(said).toContain(words)
    })

    it(`5. ${language}: step 3 names the administrator's own press by the word the Coding tools panel draws`, () => {
      const line = theNumberedLines(theSection(theSecretarysPractice()[language], HEADING[language]))[2] ?? ''
      expect(line.startsWith('3. '), 'the third numbered line is not step 3').toBe(true)
      expect(line).toContain(THE_PRESS_NAMED[language](THE_PANELS_PRESS[language]))
    })
  }
})

describe('4. the lead the card gives is a page lead to one of the key pages', () => {
  let t: TestDb
  let targets: typeof import('../src/server/lib/targets.ts')

  beforeAll(async () => {
    t = await freshDb()
    // The app's own module instance, imported after `freshDb` resets the module registry.
    targets = await import('../src/server/lib/targets.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  for (const language of ['en', 'zh'] as const) {
    it(`${language}: its example is a page lead, and it names the five key pages and no other`, () => {
      const section = theSection(theSecretarysPractice()[language], HEADING[language])
      const example = /`(\{"target":\{[^`]*\}\})`/.exec(section)?.[1]
      expect(example, 'the section gives no page lead as its example').toBeDefined()
      const lead = JSON.parse(example ?? '{}') as { target: { kind: string; route: string } }
      expect(lead.target.kind).toBe('page')
      const ours = SET_UP_WAYS.map((one) => setUpPath(one))
      expect(ours).toContain(lead.target.route)
      const named = [...new Set(section.match(/\/set-up\/[a-z-]+\/[a-z-]+/g) ?? [])]
      expect([...named].sort()).toEqual([...ours].sort())
    })
  }

  it('the server takes each key page as a page lead, and refuses a way the page has not', () => {
    for (const one of SET_UP_WAYS) {
      expect(() => targets.checkTarget({ kind: 'page', route: setUpPath(one) }, 'default')).not.toThrow()
    }
    expect(() => targets.checkTarget({ kind: 'page', route: '/set-up/codex/claude' }, 'default')).toThrow(/no page at/)
    expect(() => targets.checkTarget({ kind: 'page', route: '/set-up/codex' }, 'default')).toThrow(/no page at/)
  })
})
