// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RESTORE MAY AND MAY NOT CHANGE ABOUT WHO DECIDED WHAT — and the fence that must not close
 * the disaster path.
 *
 * Three findings from an independent durability review, each measured against the real corpus and
 * each fixed here. They are one file because they are one question: *is the archive still the thing
 * you can rebuild the project from, and does rebuilding it change what the project means?*
 *
 * D1 — THE FENCE WAS SHUT ON THE REAL CORPUS. `checkMigrations` matched applied migrations by FILE
 * HASH. `drizzle/0007_planning.sql` was edited after it had been applied to the live database, so
 * the hash in that database's journal row matches no file that exists — not on disk, not in git.
 * Every freshly migrated database therefore refused the live corpus's own archive, saying "run the
 * migrations first", which had been done and could never help. The text archive exists so that a
 * restore does not depend on a `.db` copy, and that is exactly what it had come to depend on.
 * FORMAT.md §7 already named the stable field: `when` comes out of the drizzle journal and does not
 * churn. The hash is the field that churns.
 *
 * D2 — `actor_type` WAS THE ONE CLOSED VOCABULARY NOBODY CHECKED. The importer refuses a gate word
 * and a presentation intent it does not know, on the stated ground that a rule enforced on one write
 * path and not the other is a back door. Changing one `human` to `hooman` imported clean, and the
 * restored corpus then showed a fork the owner had really settled as unsettled.
 *
 * D2b — A RESTORE COULD HAND A PROJECT A GOVERNANCE HISTORY IN SILENCE. Settling a fork IS the
 * `derived_from` link from a decision to the proposal. No check on a text file the operator owns can
 * tell a real decision from one typed into the archive, and pretending otherwise would be worse than
 * saying nothing — so the importer says what it is about to bring back instead.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, settleLinkBypassingTheGate, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AGENT = { type: 'agent', id: 'claude-code', sessionId: 's-1' } as const

let t: TestDb
let lib: ImportLib
let exportLib: ExportLib
let root: string
let decisionId: string

beforeEach(async () => {
  t = await freshDb()
  exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  lib = (await import('../src/server/lib/import.ts')) as ImportLib
  root = mkdtempSync(join(tmpdir(), 'mole-office-governance-'))

  // A fork an agent reached, and the decision a person made about it — settled the way settling
  // really happens, by a human making the link.
  const proposal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: 'Should the pads be replaced or re-textured?',
    data: { question: 'replace or re-texture?', options: ['a — replace', 'b — re-texture'] },
    actor: AGENT,
  })
  const decision = t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: 'Re-texture them',
    data: { because: 'a replacement pad is six weeks out' },
    actor: { ...HUMAN, stated: true },
  })
  t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: { ...HUMAN, stated: true } })
  decisionId = decision.id

  exportLib.writeExport(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  t.close()
})

/** Replace a substring in an archive file, refusing if it was not there — a test that edited nothing. */
function edit(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(from)) throw new Error(`this test meant to change ${JSON.stringify(from)} in ${file} and it is not there`)
  writeFileSync(file, text.replace(from, to), 'utf8')
}

/** Plan the import and answer in one shape, because a refusal THROWS out of `applyImport`. */
function planned(where: string = root): { ok: boolean; why: string; notes: string[] } {
  const plan = lib.planImport(where)
  return {
    ok: plan.ok,
    why: plan.refusals.map((r) => `${r.path}:${r.line} ${r.problem}`).join('\n'),
    notes: plan.notes,
  }
}

/** The first change file that carries a human-attributed row. */
function aHumanChangeFile(): string {
  const dir = join(root, 'changes')
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (readFileSync(path, 'utf8').includes('actorType: "human"')) return path
  }
  throw new Error('the fixture wrote no human-attributed change row, so this file cannot test one')
}

describe('D1 · the schema fence identifies a migration by when, not by what its file says today', () => {
  it('imports an archive whose migration was edited after it was applied, and SAYS the hashes differ', () => {
    // The live corpus, exactly: same migration, same `when`, different bytes. Before the fix this
    // refused, and no action the operator could take would ever have made it pass.
    const manifest = readFileSync(join(root, 'MANIFEST.md'), 'utf8')
    const hash = /hash: "([0-9a-f]{64})"/.exec(manifest)
    expect(hash, 'the archive names no migration hash, so this test proves nothing').not.toBeNull()
    edit(join(root, 'MANIFEST.md'), hash?.[0] ?? '', `hash: "${'0'.repeat(64)}"`)

    const plan = planned()
    expect(plan.ok, plan.why).toBe(true)
    // And it is not quiet about it: a restore that came back with a different build of a migration
    // must say so, because it is the answer if a column later turns out to be missing.
    expect(plan.notes.join('\n')).toMatch(/different hash/)
    // The whole point is that it really imports.
    expect(lib.applyImport(root).applied).toBe(true)
  })

  it('still refuses an archive naming a migration this database has NOT applied', () => {
    // The fence itself is not weakened. A `when` nothing has applied is a newer schema, and
    // importing it into an older database drops columns silently.
    const manifest = readFileSync(join(root, 'MANIFEST.md'), 'utf8')
    const first = manifest.indexOf('```mole-office migrations')
    expect(first, 'the archive has no migrations block, so this test proves nothing').toBeGreaterThan(-1)
    writeFileSync(
      join(root, 'MANIFEST.md'),
      manifest.slice(0, first) +
        '```mole-office migrations\nhash: "deadbeef"\nwhen: 9999999999999\ntag: "0099_from_the_future"\n```\n\n' +
        manifest.slice(first),
      'utf8',
    )

    const plan = planned()
    expect(plan.ok).toBe(false)
    expect(plan.why).toMatch(/0099_from_the_future/)
  })

  it('refuses a migrations block that identifies itself in neither way', () => {
    const manifest = readFileSync(join(root, 'MANIFEST.md'), 'utf8')
    const first = manifest.indexOf('```mole-office migrations')
    writeFileSync(
      join(root, 'MANIFEST.md'),
      manifest.slice(0, first) + '```mole-office migrations\ntag: "0042_nameless"\n```\n\n' + manifest.slice(first),
      'utf8',
    )
    const plan = planned()
    expect(plan.ok).toBe(false)
    expect(plan.why).toMatch(/neither a `when` nor a `hash`/)
  })
})

