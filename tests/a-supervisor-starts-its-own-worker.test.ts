// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR IN A SANDBOX STARTS ITS OWN WORKER, AND BOOKS THE GPU FOR IT. Wave 13j round loop-3, step 3 of "a
 * supervisor runs its own loop" (block wUDMYyLGLvfq of pipeline UPsmFdztY5Xf). It was decided, at option B of a
 * decision, that a supervisor starts its own workers, and the office only reminds how many it
 * started. GPU use goes
 * through the booking doors, and an overlap only reminds. src/server/lib/worker-runs.ts says what each
 * door checks.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder and its container row, the agents and the Casting
 * rows. A row's model is a name the launcher's compatibility data knows, read from that data, and no model is run. No real worker is started. The worker's launcher is a script written below, named by
 * MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which files the worker's run through the real tools/file-a-run.mjs and starts
 * nothing. It asks for the run's effort as the launcher does, through the real aCommandsStartFromTheOffice in
 * tools/sandbox-common.mjs, which every launcher path uses, and writes it on the run as the helper in a sandbox does.
 * The message worker's agent runtime is a script that refuses, so a run it started would show.
 *
 * THE AGENTS. The coordinator registers sw-boss, the supervisor, and files its run in the sandbox, so the office mints that run
 * a key. sw-boss registers its workers. sw-other is the coordinator's, so sw-boss is not its starter.
 *
 * WHAT IS PROVED
 *   1. The ask is refused, in words, with nothing written: a retired worker; an asker that is not the worker's
 *      registered starter proved by its own key; an ask with no running run of the supervisor's named as its session;
 *      another run named with the supervisor's run key, refused before the door reads it, since a key names only a run
 *      it holds; a run whose sandbox the office cannot vouch for; a missing brief and a brief outside the sandbox folder; a run
 *      already serving the worker; a message worker that is off; and no Casting row for the worker card.
 *   2. The ask is taken while the message worker is on and while it is merges-only. It keeps the asker as a
 *      participant with its run, the brief as a path, a sha256 and a size, and the sandbox the office vouches for. It
 *      starts nothing. Its reply says the message worker tries to start it, cites a decision, counts
 *      the runs started under the supervisor's run and the asks waiting, and refuses nothing for a
 *      count.
 *   3. Only the office writes `workerRuns`, on a create and on a patch, and the supervisor's own run key may not.
 *   4. The message worker's list holds a wanted worker run while no run serves the worker, and not while one does.
 *   5. The starting door is the message worker's alone, takes only a launcher run filed for that worker under that run,
 *      fails an ask whose brief changed and tells the supervisor, and answers the program, the model and the Casting row
 *      from the worker card, which the default router answered at the ask with the marked row and says so while no row
 *      has a probability (round 44; the ask rolls since round 46). The starting entry records the effort the office answers the launcher's own question
 *      (a builder run of that worker, on that program, with that model), with where it came from and in words.
 *   6. The worker's run may name the supervisor's run as its parent only from the launcher run the office is starting
 *      it with, and only for that worker. Then the office mints its key, and the ask becomes started in the same write.
 *      The office copies how the model was chosen (`castingRoll`) from the starting entry onto the worker's run.
 *   7. The launcher's end keeps the worker's open process row, and a launcher that ended badly is told to the supervisor.
 *   8. The worker's finish wakes the supervisor. The finish is sealed, and sw-boss is the worker's starter, so the seal's
 *      notice and the no-inspector notice go to sw-boss, and the second of them wakes it. The child-finished line is
 *      not written a second time: one finish, one notice, in tellTheParentAChildFinished.
 *      The worker writes sw-boss a FEATURE READY: line first, because the office asks for a sandbox round's check
 *      only when a whole feature is done (src/server/lib/how-a-round-ended.ts).
 *   9. The launcher's command line is the sandbox launcher's worker command with --parent, under the message worker's
 *      name, with the Casting row's model and no --effort: the launcher asks the office for the effort itself.
 *  10. A merges-only pass starts a wanted worker run and closes its launcher, and starts no run for a message;
 *      MERGES_ONLY_SAYS names the worker-run door. A pass that takes the queue does the same, and the worker's run is
 *      filed with the office's key under the supervisor's run. The effort the launcher's reader is answered, and writes
 *      on the worker's run, is the effort the starting entry records, from the same place; the two disagreeing fails
 *      here (the inspector's refusal cI6RX4Ur8IiO). The supervisor's own run key then books the GPU for the
 *      worker, extends the booking, and an overlapping booking is taken with a reminder. A launcher that files nothing
 *      leaves the ask failed, the supervisor told, and the launcher run crashed.
 *  11. (Deleted.) A run holding the nulls the office stores, no effort and no process row, still takes later writes:
 *      tests/validate.test.ts proves the three fields declare the null, and tests/the-next-round-door.test.ts, its
 *      case 11, proves a run holding them takes its doing line and its finish.
 *  12. The default router came in round 44. When another row of the worker card holds the only
 *      probability, the
 *      ask rolls that row (round 46; the start rolled it before), names the marked row it skipped and why, and the
 *      start keeps the roll on the starting entry and on the worker's run. The row is codex, and the start answers its
 *      model as openai/<model>, as it answers a chosen codex model (wave 13n round AG). The same agent's next ask keeps
 *      that roll and does not roll again.
 *  13. The cut. The ask keeps the commit the worker's worktree is to be made at: the commit the asking run's own
 *      worktree stands at, or the commit a `cutFrom` names. Either is refused, with a code and with nothing written,
 *      unless a branch or tag of the sandbox's repository reaches it, and so is a run whose own commit git cannot read.
 *      The start gives the launcher `--cut-from <commit>` when the worktree is not there, and the worker's run keeps
 *      `cutAsked`: the commit, whether it was used, and the commit the run was filed at. A worktree that is there is
 *      used as it stands: a named cut is refused at the ask, in words naming its folder, branch and commit and
 *      tools/remove-a-worktree.mjs, and fails the start when the worktree appeared after the ask; with no cut named,
 *      the launcher is given `--cut-from` the commit the worktree stands at, so that the run is filed at that commit,
 *      and `cutAsked` says the cut was not used. Only the office writes `cutAsked`. A worktree
 *      whose HEAD git cannot read stands at no commit the run could be filed at: the ask is refused, with nothing
 *      written, and a start after it came to be so fails, and the supervisor is told.
 *  14. An agent with no key of its own. A supervisor registers its worker with `noKey: true` through its own run key:
 *      no key is made or answered, the reply says how the worker's runs are given keys, the office writes the
 *      supervisor as its starter, and the row is marked. The person's own key may do the same. Refused with it, with
 *      nothing written: a claim with no key, the office's key under the supervisor's name, a run key acting for
 *      another agent's run, and a handle a live agent bears. The supervisor's ask then starts the worker, and the
 *      office mints the worker's run a key. A registration without the field is answered a key as before, and a write
 *      in its name with no key is still taken. A write in the worker's name is refused, in one sentence, with no key
 *      (in-process and over the listener) and with a long-lived key of its own. It is taken with its run key, with the
 *      supervisor's run key acting for its run, and with the office's key. A read in the worker's name with no key is
 *      refused too, in its own sentence. tests/a-worker-with-no-key-of-its-own-is-given-none.test.ts proves the reads
 *      and the doors that refuse such an agent a key.
 *  15. A clone beside repo/ (problem V5kzjT5lQwRW). A made-up sandbox has a repository of its own beside repo/, listed
 *      in its instance.json as `up` records a clone, with a branch repo/ does not hold. An ask that names the clone, by
 *      its name or its absolute path, keeps its name on the cut and looks for cutFrom only there. The start gives the
 *      launcher `--clone <name>` before `--cut-from`, and the launcher's own worktree maker, given what the launcher was
 *      given, cuts the worker's worktree from the clone at that commit. Refused, with a code and nothing written: a
 *      branch in neither; a branch of repo/ asked in the clone, and a branch of the clone asked with no clone, so
 *      nothing falls back from one to the other, and the second names the sandbox's clones; the run's own commit,
 *      which the clone does not hold; a clone path outside the sandbox or not directly in it; a name instance.json does
 *      not list; and a listed clone that leads outside the sandbox. A worker's worktree that is there, made from a
 *      clone that holds only master, is given `--cut-from` the commit it stands at and no `--clone`, so its run is
 *      filed at that commit, and the check and the seal read that commit as the run's base. A run that names neither
 *      a clone nor a cutFrom, in a worktree of the clone or in the clone itself, has its commit looked for in that
 *      clone, as if it had named it, and the ask says so; one in a worktree of repo/, or one that names a cutFrom, is
 *      looked for in repo/ as before. A run of another repository whose commit repo/ does not hold is refused in words
 *      naming that repository and the clones instance.json lists.
 *  16. The paths a worker names. A sandbox's template may leave paths out of a worker's worktree, and a worker that
 *      needs one names it in its ask as `paths`. The ask keeps the list on its entry and says it. The start gives the
 *      launcher `--with-path <path>` for each, after `--cut-from`, for worker and exec alike, and the round command
 *      takes none. Refused, in words and with nothing written: a path that is not plain, and a path named twice. An ask
 *      with no paths keeps none, and its launcher is given none. tests/a-workers-worktree-may-leave-out-paths.test.ts
 *      proves what the launcher does with them.
 *  17. The images a codex worker is given. An ask for a codex worker may name files of its worktree as `images`. The
 *      ask keeps them on its entry and says them. The start gives the launcher `--image <path>` for each, after the
 *      cut and the paths, and the round and exec commands take none. The worker's run keeps `imagesGiven`, which only
 *      the office writes. Each image is checked in words, with nothing written: a path that is not plain, a comma, a
 *      path named twice, and images for a runtime other than codex. While the worktree is not there, each must be a
 *      file, not a link or a folder, in the commit it is to be cut from. While it is there, each must be such a file
 *      on disk, with its real path inside the worktree. An image not on disk but under one of the ask's paths must be
 *      in the commit the worktree stands at. An image no longer a file where the worktree stands at the start fails
 *      the start, and the supervisor is told. tests/a-codex-worker-is-given-the-images-its-ask-names.test.ts proves
 *      what the launcher does with them. Each sentence is read from the code that makes it, called with the case's
 *      values: the door's from src/server/lib/worker-runs.ts, the reasons from src/config/a-workers-images.mjs, a path
 *      that is not plain from src/config/a-workers-left-out-paths.mjs, and the launcher command's from
 *      src/worker/runtimes/round.ts.
 *
 * THE SANDBOX'S REPOSITORY is made up too: tests/a-made-up-sandbox-repo.ts makes `<sandbox>/repo` with `main` at the
 * commit this checkout stands at, and reads this checkout's objects without writing to it.
 *
 * MUTATION PROOF (after a green control, each alone, restored with cp and checked with cmp, then green again): in the
 * commit that builds the doors, in the commit that records the launcher's effort (wave 13j round loop-3u), and in the
 * commit that declares the office's nulls (wave 13j round loop-3w), and in the commit that joins the default router
 * (wave 13s round 44), and in the commit that passes the cut (wave 13j, the round after loop-10), in the commit
 * that registers an agent with no key of its own (wave 13j, the round after the cut), in the commit that refuses
 * a read in such an agent's name (wave 13j, the round after the self-start), in the commit that takes a sandbox's
 * clone (wave 13j, the clone round), in the commit that passes a worker's paths (wave 13q round 53), and in the
 * commit that passes a codex worker's images (wave 13n round DM), and in the commit that files a worker that reuses
 * its worktree at the commit it stands at and in the commit that looks for the commit of a run that names no clone in
 * the clone its worktree belongs to (wave 13n round DP), each of which names its logs.
 */

import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IT_IS_A_LINK, IT_IS_NOT_A_FILE, NOTHING_IS_THERE, itsRealPathIsOutside } from '../src/config/a-workers-images.mjs'
import { whyNotPlainPaths } from '../src/config/a-workers-left-out-paths.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { MERGES_ONLY_SAYS } from '../src/config/settings.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'
import {
  ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED, ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN, ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS, type TheWorkerRun,
} from '../src/shared/worker-runs.ts'
import { readCastingRoll } from '../src/shared/casting-roll.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { RoundAdapter, THE_LAUNCHER_ASKS_AS, theCommandTakesNoImage } from '../src/worker/runtimes/round.ts'
import { theAgentsWorktree, theCloneNamed } from '../tools/sandbox-common.mjs'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
/**
 * The first model the launcher's compatibility data knows for a runtime's own provider, named without the provider, and
 * not Luna, which a roll renames (src/shared/casting-roll.ts).
 */
