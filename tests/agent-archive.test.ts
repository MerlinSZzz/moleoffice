// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION WITH AN AGENT BELONGS TO A PROJECT, AND AN ARCHIVE HAS TO PROVE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO CLAIMS THIS FILE EXISTS TO PROVE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A PROJECT-SCOPED ARCHIVE CARRIES EXACTLY THAT PROJECT'S CONVERSATIONS AND NO OTHERS.
 *   2. A WHOLE-INSTALLATION ARCHIVE CARRIES ALL OF THEM.
 *
 * Both were stated on 18 August 2026 when `agent_threads`, `agent_messages` and `agent_runs` were
 * classified as authored, and neither was proved. They are not obvious, and they are not the same
 * claim twice: a comment and a run carry NO `workspace_id`. A conversation says which project it is
 * about; everything said in it belongs to the project its conversation names, one join away.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THAT IS THE WHOLE DIFFICULTY
 * ---------------------------------------------------------------------------------------
 *
 * Every other authored table answers "which project" with a column of its own or with nothing at
 * all, and `PERSON_LEVEL_TABLES` is derived as the second group. Under that rule these two would
 * have been person-level — they have no `workspace_id` — and a project archive would have printed,
 * over that project's own conversations, the sentence that set exists to print: that a plan belongs
 * to no project, so there is no project whose archive these would be. A FALSE SENTENCE INSIDE AN
 * ARCHIVE, and the last test in this file is what would go red if that answer ever came back.
 *
 * So `WORKSPACE_COLUMN` in db/schema.ts gained a third form — scoped through another table's row —
 * and `readTable` in lib/export.ts follows it. This file asks whether the archive that comes out is
 * really one project's, by reading the bytes rather than by trusting the query.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE IS TWO PROJECTS THAT LOOK ALIKE
 * ---------------------------------------------------------------------------------------
 *
 * Both hold a review, both hold comments about their own work, and both hold runs. If the scoping
 * silently did nothing, every count would be double and every id of the other project would be in
 * the file — which is what these tests look for, one id at a time.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { fakeTranscript, freshDb, one, type TestDb } from './helpers.ts'
import { spanNamedBy } from '../src/shared/targets.ts'

type AgentsLib = typeof import('../src/server/lib/agents.ts')
type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type WorkspaceLib = typeof import('../src/server/lib/workspaces.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let source: TestDb
let target: TestDb
/** The whole installation, and the robotics project on its own. */
let whole: string
let scoped: string

/** Everything one project's review produced, so a test can name a row rather than find one. */
interface Made {
  workspaceId: string
  recordId: string
  sessionId: string
  threadId: string
  messageIds: string[]
  runIds: string[]
}
let robotics: Made
let panelx: Made

/** Every file under a directory, as one string. What a person opening the archive can read. */
function textOf(root: string): string {
  const out: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else out.push(readFileSync(full, 'utf8'))
    }
  }
  visit(root)
  return out.join('\n')
}

/** Every file under a directory, as paths relative to it. */
function tree(root: string): Set<string> {
  const out = new Set<string>()
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(dir, entry.name), `${prefix}${entry.name}/`)
      else out.add(`${prefix}${entry.name}`)
    }
  }
  visit(root, '')
  return out
}

/**
 * One project's review, written through the product's own doors and no others.
 *
 * TWO RECIPIENTS, BECAUSE ONE PROVES LESS. A review is one human act that goes to several agents,
 * and dispatch writes one run per recipient — so each project ends up with two runs naming one
 * conversation, which is also what makes "exactly this project's" a count worth checking.
 */
