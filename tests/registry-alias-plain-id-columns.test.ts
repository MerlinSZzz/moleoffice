// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SIX PLAIN COLUMNS HOLD AN AGENT'S REGISTRY ID, AND A PROJECT'S ARCHIVE CARRIES THE ALIAS OF AN OLD ID STORED IN ONE
 * (item 30c, part 3). A request for one press keeps the secretary that asked in one_press_requests.asked_by. A signing
 * package keeps the secretary that brought it in signing_packages.brought_by, and the agent it names in for_agent. An
 * item of a package keeps the agent that carried it out in signing_package_items.carried_out_by, once it has. A request
 * and a package keep who answered in answered_by_id, once it is answered, and answered_by_kind says whether the person
 * or an agent answered. Each is a plain column and not JSON. The first three always hold a registry id; carried_out_by
 * holds one when it holds anything, and answered_by_id holds one only when answered_by_kind is agent. One written before
 * the re-mint holds an old id, which the doors read back through its alias. The register lists the six columns and the
 * census reads them, so a project's archive carries the alias of an old id stored there, and the office it is imported
 * into reads that id back as the same agent.
 *
 * Every agent, alias and row here is made up, in a throwaway office. A person's answer below stores the spelling of an
 * old agent id on purpose, so that reading it as an agent's would show.
 *
 *   1. the register lists the six columns, among the others it lists, each a column of its table; the first three never hold nothing, the others
 *      can, and an answered_by_id is paired with its answered_by_kind, read only when that says agent;
 *   2. the census lists an old id stored in each of the first three with its canonical id, counts each under its
 *      column, blocks an empty one, and writes nothing;
 *   3. a project's archive carries the alias of each old id its own rows store in the first three and no other, names
 *      them in its note, and an office that holds the agents imports it and reads each old id back as its agent;
 *   4. the census lists an old id that an agent answered under, or that carried out an item, with its canonical id,
 *      counts each under its column, reads no answer the person gave, skips a column that holds nothing, and writes
 *      nothing;
 *   5. a project's archive carries the alias of each old id stored where an agent answered or carried out an item, and
 *      not of a person's answer, names the three columns in its note, and an office that holds the agents imports it
 *      and reads each old id back as its agent.
 *
 * The words for an agent and for the person are read from PARTICIPANT_KINDS, where the office declares them, and the
 * register's pair is typed with them, so a pair whose word is not one of them does not compile.
 *
 * MUTATIONS, after a control run: leave one of the six columns out of the register, and 1 goes red, with 2 and 3 for
 * one of the first three and 4 and 5 for one of the others. Read an answered_by_id without asking its answered_by_kind,
 * and 4 and 5 go red. Read the columns in the census without asking the alias table, and 2 to 5 go red. Name the
 * columns in the archive's note from STORED_COLUMNS alone, and 3 and 5 go red. Type the pair's word as a plain string,
 * and tsc fails on case 1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { aliasLibrary, inventedRegistry } from './registry-alias-fixture.ts'
import { PARTICIPANT_KINDS, type ParticipantKind } from '../src/shared/participants.ts'