function aKnownModelOf(runtime: string): string {
  const model = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) =>
    !name.includes('/') && name !== 'gpt-6-luna' && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])}/${name}`))
  if (model === undefined) throw new Error(`The launcher's compatibility data holds no ${runtime} model this file can cast a row with.`)
  return model
}
/** The model the made-up Casting row casts for the worker card. */
const A_CAST_MODEL = aKnownModelOf('claude-code')
/** The second row's codex model. */
const A_ROLLED_CODEX_MODEL = aKnownModelOf('codex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
const MINUTE = 60_000
/** The merge tool runs a pass watches. None is started here. */
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/**
 * THE SYNTHETIC LAUNCHER. It does what tools/sandbox.mjs worker --parent does on the office's side and nothing else: it
 * reads the supervisor's run for its sandbox, files the worker's run through the real tools/file-a-run.mjs under the
 * launcher run with the supervisor's run as its parent, cut from the commit `--cut-from` names when it is given, and
 * exits. It starts no container and no agent. What it was
 * given is kept in a capture, without the key.
 */
const FAKE_LAUNCHER = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileARun } from ${JSON.stringify(join(CHECKOUT, 'tools/file-a-run.mjs'))}
import { aCommandsStartFromTheOffice, officeHeaders } from ${JSON.stringify(join(CHECKOUT, 'tools/sandbox-common.mjs'))}
import { anAgentsToolHeaders } from ${JSON.stringify(join(CHECKOUT, 'for-agents/agent-key.mjs'))}
const argv = process.argv.slice(2)
const flag = (name) => { const at = argv.indexOf(name); return at === -1 ? null : argv[at + 1] }
const mode = process.env.WORKER_RUN_FAKE_MODE ?? 'file'
const capture = {
  argv, mode,
  keyGiven: /^[0-9a-f]{64}$/.test(process.env.MOLE_AGENT_KEY ?? ''),
  officeSettings: Object.keys(process.env).filter((name) => name.startsWith('MOLE_OFFICE_')).sort(),
}
const keep = () => writeFileSync(join(process.env.WORKER_RUN_CAPTURES, flag('--session') + '.json'), JSON.stringify(capture))
keep()
if (argv[0] !== 'worker') { process.stderr.write('The made-up launcher starts workers only, and was asked for ' + argv[0] + '.\\n'); process.exit(4) }
if (mode === 'fail') { process.stderr.write('A made-up launcher failure: no run was filed.\\n'); process.exit(3) }
const api = flag('--api'), workspace = flag('--workspace'), as = flag('--as'), session = flag('--session'), parent = flag('--parent')
const headers = { 'x-mole-office-workspace': workspace, ...anAgentsToolHeaders({ self: as, withoutAKey: as }) }
const supervisors = (await (await fetch(api + '/api/records/' + parent, { headers })).json()).record
const run = {
  api, workspace, as, session, parent, handle: flag('--agent'), worktree: supervisors.data.workingDirectory,
  cutFrom: flag('--cut-from') ?? supervisors.data.cutFrom, runtime: flag('--runtime'), model: flag('--model'),
  title: 'A made-up worker run of ' + flag('--agent'), sandbox: supervisors.data.sandbox,
}
// A FILING THAT CRASHED INSIDE NODE ITSELF WHILE IT LOADED ITS MODULES IS RUN ONCE MORE, AND THE CAPTURE SAYS SO. On a
// box running many tests, register-a-run.mjs stopped on ERR_INTERNAL_ASSERTION in Node's own TypeScript stripping, while
// it loaded its .ts imports. Memory was not short then: the box had 40,827 MB available at the median and 29,194 MB at
// the lowest. What made Node crash is not known. Those imports are static, so none of its code had run and nothing was
// filed. Any other failure, its own refusal included, is kept as it is.
const crashedInsideNode = (answer) => !answer.ok && answer.says.includes('ERR_INTERNAL_ASSERTION') && answer.says.includes('node:internal/modules/')
let filed = fileARun(run)
if (crashedInsideNode(filed)) {
  capture.retried = { exited: filed.exited, says: filed.says.split('\\n').find((line) => line.includes('[ERR_INTERNAL_ASSERTION]')) ?? '' }
  keep()
  process.stderr.write('The made-up launcher files once more, because register-a-run.mjs crashed inside Node itself: ' + capture.retried.says + '\\n')
  filed = fileARun(run)
}
capture.filed = filed.ok ? { ok: true, id: filed.id, keyAnswered: filed.key !== null } : { ok: false, exited: filed.exited, says: filed.says }
keep()
if (!filed.ok) { process.stderr.write('The made-up launcher could not file the run: ' + filed.says + '\\n'); process.exit(1) }
// THE EFFORT, ASKED AS THE LAUNCHER ASKS IT: the reader every launcher path uses, given the command the launcher gives
// a helper that takes --stdin, the model and runtime it was given, and the filed run's own key, as the helper in the
// sandbox asks with it. The effort it is answered is written on the run, as the helper writes it, when there is one.
const runtime = flag('--runtime'), model = flag('--model'), agent = flag('--agent')
const command = runtime === 'codex' ? ['codex', 'exec', '--json', '-m', model, '--', 'a made-up brief'] : ['claude', '-p', '--model', model, '--output-format', 'json']
const asTheRun = officeHeaders({ workspace, agent, session: filed.id, key: filed.key })
const given = await aCommandsStartFromTheOffice(command, { api, agent, workspace, headers: asTheRun, runtime, model, env: {} })
capture.start = given.start === null ? null : { effort: given.start.effort, effortFrom: given.start.effortFrom, officeUnavailable: given.start.officeUnavailable }
keep()
if (given.start !== null && given.start.effort !== null) {
  const wrote = await fetch(api + '/api/records/' + filed.id, { method: 'PATCH', headers: asTheRun, body: JSON.stringify({ dataPatch: { effort: given.start.effort } }) })
  if (wrote.status !== 200) { process.stderr.write('The made-up launcher could not write the effort: ' + (await wrote.text()) + '\\n'); process.exit(1) }
}
process.stdout.write('The made-up launcher filed run ' + filed.id + '.\\n')
`

/**
 * WHAT THE MADE-UP LAUNCHER KEPT, and a line in the test's output when its filing crashed inside Node and was run once
 * more, so a case that passed on the second filing says so.
 */
function theCaptureOf<Capture>(wrapper: string): Capture {
  const capture = JSON.parse(readFileSync(join(captures, `${wrapper}.json`), 'utf8')) as Capture & { retried?: { exited: string; says: string } }
  if (capture.retried !== undefined) {
    console.warn(`The made-up launcher ${wrapper} filed its run once more: register-a-run.mjs crashed inside Node itself (exited ${capture.retried.exited}): ${capture.retried.says}`)
  }
  return capture
}

/** The message worker's agent runtime. No agent run is due in this file, so one that starts fails loudly and shows. */
const NO_AGENT_RUN = `process.stderr.write('A made-up agent runtime: no agent run was due in this test.\\n'); process.exit(9)\n`

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let captures: string
let settings: WorkerSettings
let workerModeBefore: string | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent(THE_WORKER_ID, A_MADE_UP_OFFICE_KEY, session)

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, by: Record<string, string> = AS_THE_PERSON, role?: string): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = (r.body['agent'] as { id: string }).id
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string, name = folder.split('/').at(-1)!): string {
  const id = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

/** A live process row for a run: this test's own process. Taken away by deleting the row, never by the release door. */
async function aLiveProcessRow(run: string): Promise<string> {
  const r = await call('POST', '/api/resources', AS_THE_PERSON, {
    sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'A made-up process of this test',
    adopting: 'this test process stands for the run’s own process, so the run reads as going',
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['resource'].id)
}
const dropTheRow = (id: string): void => void t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(id)

type ASandbox = { folder: string; brief: string; container: string } & ReturnType<typeof aMadeUpSandboxRepo>

/**
 * A made-up sandbox folder with a brief in it, its repository with `main` at the commit this checkout stands at, and
 * the container row that vouches for it, or for `rowFor` instead.
 */
function aSandbox(name: string, rowFor?: string): ASandbox {
  const folder = join(realpathSync(scratch), 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for a worker in ${name}\n\nDo the made-up work.\n`)
  return { folder, brief, container: rowFor === undefined ? aContainerRow(folder) : aContainerRow(rowFor, name), ...aMadeUpSandboxRepo(folder, CHECKOUT) }
}

/**
 * A run of sw-boss in a sandbox, filed over the API by its starter's key, so the office mints the run its own key. The
 * starter is the secretary on the host and files it from its own terminal, as tools/sandbox.mjs does: a run filed from
 * outside every sandbox names one only then (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts). Its cut is
 * main, or `cutFrom`: a run here that finishes with records is cut at the commit this checkout stands at, because a
 * records seal refuses a run whose working directory holds commits past its cut (src/server/lib/sealed-tip.ts).
 */
async function aSupervisorsRun(sandbox: { folder: string; container: string }, title: string, workingDirectory = CHECKOUT, cutFrom = 'main'): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/records', asAgent('sw-quill', agents.get('sw-quill')!.key, argusTerminal), {
    kind: 'session',
    title,
    data: {
      state: 'running',
      servingAgent: 'sw-boss',
      servingAgentId: idOf('sw-boss'),
      runtime: 'claude-code',
      model: 'claude-made-up-boss-0',
      workingDirectory,
      cutFrom,
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String(r.body['runKey']?.key)
  expect(key, 'the office minted the supervisor’s run no key').toMatch(/^[0-9a-f]{64}$/)
  return { id: String(r.body['record'].id), key }
}

/**
 * FINISH A MADE-UP RUN, AS THE PERSON. A finished run names what it submits, so a made-up note is filed first and the run
 * is finished with it as a records submission (src/server/lib/sealed-tip.ts), as a worker with no work area finishes.
 */
async function finish(run: string): Promise<{ status: number; body: Record<string, any> }> {
  const note = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: `A made-up note that run ${run} submits` })
  expect(note.status, JSON.stringify(note.body)).toBe(201)
  return call('PATCH', `/api/records/${run}`, AS_THE_PERSON, { dataPatch: { state: 'finished', submission: { kind: 'records', records: [String(note.body['record'].id)] } } })
}

function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
const theWorkerRunOf = (run: string, handle: string): TheWorkerRun | undefined => (dataOf(run)['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]

/** What the office said in full to sw-boss, in each line saying a worker run asked on this run did not start. */
function linesToTheSupervisorAbout(run: string): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aWorkerDidNotStart'")
      .all(run) as { data: string }[]
  )
    .map((row) => JSON.parse(row.data) as { saidInFull: string; to: { kind: string; id: string }[] })
    .filter((line) => line.to.some((to) => to.kind === 'agent' && to.id === idOf('sw-boss')))
    .map((line) => line.saidInFull)
}
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')
const sessionsTitled = (title: string): number =>
  (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND title = ?").get(title) as { n: number }).n

/** Ask for a worker run. */
const ask = (agent: string, headers: Record<string, string>, body: Record<string, unknown>) => call('POST', `/api/agents/${agent}/worker-run`, headers, body)

/** The message worker's launcher run for one worker run, filed with the office's key as the worker files it. */
async function aLauncherRun(run: string, worker: string): Promise<string> {
  const r = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for a worker under ${run}`,
    data: {
      state: 'running',
      runtime: 'round-launcher',
      doing: 'starting a made-up worker run; this run runs no model',
      workingDirectory: CHECKOUT,
      startedByMoleOffice: true,
      extra: { purpose: 'worker', run, worker },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

/**
 * The worker's run, filed with the office's key under a launcher run, with the supervisor's run as its parent. It is cut
 * at the commit this checkout stands at, so a records finish finds no commit past its cut.
 */
async function theWorkersRun(handle: string, launcher: string, parent: string, title: string) {
  return call('POST', '/api/records', AS_THE_WORKER(launcher), {
    kind: 'session',
    title,
    data: {
      state: 'running',
      runtime: 'claude-code',
      model: A_CAST_MODEL,
      servingAgent: handle,
      servingAgentId: idOf(handle),
      workingDirectory: CHECKOUT,
      cutFrom: boss.head,
      parentAttachment: parent,
      sandbox: { template: 'mole-office-dev', container: boss.container, folder: boss.folder },
    },
  })
}

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
}

function msOf(stamp: string): number {
  const ms = parseLocalStamp(stamp)
  expect(ms, `${stamp} cannot be read`).not.toBeNull()
  return ms!
}
/** A whole-minute time `minutes` after `ms`, as the extend door takes it. */
const later = (ms: number, minutes: number): string => localStamp(new Date(ms + minutes * MINUTE)).slice(0, 16)

let boss: ASandbox
let bossRun = ''
/** The coordinator's own terminal, which it files its supervisor's runs from. */
let argusTerminal = ''
let bossRunKey = ''
let castingId = 0
/** The supervisor with its own run key, from its own run: how a supervisor in a sandbox asks. */
const AS_BOSS = (): Record<string, string> => asAgent('sw-boss', bossRunKey, bossRun)

beforeAll(async () => {
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-worker-run-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })

  await started('sw-quill', AS_THE_PERSON, 'secretary')
  const terminal = await call('POST', '/api/records', asOne('sw-quill'), { kind: 'session', title: 'sw-quill in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  argusTerminal = String(terminal.body['record'].id)
  await started('sw-boss', asOne('sw-quill'))
  for (const handle of ['sw-hand', 'sw-looper', 'sw-quiet', 'sw-failer', 'sw-busy', 'sw-gone', 'sw-roller', 'sw-cutter', 'sw-named', 'sw-there', 'sw-late', 'sw-headless', 'sw-broken']) {
    await started(handle, asOne('sw-boss'))
  }
  await started('sw-other', asOne('sw-quill'))
  const retired = await call('POST', `/api/participants/agent/${idOf('sw-gone')}/retire`, AS_THE_PERSON, { because: 'a made-up agent retired for this test' })
  expect(retired.status, JSON.stringify(retired.body)).toBe(200)

  boss = aSandbox('sw-boss-sandbox')
  const run = await aSupervisorsRun(boss, 'A made-up supervisor run of sw-boss')
  bossRun = run.id
  bossRunKey = run.key

  const launcher = join(scratch, 'fake-worker-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: join(scratch, 'runs'),
    env: {
      ...process.env,
      HOME: scratch,
      MOLE_OFFICE_DB: t.file,
      MOLE_OFFICE_FAKE_RUNTIME: noAgentRun,
      MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher,
      WORKER_RUN_CAPTURES: captures,
    },
  }
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1. the ask is refused, in words, and nothing is written', () => {
  it('refuses a retired worker', async () => {
    const r = await ask(idOf('sw-gone'), AS_BOSS(), { brief: boss.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain('is retired, so no worker run of it is started. Nothing was written.')
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses an asker that is not the worker’s registered starter proved by its own key', async () => {
    const askers: [string, Record<string, string>][] = [
      ['sw-other', AS_BOSS()],
      ['sw-hand', asAgent('sw-boss', undefined, bossRun)],
      ['sw-hand', asOne('sw-quill')],
      ['sw-hand', AS_THE_PERSON],
    ]
    for (const [worker, headers] of askers) {
      const r = await ask(worker, headers, { brief: boss.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(403)
      expect(r.body['error']).toContain(`A worker run of ${worker} is asked for only by its registered starter, proved by its own key`)
    }
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses an ask that names no running run of the supervisor’s, and a run whose sandbox the office cannot vouch for', async () => {
    const none = await ask('sw-hand', asAgent('sw-boss', bossRunKey), { brief: boss.brief })
    expect(none.status, JSON.stringify(none.body)).toBe(409)
    expect(none.body['error']).toContain('A worker run is asked for from a running run of sw-boss in this project, named in x-mole-office-session, and this request named none.')
    const notItsOwn = t.api.createRecord({
      kind: 'session', title: 'A made-up run of sw-other', workspaceId: 'default', actor: { type: 'agent', id: idOf('sw-quill') }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'sw-other', servingAgentId: idOf('sw-other'), runtime: 'claude-code' },
    }).id
    // ANOTHER RUN, NAMED WITH sw-boss's RUN KEY, is refused before the door reads it: a key may name only a run it holds
    // (src/server/lib/the-run-a-key-holds.ts, problem TwH5ICyRxLVd).
    const foreign = await ask('sw-hand', asAgent('sw-boss', bossRunKey, notItsOwn), { brief: boss.brief })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body['error']).toContain(`names "${notItsOwn}", and this key is the run key of run ${bossRun}, not of that run.`)
    const unvouchedSandbox = aSandbox('sw-unvouched-sandbox', join(scratch, 'elsewhere', 'sw-unvouched-sandbox'))
    const unvouched = await aSupervisorsRun(unvouchedSandbox, 'A made-up supervisor run with an unvouched sandbox', CHECKOUT, unvouchedSandbox.head)
    const r = await ask('sw-hand', asAgent('sw-boss', unvouched.key, unvouched.id), { brief: join(scratch, 'sandboxes', 'sw-unvouched-sandbox', 'brief.md') })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain(`Run ${unvouched.id} of sw-boss names no sandbox the office can vouch for`)
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
    expect(dataOf(unvouched.id)['workerRuns']).toBeUndefined()
    // IT ENDS, so it is not counted as a run of sw-boss that is going.
    expect((await finish(unvouched.id)).status).toBe(200)
  })

  it('refuses a missing brief and a brief outside the sandbox folder', async () => {
    const missing = await ask('sw-hand', AS_BOSS(), { brief: join(boss.folder, 'no-such-brief.md') })
    expect(missing.status, JSON.stringify(missing.body)).toBe(409)
    expect(missing.body['error']).toContain('There is no brief at')
    const outside = join(scratch, 'a-brief-outside.md')
    writeFileSync(outside, '# A made-up brief outside the sandbox\n')
    const r = await ask('sw-hand', AS_BOSS(), { brief: outside })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain(`is not inside the sandbox folder ${boss.folder}`)
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses while a run already serves the worker', async () => {
    const going = t.api.createRecord({
      kind: 'session', title: 'A made-up run of sw-busy still going', workspaceId: 'default', actor: { type: 'agent', id: idOf('sw-boss') }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'sw-busy', servingAgentId: idOf('sw-busy'), runtime: 'claude-code' },
    }).id
    const row = await aLiveProcessRow(going)
    try {
      const r = await ask('sw-busy', AS_BOSS(), { brief: boss.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body['error']).toContain(`Run ${going} is already serving sw-busy, so a worker run would be a second run of it.`)
    } finally {
      dropTheRow(row)
    }
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses while the office’s message worker is off, because nothing would start the worker', async () => {
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'off'
      const off = await ask('sw-hand', AS_BOSS(), { brief: boss.brief })
      expect(off.status, JSON.stringify(off.body)).toBe(409)
      expect(off.body['error']).toContain('The office starts no message worker (MOLE_OFFICE_MESSAGE_WORKER=off), so nothing would start this worker.')
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses while no Casting row casts the worker card, and is taken once the person casts it', async () => {
    const r = await ask('sw-hand', AS_BOSS(), { brief: boss.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    // THE ASK ROLLS (round 46), so its refusal is the default router's: no row of the worker card to take.
    expect(r.body['error']).toContain('No probability is set for worker in every row, and the Casting table has no marked row to take.')
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
    // THE PERSON CASTS THE WORKER CARD: a program, a model and an effort, each from a made-up decision.
    const decided = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'The test casts the worker card', data: { replaces: [] } })
    expect(decided.status, JSON.stringify(decided.body)).toBe(201)
    const decision = String(decided.body['record'].id)
    const cast = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
      program: { value: 'claude-code', decision }, model: { value: A_CAST_MODEL, decision }, effort: { value: 'high', decision },
    })
    expect(cast.status, JSON.stringify(cast.body)).toBe(201)
    castingId = Number(cast.body['casting'].id)
  })
})

describe('2. the supervisor’s ask is taken, and starts nothing', () => {
  it('takes it while the message worker is on, keeps the asker as a participant with its run, and only reminds of counts', async () => {
    const r = await ask('sw-hand', AS_BOSS(), { brief: boss.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['run']).toBe(bossRun)
    expect(r.body['worker']).toEqual({ id: idOf('sw-hand'), handle: 'sw-hand' })
    const kept = theWorkerRunOf(bossRun, 'sw-hand')!
    expect(kept.state).toBe('wanted')
    // THE ASKER IS A PARTICIPANT, `who: {kind, id}`, and no bare id (tests/an-id-names-one-thing.test.ts; FdbaBonnHB3c).
    expect(kept.askedBy).toEqual({ who: { kind: 'agent', id: idOf('sw-boss') }, session: bossRun })
    expect(kept.askedBy).not.toHaveProperty('id')
    expect(kept.handle).toBe('sw-hand')
    expect(kept.brief).toEqual({ path: boss.brief, sha256: sha256(boss.brief), bytes: readFileSync(boss.brief).length })
    expect(kept.sandbox).toEqual({ folder: boss.folder, instance: 'sw-boss-sandbox', container: boss.container })
    expect(kept.starting).toBeUndefined()
    expect(r.body['says']).toContain('Nothing has started yet.')
    expect(r.body['says']).toContain(`The message worker tries to start it on a later pass, with node tools/sandbox.mjs worker --parent ${bossRun}.`)
    expect(r.body['says']).toContain(`Run ${bossRun}'s workerRuns field says where the ask is.`)
    expect(r.body['limits'].says).toEqual([
      'A supervisor starts its own workers, and the office only reminds how many it started.',
      `Runs filed under run ${bossRun} for an agent so far: 0, and 0 of them say they are running.`,
      `Worker runs asked on run ${bossRun} that wait to start, this one included: 1.`,
      'Nothing here is refused for a count.',
    ])
    expect(sessionsTitled('A made-up worker run of sw-hand')).toBe(0)
  })

  it('takes it while the message worker is merges-only, because a worker in that mode starts the worker runs asked for', async () => {
    const before = theWorkerRunOf(bossRun, 'sw-hand')!
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'merges-only'
      const r = await ask('sw-hand', AS_BOSS(), { brief: boss.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(202)
      expect(r.body['says']).toContain('Nothing has started yet.')
      expect(r.body['says']).toContain(`It replaces the ask made at ${before.askedAt}.`)
      expect(r.body['limits'].says).toContain(`Worker runs asked on run ${bossRun} that wait to start, this one included: 1.`)
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    expect(theWorkerRunOf(bossRun, 'sw-hand')).toMatchObject({ state: 'wanted', replaced: { askedAt: before.askedAt } })
  })
})

