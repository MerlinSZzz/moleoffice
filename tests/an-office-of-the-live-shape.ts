// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE OF THE LIVE SHAPE, MADE UP, FOR THE TESTS THAT MEASURE HOME ON A BUSY OFFICE.
 *
 * Round 31 of wave 13k asked why Home is slow and why its scroll runs past
 * its content. Neither shows on the nearly empty office a test usually starts with, so these tests
 * build one of the shape the owner's office has: several hundred registered agents in a few projects,
 * a dozen groups, a few dozen runs going, some retired agents, a few hundred messages and a few
 * hundred records. Every name here is made up.
 *
 * IT IS WRITTEN IN THIS PROCESS AND THEN SERVED. One session and its flow record are copied with their links and history by SQL; the other rows go through
 * the product's doors (`createRecord`, `openAttachment`, `openAGroup`) on a database made by `freshDb`, the file is
 * copied into a folder of the test's own, and `liveApp` serves the copy. Writing four hundred agents
 * through HTTP would take minutes; the doors called here are the ones the routes call.
 */
import { randomUUID } from 'node:crypto'
import { versionOf, contentOf } from '../src/server/lib/version.ts'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { freshDb, TEST_DATABASE_PREFIX } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { GROUP_MEMBER_MAX } from '../src/shared/groups.ts'

/** The projects of the made-up office, and how many active agents each holds. */
export const LIVE_SHAPE = {
  projects: [
    { id: 'default', title: 'Default', agents: 280 },
    { id: 'greenhouse', title: 'Greenhouse', agents: 40 },
    { id: 'tide-tables', title: 'Tide tables', agents: 40 },
    { id: 'bench-rig', title: 'Bench rig', agents: 40 },
  ],
  /** Of the agents in the first project, how many are retired. */
  retired: 30,
  /** How many of the active agents in the first project have a run going. */
  runsGoing: 36,
  /**
   * Runs no durable agent serves, open. The owner's office had 2,982 open runs on 27 September 2026
   * (tests/the-roster-reads-each-run-once.test.ts), and the roster reads every run of the project.
   */
  otherRuns: 1500,
  /** Rows in `api_calls`, which presence reads. The owner's office had 944,834 on the same day. */
  apiCalls: 200_000,
  groups: 12,
  /** The made-up supervisors that started the agents, and how many agents have no starter recorded. */
  starters: 12,
  noStarter: 40,
  messages: 300,
  /**
   * Messages agents wrote to the person that the person has not read. Each puts a row on the waiting list Home's Needs you
   * section draws, and that row names the agent it came from, which is what marks the agent's group in Agents at
   * work (round 31b of wave 13k). Six, from agents with six different starters.
   */
  messagesToThePerson: 6,
  records: 300,
} as const

const PERSON = { type: 'human', id: THE_PERSON } as const

/**
 * Build the office and answer the path of a database file that outlives the in-process connection,
 * with the way to delete it. The caller deletes it in its own `afterAll`, after its stack has stopped.
 */