describe('D2 · a restore may not quietly withdraw somebody\'s decision', () => {
  it('refuses a change row whose actor type is not one of the three, naming the row and the three', () => {
    // ONE WORD. Before the fix this imported clean and the fork the human settled came back open.
    edit(aHumanChangeFile(), 'actorType: "human"', 'actorType: "hooman"')

    const plan = planned()
    expect(plan.ok, 'a change row attributed to nobody Mole Office knows was imported').toBe(false)
    expect(plan.why).toMatch(/"hooman"/)
    expect(plan.why).toMatch(/human, agent, system/)
  })

  it('is the exception to "an unrecognised word is reported, not refused", and says why', () => {
    edit(aHumanChangeFile(), 'actorType: "human"', 'actorType: "hooman"')
    const said = planned().why
    // The refusal has to answer the obvious objection — the importer keeps a record of an unknown
    // KIND rather than dropping it — or it reads as an inconsistency somebody will later "fix".
    expect(said).toMatch(/losing a row is worse/)
    expect(said).toMatch(/human-only rule/)
  })
})

describe('D2b · a restore says which forks it brings back already settled', () => {
  it('names them, counts the human-made ones, and does not claim to have checked them', () => {
    const plan = planned()
    expect(plan.ok, plan.why).toBe(true)
    const note = plan.notes.find((n) => n.includes('fork'))
    expect(note, `no note about the settled fork. Notes were:\n${plan.notes.join('\n')}`).toBeDefined()
    expect(note).toMatch(/1 fork/)
    expect(note).toMatch(/1 of them was settled by a human/)
    // AND IT DOES NOT OVERCLAIM. Nothing can tell a real decision from one written into the archive
    // by hand, so the note must read as a list to check rather than as a check that passed.
    expect(note).toMatch(/can tell a real decision from one written into the archive by hand/)
  })

  it('says nothing when the archive settles nothing', () => {
    // A note on every restore would be noise, and noise is how a real one goes unread.
    //
    // The LINK is deleted, not the decision: a soft-deleted decision is still exported, still
    // linked, and `proposalResolution` reads the deletion rather than the link's absence. Deleting
    // the record here would have left the settling link in the archive and made this test pass for
    // a reason nobody chose.
    const link = t.client.sqlite
      .prepare("SELECT id FROM links WHERE from_id = ? AND type = 'derived_from'")
      .get(decisionId) as { id: string } | undefined
    expect(link, 'the fixture made no settling link, so this test proves nothing').toBeDefined()
    t.api.deleteLink(link?.id ?? '', { ...HUMAN, stated: true }, 'default')
    const bare = mkdtempSync(join(tmpdir(), 'mole-office-governance-bare-'))
    try {
      exportLib.writeExport(bare)
      expect(planned(bare).notes.filter((n) => n.includes('fork'))).toEqual([])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('counts an agent-made settling link as NOT settled by a human, which is what the queue reads', () => {
    // The link can be in an archive whatever the write gate says now: rows written before the gate
    // existed are in the corpus today. The note must classify it the way `humanLinked` does, or the
    // operator reads "settled by a human" about a fork no human touched.
    const other = t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title: 'Should the gauge be recalibrated before the run?',
      data: { question: 'recalibrate first?', options: ['a — yes', 'b — no'] },
      actor: AGENT,
    })
    settleLinkBypassingTheGate(t, { fromId: decisionId, toId: other.id, actorType: 'agent', actorId: AGENT.id })

    const second = mkdtempSync(join(tmpdir(), 'mole-office-governance-two-'))
    try {
      exportLib.writeExport(second)
      const note = planned(second).notes.find((n) => n.includes('fork')) ?? ''
      expect(note).toMatch(/2 fork/)
      expect(note, 'an agent-made settling link was counted as a human decision').toMatch(/1 of them was settled by a human/)
    } finally {
      rmSync(second, { recursive: true, force: true })
    }
  })
})