describe('3. only the office writes workerRuns', () => {
  it('refuses it on a patch and on a create, from the person, the supervisor’s starter and the supervisor’s own run key', async () => {
    const kept = dataOf(bossRun)['workerRuns'] as Record<string, unknown>
    for (const headers of [AS_THE_PERSON, asOne('sw-quill'), AS_BOSS()]) {
      const patched = await call('PATCH', `/api/records/${bossRun}`, headers, { dataPatch: { workerRuns: { [idOf('sw-looper')]: kept[idOf('sw-hand')] } } })
      expect(patched.status, JSON.stringify(patched.body)).toBe(403)
      expect(patched.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS)
    }
    // A PATCH THAT REPLACES THE WHOLE DATA is the other way to write the field, and it is refused the same way.
    const replaced = await call('PATCH', `/api/records/${bossRun}`, AS_THE_PERSON, { data: { ...dataOf(bossRun), workerRuns: { [idOf('sw-looper')]: kept[idOf('sw-hand')] } } })
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(403)
    expect(replaced.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS)
    const created = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'A made-up run with worker runs', data: { state: 'running', workerRuns: kept } })
    expect(created.status, JSON.stringify(created.body)).toBe(403)
    expect(created.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS)
    expect(dataOf(bossRun)['workerRuns']).toEqual(kept)
    // THE SUPERVISOR'S OWN WRITES STILL GO THROUGH with the field kept on its run: a session declares `workerRuns`.
    const doing = await call('PATCH', `/api/records/${bossRun}`, AS_BOSS(), { dataPatch: { doing: 'A made-up line of what sw-boss is doing' } })
    expect(doing.status, JSON.stringify(doing.body)).toBe(200)
    expect(dataOf(bossRun)['workerRuns']).toEqual(kept)
  })
})

describe('4. the message worker’s list', () => {
  it('holds a wanted worker run while no run serves the worker, and not while one does', async () => {
    const listed = await call('GET', '/api/worker/worker-runs', AS_THE_WORKER())
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body['workerRuns']).toEqual([{ run: bossRun, agentId: idOf('sw-hand'), handle: 'sw-hand', workspaceId: 'default' }])
    const going = t.api.createRecord({
      kind: 'session', title: 'A made-up run of sw-hand going for a moment', workspaceId: 'default', actor: { type: 'agent', id: idOf('sw-boss') }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'sw-hand', servingAgentId: idOf('sw-hand'), runtime: 'claude-code' },
    }).id
    const row = await aLiveProcessRow(going)
    try {
      expect((await call('GET', '/api/worker/worker-runs', AS_THE_WORKER())).body['workerRuns']).toEqual([])
    } finally {
      dropTheRow(row)
    }
    expect((await finish(going)).status).toBe(200)
  })
})

describe('5. the starting door', () => {
  it('is the message worker’s alone, and takes only a launcher run filed for that worker under that run', async () => {
    const launcher = await aLauncherRun(bossRun, idOf('sw-hand'))
    const asPerson = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_PERSON, { agent: idOf('sw-hand'), wrapper: launcher })
    expect(asPerson.status, JSON.stringify(asPerson.body)).toBe(403)
    for (const another of [await aLauncherRun('some-other-run', idOf('sw-hand')), await aLauncherRun(bossRun, idOf('sw-quiet'))]) {
      const wrong = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf('sw-hand'), wrapper: another })
      expect(wrong.status, JSON.stringify(wrong.body)).toBe(409)
      expect(wrong.body['error']).toBe(`Run ${another} is not a launcher run the office started for a worker run of sw-hand under run ${bossRun}. Nothing was written.`)
    }
    expect(theWorkerRunOf(bossRun, 'sw-hand')?.state).toBe('wanted')
  })

  it('fails an ask whose brief changed since, and tells the supervisor', async () => {
    const launcher = await aLauncherRun(bossRun, idOf('sw-hand'))
    const was = readFileSync(boss.brief, 'utf8')
    writeFileSync(boss.brief, `${was}\nA line added after the ask.\n`)
    try {
      const r = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf('sw-hand'), wrapper: launcher })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body['error']).toContain('changed after it was asked for. The ask is now failed. Nothing was started.')
      expect(theWorkerRunOf(bossRun, 'sw-hand')).toMatchObject({ state: 'failed', failed: { says: `The brief ${boss.brief} changed after it was asked for.` } })
      expect(linesToTheSupervisorAbout(bossRun)).toEqual([`The worker run of sw-hand under run ${bossRun} did not start. The brief ${boss.brief} changed after it was asked for.`])
    } finally {
      writeFileSync(boss.brief, was)
    }
  })

  it('answers the program, the model and the Casting row of the worker card, records the effort the office answers the launcher, and makes the ask starting', async () => {
    expect((await ask('sw-hand', AS_BOSS(), { brief: boss.brief })).status).toBe(202)
    const launcher = await aLauncherRun(bossRun, idOf('sw-hand'))
    const r = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf('sw-hand'), wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['workerRun']).toMatchObject({
      run: bossRun, agentId: idOf('sw-hand'), handle: 'sw-hand', runtime: 'claude-code', model: A_CAST_MODEL,
      instance: 'sw-boss-sandbox', sandboxes: dirname(boss.folder), brief: boss.brief, parent: bossRun,
    })
    const kept = theWorkerRunOf(bossRun, 'sw-hand')!
    expect(kept.state).toBe('starting')
    expect(kept.starting).toMatchObject({ wrapper: launcher, runtime: 'claude-code', model: A_CAST_MODEL, casting: castingId })
    // THE DEFAULT ROUTER OF ROUND 44 takes the marked row while no Casting row has a probability, and says
    // so.
    expect(kept.starting?.castingSays).toBe(`The tools take marked row ${String(castingId)} because no probability is set for worker in every row.`)
    // HOW IT CHOSE is kept on the entry, in the shape the strict reader reads, and says what castingSays says.
    expect(readCastingRoll(kept.starting?.castingRoll)).toMatchObject({
      choice: 'marked', group: 'every row', selected: { rowId: castingId, program: 'claude-code', model: A_CAST_MODEL, number: null }, says: kept.starting?.castingSays,
    })
    // THE EFFORT IS THE OFFICE'S ANSWER TO THE LAUNCHER'S OWN QUESTION (a builder run of sw-hand on claude-code, with the
    // cast model), which here is the Casting row's: the launcher passes it, so the entry no longer says it is not passed.
    expect(kept.starting).toMatchObject({ effort: 'high', effortFrom: 'Casting' })
    expect(kept.starting?.effortSays).toContain(`The caller names model ${A_CAST_MODEL}. The run gets effort high from the Casting row for worker.`)
    expect(kept.starting?.effortSays).not.toContain('Not passed')
    // AN ASK WHILE ITS LAUNCHER RUN IS GOING IS REFUSED, so two launchers never start one worker.
    const again = await ask('sw-hand', AS_BOSS(), { brief: boss.brief })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body['error']).toContain(`is being started now, by the launcher run ${launcher}`)
  })
})

describe('6. the worker’s run names the supervisor’s run as its parent, and is minted its key', () => {
  it('refuses the parent from another launcher run, and for another worker, and files nothing', async () => {
    const otherLauncher = await aLauncherRun(bossRun, idOf('sw-hand'))
    const fromAnother = 'A made-up worker run from the wrong launcher'
    const wrong = await theWorkersRun('sw-hand', otherLauncher, bossRun, fromAnother)
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(403)
    expect(wrong.body['error']).toContain(`parentAttachment names the session "${bossRun}"`)
    expect(sessionsTitled(fromAnother)).toBe(0)
    const launcher = theWorkerRunOf(bossRun, 'sw-hand')!.starting!.wrapper!
    const forAnother = 'A made-up run of another worker under the launcher'
    const other = await theWorkersRun('sw-quiet', launcher, bossRun, forAnother)
    expect(other.status, JSON.stringify(other.body)).toBe(403)
    expect(other.body['error']).toContain(`parentAttachment names the session "${bossRun}"`)
    expect(sessionsTitled(forAnother)).toBe(0)
    expect(theWorkerRunOf(bossRun, 'sw-hand')?.state).toBe('starting')
  })

  it('takes the parent from the launcher run that is starting the worker, mints the key, and the ask is started', async () => {
    const launcher = theWorkerRunOf(bossRun, 'sw-hand')!.starting!.wrapper!
    const r = await theWorkersRun('sw-hand', launcher, bossRun, 'A made-up worker run of sw-hand, filed by hand')
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body['runKey']?.key).toMatch(/^[0-9a-f]{64}$/)
    const run = String(r.body['record'].id)
    expect(dataOf(run)['parentAttachment']).toBe(bossRun)
    const kept = theWorkerRunOf(bossRun, 'sw-hand')!
    expect(kept.state).toBe('started')
    expect(kept.started).toMatchObject({ run, runKeyId: dataOf(run)['extra'].runKeyId })
    // HOW ITS MODEL WAS CHOSEN is copied by the office onto the worker's own run, where the agent's later starts read it.
    expect(dataOf(run)['castingRoll']).toMatchObject({ choice: 'marked', selected: { rowId: castingId } })
    expect(dataOf(run)['castingRoll']).toEqual(kept.starting!.castingRoll)
  })
})

describe('7. how the launcher ended', () => {
  it('keeps the worker’s open process row, and tells the supervisor of a launcher that ended badly', async () => {
    const kept = theWorkerRunOf(bossRun, 'sw-hand')!
    const run = kept.started!.run
    const row = await aLiveProcessRow(run)
    try {
      const body = { agent: idOf('sw-hand'), wrapper: kept.starting!.wrapper }
      const ok = await call('POST', `/api/worker/worker-runs/${bossRun}/ended`, AS_THE_WORKER(), { ...body, ok: true, says: 'The made-up launcher exited with code 0.' })
      expect(ok.status, JSON.stringify(ok.body)).toBe(200)
      expect(theWorkerRunOf(bossRun, 'sw-hand')).toMatchObject({ state: 'started', launcher: { ok: true }, process: { row } })
      const toldBefore = linesToTheSupervisorAbout(bossRun).length
      const bad = await call('POST', `/api/worker/worker-runs/${bossRun}/ended`, AS_THE_WORKER(), { ...body, ok: false, says: 'The made-up launcher exited with code 2.' })
      expect(bad.status, JSON.stringify(bad.body)).toBe(200)
      expect(linesToTheSupervisorAbout(bossRun).length).toBe(toldBefore + 1)
      expect(linesToTheSupervisorAbout(bossRun).at(-1)).toContain(`The launcher filed run ${run} and then ended badly: The made-up launcher exited with code 2.`)
    } finally {
      dropTheRow(row)
    }
  })
})

describe('8. the worker’s finish wakes the supervisor', () => {
  it('tells sw-boss, as the worker’s starter, in the seal’s notice and a notice that wakes it, and not a second time', async () => {
    // notices.ts reaches the database, so it is imported here, after freshDb(), and not at the top.
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    const run = theWorkerRunOf(bossRun, 'sw-hand')!.started!.run
    t.api.createRecord({
      kind: 'message', title: 'A made-up word of sw-hand to sw-boss', workspaceId: 'default', actor: { type: 'agent', id: idOf('sw-hand'), sessionId: run },
      data: { to: [{ kind: 'agent', id: idOf('sw-boss') }], body: `${FEATURE_READY} the made-up work of sw-hand is done.\nI seal next.` },
    })
    const finished = await finish(run)
    expect(finished.status, JSON.stringify(finished.body)).toBe(200)
    const lines = (
      t.client.sqlite
        .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) ORDER BY created_at, id")
        .all(run) as { data: string }[]
    ).map((one) => JSON.parse(one.data) as { notice: keyof typeof NOTICES; body: string; to: { kind: string; id: string }[] })
    // ONE FINISH, ONE NOTICE: the seal's notice went to sw-boss, so the child-finished line is not written.
    // The two lines are written in the same millisecond, so they are read by their notice and not by their order.
    expect(lines.map((line) => line.notice).sort()).toEqual(['aRunWasSealed', 'noInspectorCheckItYourself'])
    const sealed = lines.find((line) => line.notice === 'aRunWasSealed')!
    const checkIt = lines.find((line) => line.notice === 'noInspectorCheckItYourself')!
    expect(sealed.to).toEqual([{ kind: 'agent', id: idOf('sw-boss') }])
    // An office message to one recipient goes to the run's own agent as well (writeAMessage in src/server/lib/inspection.ts).
    expect(checkIt.to).toEqual([{ kind: 'agent', id: idOf('sw-boss') }, { kind: 'agent', id: idOf('sw-hand') }])
    expect(sealed.body).toBe(`Run ${run} sealed`)
    expect(checkIt.body).toContain(`Run ${run} — A made-up worker run of sw-hand, filed by hand — says its work is finished.`)
    expect(NOTICES[checkIt.notice].wakes, 'the notice that says the worker finished does not wake the supervisor').toBe(true)
  })
})

describe('9. the launcher’s command line', () => {
  it('is the sandbox launcher’s worker command with --parent, under the message worker’s name, with the cast model and no effort', () => {
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const line = real.commandFor({
      verb: 'worker', parent: bossRun,
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'sw-boss-sandbox', sandboxes: dirname(boss.folder), handle: 'sw-hand', brief: boss.brief, model: A_CAST_MODEL, runtime: 'claude-code',
    })
    expect(line).toEqual({
      command: 'node',
      args: [
        join(CHECKOUT, 'tools/sandbox.mjs'), 'worker', 'sw-boss-sandbox',
        '--sandboxes', dirname(boss.folder), '--agent', 'sw-hand', '--brief', boss.brief, '--model', A_CAST_MODEL, '--runtime', 'claude-code',
        '--as', THE_LAUNCHER_ASKS_AS, '--session', 'launcher-run', '--parent', bossRun, '--api', 'http://127.0.0.1:1', '--workspace', 'default',
      ],
    })
  })
})