export async function anOfficeOfTheLiveShape(): Promise<{ file: string; remove: () => void }> {
  const t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  const attachments = await import('../src/server/lib/attachments.ts')
  const participants = await import('../src/server/lib/participants.ts')
  const groups = await import('../src/server/lib/groups.ts')

  // Keep the validated writes together; callers need the finished database, not intermediate commits.
  t.client.sqlite.transaction(() => {
    const first = LIVE_SHAPE.projects[0].id
    for (const project of LIVE_SHAPE.projects) {
      if (project.id !== 'default') workspaces.createWorkspace({ id: project.id, title: project.title })
    }

    const agents: { ref: { kind: 'agent'; id: string }; handle: string; recordId: string; workspaceId: string }[] = []
    let n = 0
    for (const project of LIVE_SHAPE.projects) {
      const howMany = project.agents + (project.id === first ? LIVE_SHAPE.retired : 0)
      for (let i = 0; i < howMany; i += 1) {
        n += 1
        const handle = `made-up-${project.id}-${String(i + 1).padStart(3, '0')}`
        const retired = project.id === first && i >= project.agents
        const recordId = t.api.createRecord({
          kind: 'agent',
          title: `Made-up agent ${String(n)}`,
          workspaceId: project.id,
          data: { handle, runtime: 'claude-code', state: retired ? 'retired' : 'active' },
          actor: PERSON,
        }).id
        if (retired) continue
        const ref = participants.participantForActor({ type: 'agent', id: handle })
        if (ref === null || ref.kind !== 'agent') throw new Error(`the made-up agent ${handle} has no registry row`)
        agents.push({ ref: { kind: 'agent', id: ref.id }, handle, recordId, workspaceId: project.id })
      }
    }

    // WHO STARTED EACH AGENT, which is how Home folds its agent column (src/web/components/home/AgentGroups.tsx).
    // A dozen made-up supervisors start the agents in turn, and the last `noStarter` agents have no starter
    // recorded, as every agent registered before migration 0135 has none.
    const starters: string[] = []
    for (let s = 0; s < LIVE_SHAPE.starters; s += 1) {
      const handle = `made-up-supervisor-${String(s + 1).padStart(2, '0')}`
      t.api.createRecord({ kind: 'agent', title: `Made-up supervisor ${String(s + 1)}`, workspaceId: first, data: { handle, runtime: 'claude-code', state: 'active' }, actor: PERSON })
      const ref = participants.participantForActor({ type: 'agent', id: handle })
      if (ref === null || ref.kind !== 'agent') throw new Error(`the made-up supervisor ${handle} has no registry row`)
      starters.push(ref.id)
    }
    const setStarter = t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?")
    agents.forEach((one, i) => {
      if (i < agents.length - LIVE_SHAPE.noStarter) setStarter.run(starters[i % starters.length], one.ref.id)
    })
    // RUNS GOING, with a recent request on each so presence has something to read.
    const here = agents.filter((one) => one.workspaceId === first)
    const insertCall = t.client.sqlite.prepare(
      'INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) VALUES (?, ?, 1.0, ?, 0, 200, ?, ?)',
    )
    for (let i = 0; i < LIVE_SHAPE.runsGoing; i += 1) {
      const agent = here[i * 7 % here.length]
      if (agent === undefined) continue
      const run = attachments.openAttachment({
        workspaceId: first,
        actor: PERSON,
        title: `A made-up run ${String(i + 1)}`,
        agentId: agent.recordId,
        doing: `Checks the made-up bench readings, part ${String(i + 1)}`,
      }).attachment.id
      insertCall.run(`call-live-shape-${String(i)}`, Date.now() - (i % 5) * 60_000, 'GET', run, 'header')
    }

    // One validated session and its flow record, links and history supply the shape.
    // Bulk copies avoid the repeated title advisory and open-run scans. All data is synthetic.
    const firstRun = attachments.openAttachment({ workspaceId: first, actor: PERSON, title: 'A made-up run nobody serves 1' }).attachment.id
    const flow = t.client.sqlite.prepare("SELECT id FROM records WHERE json_extract(data, '$.run') = ?").get(firstRun) as { id: string } | undefined
    if (flow === undefined) throw new Error('The synthetic session has no flow record to copy.')
    const originals = [firstRun, flow.id]
    const tables = ['records', 'links', 'changes', 'revisions'] as const
    const shapes = tables.map((table) => {
      const columns = (t.client.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((one) => one.name)
      const where = table === 'records' ? 'id IN (?,?)' : table === 'links' ? 'from_id IN (?,?) OR to_id IN (?,?)' : 'record_id IN (?,?)'
      const rows = t.client.sqlite.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...originals, ...(table === 'links' ? originals : [])) as Record<string, unknown>[]
      return { table, columns, rows, insert: t.client.sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`) }
    })
    for (let i = 1; i < LIVE_SHAPE.otherRuns; i += 1) {
      const replacements = new Map([[firstRun, randomUUID()], [flow.id, randomUUID()], ['A made-up run nobody serves 1', `A made-up run nobody serves ${String(i + 1)}`]])
      const rename = (value: unknown): unknown => {
        if (typeof value !== 'string') return value
        for (const [before, after] of replacements) value = (value as string).replaceAll(before, after)
        return value
      }
      for (const shape of shapes) {
        for (const row of shape.rows) {
          const copy = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, rename(value)]))
          if (shape.table !== 'records') copy['id'] = randomUUID()
          if (shape.table === 'changes') copy['append_order'] = null
          if (shape.table === 'revisions') copy['content_hash'] = versionOf(contentOf({ kind: copy['kind'] as string, title: copy['title'] as string, summary: copy['summary'] as string | null, data: JSON.parse(copy['data'] as string), deletedAt: copy['deleted_at'] as string | null }))
          shape.insert.run(...shape.columns.map((column) => copy[column]))
        }
      }
    }
    t.client.sqlite.transaction(() => {
      const now = Date.now()
      for (let i = 0; i < LIVE_SHAPE.apiCalls; i += 1) {
        insertCall.run(`call-live-shape-old-${String(i)}`, now - 3_600_000 - i * 1000, 'GET', null, 'header')
      }
    })()

    // GROUPS of agents in the first project.
    const owner = { kind: 'person' as const, id: THE_PERSON }
    const groupIds: string[] = []
    for (let g = 0; g < LIVE_SHAPE.groups; g += 1) {
      const members = here.slice(g * GROUP_MEMBER_MAX, (g + 1) * GROUP_MEMBER_MAX - 1)
      const group = groups.openAGroup({
        workspaceId: first,
        name: `Made-up crew ${String(g + 1)}`,
        openedBy: owner,
        because: 'A made-up crew for a test.',
        members: [{ who: owner, because: 'Opened it.' }, ...members.map((one) => ({ who: one.ref, because: 'Works on this crew.' }))],
      })
      groupIds.push(group.id)
    }

    // MESSAGES: from the person to agents, and to groups.
    for (let i = 0; i < LIVE_SHAPE.messages; i += 1) {
      const body = `Made-up message ${String(i + 1)}: check the bench readings again.`
      const addressing = i % 3 === 0
        ? { toGroup: groupIds[i % groupIds.length] }
        : { to: [here[i % here.length]?.ref] }
      t.api.createRecord({ kind: 'message', title: body.slice(0, 40), workspaceId: first, data: { body, ...addressing }, actor: PERSON })
    }

    // MESSAGES FROM AGENTS TO THE PERSON, unread, each written by the agent itself. Agents a few places apart in the
    // first project, so their starters differ (the starters are given in turn above).
    for (let i = 0; i < LIVE_SHAPE.messagesToThePerson; i += 1) {
      const agent = here[i * 13 + 5]
      if (agent === undefined) throw new Error('the made-up office has fewer agents in its first project than its messages need')
      const body = `Made-up question ${String(i + 1)}: may I recalibrate the bench before the next reading?`
      t.api.createRecord({
        kind: 'message',
        title: body.slice(0, 40),
        workspaceId: first,
        data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
        actor: { type: 'agent', id: agent.handle },
      })
    }

    // RECORDS: tasks and notes spread over the projects.
    for (let i = 0; i < LIVE_SHAPE.records; i += 1) {
      const project = LIVE_SHAPE.projects[i % LIVE_SHAPE.projects.length]?.id ?? first
      t.api.createRecord({
        kind: i % 2 === 0 ? 'task' : 'note',
        title: `Made-up ${i % 2 === 0 ? 'task' : 'note'} ${String(i + 1)}`,
        workspaceId: project,
        actor: PERSON,
      })
    }

  })()

  // THE FILE OUTLIVES THE CONNECTION: everything is folded into the main file before it is copied.
  t.client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}live-shape-`)
  const file = join(dir, 'panelx.db')
  copyFileSync(t.file, file)
  t.close()
  return { file, remove: () => rmSync(dir, { recursive: true, force: true }) }
}