async function reviewIn(workspaceId: string, about: string): Promise<Made> {
  const agents = (await import('../src/server/lib/agents.ts')) as AgentsLib

  const record = source.api.createRecord({
    workspaceId,
    kind: 'note',
    title: `${about} · what the last run wrote`,
    summary: `Written in ${workspaceId}, and quoted by a comment so the archive carries the words.`,
    data: { body: 'first line\nsecond line' },
    actor: HUMAN,
  })
  // THE AGENT THE RUN WORKED AS. A comment addressed to a run that answers as no agent is refused before it is
  // stored, and nothing is made up for it, so the run names one in `ranAs`. Only the person with their key may file a
  // session for an agent.
  const agent = source.api.createRecord({
    workspaceId,
    kind: 'agent',
    title: `${about} · the agent that run worked as`,
    data: { handle: `the-run-in-${workspaceId}`, state: 'active', runtime: 'claude-code' },
    actor: HUMAN,
  })
  const session = source.api.createRecord({
    workspaceId,
    kind: 'session',
    title: `${about} · the run this review is addressed to`,
    data: {
      state: 'idle',
      runtime: 'claude-code',
      ranAs: [{ workspaceId, agentId: agent.id }],
      // What discovery stamps on a session record; `stampOf` in lib/sessions.ts is its one reader,
      // and a session Mole Office has no id for is refused at dispatch by name.
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: `${workspaceId}-0000-0000-0000-000000000000`,
          // A REAL FILE, because dispatch asks whether the run can actually be picked up and that
          // reading looks for the transcript. A path nothing wrote is a run Mole Office would refuse to
          // address, which is right and is proved in tests/agent-dispatch.test.ts — it is just not
          // what this file is about.
          logPath: fakeTranscript('run', workspaceId),
          resumeCommand: `claude --resume ${workspaceId}`,
          observedState: 'idle',
          stateReason: 'its log last grew 40 minutes ago',
          filesTouched: [],
          filesComplete: true,
          at: '2026-08-18 09:00:00',
        },
      },
    },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' },
  })

  const thread = agents.createThread({ workspaceId, title: `${about} · read again`, mode: 'review' }, HUMAN)
  const onTheRecord = agents.addMessage(
    thread.id,
    workspaceId,
    {
      intent: 'review',
      body: `A comment that belongs to ${workspaceId} and to no other project.`,
      context: { target: { kind: 'record', recordId: record.id, workspaceId } },
      recipient: { kind: 'session', sessionId: session.id, why: 'This run wrote that note.' },
    },
    HUMAN,
  )
  const quote = 'second line'
  const onTheWords = agents.addMessage(
    thread.id,
    workspaceId,
    {
      intent: 'ask',
      body: 'These words claim more than the note does.',
      context: {
        target: { kind: 'record', recordId: record.id, workspaceId },
        span: {
          quote,
          from: 'first line\nsecond line'.indexOf(quote),
          to: 'first line\nsecond line'.indexOf(quote) + quote.length,
          field: 'data.body',
        },
      },
      recipient: {
        kind: 'new',
        said: 'somebody who has not read this yet',
        why: 'Asked for a fresh agent on purpose.',
      },
    },
    HUMAN,
  )

  const sent = agents.dispatchThread(thread.id, workspaceId, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' })
  if (sent.runs.length !== 2) {
    throw new Error(`the review in ${workspaceId} wrote ${sent.runs.length} run(s) and this fixture needs 2`)
  }
  const answered = one(
    sent.runs.filter((r) => r.recipientSessionId === session.id),
    `the run addressed to the ${workspaceId} session`,
  )
  agents.claimRun(answered.id, `worker-${workspaceId}`, null, { type: 'agent', id: 'mole-office-agent-worker', provedBy: 'the-office-key' })
  agents.finishRun(answered.id, { result: { says: `Answered inside ${workspaceId}.` } })

  return {
    workspaceId,
    recordId: record.id,
    sessionId: session.id,
    threadId: thread.id,
    messageIds: [onTheRecord.id, onTheWords.id],
    runIds: sent.runs.map((r) => r.id),
  }
}

beforeAll(async () => {
  whole = mkdtempSync(join(tmpdir(), 'mole-office-agents-whole-'))
  scoped = mkdtempSync(join(tmpdir(), 'mole-office-agents-scoped-'))

  source = await freshDb()
  const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
  workspaces.createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the arm' })
  workspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'this product' })

  robotics = await reviewIn('robotics', 'Tray clamp calibration')
  panelx = await reviewIn('panelx', 'The durable archive')

  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  exportLib.writeExport(whole)
  exportLib.writeExport(scoped, { workspaceId: 'robotics' })

  // A SECOND DATABASE that already holds the other project, so the restore has something to leave
  // alone. Restoring into an empty one would prove only that rows can be written.
  target = await freshDb()
  const targetWorkspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
  targetWorkspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'this product' })
  const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(scoped)
})

afterAll(() => {
  source.close()
  target.close()
  for (const dir of [whole, scoped]) rmSync(dir, { recursive: true, force: true })
})