describe('10. a message worker pass starts the launcher, and the next pass closes it', () => {
  it('starts a wanted worker run on a merges-only pass, closes its launcher on the next, and starts no run for a message', async () => {
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'merges-only'
      expect((await ask('sw-quiet', AS_BOSS(), { brief: boss.brief })).status).toBe(202)
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    const mergesOnly = { ...settings, mergesOnly: true }
    const rounds: WatchingARound[] = []
    const first = await onePass(mergesOnly, [], noMerges(), rounds)
    expect(first.started, 'the merges-only pass started an agent run for a message').toEqual([])
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: bossRun, agentId: idOf('sw-quiet'), wrapper }])
    expect(first.rounds?.started).toEqual([])
    await launchersEnded(rounds)
    const second = await onePass(mergesOnly, [], noMerges(), rounds)
    expect(second.started).toEqual([])
    expect(second.workers?.ended.map((one) => [one.run, one.agentId])).toEqual([[bossRun, idOf('sw-quiet')]])
    expect(rounds).toEqual([])
    expect(theWorkerRunOf(bossRun, 'sw-quiet')).toMatchObject({ state: 'started', starting: { wrapper }, launcher: { ok: true } })
    expect(dataOf(wrapper)).toMatchObject({ state: 'finished', runtime: 'round-launcher' })
    expect(MERGES_ONLY_SAYS).toContain('it starts no agent run for a message, so every message to an agent stays queued.')
    expect(MERGES_ONLY_SAYS).toContain(
      'It does start the rounds asked for through the next-round door (POST /api/agents/<agent>/next-round) and the worker runs ' +
        'asked for through the worker-run door (POST /api/agents/<agent>/worker-run), and no other agent run.',
    )
  })

  it('starts the launcher, which files the worker’s run under the supervisor’s run; the supervisor’s key then books the GPU for it', async () => {
    expect((await ask('sw-looper', AS_BOSS(), { brief: boss.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started, 'the pass started an agent run').toEqual([])
    expect(first.workers?.held).toEqual([])
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: bossRun, agentId: idOf('sw-looper'), wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.workers?.ended.map((one) => one.run)).toEqual([bossRun])
    expect(rounds).toEqual([])

    const capture = theCaptureOf<{
      argv: string[]; keyGiven: boolean; officeSettings: string[]; filed: { ok: boolean; id: string; keyAnswered: boolean }
      start: { effort: string | null; effortFrom: string; officeUnavailable: boolean } | null
    }>(wrapper)
    expect(capture.argv.slice(0, 2)).toEqual(['worker', 'sw-boss-sandbox'])
    expect(capture.argv).toEqual(expect.arrayContaining(['--agent', 'sw-looper', '--model', A_CAST_MODEL, '--as', THE_WORKER_ID, '--session', wrapper, '--parent', bossRun]))
    expect(capture.argv).not.toContain('--effort')
    expect(capture.keyGiven).toBe(true)
    expect(capture.officeSettings).toEqual(['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE'])
    expect(capture.filed).toMatchObject({ ok: true, keyAnswered: true })
    expect(theWorkerRunOf(bossRun, 'sw-looper')).toMatchObject({ state: 'started', started: { run: capture.filed.id }, launcher: { ok: true }, starting: { wrapper } })
    const workerRun = capture.filed.id
    expect(dataOf(workerRun)).toMatchObject({ servingAgent: 'sw-looper', model: A_CAST_MODEL, parentAttachment: bossRun, state: 'running' })
    // THE STARTING ENTRY AND THE LAUNCHER AGREE ON THE EFFORT (the inspector's refusal cI6RX4Ur8IiO, invariant 9): what the
    // launcher's reader was answered, asked with the worker run's own key, and wrote on that run, is what the entry records.
    const starting = theWorkerRunOf(bossRun, 'sw-looper')!.starting!
    expect(capture.start).toEqual({ effort: starting.effort, effortFrom: starting.effortFrom, officeUnavailable: false })
    expect(capture.start?.effort).toBe('high')
    expect(dataOf(workerRun)['effort']).toBe(starting.effort)
    const launcherRun = dataOf(wrapper)
    expect(launcherRun).toMatchObject({ state: 'finished', runtime: 'round-launcher', startedByMoleOffice: true, extra: { purpose: 'worker', run: bossRun, worker: idOf('sw-looper') } })
    expect(launcherRun['servingAgent']).toBeUndefined()

    // THE GPU, BOOKED FOR THE WORKER WITH THE SUPERVISOR'S OWN RUN KEY, through the booking doors as they are (lib/acting-for.ts).
    const forTheWorker = asAgent('sw-looper', bossRunKey, workerRun)
    const booked = await call('POST', '/api/bookings', forTheWorker, { resource: 'gpu', gib: 10, minutes: 30, purpose: 'Test made-up job of a worker', start: 'now' })
    expect(booked.status, JSON.stringify(booked.body)).toBe(201)
    const booking = booked.body['booking'] as { id: string; data: { endsAt: string; holder: { kind: string; id: string } } }
    expect(booking.data.holder).toEqual({ kind: 'agent', id: idOf('sw-looper') })
    const extended = await call('POST', `/api/bookings/${booking.id}/extend`, forTheWorker, { until: later(msOf(booking.data.endsAt), 30), because: 'Test the made-up job needs longer' })
    expect(extended.status, JSON.stringify(extended.body)).toBe(200)
    // AN OVERLAP IS TAKEN, AND ONLY REMINDS. No card reading in this file, so its size is not known.
    const beside = await call('POST', '/api/bookings', AS_BOSS(), { resource: 'gpu', gib: 10, minutes: 30, purpose: 'Test made-up job of the supervisor', start: 'now' })
    expect(beside.status, JSON.stringify(beside.body)).toBe(201)
    expect(beside.body['says'] as string).toContain('Nothing was refused: the 2 holders were reminded.')
    for (const one of [booking.id, String(beside.body['booking'].id)]) {
      expect((await call('POST', `/api/bookings/${one}/cancel`, AS_THE_PERSON)).status).toBe(200)
    }
  })

  it('leaves the ask failed, tells the supervisor, and crashes the launcher run when the launcher files nothing', async () => {
    expect((await ask('sw-failer', AS_BOSS(), { brief: boss.brief })).status).toBe(202)
    const toldBefore = linesToTheSupervisorAbout(bossRun).length
    const rounds: WatchingARound[] = []
    const failing = { ...settings, env: { ...settings.env, WORKER_RUN_FAKE_MODE: 'fail' } }
    const first = await onePass(failing, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: bossRun, agentId: idOf('sw-failer'), wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(failing, [], noMerges(), rounds)
    expect(second.workers?.ended.map((one) => one.agentId)).toEqual([idOf('sw-failer')])
    const kept = theWorkerRunOf(bossRun, 'sw-failer')!
    expect(kept.state).toBe('failed')
    expect(kept.failed?.says).toContain('The launcher ended before it filed a run: The sandbox launcher exited with code 3.')
    expect(kept.failed?.says).toContain('A made-up launcher failure: no run was filed.')
    expect(linesToTheSupervisorAbout(bossRun).length).toBe(toldBefore + 1)
    expect(linesToTheSupervisorAbout(bossRun).at(-1)).toContain(`The worker run of sw-failer under run ${bossRun} did not start.`)
    expect(dataOf(wrapper)).toMatchObject({ state: 'crashed', runtime: 'round-launcher' })
  })
})

describe('12. the default router rolls a new worker once, and its later start keeps the roll', () => {
  it('rolls the one row with a probability, records the roll on the start and the worker’s run, and keeps it next time', async () => {
    // A SECOND CASTING OF THE WORKER CARD, with a codex model the compatibility data knows and the only probability, so the roll can take
    // only it. The marked row keeps the mark and has no probability, so it is skipped and named.
    const added = await call('POST', '/api/casting/worker', AS_THE_PERSON, { program: { value: 'codex' }, model: { value: A_ROLLED_CODEX_MODEL }, probability: { value: '100%' } })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const rolled = Number(added.body['casting'].id)
    const supervisors = await aSupervisorsRun(boss, 'A made-up later supervisor run of sw-boss')
    const asTheSupervisor = asAgent('sw-boss', supervisors.key, supervisors.id)
    const start = async (): Promise<TheWorkerRun> => {
      expect((await ask('sw-roller', asTheSupervisor, { brief: boss.brief })).status).toBe(202)
      const launcher = await aLauncherRun(supervisors.id, idOf('sw-roller'))
      const r = await call('POST', `/api/worker/worker-runs/${supervisors.id}/starting`, AS_THE_WORKER(), { agent: idOf('sw-roller'), wrapper: launcher })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      // THE ROW'S MODEL IS ANSWERED AS openai/<model>, as a chosen codex model is (wave 13n round AG), because the real
      // launcher refuses a codex model without openai/.
      expect(r.body['workerRun']).toMatchObject({ runtime: 'codex', model: `openai/${A_ROLLED_CODEX_MODEL}` })
      return theWorkerRunOf(supervisors.id, 'sw-roller')!
    }

    const first = await start()
    expect(first.starting).toMatchObject({ runtime: 'codex', model: `openai/${A_ROLLED_CODEX_MODEL}`, casting: rolled })
    const roll = readCastingRoll(first.starting?.castingRoll)!
    expect(roll).toMatchObject({ choice: 'rolled', group: 'every row', selected: { rowId: rolled, probability: 1, share: 1 }, keptFrom: null })
    expect(roll.selected?.number).toEqual(expect.any(Number))
    expect(roll.skipped).toEqual([expect.objectContaining({ rowId: castingId, reasons: ['no probability is set'] })])
    expect(first.starting?.castingSays).toBe(roll.says)
    const filed = await theWorkersRun('sw-roller', first.starting!.wrapper!, supervisors.id, 'A made-up worker run of sw-roller, filed by hand')
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const run = String(filed.body['record'].id)
    expect(dataOf(run)['castingRoll']).toEqual(first.starting!.castingRoll)
    expect((await finish(run)).status).toBe(200)

    // THE SAME AGENT'S NEXT START KEEPS ITS ROLL from its run, and does not roll again.
    const second = await start()
    expect(second.starting).toMatchObject({ casting: rolled, castingSays: `The agent keeps row ${String(rolled)} from run ${run}'s roll.` })
    expect(readCastingRoll(second.starting?.castingRoll)).toMatchObject({ choice: 'kept', keptFrom: run, selected: roll.selected })
  })
})

describe('13. the cut: the commit a worker’s worktree is made at', () => {
  let cutting = { id: '', key: '' }
  const asCutting = (): Record<string, string> => asAgent('sw-boss', cutting.key, cutting.id)
  /** The marked row of section 1 casts this choice, and a choice no row of the worker card casts is refused. */
  const CHOICE = { runtime: 'claude-code', model: A_CAST_MODEL }
  const worktreeOf = (handle: string): string => join(boss.folder, 'worktrees', handle)
  /** A commit of the sandbox repository's own, on top of `main`, which no branch reaches until one is made for it. */
  const aCommitOnTop = (message: string): string => boss.git(boss.repo, 'commit-tree', `${boss.head}^{tree}`, '-p', boss.head, '-m', message)

  /** One pass that starts the worker run asked for, and one that closes its launcher. What the launcher was given and filed. */
  async function startedByAPass(handle: string): Promise<{ argv: string[]; filed: string }> {
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: cutting.id, agentId: idOf(handle), wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.workers?.ended.map((one) => one.agentId)).toEqual([idOf(handle)])
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    expect(theWorkerRunOf(cutting.id, handle)).toMatchObject({ state: 'started', started: { run: capture.filed.id }, launcher: { ok: true } })
    return { argv: capture.argv, filed: capture.filed.id }
  }
  const theCutGiven = (argv: string[]): string[] => (argv.includes('--cut-from') ? argv.slice(argv.indexOf('--cut-from'), argv.indexOf('--cut-from') + 2) : [])

  beforeAll(async () => {
    cutting = await aSupervisorsRun(boss, 'A made-up supervisor run of sw-boss that cuts its workers')
  })

  it('refuses a cut no branch or tag of the sandbox’s repository reaches, and a run whose own commit git cannot read, and writes nothing', async () => {
    const { repo } = boss
    const unknown = await ask('sw-cutter', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: 'no-such-branch' })
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(400)
    expect(unknown.body['code']).toBe('workerCutNotInTheSandbox')
    expect(unknown.body['error']).toBe(`cutFrom "no-such-branch" is not a branch or commit of the sandbox's repository ${repo}: git resolves it to no commit. Nothing was written.`)
    const option = await ask('sw-cutter', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: '--all' })
    expect(option.status, JSON.stringify(option.body)).toBe(400)
    expect(option.body['code']).toBe('workerCutNotInTheSandbox')
    expect(option.body['error']).toBe(`cutFrom "--all" is not a branch or commit of the sandbox's repository ${repo}: a branch or commit does not begin with "-". Nothing was written.`)
    const loose = aCommitOnTop('A made-up commit that no branch of the sandbox reaches')
    const unreached = await ask('sw-cutter', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: loose })
    expect(unreached.status, JSON.stringify(unreached.body)).toBe(400)
    expect(unreached.body['code']).toBe('workerCutNotInTheSandbox')
    expect(unreached.body['error']).toBe(
      `cutFrom "${loose}" names the commit ${loose}, and no branch or tag of the sandbox's repository ${repo} reaches it. ` +
        "A worker's worktree is made from that repository, so it is cut only from a commit a branch or tag there reaches. Nothing was written.",
    )
    expect(theWorkerRunOf(cutting.id, 'sw-cutter')).toBeUndefined()

    // THE DEFAULT IS CHECKED THE SAME WAY: a run whose worktree is no checkout, and one that stands at another repository's
    // commit, which repo/ does not hold, refused in words that name that repository. This sandbox lists no clones.
    const nowhere = join(realpathSync(scratch), 'not-a-checkout')
    mkdirSync(nowhere, { recursive: true })
    const unread = await aSupervisorsRun(boss, 'A made-up supervisor run of sw-boss outside any checkout', nowhere)
    const headless = await ask('sw-cutter', asAgent('sw-boss', unread.key, unread.id), { brief: boss.brief, ...CHOICE })
    expect(headless.status, JSON.stringify(headless.body)).toBe(409)
    expect(headless.body['code']).toBe('workerCutHeadUnread')
    expect(headless.body['error']).toContain(`Run ${unread.id} named no cutFrom, so the worker would be cut from the commit the run's own worktree stands at, and git could not read HEAD in ${nowhere}: git exited 128`)
    expect(headless.body['error']).toContain("Name a branch or commit of the sandbox's repository as cutFrom. Nothing was written.")
    const elsewhere = join(realpathSync(scratch), 'another-repository')
    boss.git(realpathSync(scratch), 'init', '-q', '-b', 'main', elsewhere)
    boss.git(elsewhere, 'commit', '--allow-empty', '-qm', 'A made-up commit of another repository')
    const theirs = boss.git(elsewhere, 'rev-parse', 'HEAD')
    const foreign = await aSupervisorsRun(boss, 'A made-up supervisor run of sw-boss in another repository', elsewhere)
    const outside = await ask('sw-cutter', asAgent('sw-boss', foreign.key, foreign.id), { brief: boss.brief, ...CHOICE })
    expect(outside.status, JSON.stringify(outside.body)).toBe(409)
    expect(outside.body['code']).toBe('workerCutNotInTheSandbox')
    // The words are the door's (src/server/lib/worker-runs.ts), and why instance.json could not be read is Node's own.
    const instance = join(boss.folder, 'instance.json')
    let unreadable = ''
    try {
      readFileSync(instance, 'utf8')
    } catch (error) {
      unreadable = (error as Error).message
    }
    expect(unreadable).not.toBe('')
    const { aRunOfAnotherRepositoryIsRefused, isNotOneOfTheClones } = await import('../src/server/lib/worker-runs.ts')
    expect(outside.body['error']).toBe(
      aRunOfAnotherRepositoryIsRefused(foreign.id, theirs, elsewhere, elsewhere, isNotOneOfTheClones({ ok: false, file: instance, says: unreadable }), repo),
    )
    for (const part of [foreign.id, theirs, elsewhere, instance, unreadable, repo]) expect(outside.body['error']).toContain(part)
    for (const run of [unread.id, foreign.id]) {
      expect(dataOf(run)['workerRuns']).toBeUndefined()
      expect((await finish(run)).status).toBe(200)
    }
  })

  it('cuts from the commit the asking run stands at when the ask names none, gives the launcher it, and the worker’s run says it was used', async () => {
    const r = await ask('sw-cutter', asCutting(), { brief: boss.brief, ...CHOICE })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(cutting.id, 'sw-cutter')?.cut).toEqual({ commit: boss.head, named: null })
    expect(r.body['says']).toContain(
      `When the worker starts, its worktree is to be cut from ${boss.head}, the commit run ${cutting.id}'s worktree stood at when it asked. ` +
        'If its worktree is there by then, it is used as it stands, and the cut is not used.',
    )
    const { argv, filed } = await startedByAPass('sw-cutter')
    expect(theCutGiven(argv)).toEqual(['--cut-from', boss.head])
    const starting = theWorkerRunOf(cutting.id, 'sw-cutter')!.starting!
    expect(starting.cutFrom).toBe(boss.head)
    expect(starting.cutSays).toBe(
      `The worker's worktree ${worktreeOf('sw-cutter')} was not there, so the launcher was given --cut-from ${boss.head} to make it at ` +
        `${boss.head}, the commit run ${cutting.id}'s worktree stood at when it asked.`,
    )
    // THE MADE-UP LAUNCHER FILES IN THIS CHECKOUT, which stands at the same commit, so the run stood where it was cut.
    expect(dataOf(filed)['cutFrom']).toBe(boss.head)
    expect(dataOf(filed)['cutAsked']).toEqual({ commit: boss.head, named: null, used: true, stoodAt: boss.head, says: `${String(starting.cutSays)} The run was filed at ${boss.head}.` })
    // IT IS FINISHED in the last test of this block, which tries to write its cutAsked.
  })

  it('cuts from the commit a branch the ask names stands at, and the worker’s run says its worktree did not stand there', async () => {
    const named = aCommitOnTop('A made-up commit a branch of the sandbox reaches')
    boss.git(boss.repo, 'update-ref', 'refs/heads/made-up-cut', named)
    const r = await ask('sw-named', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: 'made-up-cut' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(cutting.id, 'sw-named')?.cut).toEqual({ commit: named, named: 'made-up-cut' })
    expect(r.body['says']).toContain(`When the worker starts, its worktree is to be cut from ${named}, which cutFrom "made-up-cut" named. If its worktree is there by then, the start fails.`)
    const { argv, filed } = await startedByAPass('sw-named')
    expect(theCutGiven(argv)).toEqual(['--cut-from', named])
    const starting = theWorkerRunOf(cutting.id, 'sw-named')!.starting!
    expect(starting).toMatchObject({
      cutFrom: named,
      cutSays: `The worker's worktree ${worktreeOf('sw-named')} was not there, so the launcher was given --cut-from ${named} to make it at ${named}, which cutFrom "made-up-cut" named.`,
    })
    // THE MADE-UP LAUNCHER MADE NO WORKTREE: it filed in this checkout, at another commit, and the run says so.
    expect(dataOf(filed)['cutAsked']).toEqual({
      commit: named, named: 'made-up-cut', used: true, stoodAt: boss.head,
      says: `${String(starting.cutSays)} The run was filed at ${boss.head}, so its worktree did not stand at the commit asked.`,
    })
    expect((await finish(filed)).status).toBe(200)
  })

  it('uses a worktree that is there as it stands: refuses a named cut in words that name it, and files the run at the commit it stands at when none is named', async () => {
    const dir = worktreeOf('sw-there')
    boss.git(boss.repo, 'worktree', 'add', '--no-checkout', '-q', '-b', 'sw-there-left', dir, boss.head)
    const isThere = `${dir} is there already, on branch sw-there-left, at ${boss.head}`
    const named = await ask('sw-there', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: 'main' })
    expect(named.status, JSON.stringify(named.body)).toBe(409)
    expect(named.body['code']).toBe('workerCutWorktreeAlreadyThere')
    expect(named.body['error']).toBe(
      `The worker's worktree ${isThere}, so it cannot be cut from ${boss.head}, which cutFrom "main" named: a worktree that is there is used as it stands. ` +
        `Remove it first with node tools/remove-a-worktree.mjs ${dir}, or ask with no cutFrom to have the worker work in it as it stands. Nothing was written.`,
    )
    expect(theWorkerRunOf(cutting.id, 'sw-there')).toBeUndefined()
    const r = await ask('sw-there', asCutting(), { brief: boss.brief, ...CHOICE })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['says']).toContain(`Its worktree ${isThere}. A worktree that is there when the worker starts is used as it stands, so the cut ${boss.head} is not used.`)
    const { argv, filed } = await startedByAPass('sw-there')
    expect(theCutGiven(argv)).toEqual(['--cut-from', boss.head])
    const starting = theWorkerRunOf(cutting.id, 'sw-there')!.starting!
    const { aStartUsesAWorktreeThatIsThere } = await import('../src/server/lib/worker-runs.ts')
    expect(starting).toMatchObject({
      cutFrom: null,
      cutSays: aStartUsesAWorktreeThatIsThere({ dir, branch: 'sw-there-left', head: boss.head }, boss.head, boss.head),
    })
    expect(starting.cutSays).toContain(isThere)
    expect(dataOf(filed)['cutFrom']).toBe(boss.head)
    expect(dataOf(filed)['cutAsked']).toEqual({ commit: boss.head, named: null, used: false, stoodAt: boss.head, says: `${String(starting.cutSays)} The run was filed at ${boss.head}.` })
    expect((await finish(filed)).status).toBe(200)
  })

  it('fails the start of an ask that named a cut when the worktree appeared after the ask, and tells the supervisor', async () => {
    expect((await ask('sw-late', asCutting(), { brief: boss.brief, ...CHOICE, cutFrom: 'main' })).status).toBe(202)
    const dir = worktreeOf('sw-late')
    boss.git(boss.repo, 'worktree', 'add', '--no-checkout', '-q', '--detach', dir, boss.head)
    const launcher = await aLauncherRun(cutting.id, idOf('sw-late'))
    const r = await call('POST', `/api/worker/worker-runs/${cutting.id}/starting`, AS_THE_WORKER(), { agent: idOf('sw-late'), wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const says =
      `The worker's worktree ${dir} is there already, on no branch git could read, at ${boss.head}, so it cannot be cut from ${boss.head}, ` +
      `which cutFrom "main" named. Remove it with node tools/remove-a-worktree.mjs ${dir} and ask again.`
    expect(r.body['error']).toContain(says)
    expect(theWorkerRunOf(cutting.id, 'sw-late')).toMatchObject({ state: 'failed', failed: { says } })
    expect(linesToTheSupervisorAbout(cutting.id)).toContain(`The worker run of sw-late under run ${cutting.id} did not start. ${says}`)
  })

  /** A worker's worktree folder whose `.git` names no git directory, so git can read no branch and no HEAD in it. */
  function aWorktreeGitCannotRead(handle: string): string {
    const dir = worktreeOf(handle)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.git'), `gitdir: ${join(boss.folder, 'no-such-git-directory')}\n`)
    return dir
  }
  /** The words for a worktree at `dir` whose HEAD git cannot read, as the door that refuses it says them (src/server/lib/worker-runs.ts). */
  const aHeadNobodyCanRead = async (dir: string, door: 'ask' | 'start'): Promise<string> =>
    (await import('../src/server/lib/worker-runs.ts')).aHeadNobodyCanRead({ dir, branch: null, head: null }, door)

  // A WORKTREE THAT IS THERE IS FILED AT THE COMMIT IT STANDS AT, so one whose HEAD git cannot read is refused at the ask
  // rather than filed at another commit. MUTATION: take the ask's refusal out (the ask is taken).
  it('refuses the ask for a worker whose worktree is there at a commit git cannot read, and writes nothing', async () => {
    const dir = aWorktreeGitCannotRead('sw-headless')
    const r = await ask('sw-headless', asCutting(), { brief: boss.brief, ...CHOICE })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toBe(await aHeadNobodyCanRead(dir, 'ask'))
    expect(r.body['error']).toContain(dir)
    expect(theWorkerRunOf(cutting.id, 'sw-headless')).toBeUndefined()
  })

  // THE SAME WORKTREE AFTER THE ASK fails the start, and the launcher is not given another commit to file the run at.
  // MUTATION: the start gives the launcher no cut and goes on (it starts).
  it('fails the start of a worker whose worktree came to stand at a commit git cannot read after the ask, and tells the supervisor', async () => {
    expect((await ask('sw-broken', asCutting(), { brief: boss.brief, ...CHOICE })).status).toBe(202)
    const dir = aWorktreeGitCannotRead('sw-broken')
    const launcher = await aLauncherRun(cutting.id, idOf('sw-broken'))
    const r = await call('POST', `/api/worker/worker-runs/${cutting.id}/starting`, AS_THE_WORKER(), { agent: idOf('sw-broken'), wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const says = await aHeadNobodyCanRead(dir, 'start')
    expect(r.body['error']).toContain(says)
    expect(theWorkerRunOf(cutting.id, 'sw-broken')).toMatchObject({ state: 'failed', failed: { says } })
    const { aWorkerRunDidNotStart } = await import('../src/server/lib/worker-runs.ts')
    expect(linesToTheSupervisorAbout(cutting.id)).toContain(aWorkerRunDidNotStart('sw-broken', cutting.id, says))
  })

  it('gives the sandbox launcher --cut-from after --worktree, and a round both or neither', async () => {
    // A repair round is started in a new worktree cut at landed main, so a round takes --worktree and --cut-from
    // together. Either one alone is refused, in the words round.ts exports.
    const bothOrNeither = Reflect.get(await import('../src/worker/runtimes/round.ts'), 'A_FRESH_ROUND_NEEDS_BOTH') as string | undefined
    expect(bothOrNeither, 'round.ts exports the words that refuse half of a fresh round').toBeDefined()
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const common = {
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'sw-boss-sandbox', sandboxes: dirname(boss.folder), handle: 'sw-cutter', brief: boss.brief,
    }
    const worker = real.commandFor({ ...common, verb: 'worker', parent: bossRun, model: A_CAST_MODEL, runtime: 'claude-code', cutFrom: boss.head })
    expect(worker.args).toEqual([
      join(CHECKOUT, 'tools/sandbox.mjs'), 'worker', 'sw-boss-sandbox',
      '--sandboxes', dirname(boss.folder), '--agent', 'sw-cutter', '--brief', boss.brief, '--model', A_CAST_MODEL, '--runtime', 'claude-code',
      '--cut-from', boss.head, '--as', THE_LAUNCHER_ASKS_AS, '--session', 'launcher-run', '--parent', bossRun, '--api', 'http://127.0.0.1:1', '--workspace', 'default',
    ])
    const exec = real.commandFor({ ...common, verb: 'exec', parent: bossRun, model: 'deepseek-v4.1-flash', runtime: 'dsh', worktree: worktreeOf('sw-cutter'), cutFrom: boss.head })
    const at = exec.args.indexOf('--worktree')
    expect(exec.args.slice(at, at + 4)).toEqual(['--worktree', worktreeOf('sw-cutter'), '--cut-from', boss.head])
    const round = { ...common, model: A_CAST_MODEL, runtime: 'claude-code' as const, follows: 'made-up-run' }
    const fresh = real.commandFor({ ...round, worktree: worktreeOf('sw-cutter'), cutFrom: boss.head })
    const from = fresh.args.indexOf('--worktree')
    expect(fresh.args.slice(from, from + 4)).toEqual(['--worktree', worktreeOf('sw-cutter'), '--cut-from', boss.head])
    expect(real.commandFor(round).args).not.toContain('--worktree')
    expect(real.commandFor(round).args).not.toContain('--cut-from')
    expect(() => real.commandFor({ ...round, cutFrom: boss.head })).toThrow(bothOrNeither)
    expect(() => real.commandFor({ ...round, worktree: worktreeOf('sw-cutter') })).toThrow(bothOrNeither)
  })

  it('lets only the office write cutAsked, on a create and on a patch', async () => {
    const filed = theWorkerRunOf(cutting.id, 'sw-cutter')!.started!.run
    const kept = dataOf(filed)['cutAsked'] as Record<string, unknown>
    const forged = { ...kept, used: false }
    for (const headers of [AS_THE_PERSON, asOne('sw-quill'), asCutting()]) {
      const patched = await call('PATCH', `/api/records/${filed}`, headers, { dataPatch: { cutAsked: forged } })
      expect(patched.status, JSON.stringify(patched.body)).toBe(403)
      expect(patched.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED)
    }
    const replaced = await call('PATCH', `/api/records/${filed}`, AS_THE_PERSON, { data: { ...dataOf(filed), cutAsked: forged } })
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(403)
    expect(replaced.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED)
    const created = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'A made-up run with a cut asked', data: { state: 'running', cutAsked: kept } })
    expect(created.status, JSON.stringify(created.body)).toBe(403)
    expect(created.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED)
    expect(dataOf(filed)['cutAsked']).toEqual(kept)
    expect((await finish(filed)).status).toBe(200)
  })
})

