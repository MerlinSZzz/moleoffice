// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS AN ENTRY'S OWN SUPERVISOR TO RESOLVE A CONFLICT IT HANDED ON (tier 2 of the owner's decision,
 * round B, part 7; Fr7xGMIidn97, way (a), on the conditions of XHY2fVFG3Qq8, answer 6).
 * Nothing of it is live: the setting MOLE_OFFICE_CONFLICT_RESOLVING is off by default, and these cases turn it on only
 * around the step that hands an entry on.
 *
 * WHAT THIS FILE PROVES:
 * 1. When a conflict goes to resolving, the office writes the resolve brief from its one template into the briefs folder
 *    of the asked agent's sandbox, as `resolve-<entry>.md`, where the next-round door reads a brief. The brief fills in
 *    the clean-copy command and the hand-over from the entry, asks for the supervisor's own run of the related tests to
 *    be declared with the hand-over (XHY2fVFG3Qq8, answer 3), and names the hour's end. The office sends one message, as
 *    itself, to everybody told of the entry's end and to the secretary. Its `askedToResolve` carries the five things a
 *    program reads: the entry, the files, the brief, the agent and the hour's end. The entry keeps all of it as
 *    `resolving.asked`, and the step says it. The supervisor has no run going, so the office asks the next-round door for
 *    its round itself, on the brief, and keeps the door's answer on the ask as `round` (wave 13u round 90). The message
 *    says that the office asked and what the door answered, where it used to tell a secretary to ask. Mutation: the
 *    office's own ask left out of the hand-on turns cases 1 and 6 red.
 * 2. The asked agent is the first one told of the entry's end that may hand a resolution over, so a worker's entry asks
 *    its supervisor, into the supervisor's sandbox.
 * 3. When no brief can be written, the entry says why and the message still asks: no agent on the line may hand a
 *    resolution over, the agent has no run started in a sandbox, the office cannot vouch for the sandbox, the briefs
 *    folder is a link, or the agent's sandbox run has no create row in the change log. Nothing is written through the
 *    link. For the run with no create row, the entry keeps the words of the next-round door's 500, which name the run,
 *    and the step is not stopped by them (wave 13u round 105). Mutation: the 500 let through the hand-on turns this case
 *    red.
 * 4. Only Mole Office writes `askedToResolve`: a caller's message that carries it is refused with 403, and so is a patch
 *    of it on the office's message.
 * 5. With the setting off, the conflict bounces as before: no brief and no message.
 * 6. The brief is written before the write that records the asking. When that write fails, the step is refused with 500
 *    in words that name the brief that is left, no message is sent and the entry does not move (x2y70-Bc8xmi). The
 *    next conflict step asks, and its brief takes the next name. A trigger on this test's own database refuses the
 *    asking message, to make the write fail.
 * 7. A landing that hands on the conflict of an entry waiting behind it writes that entry's brief before the landing is
 *    recorded. When the landing's own write fails after that, the step is refused with 500 in words that name the brief
 *    that is left: the landing is not recorded, the waiting entry does not move and no message is sent (
 *    bHtubWembovw). The next landed step lands it and asks, and the brief takes the next name. A trigger on this test's
 *    own database refuses the landing's last write.
 * 8. The step reads the setting when it runs, and a choice saved on the Settings page wins over the environment (wave
 *    13r round 19). Saved 1 hands the next entry on and saved 0 bounces the next one, in the same office, with no
 *    restart. With nothing saved, the environment decides again. Mutation: the reader that ignores the saved choice
 *    turns this case red.
 *
 * A conflict met after a resolution the check passed is tests/the-office-moves-a-checked-resolution.test.ts's, and the
 * writer's own refusals are tests/the-office-writes-a-brief-into-a-sandbox.test.ts's.
 *
 * Every fixture here is synthetic and says so. The git trees are made under `.logs/` in this checkout and removed after.
 * The sandbox folders are made under the temporary directory and removed after; each is vouched for by a container row
 * written as `tools/sandbox.mjs up` writes one, and named by a run filed as its launcher files one. The records are filed
 * as fixtures, and nothing reaches the live server. Case 3 takes one run's create row out of this test's own change log.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesOwnId, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { ABSENT, pinnedRefOf } from '../src/shared/merge-queue.ts'
import { localStamp, theClockZone, theHourAfter } from '../src/shared/time.ts'

const THE_SETTING = 'MOLE_OFFICE_CONFLICT_RESOLVING'