let source: TestDb, restored: TestDb | undefined, archive: string
beforeEach(async () => { source = await freshDb(); inventedRegistry(source); archive = aTestDatabaseFolder('plain-id-columns') })
afterEach(() => { source?.close(); restored?.close(); restored = undefined; if (archive) removeThisTestFolder(archive) })
const COLUMNS = ['one_press_requests.asked_by', 'signing_packages.brought_by', 'signing_packages.for_agent']
// The columns that hold nothing until a request or a package is answered, or an item carried out.
const ONCE_DONE = ['one_press_requests.answered_by_id', 'signing_package_items.carried_out_by', 'signing_packages.answered_by_id']
const at = '2026-01-01 00:00:00'
// The two kinds of participant, as the office declares them.
const THE_PERSON: Extract<ParticipantKind, 'person'> = PARTICIPANT_KINDS[0]
const AN_AGENT: Extract<ParticipantKind, 'agent'> = PARTICIPANT_KINDS[1]
// One old id for each column, so that each alias is needed by one column only, and one stored only in another project.
const ASKED = { aliasId: 'asked-under-an-old-id', canonicalId: 'CanonicalA1' }
const BROUGHT = { aliasId: 'brought-under-an-old-id', canonicalId: 'CanonicalB2' }
const NAMED = { aliasId: 'named-under-an-old-id', canonicalId: 'CanonicalA1' }
const ELSEWHERE = { aliasId: 'asked-in-another-project', canonicalId: 'CanonicalB2' }
const PRESS_ANSWERED = { aliasId: 'answered-a-press-under-an-old-id', canonicalId: 'CanonicalA1' }
const PACKAGE_ANSWERED = { aliasId: 'answered-a-package-under-an-old-id', canonicalId: 'CanonicalB2' }
const CARRIED = { aliasId: 'carried-out-under-an-old-id', canonicalId: 'CanonicalA1' }
// Stored as a person's answer: an agent's old id, so that it would be listed if the kind beside it were not asked.
const THE_PERSONS = { aliasId: 'a-persons-answer-spelled-like-an-old-id', canonicalId: 'CanonicalB2' }