describe('14. an agent with no key of its own: a supervisor registers its worker, and the worker writes only with a run key', () => {
  let s = { id: '', key: '' }
  const asTheSupervisor = (): Record<string, string> => asAgent('sw-boss', s.key, s.id)
  /** The marked row of section 1 casts this choice, and a choice no row of the worker card casts is refused. */
  const CHOICE = { runtime: 'claude-code', model: A_CAST_MODEL }
  const NO_KEY = (handle: string) => ({ handle, name: handle, runtime: 'claude-code', noKey: true })
  const rowsNamed = (handle: string): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM agents WHERE handle = ?').get(handle) as { n: number }).n
  const keysOf = (id: string): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ?").get(id) as { n: number }).n
  const markOf = (id: string): number => (t.client.sqlite.prepare('SELECT run_keys_only AS mark FROM agents WHERE id = ?').get(id) as { mark: number }).mark
  const THE_OWN_KEY_REFUSAL =
    "An agent with no key of its own is registered only through the caller's own key: the person's key, or the caller's own agent key, a run key included."
  const THE_LIVE_HANDLE_REFUSAL = (handle: string) =>
    `A live agent already bears the handle "${handle}", and an agent already registered cannot be changed to have no key of its own. ` +
    'Register the new agent under another handle. Nothing was written.'
  const THE_ONE_SENTENCE = `"sw-nokey" was registered with no key of its own, so a write in its name is taken only with a run key or the office's key, and this request carried neither, so nothing was written.`
  const THE_READ_SENTENCE = `"sw-nokey" was registered with no key of its own, so a read in its name is answered only with a run key or the office's key, and this request carried neither, so nothing was read.`
  const aNote = (title: string) => ({ kind: 'note', title })
  let workerRun = { id: '', key: '' }

  beforeAll(async () => {
    s = await aSupervisorsRun(boss, 'A made-up supervisor run of sw-boss that registers its own worker')
  })

  it('refuses noKey to a caller its own key did not prove, and for a handle a live agent bears, and writes nothing', async () => {
    const keyless = await call('POST', '/api/agents/started', asAgent('sw-boss', undefined, s.id), NO_KEY('sw-nokey'))
    expect(keyless.status, JSON.stringify(keyless.body)).toBe(403)
    expect(keyless.body['error']).toBe(`${THE_OWN_KEY_REFUSAL} This request carried no key the office holds. Nothing was written.`)
    const person = await call('POST', '/api/agents/started', AS_THE_PERSON, NO_KEY('sw-nokey'))
    expect(person.status, JSON.stringify(person.body)).toBe(403)
    expect(person.body['error']).toBe(`${THE_OWN_KEY_REFUSAL} This request carried no key the office holds. Nothing was written.`)
    const office = await call('POST', '/api/agents/started', asAgent('sw-boss', A_MADE_UP_OFFICE_KEY, s.id), NO_KEY('sw-nokey'))
    expect(office.status, JSON.stringify(office.body)).toBe(403)
    expect(office.body['error']).toBe(`${THE_OWN_KEY_REFUSAL} This request carried the office's key, which is not the caller's own. Nothing was written.`)
    expect(rowsNamed('sw-nokey')).toBe(0)
    // FROM ANOTHER PROJECT a handle a live agent bears would join that agent's row rather than be refused as taken, so
    // this is the case the refusal is for, and the live agent's row keeps no mark.
    const far = await call('POST', '/api/workspaces', AS_THE_PERSON, { id: 'sw-far-project', title: 'A made-up second project' })
    expect(far.status, JSON.stringify(far.body)).toBe(201)
    const there = await call('POST', '/api/agents/started', { ...AS_THE_PERSON, 'x-mole-office-workspace': 'sw-far-project' }, { handle: 'sw-far', name: 'sw-far', runtime: 'claude-code' })
    expect(there.status, JSON.stringify(there.body)).toBe(201)
    const joining = await call('POST', '/api/agents/started', asTheSupervisor(), NO_KEY('sw-far'))
    expect(joining.status, JSON.stringify(joining.body)).toBe(409)
    expect(joining.body['error']).toBe(THE_LIVE_HANDLE_REFUSAL('sw-far'))
    expect(rowsNamed('sw-far')).toBe(1)
    expect(markOf(String(there.body['agent'].id))).toBe(0)
    // IN THE SAME PROJECT the handle is refused as taken further on as well, and this refusal is answered first.
    const live = await call('POST', '/api/agents/started', asTheSupervisor(), NO_KEY('sw-hand'))
    expect(live.status, JSON.stringify(live.body)).toBe(409)
    expect(live.body['error']).toBe(THE_LIVE_HANDLE_REFUSAL('sw-hand'))
    expect(rowsNamed('sw-hand')).toBe(1)
    expect(markOf(idOf('sw-hand'))).toBe(0)
  })

  it('(a) registers the worker through the supervisor’s run key with no key, the supervisor as its starter, and the mark', async () => {
    const r = await call('POST', '/api/agents/started', asTheSupervisor(), NO_KEY('sw-nokey'))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const id = String(r.body['agent'].id)
    agents.set('sw-nokey', { id, key: '' })
    expect(r.body['joinedAnExistingRow']).toBe(false)
    expect(r.body['whatToGiveIt']['key']).toBeUndefined()
    expect(r.body['whatToGiveIt']['keySays']).toBe(
      'No key was made for "sw-nokey", because it was registered with no key of its own. ' +
        "A run of it is given a run key when the office starts the run, or when a hand start names a live run of its registered starter with --asked-by and supplies --brief.",
    )
    expect(r.body['startedBy']).toEqual({ kind: 'agent', id: idOf('sw-boss') })
    expect(dataOf(String(r.body['record']))).toMatchObject({ startedBy: { kind: 'agent', id: idOf('sw-boss') }, startedByRun: s.id })
    expect(markOf(id)).toBe(1)
    expect(keysOf(id)).toBe(0)

    // THE PERSON'S OWN KEY registers one too, and is told only what the office's start gives it: the person's key mints no run key.
    const byThePerson = await call('POST', '/api/agents/started', { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }, NO_KEY('sw-nokey-p'))
    expect(byThePerson.status, JSON.stringify(byThePerson.body)).toBe(201)
    expect(byThePerson.body['whatToGiveIt']['key']).toBeUndefined()
    expect(byThePerson.body['whatToGiveIt']['keySays']).toBe(
      'No key was made for "sw-nokey-p", because it was registered with no key of its own. A run of it is given a run key when the office starts the run.',
    )
    expect(byThePerson.body['startedBy']).toEqual({ kind: 'person', id: THE_PERSON })
    expect(markOf(String(byThePerson.body['agent'].id))).toBe(1)
    expect(keysOf(String(byThePerson.body['agent'].id))).toBe(0)
  })

  it('(b) the supervisor’s ask starts the worker, and the office mints the worker’s run a key', async () => {
    const asked = await ask('sw-nokey', asTheSupervisor(), { brief: boss.brief, ...CHOICE })
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const beforeHandCheck = theWorkerRunOf(s.id, 'sw-nokey')
    const handCheck = await call('POST', '/api/agents/sw-nokey/hand-run', AS_THE_WORKER(), {})
    expect(handCheck.status, handCheck.body['error']).toBe(200)
    expect(handCheck.body['cut']).toBeNull()
    expect(theWorkerRunOf(s.id, 'sw-nokey')).toEqual(beforeHandCheck)
    const launcher = await aLauncherRun(s.id, idOf('sw-nokey'))
    const starting = await call('POST', `/api/worker/worker-runs/${s.id}/starting`, AS_THE_WORKER(), { agent: idOf('sw-nokey'), wrapper: launcher })
    expect(starting.status, JSON.stringify(starting.body)).toBe(200)
    const filed = await theWorkersRun('sw-nokey', launcher, s.id, 'A made-up worker run of sw-nokey')
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const run = String(filed.body['record'].id)
    const key = String(filed.body['runKey']?.key)
    expect(key, 'the office minted the worker’s run no key').toMatch(/^[0-9a-f]{64}$/)
    expect(theWorkerRunOf(s.id, 'sw-nokey')).toMatchObject({ state: 'started', started: { run, runKeyId: dataOf(run)['extra'].runKeyId } })
    workerRun = { id: run, key }
  })

  it('(c) a registration without the field is answered a key, and a write in its name is taken as before', async () => {
    const r = await call('POST', '/api/agents/started', asTheSupervisor(), { handle: 'sw-keyed', name: 'sw-keyed', runtime: 'claude-code' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const id = String(r.body['agent'].id)
    const key = String(r.body['whatToGiveIt']['key'])
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(markOf(id)).toBe(0)
    expect(keysOf(id)).toBe(1)
    const keyless = await call('POST', '/api/records', asAgent('sw-keyed'), aNote('A made-up note by sw-keyed with no key'))
    expect(keyless.status, JSON.stringify(keyless.body)).toBe(201)
    const keyed = await call('POST', '/api/records', asAgent('sw-keyed', key), aNote('A made-up note by sw-keyed with its own key'))
    expect(keyed.status, JSON.stringify(keyed.body)).toBe(201)
  })

  it('(d) refuses a write in the worker’s name with no key or a long-lived key of its own, in one sentence, and takes its run keys and the office’s', async () => {
    const notes = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'note' AND title LIKE 'A made-up note in sw-nokey''s name%'").get() as { n: number }).n
    const keyless = await call('POST', '/api/records', asAgent('sw-nokey', undefined, workerRun.id), aNote("A made-up note in sw-nokey's name with no key"))
    expect(keyless.status, JSON.stringify(keyless.body)).toBe(403)
    expect(keyless.body['error']).toBe(THE_ONE_SENTENCE)
    const patched = await call('PATCH', `/api/records/${workerRun.id}`, asAgent('sw-nokey', undefined, workerRun.id), { dataPatch: { doing: 'a made-up doing line with no key' } })
    expect(patched.status, JSON.stringify(patched.body)).toBe(403)
    expect(patched.body['error']).toBe(THE_ONE_SENTENCE)
    const overTheListener = await fetch(`${api}/api/records`, {
      method: 'POST',
      headers: asAgent('sw-nokey', undefined, workerRun.id),
      body: JSON.stringify(aNote("A made-up note in sw-nokey's name over the listener")),
    })
    expect(overTheListener.status).toBe(403)
    expect(((await overTheListener.json()) as { error: string }).error).toBe(THE_ONE_SENTENCE)
    // A LONG-LIVED KEY OF ITS OWN, made here in-process. No door gives such an agent one (the test of the doors is named
    // in the header), so this stands for a key made some other way, and the rule must refuse it all the same.
    const keys = await import('../src/server/lib/keys.ts')
    const itsOwn = keys.makeAnAgentKey(idOf('sw-nokey'), null)
    const longLived = await call('POST', '/api/records', asAgent('sw-nokey', itsOwn, workerRun.id), aNote("A made-up note in sw-nokey's name with a long-lived key"))
    expect(longLived.status, JSON.stringify(longLived.body)).toBe(403)
    expect(longLived.body['error']).toBe(THE_ONE_SENTENCE)
    expect(notes()).toBe(0)
    expect(dataOf(workerRun.id)['doing']).toBeUndefined()

    const byItsRunKey = await call('POST', '/api/records', asAgent('sw-nokey', workerRun.key, workerRun.id), aNote("A made-up note in sw-nokey's name with its run key"))
    expect(byItsRunKey.status, JSON.stringify(byItsRunKey.body)).toBe(201)
    const actingFor = await call('POST', '/api/records', asAgent('sw-nokey', s.key, workerRun.id), aNote("A made-up note in sw-nokey's name with the supervisor's run key"))
    expect(actingFor.status, JSON.stringify(actingFor.body)).toBe(201)
    const byTheOffice = await call('POST', '/api/records', asAgent('sw-nokey', A_MADE_UP_OFFICE_KEY), aNote("A made-up note in sw-nokey's name with the office's key"))
    expect(byTheOffice.status, JSON.stringify(byTheOffice.body)).toBe(201)
    const doing = await call('PATCH', `/api/records/${workerRun.id}`, asAgent('sw-nokey', workerRun.key, workerRun.id), { dataPatch: { doing: 'a made-up doing line with its run key' } })
    expect(doing.status, JSON.stringify(doing.body)).toBe(200)
    expect(notes()).toBe(3)

    // A KEY SENT ALONE, with no actor headers, names its holder, and is held to the same rule.
    const keyAlone = (key: string): Record<string, string> => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key })
    const longLivedAlone = await call('POST', '/api/records', keyAlone(itsOwn), aNote("A made-up note in sw-nokey's name with a long-lived key sent alone"))
    expect(longLivedAlone.status, JSON.stringify(longLivedAlone.body)).toBe(403)
    expect(longLivedAlone.body['error']).toBe(THE_ONE_SENTENCE)
    expect(notes()).toBe(3)
    const runKeyAlone = await call('POST', '/api/records', keyAlone(workerRun.key), aNote("A made-up note in sw-nokey's name with its run key sent alone"))
    expect(runKeyAlone.status, JSON.stringify(runKeyAlone.body)).toBe(201)
    expect(notes()).toBe(4)

    // A READ IN ITS NAME WITH NO KEY IS REFUSED TOO, in its own sentence: a read is answered only with a run key or the office's key.
    const aRead = await call('GET', `/api/records/${workerRun.id}`, asAgent('sw-nokey', undefined, workerRun.id))
    expect(aRead.status, JSON.stringify(aRead.body).slice(0, 400)).toBe(403)
    expect(aRead.body['error']).toBe(THE_READ_SENTENCE)

    // A RUN KEY ACTING FOR ANOTHER AGENT'S RUN is a key, and still not the caller's own: it registers no agent with no key.
    const acting = await call('POST', '/api/agents/started', asAgent('sw-nokey', s.key, workerRun.id), NO_KEY('sw-nokey-acting'))
    expect(acting.status, JSON.stringify(acting.body)).toBe(403)
    expect(acting.body['error']).toBe(`${THE_OWN_KEY_REFUSAL} This request carried a run key acting for another agent's run. Nothing was written.`)
    expect(rowsNamed('sw-nokey-acting')).toBe(0)
  })
})

