// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TURN DRAFT'S PAGE SAYS WHOM ITS WORDS ARE HELD FOR AND THAT THEY GO AS ONE MESSAGE, AND IT OPENS ON THE WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * A run that reports its turns has the messages it writes held in one draft per set of readers, and Mole Office
 * sends each draft as one message when the turn ends (src/server/lib/turn-drafts.ts). The record page drew a held
 * turn draft as any draft: its title, then Body and Becomes, both closed. Nothing on it said whom the words were
 * held for or that they would go as one message, and the held words themselves were folded away. An agent found
 * both on round BV's pictures.
 *
 * So, in English and in Chinese:
 *
 *   1. A held turn draft to a person has one line under its title: held for that person by name, sent as one
 *      message when the turn ends, and within the minutes a person's draft goes in at the latest.
 *   2. A held turn draft to an agent has the line without the minutes, and the agent is named.
 *   3. A held turn draft to a group says it is held for the members of a group. The page holds no group's name.
 *   4. A sent turn draft says whom it went to and when, and links to the message it became.
 *   5. A turn draft whose send was refused has no line, because it is neither held to go nor sent.
 *   6. The Body fold is open on every turn draft, and closed on any other draft.
 *
 * The drafts are made up and handed to the page as plain data, in the shape src/server/lib/turn-drafts.ts writes
 * (`holdIt` and `sendOne`). Nothing here fetches.
 *
 * Proved by mutation, each run alone against this file:
 *   - the record page not drawing the line → cases 1 to 4 are red;
 *   - the line drawn for a refused send as if it were held → case 5 is red;
 *   - the Body fold left closed on a turn draft → case 6 is red;
 *   - the Body fold opened on every draft → case 6 is red, on the draft that is not a turn draft.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES } from '../src/shared/turn-drafts.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Router = typeof import('../src/web/components/router.tsx')

const NOW = '2026-11-08 05:30:00'
const SENT_AT = '2026-11-08 05:41:00'
const PERSON = { id: 'made-up-reader', handle: 'made-up-reader', name: 'Made-up Reader' }
const AGENT = { id: 'made-up-agent-id', handle: 'made-up-kiln-keeper', name: 'Made-up Kiln Keeper' }
const WRITER = { id: 'made-up-writer-id', handle: 'made-up-writer', name: 'Made-up Writer' }
const MESSAGE = 'made-up-message-id'
const WORDS = 'The made-up kiln is cool enough to open.'

/** The registries as the page reads them, holding the made-up reader, the agent and the writer. */
const PARTICIPANTS = { people: [PERSON], agents: [AGENT, WRITER] }

/** A window, and the page imported after it exists, in the page language asked for. */
async function boot(language: 'en' | 'zh'): Promise<{ page: Page; i18n: I18n; router: Router }> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage(language)
  return { page: (await import('../src/web/pages/RecordPage.tsx')) as Page, i18n, router: await import('../src/web/components/router.tsx') }
}

/** The turn field as `holdIt` writes it, for these `to` fields. */
function turnFor(fields: Record<string, unknown>, toAPerson: boolean): Record<string, unknown> {
  return {
    run: 'made-up-run-id',
    agent: { kind: 'agent', id: WRITER.id },
    readers: 'made-up readers key',
    heldAt: NOW,
    writes: 1,
    sendIds: [],
    fields,
    toAPerson,
  }
}

/** A draft record with these data, as the page receives it. */
function draft(data: Record<string, unknown>): PanelRecord {
  return {
    id: 'made-up-draft-id',
    workspaceId: 'default',
    kind: 'draft',
    title: 'The made-up kiln',
    summary: null,
    data: { body: WORDS, becomes: 'message', ...data },
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  } as unknown as PanelRecord
}

const TO_THE_PERSON = [{ kind: 'person', id: PERSON.id }]
const TO_THE_AGENT = [{ kind: 'agent', id: AGENT.id }]

const HELD_FOR_THE_PERSON = draft({ for: TO_THE_PERSON, turn: turnFor({ to: TO_THE_PERSON }, true) })
const HELD_FOR_THE_AGENT = draft({ for: TO_THE_AGENT, turn: turnFor({ to: TO_THE_AGENT }, false) })
const HELD_FOR_A_GROUP = draft({ for: [], turn: turnFor({ toGroup: 'made-up-group-id' }, false) })
const SENT_TO_THE_PERSON = draft({ for: TO_THE_PERSON, turn: turnFor({ to: TO_THE_PERSON }, true), sentAs: MESSAGE, sentAt: SENT_AT })
const REFUSED = draft({
  for: TO_THE_PERSON,
  turn: { ...turnFor({ to: TO_THE_PERSON }, true), notSent: { at: SENT_AT, why: 'A made-up refusal.' } },
})
const NOT_A_TURN_DRAFT = draft({ for: TO_THE_PERSON })