async function oldIdsFiled(t: TestDb) {
  await (await import('../src/server/lib/workspaces.ts')).createWorkspace({ id: 'synthetic-other', title: 'Synthetic other project' })
  ;(await aliasLibrary()).fileRegistryAliases(t.client.sqlite, [ASKED, BROUGHT, NAMED, ELSEWHERE].map(one => ({ namespace: 'agent-registry', ...one })))
}
function aRequest(t: TestDb, id: string, workspace: string, askedBy: string) {
  t.client.sqlite.prepare('INSERT INTO one_press_requests (id, workspace_id, act, inputs, asked_by, shows, state, asked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, workspace, 'change-a-setting', '{"panel":"settings.whatiskept","setting":"keepBackups","value":12}', askedBy, 'Change "Backups to keep" from 30 to 12.', 'waiting', at)
}
function aPackage(t: TestDb, id: string, workspace: string, broughtBy: string, forAgent: string) {
  t.client.sqlite.prepare('INSERT INTO signing_packages (id, workspace_id, brought_by, for_agent, task, state, brought_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, workspace, broughtBy, forAgent, 'A made-up task', 'waiting', at)
}
function answered(t: TestDb, table: 'one_press_requests' | 'signing_packages', id: string, kind: ParticipantKind, by: string) {
  t.client.sqlite.prepare(`UPDATE ${table} SET state = 'refused', answered_at = ?, answered_by_kind = ?, answered_by_id = ? WHERE id = ?`).run(at, kind, by, id)
}
function anItem(t: TestDb, id: string, packageId: string, position: number, carriedOutBy: string | null) {
  t.client.sqlite.prepare('INSERT INTO signing_package_items (id, package_id, position, act, inputs, why, shows, changes, undone, state, carried_out_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, packageId, position, 'change-a-setting', '{"panel":"settings.whatiskept","setting":"keepBackups","value":12}', 'A made-up reason', 'Change "Backups to keep" from 30 to 12.', 'One setting.', 'Set it back.', carriedOutBy === null ? 'waiting' : 'done', carriedOutBy)
}
/** The rows of the second census and archive: two answered by an agent under an old id, two by the person, two waiting. */
async function answersAndItems(t: TestDb, workspace: string) {
  ;(await aliasLibrary()).fileRegistryAliases(t.client.sqlite, [PRESS_ANSWERED, PACKAGE_ANSWERED, CARRIED, THE_PERSONS].map(one => ({ namespace: 'agent-registry', ...one })))
  aRequest(t, 'SyntheticPressAnswered', workspace, 'CanonicalA1')
  answered(t, 'one_press_requests', 'SyntheticPressAnswered', AN_AGENT, PRESS_ANSWERED.aliasId)
  aRequest(t, 'SyntheticPressThePerson', workspace, 'CanonicalA1')
  answered(t, 'one_press_requests', 'SyntheticPressThePerson', THE_PERSON, THE_PERSONS.aliasId)
  aRequest(t, 'SyntheticPressWaiting', workspace, 'CanonicalA1')
  aPackage(t, 'SyntheticPackageAnswered', workspace, 'CanonicalB2', 'CanonicalA1')
  answered(t, 'signing_packages', 'SyntheticPackageAnswered', AN_AGENT, PACKAGE_ANSWERED.aliasId)
  aPackage(t, 'SyntheticPackageThePerson', workspace, 'CanonicalB2', 'CanonicalA1')
  answered(t, 'signing_packages', 'SyntheticPackageThePerson', THE_PERSON, THE_PERSONS.aliasId)
  anItem(t, 'SyntheticItemCarried', 'SyntheticPackageAnswered', 1, CARRIED.aliasId)
  anItem(t, 'SyntheticItemWaiting', 'SyntheticPackageAnswered', 2, null)
}
const everyRow = (t: TestDb) => Object.fromEntries(['one_press_requests', 'signing_packages', 'signing_package_items', 'records', 'revisions', 'changes', 'registry_aliases']
  .map(table => [table, t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]))

describe('the census of the plain columns', () => {
  it('lists an old id stored in each with its canonical id, counts each under its column, blocks an empty one, and writes nothing', async () => {
    await oldIdsFiled(source)
    aRequest(source, 'SyntheticPress', 'default', ASKED.aliasId)
    aPackage(source, 'SyntheticPackage', 'default', BROUGHT.aliasId, NAMED.aliasId)
    aPackage(source, 'SyntheticEmpty', 'default', '', 'CanonicalB2')
    const before = everyRow(source)
    const census = (await import('../src/server/lib/registry-aliases/census.ts')).takeIdentityCensus(source.client.sqlite)
    expect(everyRow(source)).toEqual(before)

    expect(census.read).toMatchObject({ one_press_requests: 1, signing_packages: 2 })
    expect(census.positions).toMatchObject({ 'one_press_requests.asked_by': 1, 'signing_packages.brought_by': 1, 'signing_packages.for_agent': 2 })
    const ofTheColumns = <T extends { table: string; path: string }>(rows: T[]) => rows.filter(one => COLUMNS.includes(`${one.table}.${one.path}`))
    expect(ofTheColumns(census.aliases)).toEqual([
      { table: 'one_press_requests', row: 'SyntheticPress', path: 'asked_by', stored: ASKED.aliasId, canonical: ASKED.canonicalId },
      { table: 'signing_packages', row: 'SyntheticPackage', path: 'brought_by', stored: BROUGHT.aliasId, canonical: BROUGHT.canonicalId },
      { table: 'signing_packages', row: 'SyntheticPackage', path: 'for_agent', stored: NAMED.aliasId, canonical: NAMED.canonicalId },
    ])
    expect(ofTheColumns(census.blocks).map(one => [one.table, one.row, one.path, one.reason])).toEqual([['signing_packages', 'SyntheticEmpty', 'brought_by', 'empty-id']])
  })
})

describe("a project's archive and the plain columns", () => {
  it('carries the alias of each old id its own rows store there and no other, names the columns, and imports where the agents are held', async () => {
    await oldIdsFiled(source)
    aRequest(source, 'SyntheticPress', 'default', ASKED.aliasId)
    aPackage(source, 'SyntheticPackage', 'default', BROUGHT.aliasId, NAMED.aliasId)
    aRequest(source, 'SyntheticPressElsewhere', 'synthetic-other', ELSEWHERE.aliasId)
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive, { workspaceId: 'default' })
    const { counts, notes } = exporter.buildExport({ workspaceId: 'default' }).report
    expect(counts['registry_aliases']).toBe(3)
    const said = notes.join('\n')
    expect(said).toMatch(/carries 3 of the 4 permanent registry aliases/)
    for (const site of COLUMNS) expect(said, site).toContain(site)
    for (const file of readdirSync(archive, { recursive: true }).map(String).filter(path => statSync(join(archive, path)).isFile())) {
      expect(readFileSync(join(archive, file), 'utf8'), file).not.toContain(ELSEWHERE.aliasId)
    }

    restored = await freshDb()
    inventedRegistry(restored)
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(restored.client.sqlite.prepare('SELECT alias_id AS aliasId, canonical_id AS canonicalId FROM registry_aliases ORDER BY alias_id').all())
      .toEqual([ASKED, BROUGHT, NAMED].sort((a, b) => (a.aliasId < b.aliasId ? -1 : 1)))
    const { theAgentAStoredIdNames } = await import('../src/server/lib/participants.ts')
    for (const one of [ASKED, BROUGHT, NAMED]) expect(theAgentAStoredIdNames(one.aliasId)?.id, one.aliasId).toBe(one.canonicalId)
  })
})

describe('the census of the columns that hold an id once a thing is done', () => {
  it("lists an old id an agent answered under or carried an item out under, counts each, reads no answer of the person's, skips an empty column, and writes nothing", async () => {
    await answersAndItems(source, 'default')
    const before = everyRow(source)
    const census = (await import('../src/server/lib/registry-aliases/census.ts')).takeIdentityCensus(source.client.sqlite)
    expect(everyRow(source)).toEqual(before)

    expect(census.read).toMatchObject({ one_press_requests: 3, signing_packages: 2, signing_package_items: 2 })
    expect(census.positions).toMatchObject({ 'one_press_requests.answered_by_id': 1, 'signing_packages.answered_by_id': 1, 'signing_package_items.carried_out_by': 1 })
    const ofTheColumns = <T extends { table: string; path: string }>(rows: T[]) => rows.filter(one => ONCE_DONE.includes(`${one.table}.${one.path}`))
    expect(ofTheColumns(census.aliases).sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0))).toEqual([
      { table: 'one_press_requests', row: 'SyntheticPressAnswered', path: 'answered_by_id', stored: PRESS_ANSWERED.aliasId, canonical: PRESS_ANSWERED.canonicalId },
      { table: 'signing_package_items', row: 'SyntheticItemCarried', path: 'carried_out_by', stored: CARRIED.aliasId, canonical: CARRIED.canonicalId },
      { table: 'signing_packages', row: 'SyntheticPackageAnswered', path: 'answered_by_id', stored: PACKAGE_ANSWERED.aliasId, canonical: PACKAGE_ANSWERED.canonicalId },
    ])
    expect(ofTheColumns(census.blocks)).toEqual([])
  })
})

