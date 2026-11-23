// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RESTORE PROOF RENAMES AN AGENT, AND NEVER MOLE OFFICE'S OWN ROW. Wave 13s round 257.
 *
 * The proof fills agent_renames through `fillTheRenameProof` (src/server/lib/agent-names.ts): the person renames one
 * live agent at once, then proposes another name for it and refuses that. It took the first live row of `agents` by
 * id. Mole Office's own row is in that registry and is not an agent, and its id is drawn, so now and then it was the
 * first. The rename was then refused with the sentence for a change to the office's own row, and
 * tests/restore-semantics.test.ts failed while it loaded, with none of its cases run.
 *
 * THE ORDER IS MADE HERE, NOT DRAWN. Each case gives the office's row the lowest id the mint can make: the lowest of
 * the characters an id may begin with, then the lowest of nanoid's characters for the rest. Every other id the mint
 * makes sorts after it. Each case asserts which live rows there are, in that order, before the proof fills.
 *
 *   (a) with one real agent beside the office's row, every rename the proof writes is of that agent, and the office's
 *       row keeps its name;
 *   (b) with no live row but the office's own, the proof refuses and writes no rename, and its refusal is not the
 *       sentence for a change to the office's own row.
 *
 * The filler is reached the way the proof reaches it: by the declaration of agent_renames in `everyPartTable()`.
 * The product's sentence and the lowest characters are read from the code, never written out here.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `fillTheRenameProof`, take the first live row by id again, whether or not it is the office's own → (a) and
 *      (b) go red: the rename is refused with the sentence for a change to the office's own row.
 */
import { urlAlphabet } from 'nanoid'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})
afterEach(() => t?.close())

/** The live rows of the registry, first by id. */
function theLiveRowsById(): { id: string; name: string }[] {
  return t.client.sqlite.prepare('SELECT id, name FROM agents WHERE retired = 0 ORDER BY id').all() as { id: string; name: string }[]
}

/** A real agent, registered through the record door, by the registry id its registration gave it. */
function aRealAgent(): string {
  const record = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'A real agent',
    data: { handle: 'a-real-agent', runtime: 'claude-code', state: 'active' },
    actor: t.api.HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as
    | { id: string }
    | undefined
  if (row === undefined) throw new Error(`The agent record ${record.id} was filed, and no registry row is mapped to it.`)
  return row.id
}

/**
 * GIVE THE OFFICE'S ROW THE LOWEST ID THE MINT CAN MAKE, and every column that names the row the same id. Only this
 * test's own office is changed, the way tests/the-office-reads-its-own-id-from-its-row.test.ts re-mints the row.
 */
async function theOfficesRowSortsFirst(): Promise<string> {
  const { AN_IDS_FIRST_CHARACTERS } = await import('../src/server/lib/ids.ts')
  const theLowestOf = (characters: string): string => [...characters].sort()[0]!
  const oldId = theOfficesOwnId(t)
  const id = theLowestOf(AN_IDS_FIRST_CHARACTERS) + theLowestOf(urlAlphabet).repeat(oldId.length - 1)
  const sql = t.client.sqlite
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
  sql.transaction(() => {
    sql.pragma('defer_foreign_keys = ON')
    sql.prepare('UPDATE agents SET id = ? WHERE id = ?').run(id, oldId)
    const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    for (const table of tables) {
      const keys = sql.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all() as { table: string; from: string; to: string }[]
      for (const key of keys) if (key.table === 'agents' && key.to === 'id') {
        sql.prepare(`UPDATE ${quote(table.name)} SET ${quote(key.from)} = ? WHERE ${quote(key.from)} = ?`).run(id, oldId)
      }
    }
  })()
  expect(sql.pragma('foreign_key_check')).toEqual([])
  expect(theOfficesOwnId(t)).toBe(id)
  return id
}

/** The proof's renames, filled as the proof fills them, after it reads the role cards. Null, or why it refused. */
async function whyTheProofRefusesToFillTheRenames(): Promise<string | null> {
  const { readTheRoleCardsAtStart } = await import('../scripts/restore-check.ts')
  await readTheRoleCardsAtStart()
  // THE FILL IS A DECLARATION THE FILLER'S OWN FILE MAKES WHEN IT LOADS, and the proof loads that file before it fills
  // (scripts/restore-check.ts, fillEmptyTables). Loading it here is the same reach the proof has.
  await import('../src/server/lib/agent-names.ts')
  const schema = await import('../src/server/db/schema.ts')
  const { everyPartTable } = await import('../src/server/db/every-part-table.ts')
  const part = one(
    everyPartTable().filter((table) => table.table === schema.agentRenames),
    'the part table agent_renames',
  )
  if (part.says.restore === 'not in this proof') {
    throw new Error('agent_renames says the restore proof leaves it out, and this test is of the proof that fills it.')
  }
  return part.says.fillForTheProof().then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
}

function theAgentsRenamed(): Set<string> {
  const rows = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_renames').all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

it("(a) renames the real agent, and not the office's own row, when the office's row is the first live row by id", async () => {
  const agent = aRealAgent()
  const office = await theOfficesRowSortsFirst()
  const before = theLiveRowsById()
  expect(before.map((row) => row.id), 'the live rows by id, before the proof fills').toEqual([office, agent])

  expect(await whyTheProofRefusesToFillTheRenames(), 'why the restore proof refused to fill agent_renames').toBeNull()

  expect(theAgentsRenamed(), 'the agents agent_renames names').toEqual(new Set([agent]))
  const after = new Map(theLiveRowsById().map((row) => [row.id, row.name]))
  expect(after.get(office), "the office's own name").toBe(before[0]!.name)
  expect(after.get(agent), "the real agent's name").not.toBe(before[1]!.name)
})

it("(b) refuses, writes no rename, and does not refuse for the office's own row, when that row is the only live one", async () => {
  const { MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE } = await import('../src/shared/participants.ts')
  const office = await theOfficesRowSortsFirst()
  expect(theLiveRowsById().map((row) => row.id), 'the live rows by id, before the proof fills').toEqual([office])

  const refusal = await whyTheProofRefusesToFillTheRenames()

  expect(refusal, 'the restore proof filled agent_renames with no agent to rename').not.toBeNull()
  expect(refusal, "the restore proof's refusal").not.toContain(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE)
  expect(theAgentsRenamed(), 'the agents agent_renames names').toEqual(new Set())
})