/** The page's body for one draft, as RecordDetail draws it in normal mode. */
function drawn(page: Page, record: PanelRecord): string {
  return renderToStaticMarkup(
    h(page.RecordDetail, {
      record,
      editable: false,
      deleted: false,
      records: [record],
      detailLinks: [],
      relations: [],
      evolutionLinks: [],
      log: { changes: [], sessions: [] },
      participants: PARTICIPANTS,
      titles: [record.title],
      titleById: new Map([[record.id, record.title]]),
      unfilledByRecord: new Map<string, number>(),
      body: page.bodySections(record),
      onChanged: () => {},
    } as never),
  )
}

/** Words as the page's markup writes them. */
function asMarkup(words: string): string {
  return renderToStaticMarkup(h('i', null, words)).slice('<i>'.length, -'</i>'.length)
}

/** Whether the fold headed by these words is drawn open. */
function theFoldIsOpen(html: string, heading: string): boolean {
  const at = html.indexOf(`>${asMarkup(heading)}</summary>`)
  expect(at, `the page draws a fold headed ${heading}`).toBeGreaterThan(-1)
  const opening = html.slice(html.lastIndexOf('<details', at), at)
  return /\sopen=""/.test(opening)
}

describe('a turn draft says whom its words are held for, and opens on them', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`1: a held turn draft to a person names the person and says it goes as one message (${language})`, async () => {
      const { page, i18n } = await boot(language)
      const line = i18n.t('record.turnDraft.heldForAPerson', {
        readers: PERSON.name,
        minutes: A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES,
      })
      expect(drawn(page, HELD_FOR_THE_PERSON), 'the line under the title').toContain(`<p class="rd-sub">${asMarkup(line)}</p>`)
    })

    it(`2: a held turn draft to an agent names the agent, without the minutes (${language})`, async () => {
      const { page, i18n } = await boot(language)
      const line = i18n.t('record.turnDraft.held', { readers: AGENT.name })
      expect(drawn(page, HELD_FOR_THE_AGENT), 'the line under the title').toContain(`<p class="rd-sub">${asMarkup(line)}</p>`)
    })

    it(`3: a held turn draft to a group says it is held for the group's members (${language})`, async () => {
      const { page, i18n } = await boot(language)
      const line = i18n.t('record.turnDraft.held', { readers: i18n.t('record.turnDraft.aGroup') })
      expect(drawn(page, HELD_FOR_A_GROUP), 'the line under the title').toContain(`<p class="rd-sub">${asMarkup(line)}`)
    })

    it(`4: a sent turn draft says whom it went to and when, and links to the message (${language})`, async () => {
      const { page, i18n, router } = await boot(language)
      const html = drawn(page, SENT_TO_THE_PERSON)
      const line = i18n.t('record.turnDraft.sent', { readers: PERSON.name, at: i18n.writtenMoment(SENT_AT) })
      expect(html, 'the line under the title').toContain(`<p class="rd-sub">${asMarkup(line)}`)
      // The page's addresses are hash routes, so a link inside the page is written with a # before the path.
      expect(html, 'the link to the message it became').toContain(`href="#${asMarkup(router.recordPath(MESSAGE))}"`)
      expect(html, 'the words of the link').toContain(`>${asMarkup(i18n.t('record.turnDraft.openTheMessage'))}</a>`)
      expect(html, 'no line says it is still held').not.toContain(asMarkup(i18n.t('record.turnDraft.heldForAPerson', {
        readers: PERSON.name,
        minutes: A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES,
      })))
    })
  }

  it('5: a turn draft whose send was refused says neither held nor sent', async () => {
    const { page, i18n } = await boot('en')
    const html = drawn(page, REFUSED)
    const held = i18n.t('record.turnDraft.heldForAPerson', { readers: PERSON.name, minutes: A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES })
    expect(html, 'a refused send is not held to go').not.toContain(asMarkup(held))
    expect(html, 'a refused send was not sent').not.toContain(asMarkup(i18n.t('record.turnDraft.openTheMessage')))
  })

  it('6: the Body fold is open on every turn draft and closed on any other draft', async () => {
    const { page } = await boot('en')
    const heading = page.bodySections(HELD_FOR_THE_PERSON).find((one) => one.key === 'body')?.heading
    expect(heading, 'a draft has a Body section').toBeDefined()
    for (const [what, record] of [
      ['held for a person', HELD_FOR_THE_PERSON],
      ['held for an agent', HELD_FOR_THE_AGENT],
      ['held for a group', HELD_FOR_A_GROUP],
      ['sent', SENT_TO_THE_PERSON],
      ['refused', REFUSED],
    ] as const) {
      expect(theFoldIsOpen(drawn(page, record), heading!), `Body on a turn draft ${what}`).toBe(true)
    }
    expect(theFoldIsOpen(drawn(page, NOT_A_TURN_DRAFT), heading!), 'Body on a draft that is not a turn draft').toBe(false)
    expect(theFoldIsOpen(drawn(page, HELD_FOR_THE_PERSON), page.bodySections(HELD_FOR_THE_PERSON).find((one) => one.key === 'becomes')!.heading),
      'Becomes stays closed on a turn draft').toBe(false)
  })
})
