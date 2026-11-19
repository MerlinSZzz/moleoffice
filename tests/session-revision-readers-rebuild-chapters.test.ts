// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
beforeAll(async () => { t = await freshDb() }, 60_000)
afterAll(() => { t.close() })

function session() {
  const record = t.api.createRecord({ kind: 'session', title: 'A made-up session for reader checks', workspaceId: 'default', actor: t.api.HUMAN, origin: 'fixture', data: { state: 'running', doing: 'first', extra: { roundChapters: { madeUp: true, brief: { text: 'A made-up brief' } } } } })
  t.api.patchRecord(record.id, { dataPatch: { doing: 'second' } }, t.api.HUMAN)
  return record.id
}

describe('whole revision readers with stored chapters', () => {
  it('does not age a short form when only the short form was written', async () => {
    const id = session()
    const { getRevision } = await import('../src/server/lib/revisions.ts')
    const { writeShortForms } = await import('../src/server/lib/zoom.ts')
    const revision = getRevision(id, 2)
    const answer = writeShortForms(id, 'default', { madeFrom: { seq: 2, contentHash: revision.contentHash }, forms: { label: 'Reader fixture' } }, t.api.HUMAN)
    expect(answer.levels.find(level => level.level === 'label')?.state).toBe('current')
  })

  it('describes a warranted update without claiming the unchanged chapters moved', async () => {
    const id = session()
    const warrant = { saidBy: 'person', words: 'A made-up instruction.', where: 'terminal', when: '2026-01-01 10:00', for: [id] }
    t.client.sqlite.prepare('UPDATE revisions SET warrant = ? WHERE record_id = ? AND seq = 2').run(JSON.stringify(warrant), id)
    const { actsOnTheirWords } = await import('../src/server/lib/warrants.ts')
    const act = actsOnTheirWords(id).find(one => one.seq === 2)
    expect(act?.what).toContain('doing:')
    expect(act?.what).not.toContain('roundChapters')
  })

  it('pins the stored row and still recognizes a pin made before the parts column', async () => {
    const id = session()
    const { theNewestRevisionOf } = await import('../src/server/lib/sealed-tip.ts')
    const { theHashOfARow, theListARevisionRowHashesUnder } = await import('../src/server/db/the-hash-a-seal-pins-a-row-by.ts')
    const pin = theNewestRevisionOf(id)!
    const row = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? AND seq = 2').get(id) as Record<string, unknown>
    expect(row.parts).not.toBeNull()
    expect(theListARevisionRowHashesUnder(row, pin.hash)).toBe('0351_a_revision_stores_a_runs_chapters_once')
    const { parts: _parts, ...oldColumns } = row
    const oldHash = theHashOfARow(oldColumns)
    expect(theListARevisionRowHashesUnder(row, oldHash)).toBe('0276_a_signed_item_held_for_its_named_agent')
    expect(theListARevisionRowHashesUnder({ ...row, parts: '{}' }, pin.hash)).toBeNull()
  })

  it('refuses an archive whose part names a later revision before writing anything', async () => {
    const id = session()
    const root = aTestDatabaseFolder('broken-revision-part')
    const { writeExport } = await import('../src/server/lib/export.ts')
    const { planImport } = await import('../src/server/lib/import.ts')
    writeExport(root)
    const page = join(root, 'revisions', id, '2.md')
    const original = readFileSync(page, 'utf8')
    expect(original).toMatch(/^parts: .*extra\.roundChapters.*1/m)
    writeFileSync(page, original.replace(/^parts: .*$/m, 'parts: {"extra.roundChapters":2}'))
    const before = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(id)
    expect(planImport(root).refusals.some(refusal => refusal.problem.includes('holder must be earlier'))).toBe(true)
    expect(t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(id)).toEqual(before)
  }, 60_000)

})
