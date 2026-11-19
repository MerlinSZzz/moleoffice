// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MERGE ENTRY'S OWN PAGE NAMES WHO SUBMITTED IT (wave 13u round 97, item 2). The queue page's row said who sent each
 * entry, and the entry's own record page did not: `submittedBy` holds an object, and the page's body leaves objects out.
 * The page now names the submitter the way it names every other writer of a record.
 *
 * Three made-up entries are filed in a test office with a database of its own, and opened at their record address in a
 * real browser, in normal mode:
 *   - one submitted by a made-up agent the registry holds, named by the registry's name for it;
 *   - one submitted by the office itself, as the office does for a sealed round, said in the words the queue page's row
 *     gives it;
 *   - one submitted by an agent nobody registered, said in words to be unregistered.
 * Normal mode never draws the stored id of the submitter.
 *
 * A record may be filed without a field its kind requires, and one stored value may be of a shape the office cannot
 * read. Two more made-up entries are filed so: one with no submitter, said in words to have none, and one whose
 * submitter is not a `{kind, id}`, said in words to be unreadable. Both pages still draw the whole record.
 *
 * AN ENTRY THE OFFICE SUBMITTED IS WORDED ALIKE ON BOTH PAGES (wave 13u round 98, item 34). Its own page named the
 * office with the word every page gives the office's own writer, and the queue page's row said the office sent it for a
 * sealed round. Both were true, in different words. The entry's page now gives the row's words, and the office's
 * writer keeps its word everywhere else. tests/an-entry-the-office-sent-is-worded-alike-on-both-pages.test.ts draws
 * both and compares them. It was written in a file of its own because this office's queue page then drew only the
 * queue's refusal: two of this office's entries are filed with no readable submitter on purpose, and one such entry
 * failed the queue's whole list. Since wave 13u round 99 the list names those two apart from its lanes.
 *
 * CASE PROOF MAP. Both cases were red on the page before this change, which drew no such panel. The first is turned red
 * by naming the submitter by its stored id in src/web/components/MergeQueueSubmitter.tsx instead of by `writerNamed`.
 * The second is turned red by saying an unreadable submitter the way the component says a missing one. Round 98's change
 * to the first case was red before it, when the entry's page gave the office's own word, and is turned red by naming
 * the office with `writerNamed` again in MergeQueueSubmitter.tsx.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { THE_OFFICE_WRITER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let app: LiveApp
let copy = ''
const actor = { type: 'human' as const, id: THE_PERSON }
const SUBMITTER = 'made-up-entry-submitter'
const NOBODY = 'made-up-submitter-nobody-registered'
const ids = { agent: '', office: '', nobody: '', unrecorded: '', unreadable: '' }
const said = { agent: '', office: '', nobody: '' }
let submitterId = ''

beforeAll(async () => {
  const t = await freshDb()
  const mergeQueue = await import('../src/server/lib/merge-entry-door.ts')
  const file = (kind: string, title: string, data: Record<string, unknown>): PanelRecord =>
    t.api.createRecord({ workspaceId: 'default', kind: kind as PanelRecord['kind'], title, data, actor })
  file('agent', 'The made-up entry submitter', { handle: SUBMITTER, runtime: 'claude-code', state: 'active' })
  const row = t.client.sqlite.prepare('SELECT id, name FROM agents WHERE handle = ?').get(SUBMITTER) as { id: string; name: string }
  submitterId = row.id
  // EACH ENTRY HOLDS A LANE OF ITS OWN, so the three can wait in the queue at once.
  const entry = (lane: string, submittedBy: Record<string, unknown> | undefined): string =>
    mergeQueue.asTheMergeQueue(() => file('merge_entry', `A made-up entry for the ${lane} checkout`, {
      run: 'made-up-run',
      seal: { id: 'made-up-seal', hash: 'made-up-seal-hash' },
      changeset: { adapter: 'git', root: `/tmp/made-up-entry-${lane}`, repository: 'made-up-repository', branch: 'work', commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', base: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c' },
      state: 'submitted',
      ...(submittedBy === undefined ? {} : { submittedBy }),
    })).id
  ids.agent = entry('agent', { kind: 'agent', id: submitterId })
  ids.office = entry('office', { kind: 'agent', id: THE_OFFICE_WRITER_ID })
  ids.nobody = entry('nobody', { kind: 'agent', id: NOBODY })
  ids.unrecorded = entry('unrecorded', undefined)
  ids.unreadable = entry('unreadable', { kind: 'agent', id: 7 })
  said.agent = row.name
  said.office = sayInEnglish('mergeQueuePage.submitterTheOffice')
  said.nobody = sayInEnglish('record.writer.unregisteredAgent')
  copy = join(mkdtempSync(join(tmpdir(), 'mole-office-entry-submitter-')), 'panelx.db')
  t.client.sqlite.exec(`VACUUM INTO '${copy}'`)
  t.close()
  app = await liveApp({ name: 'entry-submitter', viewport: { width: 1440, height: 1000 }, database: copy, workspace: 'default' })
  app.page.setDefaultTimeout(20_000)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (copy !== '') rmSync(dirname(copy), { recursive: true, force: true })
}, 120_000)

/** The submitter's line on one entry's page, and the whole panel it sits in. A page that draws none fails the case. */
async function theSubmitterOn(entry: keyof typeof ids): Promise<{ line: string; panel: string }> {
  const page = app.page
  await page.goto(`${app.site}/#/r/${ids[entry]}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('article.rp .rd-rail').waitFor({ timeout: 30_000 })
  await page.locator('article.rp [data-entry-submitter]').waitFor({ timeout: 30_000 })
  expect(await page.locator('article.rp [data-entry-submitter]').count(), `the ${entry} entry's page names its submitter once`).toBe(1)
  return {
    line: (await page.locator('article.rp [data-entry-submitter]').innerText()).trim(),
    panel: await page.locator('article.rp .px-panel:has([data-entry-submitter])').innerText(),
  }
}

it('names the agent, the office or an unregistered agent that submitted the entry, and never draws the stored id', async () => {
  for (const entry of ['agent', 'office', 'nobody'] as const) {
    const { line, panel } = await theSubmitterOn(entry)
    expect(line, entry).toBe(said[entry])
    expect(panel, entry).toContain(sayInEnglish('record.section.submittedBy'))
    for (const never of [submitterId, THE_OFFICE_WRITER_ID, NOBODY, ids[entry]]) expect(panel, `${entry}: ${never}`).not.toContain(never)
  }
}, 180_000)

it('says in words that nobody recorded the submitter, or that what is stored cannot be read, and still draws the page', async () => {
  // The two words are read by key, because the criterion was written before the words were.
  const words = { unrecorded: sayInEnglish('entrySubmitter.none' as WordKey), unreadable: sayInEnglish('entrySubmitter.unread' as WordKey) }
  for (const entry of ['unrecorded', 'unreadable'] as const) {
    const { line, panel } = await theSubmitterOn(entry)
    expect(line, entry).toBe(words[entry])
    expect(panel, entry).toContain(sayInEnglish('record.section.submittedBy'))
    expect(panel, entry).not.toContain(ids[entry])
  }
}, 180_000)
