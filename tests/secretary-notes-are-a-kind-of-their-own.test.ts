// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S NOTES ARE A KIND OF THEIR OWN, CALLED "SECRETARY NOTES" AND 秘书笔记.
 * It is item 1 of a decision of wave 13k round 19.
 *
 * What this file holds:
 *   4. The stored record keeps its kind (`notebook`), its id and its entries' ids when the person
 *      adds an entry from the page.
 *
 * THE MUTATIONS THAT PROVE IT:
 *   - make POST /api/agents/<handle>/notebook/entries file a new record every time instead of adding
 *     to the one there (src/server/api/notebook.ts, the `already === null` test): hold 4 goes red,
 *     because the second entry is refused as a second notebook or lands in another record.
 *
 * Made-up names only. Set TEST_SHOTS to a folder to keep the pictures (tests/where-shots-go.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const SECRETARY = 'wren-ledger'
const SECRETARY_NAME = 'Wren Ledger'
const FIRST_WORDS = 'Answer with the conclusion first. Keep the bakery orders apart from the pottery ones.'
const SECOND_WORDS = 'On Fridays the kiln schedule comes before anything else.'

interface Declared {
  elevation: { onlyThisCardCanHoldIt: string }
  cards: { name: string; howItWorks?: { en: string; zh: string } }[]
}

function declared(): Declared {
  return JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as Declared
}

describe('a secretary’s notes in a browser', () => {
  let app: LiveApp
  let recordId = ''
  let firstEntryId = ''
  const person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }

  beforeAll(async () => {
    app = await liveApp({ name: 'secretary-notes', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const started = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: person,
      body: JSON.stringify({ handle: SECRETARY, name: SECRETARY_NAME, role: declared().elevation.onlyThisCardCanHoldIt }),
    })
    expect(started.status, (await started.text()).slice(0, 300)).toBe(201)
    const written = await fetch(`${app.api}/api/agents/${SECRETARY}/notebook/entries`, {
      method: 'POST',
      headers: person,
      body: JSON.stringify({ entryKind: 'how-they-want-answers', text: FIRST_WORDS }),
    })
    expect(written.status, (await written.text()).slice(0, 300)).toBe(201)
    const read = (await (await fetch(`${app.api}/api/agents/${SECRETARY}/notebook`, { headers: person })).json()) as {
      recordId: string
      entries: { id: string; text: string }[]
    }
    recordId = read.recordId
    firstEntryId = read.entries.find((one) => one.text === FIRST_WORDS)?.id ?? ''
    expect(recordId).not.toBe('')
    expect(firstEntryId).not.toBe('')
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  async function open(page: Page, address: string, language: 'en' | 'zh' | 'xx'): Promise<void> {
    await page.goto(`${app.site}/?lang=${language}${address}`)
    await waitForThePage(page, 30_000)
  }

  const notesAddress = `#/who/agent/${SECRETARY}/notebook`

  it('keeps the record’s kind, its id and the first entry’s id when the person writes from the page', async () => {
    const page = app.page
    await open(page, notesAddress, 'en')
    await page.locator('#nb-words').waitFor({ state: 'attached' })
    // The form is behind one press, a fold (tests/read-before-edit.test.ts says why).
    if (!(await page.locator('#nb-words').isVisible())) {
      await page.locator('details.px-explain', { has: page.locator('#nb-words') }).locator('summary').click()
    }
    await page.locator('#nb-words').fill(SECOND_WORDS)
    await page.getByRole('button', { name: 'Write it' }).click()
    await expect.poll(() => page.locator('.nb-entry').count()).toBe(2)
    const read = (await (await fetch(`${app.api}/api/agents/${SECRETARY}/notebook`, { headers: person })).json()) as {
      recordId: string
      entries: { id: string; text: string }[]
    }
    expect(read.recordId).toBe(recordId)
    expect(read.entries.find((one) => one.text === FIRST_WORDS)?.id).toBe(firstEntryId)
    expect(read.entries.map((one) => one.text)).toContain(SECOND_WORDS)
    const record = (await (await fetch(`${app.api}/api/records/${recordId}`, { headers: person })).json()) as { record: { id: string; kind: string } }
    expect(record.record.id).toBe(recordId)
    expect(record.record.kind).toBe('notebook')
  }, 120_000)

  describe.skipIf(!process.env[TEST_SHOTS])('pictures', () => {
    async function aWindow(width: number, theme: 'light' | 'dark'): Promise<Page> {
      const context = await app.browser.newContext({ viewport: { width, height: 1100 }, colorScheme: theme })
      await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
      return context.newPage()
    }

    it('photographs the notes page at four widths, and the places the kind is listed at 1440 and 390', async () => {
      const dir = testShots('secretary-notes')
      const places = [
        ['notes', notesAddress],
        ['agent', `#/who/agent/${SECRETARY}`],
        ['roles', '#/roles'],
        ['records', '#/records'],
      ] as const
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          const page = await aWindow(width, theme)
          try {
            for (const [name, address] of places) {
              if (name !== 'notes' && width !== 1440 && width !== 390) continue
              await open(page, address, 'en')
              await page.waitForTimeout(600)
              await page.screenshot({ path: join(dir, `${name}-${String(width)}-${theme}.png`), fullPage: true })
            }
          } finally {
            await page.context().close()
          }
        }
      }
      const zh = await aWindow(1440, 'light')
      try {
        for (const [name, address] of places) {
          await open(zh, address, 'zh')
          await zh.waitForTimeout(600)
          await zh.screenshot({ path: join(dir, `${name}-1440-light-zh.png`), fullPage: true })
        }
        await open(zh, notesAddress, 'xx')
        await zh.waitForTimeout(600)
        await zh.screenshot({ path: join(dir, 'notes-1440-light-xx.png'), fullPage: true })
      } finally {
        await zh.context().close()
      }
    }, 600_000)
  })
})