describe('15. a clone beside repo/: the ask names it, cutFrom is looked for there, and the worker is cut from it', () => {
  /** The marked row of section 1 casts this choice, and a choice no row of the worker card casts is refused. */
  const CHOICE = { runtime: 'claude-code', model: A_CAST_MODEL }
  const CLONE = 'made-up-clone'
  let sandbox: ASandbox
  let clone = ''
  /** A repository outside the sandbox, which a listed clone leads to through a link. */
  let outside = ''
  /** The commit the clone's branch stands at. The sandbox's repo/ does not hold it. */
  let ofTheClone = ''
  let asking = { id: '', key: '' }
  const askFor = (body: Record<string, unknown>) => ask('sw-cloned', asAgent('sw-boss', asking.key, asking.id), { brief: sandbox.brief, ...CHOICE, ...body })
  async function refused(status: number, code: string, body: Record<string, unknown>, error: string): Promise<void> {
    const r = await askFor(body)
    expect(r.status, JSON.stringify(r.body)).toBe(status)
    expect(r.body['code']).toBe(code)
    expect(r.body['error']).toBe(error)
    expect(theWorkerRunOf(asking.id, 'sw-cloned')).toBeUndefined()
  }
  /** git as the made-up sandbox runs it, answered as spawnSync answers, for the launcher's own worktree maker. */
  const inTheSandbox = (args: string[]) =>
    spawnSync('git', args, {
      encoding: 'utf8',
      env: { ...process.env, HOME: join(sandbox.folder, 'git-home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(sandbox.folder, 'git-home', 'no-config') },
    })

  beforeAll(async () => {
    await started('sw-cloned', asOne('sw-boss'))
    await started('sw-reused', asOne('sw-boss'))
    await started('sw-in-clone', asOne('sw-boss'))
    sandbox = aSandbox('sw-clone-sandbox')
    // THE CLONE: a repository of its own beside repo/, as `up` makes one from the template's "clones", with a branch
    // repo/ does not have. repo/ has a branch the clone does not have.
    clone = join(sandbox.folder, CLONE)
    sandbox.git(sandbox.folder, 'init', '-q', '-b', 'main', clone)
    sandbox.git(clone, 'commit', '--allow-empty', '-qm', 'A made-up commit of the sandbox’s clone')
    ofTheClone = sandbox.git(clone, 'rev-parse', 'HEAD')
    sandbox.git(clone, 'branch', 'made-up-clone-branch')
    sandbox.git(sandbox.repo, 'branch', 'made-up-repo-branch', sandbox.head)
    // A LISTED CLONE THAT LEADS OUTSIDE THE SANDBOX, because a run in the sandbox can write its instance.json.
    outside = join(realpathSync(scratch), 'outside-the-sandbox')
    sandbox.git(realpathSync(scratch), 'init', '-q', '-b', 'main', outside)
    symlinkSync(outside, join(sandbox.folder, 'linked-clone'))
    const clones = [{ name: CLONE, from: '/made-up/source/of-the-clone', ref: 'main' }, { name: 'linked-clone', from: outside, ref: 'main' }]
    writeFileSync(join(sandbox.folder, 'instance.json'), `${JSON.stringify({ clones }, null, 2)}\n`)
    asking = await aSupervisorsRun(sandbox, 'A made-up supervisor run of sw-boss in a sandbox with a clone')
  })

  it('refuses a clone path outside the sandbox, a clone it does not list, and a listed clone that leads outside it, and writes nothing', async () => {
    const { folder } = sandbox
    for (const path of [outside, join(folder, 'worktrees', CLONE), `${CLONE}/../repo`]) {
      await refused(400, 'workerCloneNotOfTheSandbox', { clone: path, cutFrom: 'main' },
        `clone "${path}" is not a folder of the sandbox ${folder}. Name one of its clones by its folder name beside repo/, or by its absolute path there. Nothing was written.`)
    }
    await refused(400, 'workerCloneNotOfTheSandbox', { clone: 'repo', cutFrom: 'main' },
      `clone "repo" is not one of the sandbox's clones, which ${join(folder, 'instance.json')} lists: ${CLONE}, linked-clone. Nothing was written.`)
    await refused(400, 'workerCloneNotOfTheSandbox', { clone: 'linked-clone', cutFrom: 'main' },
      `clone "linked-clone" is ${join(folder, 'linked-clone')}, which leads to ${outside}, outside the sandbox ${folder}. Nothing was written.`)
  })

  it('looks for cutFrom only in the clone named, and with none named only in repo/, and refuses a branch in neither', async () => {
    // IN THE CLONE: a branch in neither, and a branch only repo/ has, which is not looked for in repo/.
    for (const named of ['no-such-branch', 'made-up-repo-branch']) {
      await refused(400, 'workerCutNotInTheSandbox', { clone: CLONE, cutFrom: named },
        `cutFrom "${named}" is not a branch or commit of the sandbox's clone ${clone}: git resolves it to no commit. Nothing was written.`)
    }
    // IN REPO/: a branch in neither, and a branch only the clone has, which is not looked for in the clone. The refusal
    // names the sandbox's clones, so the asker learns what to name.
    for (const named of ['no-such-branch', 'made-up-clone-branch']) {
      await refused(400, 'workerCutNotInTheSandbox', { cutFrom: named },
        `cutFrom "${named}" is not a branch or commit of the sandbox's repository ${sandbox.repo}: git resolves it to no commit. ` +
          `The sandbox's clones are ${CLONE}, linked-clone: to cut from one, name it as clone. Nothing was written.`)
    }
    // THE RUN'S OWN COMMIT, which the clone does not hold, is checked in the clone too.
    const headless = await askFor({ clone: CLONE })
    expect(headless.status, JSON.stringify(headless.body)).toBe(409)
    expect(headless.body['code']).toBe('workerCutNotInTheSandbox')
    expect(headless.body['error']).toContain(
      `Run ${asking.id} named no cutFrom, so the worker would be cut from ${sandbox.head}, the commit its worktree ${CHECKOUT} stands at, ` +
        `and git could not say whether a branch or tag of the sandbox's clone ${clone} reaches it: git exited`,
    )
    expect(theWorkerRunOf(asking.id, 'sw-cloned')).toBeUndefined()
  })

  /** A supervisor run of sw-boss working in `directory`, and its ask for sw-in-clone, which names no clone. */
  async function askedFrom(directory: string, title: string, body: Record<string, unknown> = {}) {
    const run = await aSupervisorsRun(sandbox, title, directory)
    const r = await ask('sw-in-clone', asAgent('sw-boss', run.key, run.id), { brief: sandbox.brief, ...CHOICE, ...body })
    return { run, r }
  }
  /** One pass that starts the worker run `run` asked for, one that closes its launcher, and the finish of both runs. What the launcher was given. */
  async function startedAndFinished(run: string, handle: string): Promise<string[]> {
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run, agentId: idOf(handle), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    expect((await finish(capture.filed.id)).status).toBe(200)
    expect((await finish(run)).status).toBe(200)
    return capture.argv
  }
  /**
   * The ask's sentences for a run whose commit was looked for in the clone its worktree belongs to, as the door says them
   * (src/server/lib/worker-runs.ts), each checked to name the run, its worktree, the clone and the clone's commit.
   */
  const lookedForInTheClone = async (run: string, directory: string): Promise<string> => {
    const { theCommitWasLookedForInTheClone, theWorktreeIsToBeCutFrom } = await import('../src/server/lib/worker-runs.ts')
    const where = theCommitWasLookedForInTheClone(run, directory, CLONE)
    for (const part of [run, directory, CLONE]) expect(where).toContain(part)
    const cut = theWorktreeIsToBeCutFrom({ commit: ofTheClone, named: null, clone: CLONE }, run)
    for (const part of [run, ofTheClone, CLONE]) expect(cut).toContain(part)
    return where + cut
  }

  // A RUN WORKING IN A WORKTREE OF A LISTED CLONE THAT NAMES NO CLONE has its commit looked for in that clone, as if it
  // had named it, and is cut from it there. Before, it was looked for in repo/, which does not hold it, and refused.
  // MUTATIONS: look for it in repo/ only, keep no clone on the cut, or leave out the sentence that says where the commit
  // was looked for (this case goes red).
  it('looks for the commit of a run in a worktree of a listed clone that names no clone in that clone, and gives the launcher --clone', async () => {
    const worktree = join(sandbox.folder, 'a-worktree-of-the-clone')
    sandbox.git(clone, 'worktree', 'add', '-q', '-b', 'a-worktree-of-the-clone', worktree, ofTheClone)
    const { run, r } = await askedFrom(worktree, 'A made-up supervisor run of sw-boss in a worktree of the sandbox’s clone')
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(run.id, 'sw-in-clone')?.cut).toEqual({ commit: ofTheClone, named: null, clone: CLONE })
    expect(r.body['says']).toContain(await lookedForInTheClone(run.id, worktree))
    const argv = await startedAndFinished(run.id, 'sw-in-clone')
    const at = argv.indexOf('--clone')
    expect(argv.slice(at, at + 4)).toEqual(['--clone', CLONE, '--cut-from', ofTheClone])
    const { aStartCutsTheWorktree } = await import('../src/server/lib/worker-runs.ts')
    const cutSays = theWorkerRunOf(run.id, 'sw-in-clone')?.starting?.cutSays
    expect(cutSays).toBe(aStartCutsTheWorktree(join(sandbox.folder, 'worktrees', 'sw-in-clone'), { commit: ofTheClone, named: null, clone: CLONE }, run.id))
    // The words name what the launcher was given.
    expect(cutSays).toContain(argv.slice(at, at + 4).join(' '))
  })

  // THE CLONE ITSELF is found the same way as a worktree of it. Before, the commit was looked for in repo/ and refused.
  it('looks for the commit of a run in the clone itself that names no clone in that clone', async () => {
    const { run, r } = await askedFrom(clone, 'A made-up supervisor run of sw-boss in the sandbox’s clone')
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(run.id, 'sw-in-clone')?.cut).toEqual({ commit: ofTheClone, named: null, clone: CLONE })
    expect(r.body['says']).toContain(await lookedForInTheClone(run.id, clone))
    const argv = await startedAndFinished(run.id, 'sw-in-clone')
    const at = argv.indexOf('--clone')
    expect(argv.slice(at, at + 4)).toEqual(['--clone', CLONE, '--cut-from', ofTheClone])
  })

  // A RUN IN A WORKTREE OF REPO/ is looked for in repo/, with no clone and no word of one. This case is green before
  // the change too, by design: a worktree of repo/ shares repo/'s objects, so its commit is found there either way. It
  // guards that the clones are not matched wrongly.
  it('looks for the commit of a run in a worktree of repo/ that names no clone in repo/, and names no clone', async () => {
    const worktree = join(sandbox.folder, 'a-worktree-of-repo')
    sandbox.git(sandbox.repo, 'worktree', 'add', '-q', '-b', 'a-worktree-of-repo', worktree, sandbox.head)
    const { run, r } = await askedFrom(worktree, 'A made-up supervisor run of sw-boss in a worktree of repo/')
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(run.id, 'sw-in-clone')?.cut).toEqual({ commit: sandbox.head, named: null })
    const argv = await startedAndFinished(run.id, 'sw-in-clone')
    expect(argv).not.toContain('--clone')
    const { theCommitWasLookedForInTheClone } = await import('../src/server/lib/worker-runs.ts')
    for (const name of [CLONE, 'linked-clone']) {
      expect(r.body['says']).not.toContain(theCommitWasLookedForInTheClone(run.id, worktree, name))
      expect(r.body['says']).not.toContain(name)
    }
  })

  // A RUN IN A WORKTREE OF THE CLONE THAT NAMES A CUTFROM AND NO CLONE has cutFrom looked for in repo/, as before. This
  // case is green before the change too, by design. MUTATION: look for the clone the run stands in when cutFrom is
  // named (this case goes red: "main" names the clone's own commit there).
  it('looks for a cutFrom a run in a worktree of the clone names, with no clone, in repo/', async () => {
    const worktree = join(sandbox.folder, 'a-worktree-of-the-clone')
    const { run, r } = await askedFrom(worktree, 'A made-up supervisor run of sw-boss in a worktree of the sandbox’s clone, naming a cutFrom', { cutFrom: 'main' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(run.id, 'sw-in-clone')?.cut).toEqual({ commit: sandbox.git(sandbox.repo, 'rev-parse', 'main'), named: 'main' })
    const argv = await startedAndFinished(run.id, 'sw-in-clone')
    expect(argv).not.toContain('--clone')
    const { theCommitWasLookedForInTheClone } = await import('../src/server/lib/worker-runs.ts')
    expect(r.body['says']).not.toContain(theCommitWasLookedForInTheClone(run.id, worktree, CLONE))
  })

  // A RUN OF ANOTHER REPOSITORY whose commit repo/ does not hold is refused in words naming that repository and the
  // clones the sandbox lists. MUTATION: take those words out (this case goes red).
  it('refuses a run of another repository that names no clone, when repo/ does not hold its commit, naming the clones listed', async () => {
    const elsewhere = join(realpathSync(scratch), 'a-repository-beside-the-clone-sandbox')
    sandbox.git(realpathSync(scratch), 'init', '-q', '-b', 'main', elsewhere)
    sandbox.git(elsewhere, 'commit', '--allow-empty', '-qm', 'A made-up commit of a repository that is no clone')
    const theirs = sandbox.git(elsewhere, 'rev-parse', 'HEAD')
    const { run, r } = await askedFrom(elsewhere, 'A made-up supervisor run of sw-boss in a repository that is no clone')
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['code']).toBe('workerCutNotInTheSandbox')
    const { aRunOfAnotherRepositoryIsRefused, isNotOneOfTheClones } = await import('../src/server/lib/worker-runs.ts')
    const instance = join(sandbox.folder, 'instance.json')
    expect(r.body['error']).toBe(
      aRunOfAnotherRepositoryIsRefused(run.id, theirs, elsewhere, elsewhere, isNotOneOfTheClones({ ok: true, file: instance, names: [CLONE, 'linked-clone'] }), sandbox.repo),
    )
    for (const part of [run.id, theirs, elsewhere, instance, CLONE, 'linked-clone', sandbox.repo]) expect(r.body['error']).toContain(part)
    expect(dataOf(run.id)['workerRuns']).toBeUndefined()
    expect((await finish(run.id)).status).toBe(200)
  })

  it('takes a branch of the clone, keeps the clone on the cut, and gives the launcher --clone, so the worker’s worktree is cut from the clone', async () => {
    // BY ITS ABSOLUTE PATH, KEPT BY ITS NAME: the office keeps and says what it made of the words.
    const byPath = await askFor({ clone: `${clone}/`, cutFrom: 'made-up-clone-branch' })
    expect(byPath.status, JSON.stringify(byPath.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-cloned')?.cut).toEqual({ commit: ofTheClone, named: 'made-up-clone-branch', clone: CLONE })
    const r = await askFor({ clone: CLONE, cutFrom: 'made-up-clone-branch' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-cloned')?.cut).toEqual({ commit: ofTheClone, named: 'made-up-clone-branch', clone: CLONE })
    expect(r.body['says']).toContain(
      `When the worker starts, its worktree is to be cut from ${ofTheClone}, which cutFrom "made-up-clone-branch" named, in the sandbox's clone ${CLONE}. ` +
        'If its worktree is there by then, the start fails.',
    )

    // A PASS STARTS IT, through the real command line, and the next pass closes the launcher.
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: asking.id, agentId: idOf('sw-cloned'), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    const dir = join(sandbox.folder, 'worktrees', 'sw-cloned')
    expect(theWorkerRunOf(asking.id, 'sw-cloned')).toMatchObject({
      state: 'started',
      started: { run: capture.filed.id },
      starting: {
        cutFrom: ofTheClone,
        cutSays:
          `The worker's worktree ${dir} was not there, so the launcher was given --clone ${CLONE} --cut-from ${ofTheClone} to make it at ` +
          `${ofTheClone}, which cutFrom "made-up-clone-branch" named, in the sandbox's clone ${CLONE}.`,
      },
    })
    const { argv } = capture
    const at = argv.indexOf('--clone')
    expect(argv.slice(at, at + 4)).toEqual(['--clone', CLONE, '--cut-from', ofTheClone])

    // THE LAUNCHER'S OWN WORKTREE MAKER, given what the launcher was given, cuts the worker's worktree from the clone.
    const given = (flag: string): string => argv[argv.indexOf(flag) + 1]!
    const instanceDir = join(given('--sandboxes'), argv[1]!)
    const listed = theCloneNamed(JSON.parse(readFileSync(join(instanceDir, 'instance.json'), 'utf8')) as { clones?: unknown }, given('--clone'))
    const made = theAgentsWorktree({ instanceDir, from: listed.from, branch: 'sw-cloned', value: dir, cutFrom: given('--cut-from'), cutNamed: true, clone: listed.name, git: inTheSandbox })
    expect(made.made).toContain(`git worktree add from ${clone}, cut from ${ofTheClone}`)
    expect(sandbox.git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir')).toBe(join(clone, '.git'))
    expect(sandbox.git(dir, 'rev-parse', 'HEAD')).toBe(ofTheClone)
    expect((await finish(capture.filed.id)).status).toBe(200)
  })

  /** The worker's worktree that is there before the ask, a worktree of a clone that holds only master, and the run filed for it. */
  const reused = { dir: '', stands: '', filed: '' }

  // A WORKTREE THAT IS THERE IS FILED AT THE COMMIT IT STANDS AT. A sandbox's second clone may hold only master, so the
  // name "main" resolves to nothing there. The launcher is given --cut-from the commit the worktree stands at, and no
  // --clone, as it makes no worktree. MUTATION: give a worktree that is there no cut again (this case and the next go red).
  it('gives the launcher the commit a worktree that is there stands at, and no clone, so the worker’s run is filed at that commit', async () => {
    const masterOnly = join(sandbox.folder, 'master-only-clone')
    sandbox.git(sandbox.folder, 'init', '-q', '-b', 'master', masterOnly)
    sandbox.git(masterOnly, 'commit', '--allow-empty', '-qm', 'A made-up commit of a clone that holds only master')
    reused.stands = sandbox.git(masterOnly, 'rev-parse', 'HEAD')
    reused.dir = join(sandbox.folder, 'worktrees', 'sw-reused')
    sandbox.git(masterOnly, 'worktree', 'add', '-q', '-b', 'sw-reused', reused.dir, reused.stands)
    const r = await ask('sw-reused', asAgent('sw-boss', asking.key, asking.id), { brief: sandbox.brief, ...CHOICE })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-reused')?.cut).toEqual({ commit: sandbox.head, named: null })

    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: asking.id, agentId: idOf('sw-reused'), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    reused.filed = capture.filed.id
    const { argv } = capture
    expect(argv.includes('--cut-from') ? argv.slice(argv.indexOf('--cut-from'), argv.indexOf('--cut-from') + 2) : []).toEqual(['--cut-from', reused.stands])
    expect(argv).not.toContain('--clone')
    const starting = theWorkerRunOf(asking.id, 'sw-reused')!.starting!
    const { aStartUsesAWorktreeThatIsThere } = await import('../src/server/lib/worker-runs.ts')
    expect(starting).toMatchObject({
      cutFrom: null,
      cutSays: aStartUsesAWorktreeThatIsThere({ dir: reused.dir, branch: 'sw-reused', head: reused.stands }, reused.stands, sandbox.head),
    })
    for (const part of [reused.dir, reused.stands, sandbox.head]) expect(starting.cutSays).toContain(part)
    expect(dataOf(reused.filed)['cutFrom']).toBe(reused.stands)
    expect(dataOf(reused.filed)['cutAsked']).toMatchObject({ commit: sandbox.head, named: null, used: false })
  })

  // THE CHECK AND THE SEAL READ THE RUN'S BASE from its cutFrom, in the worker's worktree (src/server/lib/check-tip.ts and
  // src/server/lib/sealed-tip.ts). Filed at "main", which the clone does not hold, both would read another base.
  it('has the check and the seal read the commit a reused worktree stood at as the base of the worker’s run', async () => {
    // check-tip.ts and sealed-tip.ts reach the database, so they are imported here, after freshDb(), and not at the top.
    const { A_RECORDED_COMMIT_SAYS, recordedCutFrom } = await import('../src/server/lib/check-tip.ts')
    const { theBaseASealReadsOff } = await import('../src/server/lib/sealed-tip.ts')
    const cutFrom = String(dataOf(reused.filed)['cutFrom'])
    expect(recordedCutFrom(reused.dir, cutFrom)).toEqual({ branch: reused.stands, says: A_RECORDED_COMMIT_SAYS })
    expect(theBaseASealReadsOff(reused.dir, cutFrom)(reused.stands)).toEqual({ branch: reused.stands, says: A_RECORDED_COMMIT_SAYS })
    expect((await finish(reused.filed)).status).toBe(200)
  })

  it('gives the sandbox launcher --clone after --worktree and before --cut-from, and the round command none', () => {
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const common = {
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'sw-clone-sandbox', sandboxes: dirname(sandbox.folder), handle: 'sw-cloned', brief: sandbox.brief,
    }
    const worktree = join(sandbox.folder, 'worktrees', 'sw-cloned')
    const exec = real.commandFor({ ...common, verb: 'exec', parent: asking.id, model: 'deepseek-v4.1-flash', runtime: 'dsh', worktree, clone: CLONE, cutFrom: ofTheClone })
    const at = exec.args.indexOf('--worktree')
    expect(exec.args.slice(at, at + 6)).toEqual(['--worktree', worktree, '--clone', CLONE, '--cut-from', ofTheClone])
    expect(() => real.commandFor({ ...common, model: A_CAST_MODEL, runtime: 'claude-code', clone: CLONE })).toThrow("The sandbox launcher's round command takes no --clone.")
  })
})

describe('16. the paths a worker names: the ask keeps them, and the start gives them to the launcher as --with-path', () => {
  const CHOICE = { runtime: 'claude-code', model: A_CAST_MODEL }
  const PATHS = ['design', 'docs/big']
  let sandbox: ASandbox
  let asking = { id: '', key: '' }
  const askFor = (body: Record<string, unknown>) => ask('sw-pathed', asAgent('sw-boss', asking.key, asking.id), { brief: sandbox.brief, ...CHOICE, ...body })

  beforeAll(async () => {
    await started('sw-pathed', asOne('sw-boss'))
    sandbox = aSandbox('sw-paths-sandbox')
    asking = await aSupervisorsRun(sandbox, 'A made-up supervisor run of sw-boss whose worker names paths')
  })

  it('refuses a path that is not plain and a path named twice, in words, and writes nothing', async () => {
    for (const [paths, says] of [
      [['design/../docs'], 'paths names "design/../docs", which is not a plain path: it has the part ".."'],
      [['/design'], 'paths names "/design", which is not a plain path: it begins with "/"'],
      [['de*sign'], 'paths names "de*sign", which is not a plain path: it has the character "*"'],
      [['design', 'design'], 'paths names design twice'],
    ] as const) {
      const r = await askFor({ paths })
      expect(r.status, JSON.stringify(r.body)).toBe(400)
      expect(String(r.body['error'])).toContain(says)
      expect(String(r.body['error'])).toMatch(/ Nothing was written\.$/)
      expect(theWorkerRunOf(asking.id, 'sw-pathed')).toBeUndefined()
    }
  })

  it('keeps the paths on the ask, says them, and gives the launcher --with-path for each after --cut-from', async () => {
    const r = await askFor({ paths: PATHS })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-pathed')?.paths).toEqual(PATHS)
    expect(r.body['says']).toContain(
      'The ask names the paths design, docs/big. The launcher is given each as --with-path, so it is checked out in the ' +
        "worker's worktree even if the sandbox's template leaves it out. The launcher refuses a path the template does not " +
        'leave out, and then the start fails.',
    )

    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: asking.id, agentId: idOf('sw-pathed'), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    const commit = theWorkerRunOf(asking.id, 'sw-pathed')?.cut?.commit ?? ''
    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    const at = capture.argv.indexOf('--cut-from')
    expect(capture.argv.slice(at, at + 6)).toEqual(['--cut-from', commit, '--with-path', 'design', '--with-path', 'docs/big'])
    expect((await finish(capture.filed.id)).status).toBe(200)
  })

  it('an ask with no paths keeps none, and the launcher is given no --with-path', async () => {
    await started('sw-unpathed', asOne('sw-boss'))
    const r = await ask('sw-unpathed', asAgent('sw-boss', asking.key, asking.id), { brief: sandbox.brief, ...CHOICE })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-unpathed')).not.toHaveProperty('paths')
    expect(r.body['says']).not.toContain('--with-path')
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: asking.id, agentId: idOf('sw-unpathed'), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    expect(capture.argv).not.toContain('--with-path')
    expect((await finish(capture.filed.id)).status).toBe(200)
  })

  it('gives the sandbox launcher --with-path for each path after --cut-from, for worker and exec, and the round command none', () => {
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const common = {
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'sw-paths-sandbox', sandboxes: dirname(sandbox.folder), handle: 'sw-pathed', brief: sandbox.brief,
    }
    const worktree = join(sandbox.folder, 'worktrees', 'sw-pathed')
    const named = ['--with-path', 'design', '--with-path', 'docs/big']
    const worker = real.commandFor({ ...common, verb: 'worker', parent: asking.id, model: A_CAST_MODEL, runtime: 'claude-code', cutFrom: sandbox.head, paths: PATHS })
    const w = worker.args.indexOf('--cut-from')
    expect(worker.args.slice(w, w + 6)).toEqual(['--cut-from', sandbox.head, ...named])
    const exec = real.commandFor({
      ...common, verb: 'exec', parent: asking.id, model: 'deepseek-v4.1-flash', runtime: 'opencode', worktree, paths: PATHS, command: ['opencode', 'run', 'a made-up brief'],
    })
    const e = exec.args.indexOf('--worktree')
    expect(exec.args.slice(e, e + 6)).toEqual(['--worktree', worktree, ...named])
    expect(exec.args.indexOf('--with-path')).toBeLessThan(exec.args.indexOf('--'))
    for (const paths of [undefined, []]) {
      const none = real.commandFor({ ...common, verb: 'worker', parent: asking.id, model: A_CAST_MODEL, runtime: 'claude-code', ...(paths === undefined ? {} : { paths }) })
      expect(none.args).not.toContain('--with-path')
    }
    expect(() => real.commandFor({ ...common, model: A_CAST_MODEL, runtime: 'claude-code', follows: 'a-run', paths: PATHS })).toThrow("The sandbox launcher's round command takes no --with-path.")
  })
})

describe('17. the images a codex worker is given: the ask keeps them, the start gives them as --image, and the worker’s run keeps them', () => {
  /** The codex row of section 12 casts this choice. */
  const CHOICE = { runtime: 'codex', model: A_ROLLED_CODEX_MODEL }
  /** Two files the commit this checkout stands at holds, so the made-up sandbox's `main` holds them too. */
  const IMAGES = ['assets/architecture/general-en.png', 'assets/architecture/flow-en.png']
  /** The door's words. worker-runs.ts reaches the database, so it is imported in beforeAll, after freshDb(), and not at the top. */
  let door: typeof import('../src/server/lib/worker-runs.ts')
  let sandbox: ASandbox
  let asking = { id: '', key: '' }
  const askFor = (handle: string, body: Record<string, unknown>) => ask(handle, asAgent('sw-boss', asking.key, asking.id), { brief: sandbox.brief, ...CHOICE, ...body })
  const worktreeOf = (handle: string): string => join(sandbox.folder, 'worktrees', handle)
  /** One pass that starts the one worker run asked for, and one that closes its launcher. What the launcher was given and filed. */
  async function startedByAPass(handle: string): Promise<{ argv: string[]; filed: string }> {
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.workers?.started[0]?.wrapper ?? ''
    expect(first.workers?.started).toEqual([{ run: asking.id, agentId: idOf(handle), wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const capture = theCaptureOf<{ argv: string[]; filed: { ok: boolean; id: string } }>(wrapper)
    expect(capture.filed.ok, JSON.stringify(capture.filed)).toBe(true)
    return { argv: capture.argv, filed: capture.filed.id }
  }
  async function refused(handle: string, body: Record<string, unknown>, says: string, ...andSays: string[]): Promise<void> {
    const r = await askFor(handle, body)
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    for (const part of [says, ...andSays]) expect(String(r.body['error'])).toContain(part)
    expect(String(r.body['error'])).toMatch(/ Nothing was written\.$/)
    expect(theWorkerRunOf(asking.id, handle)).toBeUndefined()
  }

  beforeAll(async () => {
    door = await import('../src/server/lib/worker-runs.ts')
    for (const handle of ['sw-imaged', 'sw-imaged-there', 'sw-imaged-gone']) await started(handle, asOne('sw-boss'))
    sandbox = aSandbox('sw-images-sandbox')
    asking = await aSupervisorsRun(sandbox, 'A made-up supervisor run of sw-boss whose codex worker is given images')
  })

  it('refuses an image that is not plain, has a comma, is named twice, or is not a file of the cut, and images for another runtime', async () => {
    const cut = sandbox.head
    for (const images of [
      ['assets/architecture/general-en.png,assets/architecture/flow-en.png'],
      ['assets/../assets/architecture/general-en.png'],
      ['/assets/architecture/general-en.png'],
      ['assets/architecture/general-en.png', 'assets/architecture/general-en.png'],
    ]) {
      const says = whyNotPlainPaths(images, 'images')
      expect(says, JSON.stringify(images)).not.toBeNull()
      await refused('sw-imaged', { images }, says!, `. ${door.AN_IMAGE_IS} Nothing was written.`)
    }
    const inTheCut = door.theCommitOfTheCut(cut)
    await refused('sw-imaged', { images: ['assets/no-such-picture.png'] }, door.imagesNotInTheCommit('assets/no-such-picture.png', inTheCut, NOTHING_IS_THERE))
    await refused('sw-imaged', { images: ['assets'] }, door.imagesNotInTheCommit('assets', inTheCut, IT_IS_NOT_A_FILE))
    await refused('sw-imaged', { images: ['tools/kit/mark-read.sh'] }, door.imagesNotInTheCommit('tools/kit/mark-read.sh', inTheCut, IT_IS_A_LINK))
    await refused('sw-imaged', { images: IMAGES, runtime: 'claude-code', model: A_CAST_MODEL }, door.imagesAreOnlyForCodex('claude-code'))
  })

  it('keeps the images on the ask, says them, gives the launcher --image for each, and the worker’s run keeps imagesGiven', async () => {
    const r = await askFor('sw-imaged', { images: IMAGES })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(asking.id, 'sw-imaged')?.images).toEqual(IMAGES)
    expect(r.body['says']).toContain(door.whatTheAskSaysOfItsImages(IMAGES, false))
    const { argv, filed } = await startedByAPass('sw-imaged')
    const at = argv.indexOf('--cut-from')
    expect(argv.slice(at, at + 6)).toEqual(['--cut-from', sandbox.head, '--image', IMAGES[0], '--image', IMAGES[1]])
    const worktree = worktreeOf('sw-imaged')
    const given = { images: IMAGES, worktree, says: door.theImagesGivenSay(IMAGES, worktree) }
    expect(dataOf(filed)['imagesGiven']).toEqual(given)

    // ONLY THE OFFICE WRITES IT: an ordinary patch and an ordinary create are refused, whoever writes them.
    for (const headers of [AS_THE_PERSON, asOne('sw-quill'), asAgent('sw-boss', asking.key, asking.id)]) {
      const patched = await call('PATCH', `/api/records/${filed}`, headers, { dataPatch: { imagesGiven: { ...given, images: [IMAGES[0]] } } })
      expect(patched.status, JSON.stringify(patched.body)).toBe(403)
      expect(patched.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN)
    }
    const dropped = await call('PATCH', `/api/records/${filed}`, AS_THE_PERSON, { data: { ...dataOf(filed), imagesGiven: undefined } })
    expect(dropped.status, JSON.stringify(dropped.body)).toBe(403)
    expect(dropped.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN)
    const created = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'A made-up run with images given', data: { state: 'running', imagesGiven: given } })
    expect(created.status, JSON.stringify(created.body)).toBe(403)
    expect(created.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN)
    expect(dataOf(filed)['imagesGiven']).toEqual(given)
    expect((await finish(filed)).status).toBe(200)
  })

  it('reads a worktree that is there on disk, and an image under the ask’s paths in the commit it stands at', async () => {
    const dir = worktreeOf('sw-imaged-there')
    sandbox.git(sandbox.repo, 'worktree', 'add', '--no-checkout', '-q', '--detach', dir, sandbox.head)
    mkdirSync(join(dir, 'design', 'shots'), { recursive: true })
    writeFileSync(join(dir, 'design', 'the-page-now.png'), 'a made-up picture')
    symlinkSync('the-page-now.png', join(dir, 'design', 'a-link.png'))
    const outside = join(realpathSync(scratch), 'outside-the-images-worktree')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'a-picture.png'), 'a made-up picture outside')
    symlinkSync(outside, join(dir, 'elsewhere'))
    await refused('sw-imaged-there', { images: ['design/a-link.png'] }, door.imagesNotInTheWorktree('design/a-link.png', dir, IT_IS_A_LINK))
    await refused('sw-imaged-there', { images: ['design/shots'] }, door.imagesNotInTheWorktree('design/shots', dir, IT_IS_NOT_A_FILE))
    await refused(
      'sw-imaged-there', { images: ['elsewhere/a-picture.png'] },
      door.imagesNotInTheWorktree('elsewhere/a-picture.png', dir, itsRealPathIsOutside(join(outside, 'a-picture.png'))),
    )
    // NOT ON DISK: refused, unless one of the ask's paths brings it back, and then the commit the worktree stands at must hold it.
    await refused('sw-imaged-there', { images: [IMAGES[0]] }, door.imagesNotInTheWorktree(IMAGES[0]!, dir, NOTHING_IS_THERE))
    await refused(
      'sw-imaged-there', { images: ['assets/no-such-picture.png'], paths: ['assets'] },
      door.imagesNotInTheCommit('assets/no-such-picture.png', door.theCommitTheWorktreeStandsAt(sandbox.head, dir), NOTHING_IS_THERE),
    )
    const images = ['design/the-page-now.png', IMAGES[0]!]
    const r = await askFor('sw-imaged-there', { images, paths: ['assets'] })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['says']).toContain(door.whatTheAskSaysOfItsImages(images, true))
    const { argv, filed } = await startedByAPass('sw-imaged-there')
    expect(argv.slice(argv.indexOf('--cut-from'), argv.indexOf('--cut-from') + 2)).toEqual(['--cut-from', sandbox.head])
    const at = argv.indexOf('--with-path')
    expect(argv.slice(at, at + 6)).toEqual(['--with-path', 'assets', '--image', images[0], '--image', images[1]])
    expect(dataOf(filed)['imagesGiven']).toMatchObject({ images, worktree: dir })
    expect((await finish(filed)).status).toBe(200)
  })

  it('fails the start when an image is no longer a file where the worktree stands, and tells the supervisor', async () => {
    expect((await askFor('sw-imaged-gone', { images: IMAGES })).status).toBe(202)
    const dir = worktreeOf('sw-imaged-gone')
    sandbox.git(sandbox.repo, 'worktree', 'add', '--no-checkout', '-q', '--detach', dir, sandbox.head)
    const launcher = await aLauncherRun(asking.id, idOf('sw-imaged-gone'))
    const r = await call('POST', `/api/worker/worker-runs/${asking.id}/starting`, AS_THE_WORKER(), { agent: idOf('sw-imaged-gone'), wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const says = door.imagesNotInTheWorktree(IMAGES[0]!, dir, NOTHING_IS_THERE)
    expect(r.body['error']).toContain(says)
    expect(theWorkerRunOf(asking.id, 'sw-imaged-gone')).toMatchObject({ state: 'failed', failed: { says } })
    expect(linesToTheSupervisorAbout(asking.id)).toContain(`The worker run of sw-imaged-gone under run ${asking.id} did not start. ${says}`)
  })

  it('gives the sandbox launcher --image for each image after the paths, for worker only', () => {
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const common = {
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'sw-images-sandbox', sandboxes: dirname(sandbox.folder), handle: 'sw-imaged', brief: sandbox.brief,
    }
    const model = `openai/${A_ROLLED_CODEX_MODEL}`
    const worker = real.commandFor({ ...common, verb: 'worker', parent: asking.id, model, runtime: 'codex', cutFrom: sandbox.head, paths: ['design'], images: IMAGES })
    const w = worker.args.indexOf('--cut-from')
    expect(worker.args.slice(w, w + 8)).toEqual(['--cut-from', sandbox.head, '--with-path', 'design', '--image', IMAGES[0], '--image', IMAGES[1]])
    for (const images of [undefined, []]) {
      const none = real.commandFor({ ...common, verb: 'worker', parent: asking.id, model, runtime: 'codex', ...(images === undefined ? {} : { images }) })
      expect(none.args).not.toContain('--image')
    }
    expect(() => real.commandFor({
      ...common, verb: 'exec', parent: asking.id, model: 'deepseek-v4.1-flash', runtime: 'opencode', worktree: worktreeOf('sw-imaged'), images: IMAGES,
      command: ['opencode', 'run', 'a made-up brief'],
    })).toThrow(theCommandTakesNoImage('exec'))
    expect(() => real.commandFor({ ...common, model: A_CAST_MODEL, runtime: 'claude-code', follows: 'a-run', images: IMAGES })).toThrow(theCommandTakesNoImage('round'))
  })
})