// ================================================================ the fixture is worth measuring

describe('both projects really hold a conversation, or nothing below means anything', () => {
  it('wrote two reviews, four comments and four runs, in two projects', () => {
    const count = (table: string): number =>
      (source.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    expect(count('agent_threads')).toBe(2)
    expect(count('agent_messages')).toBe(4)
    expect(count('agent_runs')).toBe(4)
    // And the two projects are really two: a scoping that did nothing would still pass a count.
    const byProject = source.client.sqlite
      .prepare('SELECT workspace_id AS w, count(*) AS n FROM agent_threads GROUP BY 1 ORDER BY 1')
      .all() as { w: string; n: number }[]
    expect(byProject).toEqual([
      { w: 'panelx', n: 1 },
      { w: 'robotics', n: 1 },
    ])
  })

  it('gave the two projects different ids, so finding one is not finding the other', () => {
    const mine = new Set([robotics.threadId, ...robotics.messageIds, ...robotics.runIds])
    for (const id of [panelx.threadId, ...panelx.messageIds, ...panelx.runIds]) {
      expect(mine.has(id), `${id} is in both projects, so no test here can tell them apart`).toBe(false)
    }
  })
})

// ================================================================ claim 1: exactly this project's

describe("a project archive carries exactly that project's conversations", () => {
  it('holds this project\'s conversation, its comments and its runs', () => {
    const text = textOf(scoped)
    expect(text, 'the conversation is not in the archive').toContain(`id: "${robotics.threadId}"`)
    for (const id of robotics.messageIds) expect(text, `comment ${id} is not in the archive`).toContain(`id: "${id}"`)
    for (const id of robotics.runIds) expect(text, `run ${id} is not in the archive`).toContain(`id: "${id}"`)
    // A file per conversation and a file per run, so a person can open one and read it.
    const files = tree(scoped)
    expect(files).toContain(`conversations/${robotics.threadId}.md`)
    for (const id of robotics.runIds) expect(files).toContain(`runs/${id}.md`)
  })

  it('holds NOTHING of the other project, by id, anywhere in its bytes', () => {
    // THE CLAIM ITSELF. A comment and a run carry no workspace of their own, so "this archive is one
    // project's" cannot be read off a column — it has to be read off which rows are in the file.
    const text = textOf(scoped)
    for (const id of [panelx.threadId, ...panelx.messageIds, ...panelx.runIds]) {
      expect(text, `the other project's ${id} is in this project's archive`).not.toContain(id)
    }
    const files = tree(scoped)
    expect(files).not.toContain(`conversations/${panelx.threadId}.md`)
    for (const id of panelx.runIds) expect(files).not.toContain(`runs/${id}.md`)
  })

  it('counts one conversation, two comments and two runs in its manifest', () => {
    // The manifest is what an importer checks itself against, so the scoping has to be true THERE
    // as well as in the files. A count that said four while two were written is a truncated archive.
    const manifest = readFileSync(join(scoped, 'MANIFEST.md'), 'utf8')
    expect(manifest).toContain('workspace: "robotics"')
    expect(manifest).toContain('agent_threads: 1')
    expect(manifest).toContain('agent_messages: 2')
    expect(manifest).toContain('agent_runs: 2')
  })

  it('carries the words a comment quoted, and who each comment was for', () => {
    // Not the row count — the facts inside the row that no count would notice missing.
    const conversation = readFileSync(join(scoped, 'conversations', `${robotics.threadId}.md`), 'utf8')
    expect(conversation, 'the quoted words are not in the archive').toContain('second line')
    expect(conversation, 'the recipient session is not in the archive').toContain(robotics.sessionId)
    expect(conversation, 'the reason for a recipient is not in the archive').toContain('This run wrote that note.')
    expect(conversation, 'a comment addressed to a new agent does not say so').toContain('"new"')
  })

  it('carries what each worker was asked, written once', () => {
    const answered = one(
      robotics.runIds
        .map((id) => ({ id, text: readFileSync(join(scoped, 'runs', `${id}.md`), 'utf8') }))
        .filter((r) => r.text.includes('"result"') || r.text.includes('Answered inside')),
      'the run that was answered',
    )
    expect(answered.text).toContain('```json mole-office agent_runs.request')
    expect(answered.text).toContain('```json mole-office agent_runs.result')
    expect(answered.text).toContain('Answered inside robotics')
    // The request names this project and this conversation, which is what makes it readable against
    // the question it was given rather than against a question somebody reconstructed.
    expect(answered.text).toContain('"workspaceId": "robotics"')
  })
})

// ================================================================ claim 2: all of them

describe('a whole-installation archive carries all of them', () => {
  it('holds both projects\' conversations, comments and runs', () => {
    const text = textOf(whole)
    for (const made of [robotics, panelx]) {
      expect(text, `${made.workspaceId}: the conversation is missing`).toContain(`id: "${made.threadId}"`)
      for (const id of [...made.messageIds, ...made.runIds]) {
        expect(text, `${made.workspaceId}: ${id} is missing`).toContain(`id: "${id}"`)
      }
    }
    const files = tree(whole)
    for (const made of [robotics, panelx]) {
      expect(files).toContain(`conversations/${made.threadId}.md`)
      for (const id of made.runIds) expect(files).toContain(`runs/${id}.md`)
    }
  })

  it('counts every row of every project in its manifest', () => {
    const manifest = readFileSync(join(whole, 'MANIFEST.md'), 'utf8')
    expect(manifest).toContain('workspace: null')
    expect(manifest).toContain('agent_threads: 2')
    expect(manifest).toContain('agent_messages: 4')
    expect(manifest).toContain('agent_runs: 4')
  })

  it('is bigger than the scoped one, so the scoping is what was measured', () => {
    expect(tree(whole).size).toBeGreaterThan(tree(scoped).size)
  })

  it('builds the identical bytes twice, with conversations in it', async () => {
    // The property the git mirror rests on, asked over the pages this change added. A conversation
    // page holds its comments in order and a run page holds two documents; any of that read in a
    // different order would make every export a commit saying something changed.
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    const a = exportLib.buildExport().files
    const b = exportLib.buildExport().files
    expect(a.some((f) => f.path.startsWith('conversations/')), 'no conversation page, so this proves nothing').toBe(true)
    expect(a.some((f) => f.path.startsWith('runs/')), 'no run page, so this proves nothing').toBe(true)
    expect(b.map((f) => f.path)).toEqual(a.map((f) => f.path))
    for (const [i, file] of a.entries()) expect(b[i]?.text, `${file.path} differs between two builds`).toBe(file.text)
  })
})

// ================================================================ the restore

describe('a project archive restores its conversations beside a project it says nothing about', () => {
  it('brings the conversation back into the project it names', () => {
    const rows = target.client.sqlite
      .prepare('SELECT id, workspace_id AS w, title, mode, state FROM agent_threads')
      .all() as { id: string; w: string; title: string; mode: string; state: string }[]
    expect(rows.map((r) => r.id)).toEqual([robotics.threadId])
    expect(one(rows, 'the restored conversation').w).toBe('robotics')
    expect(one(rows, 'the restored conversation').mode).toBe('review')
  })

  it('brings every comment back with who it was for', () => {
    const rows = target.client.sqlite
      .prepare(
        'SELECT id, recipient_kind AS kind, recipient_session_id AS session, recipient_why AS why FROM agent_messages ORDER BY position',
      )
      .all() as { id: string; kind: string | null; session: string | null; why: string | null }[]
    expect(rows.map((r) => r.id).sort()).toEqual([...robotics.messageIds].sort())
    expect(rows.map((r) => r.kind).sort()).toEqual(['new', 'session'])
    const addressed = one(rows.filter((r) => r.kind === 'session'), 'the comment addressed to a run')
    expect(addressed.session).toBe(robotics.sessionId)
    expect(addressed.why).toBe('This run wrote that note.')
  })

  it('brings every run back with the question it was given', () => {
    const rows = target.client.sqlite.prepare('SELECT id, request, result FROM agent_runs').all() as {
      id: string
      request: string
      result: string | null
    }[]
    expect(rows.map((r) => r.id).sort()).toEqual([...robotics.runIds].sort())
    for (const row of rows) {
      const request = JSON.parse(row.request) as { workspaceId?: unknown; messages?: unknown[] }
      expect(request.workspaceId).toBe('robotics')
      expect(Array.isArray(request.messages) && request.messages.length > 0).toBe(true)
    }
    expect(rows.filter((r) => r.result !== null).length, 'the answered run came back with no answer').toBe(1)
  })

  it('reads back as a conversation, through the product\'s own reader', async () => {
    // THROUGH `readThread`, NOT OFF THE TABLE, because what a person sees is what has to come back.
    // A restore that put every column in place and left the conversation unreadable to the product
    // would pass every check above. `freshDb()` pointed the module registry at the target database
    // when it was made, so this reader is the restored one's.
    const agents = (await import('../src/server/lib/agents.ts')) as AgentsLib
    const read = agents.readThread(robotics.threadId, 'robotics')
    expect(read.thread.workspaceId).toBe('robotics')
    expect(read.messages.map((m) => m.id).sort()).toEqual([...robotics.messageIds].sort())
    expect(read.runs.map((r) => r.id).sort()).toEqual([...robotics.runIds].sort())

    // The comment that quoted a span of text still points at the words it quoted. That is the whole
    // reason the quote is stored, and a restore that lost it would leave Mole Office pretending an offset
    // still holds.
    const quoting = one(
      // `spanNamedBy` AND NOT THE FIELD. A span is written down in one of two fields and this asks
      // the one accessor, so it finds the comment that quoted words however that comment was written.
      read.messages.filter((m) => m.context !== null && spanNamedBy(m.context) !== null),
      'the comment that quoted a span of text',
    )
    expect(quoting.reading?.state, quoting.reading?.says).toBe('there')
    expect(quoting.reading?.quote?.words).toBe('second line')
    expect(quoting.reading?.quote?.stillThere).toBe(true)

    // And who each comment was for comes back as the product's own three layers.
    const addressed = one(
      read.messages.filter((m) => m.recipient?.kind === 'session'),
      'the comment addressed to a run',
    )
    expect(addressed.recipient?.sessionId).toBe(robotics.sessionId)
  })
})

// ================================================================ the false sentence

/**
 * THE ANSWER THAT WAS REJECTED, PINNED SO IT CANNOT COME BACK QUIETLY.
 *
 * If `agent_messages` and `agent_runs` were classified as person-level — which is what "no
 * `workspace_id` column means no project" would have made them — then a project archive would carry
 * none of their rows and would say so, in the sentence `absenceLine` writes: that a plan belongs to
 * no project, so there is no project whose archive these would be. Over a project's OWN
 * conversations that sentence is false, and it would be inside an archive, which is the one place
 * this product must not put one.
 */
describe('a project archive never says a project\'s own conversations belong to nobody', () => {
  it('does not call the agent tables person-level', async () => {
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    for (const table of ['agent_threads', 'agent_messages', 'agent_runs']) {
      expect(
        [...PERSON_LEVEL_TABLES],
        `${table} is reported as belonging to no project, and a project archive would say so in words`,
      ).not.toContain(table)
    }
  })

  it('writes none of the person-level sentences over a conversation', () => {
    const text = textOf(scoped)
    for (const table of ['agent_threads', 'agent_messages', 'agent_runs']) {
      expect(text, `the archive says it carries no ${table} rows, over rows it is carrying`).not.toContain(
        `carries no \`${table}\` rows AT ALL`,
      )
    }
    // The manifest's list of what a project archive cannot hold is the other place the sentence
    // would appear, under a heading calling all of it the planning layer.
    const manifest = readFileSync(join(scoped, 'MANIFEST.md'), 'utf8')
    const absent = manifest.slice(manifest.indexOf('## Tables that are deliberately absent'))
    for (const table of ['agent_threads', 'agent_messages', 'agent_runs']) {
      expect(absent, `${table} is listed as a table this archive cannot carry`).not.toContain(table)
    }
  })

  it('and the sentence really is written for the tables it IS true of', async () => {
    // NOT VACUOUS. Without this, the three assertions above could pass because `absenceLine` had
    // stopped writing that sentence at all, and the archive would then say nothing where it used to
    // say something true.
    const { PERSON_LEVEL_TABLES } = await import('../src/server/db/authored-table-of.ts')
    const text = textOf(scoped)
    expect(PERSON_LEVEL_TABLES.length).toBeGreaterThan(0)
    const said = PERSON_LEVEL_TABLES.filter((table) => text.includes(`carries no \`${table}\` rows AT ALL`))
    expect(said.length, 'no page of this archive says where the person-level rows went').toBeGreaterThan(0)
  })
})

// ================================================================ a comment with no conversation

/**
 * A COMMENT WHOSE CONVERSATION IS NOT THERE BELONGS TO NO PROJECT, AND IS STILL SOMEBODY'S WORDS.
 *
 * A comment carries no `workspace_id`: its project is a fact about its conversation. So a comment
 * naming a conversation that is not there has no project anybody can work out — the same shape of
 * fact as a change row whose `record_id` answers to nothing, and the archive treats it the same way.
 *
 *   THE WHOLE-INSTALLATION ARCHIVE STILL CARRIES IT. A row that is counted in the manifest and
 *     written into no file is a row a restore loses in silence, and the importer would report the
 *     archive as truncated rather than saying which row went missing.
 *   NO PROJECT'S ARCHIVE CARRIES IT, and the scoped export SAYS SO with the number, rather than
 *     dropping it quietly and reading as complete.
 *
 * Nothing in the product deletes a conversation today, so this state is reached here by deleting the
 * row directly. That is the point: the archive has to be honest about a database it did not write.
 */
describe('a comment whose conversation is gone is carried, and said out loud', () => {
  let orphaned: TestDb
  let everything: string
  let onlyRobotics: string
  let scopedReport: { notes: string[] }
  let strandedId: string

  beforeAll(async () => {
    everything = mkdtempSync(join(tmpdir(), 'mole-office-orphan-whole-'))
    onlyRobotics = mkdtempSync(join(tmpdir(), 'mole-office-orphan-scoped-'))

    orphaned = await freshDb()
    const workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspaceLib
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the arm' })
    const agents = (await import('../src/server/lib/agents.ts')) as AgentsLib

    const kept = agents.createThread({ workspaceId: 'robotics', title: 'A conversation that stays', mode: 'direct' }, HUMAN)
    agents.addMessage(kept.id, 'robotics', { intent: 'discuss', body: 'This one has a conversation.' }, HUMAN)

    const doomed = agents.createThread({ workspaceId: 'robotics', title: 'A conversation about to vanish', mode: 'direct' }, HUMAN)
    const stranded = agents.addMessage(
      doomed.id,
      'robotics',
      { intent: 'ask', body: 'These words are somebody\'s and their conversation is about to go.' },
      HUMAN,
    )
    strandedId = stranded.id
    orphaned.client.sqlite.prepare('DELETE FROM agent_threads WHERE id = ?').run(doomed.id)

    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(everything)
    scopedReport = exportLib.writeExport(onlyRobotics, { workspaceId: 'robotics' })
  })

  afterAll(() => {
    orphaned.close()
    for (const dir of [everything, onlyRobotics]) rmSync(dir, { recursive: true, force: true })
  })

  it('the fixture really stranded a comment, or nothing here is about anything', () => {
    const n = (
      orphaned.client.sqlite
        .prepare('SELECT count(*) AS n FROM agent_messages WHERE thread_id NOT IN (SELECT id FROM agent_threads)')
        .get() as { n: number }
    ).n
    expect(n).toBe(1)
  })

  it('the whole-installation archive writes it into a file rather than counting it and losing it', () => {
    const text = textOf(everything)
    expect(text).toContain(`id: "${strandedId}"`)
    expect(tree(everything)).toContain('conversations/comments-with-no-conversation.md')
    // The manifest counts what is in the files, so a row written nowhere would make this archive
    // read as truncated to the importer that checks itself against it.
    expect(readFileSync(join(everything, 'MANIFEST.md'), 'utf8')).toContain('agent_messages: 2')
  })

  it('the whole-installation archive restores it, stranded comment and all', async () => {
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = importLib.planImport(everything)
    expect(plan.ok, plan.refusals.map((r) => r.problem).join('\n')).toBe(true)
    expect(plan.read['agent_messages']).toBe(2)
  })

  it('no project archive carries it, and the report says how many were left behind', () => {
    const text = textOf(onlyRobotics)
    expect(text, 'a comment with no project is inside a project archive').not.toContain(strandedId)
    expect(readFileSync(join(onlyRobotics, 'MANIFEST.md'), 'utf8')).toContain('agent_messages: 1')
    const said = scopedReport.notes.join('\n')
    expect(said, 'the scoped export said nothing about the comment it could not carry').toContain('agent_messages')
    expect(said).toContain('1 agent_messages row(s) name a agent_threads row that is not there')
  })
})