describe('the office asks the entry\'s own supervisor to resolve a conflict it handed on', () => {
  let t: TestDb
  let app: FastifyInstance
  let main: string
  let sandboxes: string
  const made: string[] = []
  const A = 'work/a.txt'
  const REPOSITORY = 'resolve-seven'
  const ids: Record<string, string> = {}
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asTheOffice = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  const asAgent = (handle: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
  async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    mkdirSync('.logs', { recursive: true })
    const dir = mkdtempSync(join(process.cwd(), '.logs', `asked-${prefix}-`))
    made.push(dir)
    return dir
  }
  const stored = (id: string) => t.api.getRecord(id)!.data
  const listed = (dir: string) => readdirSync(dir).sort()
  /** Every message the office wrote that asks for a resolution about this run. */
  const askingAbout = (run: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'askedToResolve' AND json_extract(data, '$.aboutRun') = ?").all(run) as { id: string }[]).map((row) => row.id)
  const countMessages = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
  const theConflictsCountedToday = () => {
    const row = t.client.sqlite.prepare("SELECT would_stop AS n FROM gate_counts WHERE gate = 'conflict-resolving' AND day = ?").get(localStamp(new Date()).slice(0, 10)) as { n: number } | undefined
    return row?.n ?? 0
  }
  function rawData(id: string, data: Record<string, unknown>) { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id) }
  /** A conflict met after a resolution the check passed, with a stored hour whose start cannot be read. */
  function withAnHourThatCannotBeRead(id: string) {
    rawData(id, {
      ...stored(id),
      resolving: { files: [A], says: ITS_TURN, since: '2026-10-25 01:30:00', timeZone: 'Europe/London' },
      resolution: { checked: {} },
    })
  }
  const THE_ASKING_IS_REFUSED = "CREATE TRIGGER synthetic_refusal_of_the_asking BEFORE INSERT ON records WHEN NEW.kind = 'message' AND json_extract(NEW.data, '$.notice') = 'askedToResolve' BEGIN SELECT RAISE(ABORT, 'Synthetic: the database refused the asking message'); END"

  /** A synthetic tree whose `work` branch changes work/a.txt with a line of its own, so two trees are two works. */
  function tree(): { dir: string; mainAt: string } {
    const dir = scratch('tree')
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic resolving fixture')
    mkdirSync(join(dir, 'work')); writeFileSync(join(dir, A), 'before\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    const mainAt = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    return { dir, mainAt }
  }

  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function withTheSetting<T>(value: '0' | '1', run: () => Promise<T>): Promise<T> {
    const before = process.env[THE_SETTING]
    process.env[THE_SETTING] = value
    try { return await run() } finally { if (before === undefined) delete process.env[THE_SETTING]; else process.env[THE_SETTING] = before }
  }

  interface Judged { id: string; run: string; commit: string; mainAt: string; files: Record<string, string> }
  /** A SUBMITTED ENTRY: a finished run of `servedBy` in a fresh tree, sealed, released and submitted by the person. */
  async function aSubmittedEntry(servedBy: string): Promise<Judged> {
    const { dir, mainAt } = tree()
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose entry conflicts', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: servedBy, workingDirectory: dir, cutFrom: 'main' } }).id
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: { path: string; hash: string | null }[] } }
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-17 01:30:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    const queued = await call('POST', '/api/merge-queue', asPerson, { run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    const id = String(queued.body.entry.id)
    const files = Object.fromEntries(seal.git.files.map((one) => [one.path, one.hash ?? ABSENT]))
    return { id, run, commit: seal.git.commit, mainAt, files }
  }
  /** A JUDGED ENTRY: a submitted entry, pinned. */
  async function aJudgedEntry(servedBy: string): Promise<Judged> {
    const one = await aSubmittedEntry(servedBy)
    const pinned = await step(one.id, 'pinned', { files: one.files })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('judged')
    return one
  }

  interface One { id: string; run: string; commit: string; mainAt: string; decided: string; error?: string }
  /**
   * AN ENTRY AT ITS CONFLICT: a judged entry of `servedBy`, integrating, and then the conflict step at the tree's main,
   * with the setting as `setting` says. The step answers `status`, and the refusal's words are `error` when it is not 200.
   */
  async function anEntryThatConflicts(servedBy: string, setting: '0' | '1' = '1', status = 200): Promise<One> {
    const { id, run, commit, mainAt } = await aJudgedEntry(servedBy)
    expect((await step(id, 'integrating', {})).status).toBe(200)
    const stepped = await withTheSetting(setting, () => step(id, 'conflict', { files: [A], mainAt }))
    expect(stepped.status, stepped.raw).toBe(status)
    return { id, run, commit, mainAt, decided: String(stepped.body.decided), ...(status === 200 ? {} : { error: String(stepped.body['error']) }) }
  }

  /**
   * A SANDBOX OF `handle`: a folder with its worktrees folder and its briefs folder (or a link in the briefs folder's
   * place, or none), the container row that vouches for it (or one that names another folder), and the agent's run
   * started in it, filed as the launcher files one.
   */
  /** The run started in each handle's sandbox, which holds the office's own ask for the handle's next round. */
  const runsIn: Record<string, string> = {}
  function aSandbox(handle: string, how: { briefs?: 'a folder' | 'a link'; vouched?: false } = {}): { folder: string; run: string } {
    const folder = join(sandboxes, `sandbox-${handle}`)
    mkdirSync(join(folder, 'worktrees'), { recursive: true })
    mkdirSync(join(folder, 'repo'), { recursive: true })
    if ((how.briefs ?? 'a folder') === 'a folder') mkdirSync(join(folder, 'briefs'))
    else {
      mkdirSync(join(sandboxes, `elsewhere-${handle}`))
      symlinkSync(join(sandboxes, `elsewhere-${handle}`), join(folder, 'briefs'))
    }
    const named = how.vouched === false ? join(sandboxes, `another-${handle}`) : folder
    const container = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-17 07:00:00', 'agent:fixture')")
      .run(container, `mole-office-sandbox-${basename(folder)}`, `Sandbox ${basename(folder)}, from the template mole-office-dev; ${theWordsNamingTheFolder(named)} Started by node tools/sandbox.mjs up.`)
    const run = t.api.createRecord({
      kind: 'session',
      title: `Synthetic round of ${handle} in its sandbox`,
      workspaceId: 'default',
      actor: person,
      origin: 'fixture',
      data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: 'claude-made-up-resolve-0', workingDirectory: join(folder, 'repo'), cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder } },
    }).id
    runsIn[handle] = run
    return { folder, run }
  }

  /** The hour of a resolving entry: its start, its end as a person reads it and as a program reads it, and its zone. */
  function theHourOf(id: string) {
    const { since, timeZone } = stored(id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs, `the hour of merge entry ${id} cannot be read`).not.toBeNull()
    return { since, timeZone, stamp: since.slice(0, 19).replace('T', ' '), until: hour.until!, iso: new Date(hour.untilMs!).toISOString() }
  }
  const ITS_TURN = `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}.`

  /** THE BRIEF, AS ITS ONE TEMPLATE WRITES IT for an entry that met its first conflict, asked of res7-supervisor. */
  function theBriefFor(one: One, into: string): string {
    const hour = theHourOf(one.id)
    return [
      `# Resolve the conflict of merge entry ${one.id}`,
      '',
      `Mole Office wrote this brief for res7-supervisor (${ids['res7-supervisor']}) when the merge queue handed the entry's conflict to its own supervisor instead of bouncing it.`,
      '',
      '## The entry',
      '',
      `- Merge entry: ${one.id}, ${t.api.getRecord(one.id)!.title}`,
      `- Its run: ${one.run}`,
      `- Its repository: ${main}`,
      `- The files to resolve: ${A}`,
      `- What the queue met: ${ITS_TURN}`,
      '',
      '## The time to resolve',
      '',
      `Hand over a resolution, or say that the conflict cannot be resolved, before ${hour.until} (${hour.timeZone}). The 60 minutes started when the entry's first conflict was handed on, and they are never started again. When they end with no resolution handed over, the entry bounces as "the hour ran out".`,
      '',
      '## The clean copy',
      '',
      'From the top of a checkout of Mole Office:',
      '',
      `    node tools/merge-tool/resolve-a-conflict.mjs --entry ${one.id} --repository ${main} --ref ${pinnedRefOf(one.id)} --commit ${one.commit} --main-at ${one.mainAt} --files ${A} --into ${into}`,
      '',
      "It replays the entry's own commit onto that main with the queue's joins, and stops where git leaves a file in conflict. Resolve the places, run `git add` on the files, and run it again until the replay ends:",
      '',
      `    node tools/merge-tool/resolve-a-conflict.mjs --continue --into ${into}`,
      '',
      '## How to resolve',
      '',
      'Keep both sides. If keeping both would change what one side meant, say so and stop:',
      '',
      `    POST /api/merge-queue/${one.id}/resolution {"cannot": "<one sentence saying why>", "changesWhatOneSideMeant": true}`,
      '',
      'If it cannot be resolved for another reason, say why and stop:',
      '',
      `    POST /api/merge-queue/${one.id}/resolution {"cannot": "<one sentence saying why>"}`,
      '',
      '## The related tests',
      '',
      'When the replay ends, the clean-copy tool names the test files that depend on the resolved paths, and the command that runs them. Run them in the clean copy.',
      '',
      "Declare what they did with the hand-over, as `tests`: the commit they ran at, the exit code, how many passed and failed, and the log. Declare it with your own key. The office does not run them or read the log. It shows your run, as declared, to whoever judges the resolution, and it passes or fails nothing. The merge tool refuses a resolution whose declared run is not at the resolution's commit.",
      '',
      '## The hand-over',
      '',
      `    POST /api/merge-queue/${one.id}/resolution {"workingDirectory": "${into}", "tests": {"commit": "<the resolution's commit>", "exit": <exit>, "counts": {"passed": <n>, "failed": <n>}, "log": "${into}.tests.log"}}`,
      '',
      'The tool prints this request when the replay ends, with the commit filled in. Leave out `tests` if you ran none. Keep the HEAD of the clean copy at the resolution until the entry ends: the merge tool fetches it from there.',
      '',
    ].join('\n')
  }

  /**
   * THE ENTRY WAS HANDED ON AND ASKED FOR: what it keeps of whom the office asked, and the step's words for it. `round`
   * is the run that holds the office's own ask for the agent's next round, when the door took one (wave 13u round 90).
   * The door's own words are its line's, so they are read back and not pinned.
   */
  function itAsked(one: One, asked: Record<string, unknown>, whom: string, round?: string) {
    const held = stored(one.id)
    expect(held['state']).toBe('resolving')
    expect((held['resolving'] as { asked: unknown }).asked).toEqual({
      ...asked,
      message: expect.any(String),
      ...(round === undefined ? {} : { round: { at: expect.any(String), status: 202, said: expect.any(String), run: round } }),
    })
    const { message, round: door } = (held['resolving'] as { asked: { message: string; round?: { said: string } } }).asked
    expect(askingAbout(one.run)).toEqual([message])
    expect(one.decided).toBe(
      `Conflict in ${A}. It now waits for its own supervisor to resolve the conflict, within 60 minutes of ${theHourOf(one.id).stamp}. ${whom} It asked in message ${message}.` +
        (door === undefined ? '' : ` It asked for the round itself, and the door answered: ${door.said}`),
    )
    return t.api.getRecord(message)!
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    main = realpathSync(scratch('main'))
    sandboxes = realpathSync(mkdtempSync(join(tmpdir(), 'resolve-seven-sandboxes-')))
    made.push(sandboxes)
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root: main, actor: { ...person, provedBy: 'the-person-key' } })
    // THE LINE, as the secretary registers a supervisor and a supervisor registers its worker. A row that names no role reads as a worker.
    const started = async (by: Record<string, string>, handle: string, role?: string) => {
      // A SECRETARY REGISTERS NO WORK AREA: its card's rule refuses one, so this call leaves `workArea` out.
      const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(role === 'secretary' ? {} : { workArea: ['work'] }), ...(role === undefined ? {} : { role }) })
      expect(r.status, r.raw).toBe(201)
      ids[handle] = String(r.body['agent'].id)
    }
    await started(asPerson, 'res7-starter', 'supervisor')
    await started(asAgent('res7-starter'), 'res7-supervisor', 'supervisor')
    await started(asAgent('res7-supervisor'), 'res7-worker')
    await started(asPerson, 'res7-secretary', 'secretary')
    await started(asPerson, 'res7-bare', 'supervisor')
    await started(asPerson, 'res7-unvouched', 'supervisor')
    await started(asPerson, 'res7-linked', 'supervisor')
    await started(asPerson, 'res7-unplaced', 'supervisor')
    await started(asPerson, 'res7-lone')
  }, 60_000)
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it("writes the resolve brief into the supervisor's sandbox and asks once, as the office, the entry's line and the secretary", async () => {
    const sandbox = aSandbox('res7-supervisor')
    const one = await anEntryThatConflicts('res7-supervisor')
    const brief = join(sandbox.folder, 'briefs', `resolve-${one.id}.md`)
    const into = join(sandbox.folder, 'worktrees', `resolve-${one.id}`)
    const message = itAsked(one, { agent: ids['res7-supervisor'], brief }, `The office wrote the resolve brief at ${brief}.`, sandbox.run)
    expect(readFileSync(brief, 'utf8')).toBe(theBriefFor(one, into))
    expect(existsSync(into), 'the clean copy is the supervisor\'s to make').toBe(false)
    // THE BRIEF IS WHERE THE NEXT-ROUND DOOR READS ONE: inside the sandbox folder of the agent's last run in a sandbox.
    const { theBriefAt } = await import('../src/server/lib/next-round.ts')
    expect(theBriefAt(brief, sandbox.folder)).toMatchObject({ path: brief })

    // ONE MESSAGE, written as the office, to everybody told of the entry's end and then the secretary.
    const hour = theHourOf(one.id)
    expect(message.kind).toBe('message')
    expect(message.title).toBe(`Asked to resolve: merge entry ${one.id}`)
    expect(message.data).toMatchObject({
      notice: 'askedToResolve',
      sentBy: { kind: 'agent', id: theOfficesOwnId(t) },
      to: [{ kind: 'agent', id: ids['res7-supervisor'] }, { kind: 'agent', id: ids['res7-starter'] }, { kind: 'agent', id: ids['res7-secretary'] }],
      aboutRun: one.run,
      askedToResolve: { entry: one.id, files: [A], brief, agent: ids['res7-supervisor'], until: hour.iso },
    })
    expect(message.data['body']).toBe(
      `Merge entry ${one.id} — ${t.api.getRecord(one.id)!.title} — met a conflict no rule joins, and the queue handed it to its own supervisor instead of bouncing it. ${ITS_TURN}\n\n` +
        `The files to resolve: ${A}.\n` +
        'The agent asked to resolve it: res7-supervisor.\n' +
        `The resolve brief: ${brief}\n` +
        `The 60 minutes end at ${hour.until} (${hour.timeZone}). When they end with no resolution handed over, the entry bounces as "the hour ran out".\n\n` +
        `res7-supervisor had no run going, so the office asked for its next round itself, on this brief. The door answered: ${(stored(one.id)['resolving'] as { asked: { round: { said: string } } }).asked.round.said}`,
    )

    // A WORKER'S ENTRY ASKS ITS SUPERVISOR, the first on the line that may hand a resolution over, into its sandbox.
    const workers = await anEntryThatConflicts('res7-worker')
    const theirs = join(sandbox.folder, 'briefs', `resolve-${workers.id}.md`)
    const toWorkers = itAsked(workers, { agent: ids['res7-supervisor'], brief: theirs }, `The office wrote the resolve brief at ${theirs}.`, sandbox.run)
    expect(readFileSync(theirs, 'utf8')).toContain(`--into ${join(sandbox.folder, 'worktrees', `resolve-${workers.id}`)}`)
    expect(toWorkers.data['to']).toEqual([{ kind: 'agent', id: ids['res7-worker'] }, { kind: 'agent', id: ids['res7-supervisor'] }, { kind: 'agent', id: ids['res7-secretary'] }])
    expect(listed(join(sandbox.folder, 'briefs'))).toEqual([`resolve-${one.id}.md`, `resolve-${workers.id}.md`].sort())
  })

  it('says why no brief was written, and still asks, for each reason it cannot write one', async () => {
    const NO_ONE_STARTS = 'Nobody can be started on a brief, so whoever resolves it has to be told by a person or the secretary.'
    // NO SANDBOX RUN AT ALL.
    const bare = await anEntryThatConflicts('res7-bare')
    const noRun = 'res7-bare has no run in this project that was started in a sandbox, so there is no sandbox folder to write the brief into. No brief was written.'
    const toBare = itAsked(bare, { agent: ids['res7-bare'], noBrief: noRun }, noRun)
    expect(toBare.data['askedToResolve']).toEqual({ entry: bare.id, files: [A], brief: null, agent: ids['res7-bare'], until: theHourOf(bare.id).iso })
    expect(String(toBare.data['body'])).toContain(`The agent asked to resolve it: res7-bare.\n${noRun}\n`)
    expect(String(toBare.data['body']).endsWith(NO_ONE_STARTS)).toBe(true)

    // A SANDBOX THE OFFICE CANNOT VOUCH FOR: its container row names another folder.
    const unvouched = aSandbox('res7-unvouched', { vouched: false })
    const notVouched = await anEntryThatConflicts('res7-unvouched')
    const cannotVouch = `Run ${unvouched.run}, the last of res7-unvouched started in a sandbox, names a sandbox the office cannot vouch for: its folder is not one a container row of the ledger names. No brief was written.`
    itAsked(notVouched, { agent: ids['res7-unvouched'], noBrief: cannotVouch }, cannotVouch)
    expect(listed(join(unvouched.folder, 'briefs'))).toEqual([])

    // A BRIEFS FOLDER THAT IS A LINK: refused, and nothing is written where it points.
    const linked = aSandbox('res7-linked', { briefs: 'a link' })
    const throughALink = await anEntryThatConflicts('res7-linked')
    const noBrief = (stored(throughALink.id)['resolving'] as { asked: { noBrief: string } }).asked.noBrief
    expect(noBrief).toBe(`${join(linked.folder, 'briefs')} is a link or not a folder, and the office does not write through a link. Nothing was written.`)
    itAsked(throughALink, { agent: ids['res7-linked'], noBrief }, noBrief)
    expect(listed(join(sandboxes, 'elsewhere-res7-linked'))).toEqual([])

    // A SANDBOX RUN WITH NO CREATE ROW IN THE CHANGE LOG: the next-round door's 500 names the run, and the entry keeps
    // those words as why no brief was written, where they used to stop the step.
    const unplaced = aSandbox('res7-unplaced')
    const gone = t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(unplaced.run)
    expect(gone.changes, `the create row of ${unplaced.run}`).toBe(1)
    const { theLastSandboxRunOf } = await import('../src/server/lib/next-round.ts')
    const the500 = (() => { try { theLastSandboxRunOf(ids['res7-unplaced']!, 'res7-unplaced', 'default'); return null } catch (error) { return error as { status?: number; message?: string } } })()
    expect(the500?.status, String(the500?.message)).toBe(500)
    expect(the500?.message).toContain(`Run ${unplaced.run} `)
    const noPlace = await anEntryThatConflicts('res7-unplaced')
    const notPlaced = `${the500!.message} No brief was written.`
    itAsked(noPlace, { agent: ids['res7-unplaced'], noBrief: notPlaced }, notPlaced)
    expect(listed(join(unplaced.folder, 'briefs'))).toEqual([])

    // NOBODY ON THE LINE MAY HAND A RESOLUTION OVER: a worker the person registered, whose line is itself alone.
    const lone = await anEntryThatConflicts('res7-lone')
    const noAgent = `No agent told of this entry's end (${ids['res7-lone']}) may hand a resolution over: each is retired or holds a worker's card. No brief was written.`
    const toLone = itAsked(lone, { noBrief: noAgent }, noAgent)
    expect(toLone.data['to']).toEqual([{ kind: 'agent', id: ids['res7-lone'] }, { kind: 'agent', id: ids['res7-secretary'] }])
    expect(String(toLone.data['body'])).toContain(`No agent is asked by name.\n${noAgent}\n`)
    expect(String(toLone.data['body']).endsWith(NO_ONE_STARTS)).toBe(true)
  })

  it('keeps `askedToResolve` the office\'s own: a caller\'s message carrying it is refused, and so is a patch of it', async () => {
    const one = await anEntryThatConflicts('res7-bare')
    const theOffices = (stored(one.id)['resolving'] as { asked: { message: string } }).asked.message
    const before = countMessages()
    const askedToResolve = { entry: one.id, files: [A], brief: '/synthetic/briefs/resolve.md', agent: ids['res7-bare'], until: '2026-10-17T09:00:00.000Z' }
    const sent = await call('POST', '/api/records', asAgent('res7-supervisor'), { kind: 'message', title: 'Synthetic: a message that asks as the office would', data: { to: [{ kind: 'agent', id: ids['res7-secretary'] }], body: 'Synthetic.', askedToResolve } })
    expect(sent.status, sent.raw).toBe(403)
    expect(sent.body['error']).toBe("Mole Office writes `askedToResolve` on the message that asks a merge entry's supervisor to resolve its conflict, and a caller may not set it. Nothing was written.")
    expect(countMessages()).toBe(before)
    // A CALLER'S OWN MESSAGE MAY NOT GAIN IT BY A PATCH, and the office's may not lose or change it. Each is refused in
    // these words first. Without them each would still be refused, in the words of the rule that a writer changes only a
    // message's words, or that nobody changes a notice from Mole Office, which say nothing of `askedToResolve`.
    const plain = await call('POST', '/api/records', asAgent('res7-supervisor'), { kind: 'message', title: 'Synthetic: a plain message', data: { to: [{ kind: 'agent', id: ids['res7-secretary'] }], body: 'Synthetic.' } })
    // NOTHING HOLDS THE SECRETARY IN THE TEST OFFICE, so the office stores the plain message, routes it and answers 409.
    // The message is stored all the same, and the patch below is about it.
    expect(plain.status, plain.raw).toBe(409)
    const plainId = String(plain.body['record'].id)
    const patched = await call('PATCH', `/api/records/${plainId}`, asAgent('res7-supervisor'), { ifVersion: plain.body['record'].version, dataPatch: { askedToResolve } })
    expect(patched.status, patched.raw).toBe(403)
    expect(patched.body['error']).toBe('Mole Office writes `askedToResolve` when the line is written, and a caller may not set or change it. Nothing was written.')
    expect(t.api.getRecord(plainId)!.data['askedToResolve']).toBeUndefined()
    const kept = t.api.getRecord(theOffices)!.data['askedToResolve']
    expect(() => t.api.patchRecord(theOffices, { dataPatch: { askedToResolve: { ...askedToResolve, entry: one.id } } }, person)).toThrow(
      'Mole Office writes `askedToResolve` when the line is written, and a caller may not set or change it. Nothing was written.',
    )
    expect(t.api.getRecord(theOffices)!.data['askedToResolve']).toEqual(kept)
  })

  it('at the pin, a conflict whose hour cannot be read is refused, and the count is kept', async () => {
    const one = await aSubmittedEntry('res7-supervisor')
    withAnHourThatCannotBeRead(one.id)
    const mainAt = 'd4'.repeat(20)
    const countBefore = theConflictsCountedToday()
    const refused = await withTheSetting('1', () => step(one.id, 'pinned', {
      files: one.files,
      cannotJoin: { mainAt, commit: one.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] },
    }))
    expect(refused.status, refused.raw).toBe(500)
    expect(theConflictsCountedToday()).toBe(countBefore + 1)
    expect(refused.body['error']).toBe(`Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken. The conflict was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.`)
    expect(stored(one.id)['state']).toBe('submitted')
  })

  it('at the pin, names the brief it left when recording the asking fails, and keeps the conflict count', async () => {
    const briefs = join(sandboxes, 'sandbox-res7-supervisor', 'briefs')
    const one = await aSubmittedEntry('res7-supervisor')
    const mainAt = 'f6'.repeat(20)
    const countBefore = theConflictsCountedToday()
    t.client.sqlite.exec(THE_ASKING_IS_REFUSED)
    try {
      const refused = await withTheSetting('1', () => step(one.id, 'pinned', {
        files: one.files,
        cannotJoin: { mainAt, commit: one.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] },
      }))
      expect(refused.status, refused.raw).toBe(500)
      const brief = join(briefs, `resolve-${one.id}.md`)
      expect(refused.body['error']).toBe(
        `The office wrote the resolve brief of merge entry ${one.id} at ${brief}, and then recording that it handed the conflict on failed: Synthetic: the database refused the asking message. ` +
          'The conflict was counted, and the count is kept. No asking message was sent and the entry did not move. The brief is left at that path, and nothing names it.',
      )
      expect(theConflictsCountedToday()).toBe(countBefore + 1)
      expect(readFileSync(brief, 'utf8')).toContain(`resolve-${one.id}`)
      expect(stored(one.id)['state']).toBe('submitted')
      expect(stored(one.id)['resolving']).toBeUndefined()
      expect(askingAbout(one.run)).toEqual([])
    } finally { t.client.sqlite.exec('DROP TRIGGER IF EXISTS synthetic_refusal_of_the_asking') }
  })

  it("at the entry's turn, a conflict whose hour cannot be read is refused, and the count is kept", async () => {
    const one = await aJudgedEntry('res7-supervisor')
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    withAnHourThatCannotBeRead(one.id)
    const countBefore = theConflictsCountedToday()
    const refused = await withTheSetting('1', () => step(one.id, 'conflict', { files: [A], mainAt: 'e5'.repeat(20) }))
    const countAtRefusal = theConflictsCountedToday()
    const stateAtRefusal = stored(one.id)['state']
    // THE ENTRY STILL HOLDS THE LANE, so it is taken back before the words are judged, and a wrong word cannot
    // hold the lane for the next case.
    expect((await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })).status).toBe(200)
    expect(refused.status, refused.raw).toBe(500)
    expect(countAtRefusal).toBe(countBefore + 1)
    expect(refused.body['error']).toBe(`Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken. The conflict was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.`)
    expect(stateAtRefusal).toBe('integrating')
  })

  it('names the brief it left when recording the asking fails, sends no message and moves nothing', async () => {
    const briefs = join(sandboxes, 'sandbox-res7-supervisor', 'briefs')
    let failed: One
    let whenRefused: Record<string, unknown>
    let askingsAtRefusal: string[]
    const countBefore = theConflictsCountedToday()
    t.client.sqlite.exec(
      "CREATE TRIGGER synthetic_refusal_of_the_asking BEFORE INSERT ON records WHEN NEW.kind = 'message' AND json_extract(NEW.data, '$.notice') = 'askedToResolve' " +
        "BEGIN SELECT RAISE(ABORT, 'Synthetic: the database refused the asking message'); END",
    )
    try {
      failed = await anEntryThatConflicts('res7-supervisor', '1', 500)
      whenRefused = stored(failed.id)
      askingsAtRefusal = askingAbout(failed.run)
    } finally { t.client.sqlite.exec('DROP TRIGGER IF EXISTS synthetic_refusal_of_the_asking') }
    const countAtRefusal = theConflictsCountedToday()

    // THE NEXT CONFLICT STEP ASKS, and the brief left behind keeps its name, so the new brief takes the next one.
    // It also takes the entry out of `integrating`, so a wrong word above cannot hold the lane for the next case.
    const again = await withTheSetting('1', () => step(failed.id, 'conflict', { files: [A], mainAt: failed.mainAt }))
    expect(again.status, again.raw).toBe(200)
    const brief = join(briefs, `resolve-${failed.id}.md`)
    expect(failed.error).toBe(
      `The office wrote the resolve brief of merge entry ${failed.id} at ${brief}, and then recording that it handed the conflict on failed: Synthetic: the database refused the asking message. ` +
        'The conflict was counted, and the count is kept. No asking message was sent and the entry did not move. The brief is left at that path, and nothing names it.',
    )
    expect(countAtRefusal).toBe(countBefore + 1)
    expect(readFileSync(brief, 'utf8')).toContain(`resolve-${failed.id}`)
    expect(whenRefused['state']).toBe('integrating')
    expect(whenRefused['resolving']).toBeUndefined()
    expect(askingsAtRefusal).toEqual([])
    const next = join(briefs, `resolve-${failed.id}-2.md`)
    itAsked({ ...failed, decided: String(again.body['decided']) }, { agent: ids['res7-supervisor'], brief: next }, `The office wrote the resolve brief at ${next}.`, runsIn['res7-supervisor'])
    expect(listed(briefs).filter((name) => name.startsWith(`resolve-${failed.id}`))).toEqual([`resolve-${failed.id}-2.md`, `resolve-${failed.id}.md`])
  })

  it('names the brief a landing left when recording the landing fails, moves no waiting entry and sends no message', async () => {
    const briefs = join(sandboxes, 'sandbox-res7-supervisor', 'briefs')
    const waiting = await aJudgedEntry('res7-supervisor')
    const lander = await aJudgedEntry('res7-bare')
    for (const [name, facts] of [
      ['integrating', {}],
      ['integrated', { result: lander.commit, mainAt: lander.mainAt, files: lander.files }],
      ['tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 }],
      ['landing', { mainAt: lander.mainAt }],
    ] as const) {
      const stepped = await step(lander.id, name, facts)
      expect(stepped.status, `${name}: ${stepped.raw}`).toBe(200)
    }
    const landed = () => withTheSetting('1', () => step(lander.id, 'landed', {
      mainAfter: lander.commit,
      earlyConflicts: [{ entry: waiting.id, tip: waiting.commit, files: [A], commit: waiting.commit, lines: [{ path: A, ranges: '1-5' }] }],
    }))
    const messages = countMessages()
    t.client.sqlite.exec(
      `CREATE TRIGGER synthetic_refusal_of_the_landing BEFORE UPDATE ON records WHEN NEW.id = '${lander.id}' AND json_extract(NEW.data, '$.told') IS NOT NULL AND json_extract(OLD.data, '$.told') IS NULL ` +
        "BEGIN SELECT RAISE(ABORT, 'Synthetic: the database refused the landing''s last write'); END",
    )
    try {
      const refused = await landed()
      expect(refused.status, refused.raw).toBe(500)
      const brief = join(briefs, `resolve-${waiting.id}.md`)
      expect(refused.body['error']).toBe(
        `The office wrote the resolve brief of merge entry ${waiting.id} at ${brief}, and then recording the landing of merge entry ${lander.id} failed: Synthetic: the database refused the landing's last write. ` +
          `The landing was not recorded: merge entry ${lander.id} is still landing, no waiting entry moved, and no message was sent. The brief is left at that path, and nothing names it.`,
      )
      expect(readFileSync(brief, 'utf8')).toContain(`resolve-${waiting.id}`)
      expect(stored(lander.id)['state']).toBe('landing')
      expect(stored(lander.run)['integrated']).toBeUndefined()
      expect(stored(waiting.id)['state']).toBe('judged')
      expect(stored(waiting.id)['resolving']).toBeUndefined()
      expect(askingAbout(waiting.run)).toEqual([])
      expect(countMessages()).toBe(messages)
    } finally { t.client.sqlite.exec('DROP TRIGGER IF EXISTS synthetic_refusal_of_the_landing') }

    // THE NEXT LANDED STEP LANDS IT AND ASKS, and the brief left behind keeps its name, so the new brief takes the next one.
    const again = await landed()
    expect(again.status, again.raw).toBe(200)
    expect(again.body.entry.state).toBe('merged')
    const next = join(briefs, `resolve-${waiting.id}-2.md`)
    expect(stored(waiting.id)['state']).toBe('resolving')
    const asked = (stored(waiting.id)['resolving'] as { asked: { brief: string; message: string } }).asked
    expect(asked).toMatchObject({ agent: ids['res7-supervisor'], brief: next })
    expect(askingAbout(waiting.run)).toEqual([asked.message])
    expect(listed(briefs).filter((name) => name.startsWith(`resolve-${waiting.id}`))).toEqual([`resolve-${waiting.id}-2.md`, `resolve-${waiting.id}.md`])
  })

  /** A LANDER AT ITS LANDING STEP, with a judged entry waiting behind it. */
  async function aLandingWithOneWaiting(): Promise<{ waiting: Judged; lander: Judged }> {
    const waiting = await aJudgedEntry('res7-supervisor')
    const lander = await aJudgedEntry('res7-bare')
    for (const [name, facts] of [
      ['integrating', {}],
      ['integrated', { result: lander.commit, mainAt: lander.mainAt, files: lander.files }],
      ['tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 }],
      ['landing', { mainAt: lander.mainAt }],
    ] as const) {
      const stepped = await step(lander.id, name, facts)
      expect(stepped.status, `${name}: ${stepped.raw}`).toBe(200)
    }
    return { waiting, lander }
  }
  const itLands = (lander: Judged, earlyConflicts: unknown[]) => withTheSetting('1', () => step(lander.id, 'landed', { mainAfter: lander.commit, earlyConflicts }))

  it('on the landing path, a conflict whose hour cannot be read takes its count back with the landing', async () => {
    const { waiting, lander } = await aLandingWithOneWaiting()
    withAnHourThatCannotBeRead(waiting.id)
    const countBefore = theConflictsCountedToday()
    const refused = await itLands(lander, [{ entry: waiting.id, tip: waiting.commit, files: [A], commit: waiting.commit, lines: [{ path: A, ranges: '1-5' }] }])
    const countAtRefusal = theConflictsCountedToday()
    const waitingState = stored(waiting.id)['state']
    const landerState = stored(lander.id)['state']
    // THE LANDING STILL GOES THROUGH, so the lane is free for the next case even when a word below is wrong.
    const again = await itLands(lander, [])
    expect(again.status, again.raw).toBe(200)
    expect(again.body.entry.state).toBe('merged')
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(`Merge entry ${waiting.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken, so nothing was written.`)
    expect(countAtRefusal).toBe(countBefore)
    expect(waitingState).toBe('judged')
    expect(landerState).toBe('landing')
  })

  it('on the landing path, a brief left when the asking fails is named, and the conflict count is taken back', async () => {
    const briefs = join(sandboxes, 'sandbox-res7-supervisor', 'briefs')
    const { waiting, lander } = await aLandingWithOneWaiting()
    const countBefore = theConflictsCountedToday()
    t.client.sqlite.exec(THE_ASKING_IS_REFUSED)
    let refused: Awaited<ReturnType<typeof itLands>>
    try {
      refused = await itLands(lander, [{ entry: waiting.id, tip: waiting.commit, files: [A], commit: waiting.commit, lines: [{ path: A, ranges: '1-5' }] }])
    } finally { t.client.sqlite.exec('DROP TRIGGER IF EXISTS synthetic_refusal_of_the_asking') }
    const countAtRefusal = theConflictsCountedToday()
    const waitingState = stored(waiting.id)['state']
    const resolving = stored(waiting.id)['resolving']
    const askings = askingAbout(waiting.run)
    const landerState = stored(lander.id)['state']
    const brief = join(briefs, `resolve-${waiting.id}.md`)
    const briefWords = readFileSync(brief, 'utf8')
    // THE LANDING STILL GOES THROUGH, so the lane is free for the next case even when a word below is wrong.
    const again = await itLands(lander, [])
    expect(again.status, again.raw).toBe(200)
    expect(again.body.entry.state).toBe('merged')
    expect(refused.status, refused.raw).toBe(500)
    expect(refused.body['error']).toBe(
      `The office wrote the resolve brief of merge entry ${waiting.id} at ${brief}, and then recording that it handed the conflict on failed: Synthetic: the database refused the asking message. ` +
        'No message was sent and the entry did not move. The brief is left at that path, and nothing names it.',
    )
    expect(countAtRefusal).toBe(countBefore)
    expect(briefWords).toContain(`resolve-${waiting.id}`)
    expect(waitingState).toBe('judged')
    expect(resolving).toBeUndefined()
    expect(askings).toEqual([])
    expect(landerState).toBe('landing')
  })

  it('bounces as before with the setting off: no brief is written and nobody is asked', async () => {
    const briefs = join(sandboxes, 'sandbox-res7-supervisor', 'briefs')
    const there = listed(briefs)
    const off = await anEntryThatConflicts('res7-supervisor', '0')
    expect(stored(off.id)['state']).toBe('bounced')
    expect(stored(off.id)['resolving']).toBeUndefined()
    expect(askingAbout(off.run)).toEqual([])
    expect(listed(briefs)).toEqual(there)
  })

  it('reads a choice saved on the Settings page at the step, with no restart, over the environment', async () => {
    const save = (value: '0' | '1' | null) =>
      call('POST', '/api/office/settings', asPerson, { changes: [{ name: THE_SETTING, value }], because: 'Made-up reason: try tier 2 in this test office' })
    try {
      // SAVED ON, while the environment says off, as a line in .env would.
      const savedOn = await save('1')
      expect(savedOn.status, savedOn.raw).toBe(200)
      const on = await anEntryThatConflicts('res7-supervisor', '0')
      expect(stored(on.id)['state']).toBe('resolving')
      expect(askingAbout(on.run)).toHaveLength(1)
      // SAVED OFF, while the environment says on: the next entry bounces, in the same office.
      expect((await save('0')).status).toBe(200)
      const off = await anEntryThatConflicts('res7-supervisor', '1')
      expect(stored(off.id)['state']).toBe('bounced')
      expect(askingAbout(off.run)).toEqual([])
      // NOTHING SAVED: the environment decides again.
      expect((await save(null)).status).toBe(200)
      const again = await anEntryThatConflicts('res7-supervisor', '1')
      expect(stored(again.id)['state']).toBe('resolving')
    } finally { await save(null) }
  })
})