describe("a project's archive and the columns that hold an id once a thing is done", () => {
  it("carries the alias of an old id an agent answered under or carried an item out under, not of a person's answer, names the columns, and imports", async () => {
    await answersAndItems(source, 'default')
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive, { workspaceId: 'default' })
    const { counts, notes } = exporter.buildExport({ workspaceId: 'default' }).report
    expect(counts['registry_aliases']).toBe(3)
    const said = notes.join('\n')
    expect(said).toMatch(/carries 3 of the 4 permanent registry aliases/)
    for (const site of ONCE_DONE) expect(said, site).toContain(site)

    restored = await freshDb()
    inventedRegistry(restored)
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(restored.client.sqlite.prepare('SELECT alias_id AS aliasId, canonical_id AS canonicalId FROM registry_aliases ORDER BY alias_id').all())
      .toEqual([PRESS_ANSWERED, PACKAGE_ANSWERED, CARRIED].sort((a, b) => (a.aliasId < b.aliasId ? -1 : 1)))
    const { theAgentAStoredIdNames } = await import('../src/server/lib/participants.ts')
    for (const one of [PRESS_ANSWERED, PACKAGE_ANSWERED, CARRIED]) expect(theAgentAStoredIdNames(one.aliasId)?.id, one.aliasId).toBe(one.canonicalId)
  })
})
