// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A CHECK POSTS ITS VERDICT AFTER THE WORKER'S FOLDER HAS MOVED ON TO THE NEXT ROUND.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A git seal names a commit, and the folder the run worked in. Just before the inspector posts its
 * verdict, it reads the run's current seal again (`theSealIsStillTheOneRead` in
 * tools/the-inspector.mjs), and the verdict door reads it too. Both read the seal in the folder: HEAD
 * must still be the sealed commit, and every sealed file on disk must hash as sealed. A check takes
 * minutes. In that time the next round can start in the same folder, on a new branch, and change a
 * sealed file. Then the read before the verdict answered 409, the tool posted nothing, and a finished
 * check was thrown away, although the sealed commit had not changed at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HOLDS NOW
 * ---------------------------------------------------------------------------------------
 *
 * The read before the verdict sends `SEAL_READ_HEADER`, and it and the verdict door read a git seal
 * from its sealed commit in the repository the seal names. Neither reads the folder. The read a check
 * starts with does not send the header and still reads the folder, and so does every other reading;
 * tests/sealed-submission.test.ts holds that, and the first case here shows it once more. Read from
 * its commit, a seal is still refused when the repository no longer holds the sealed commit, and when
 * git's objects for that commit no longer hold the sealed files: the last cases here.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE FOLDER IS MOVED, AND WHY THIS IS A FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The real tool runs against the real server on a port of its own, as in
 * tests/a-whole-check-reaches-its-verdict.test.ts, and only `claude` is a stand-in. The folder is
 * moved by the server itself, in an `onSend` hook, as it answers `POST /api/checks/<run>/assembled`.
 * That is after the check's first reads, which read the folder and pass, and before the tool
 * photographs the worker's folder for criterion C22, so the move is not seen as the inspector's work.
 * The check's own worktree was cut at the sealed commit before then, so the check reads the sealed
 * work. The hook has to be put on the server before it starts, which is why this is not a case in
 * that file, and tests/sealed-submission.test.ts runs no tool.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED. Control run first, on the code before the change.
 * ---------------------------------------------------------------------------------------
 *
 *   - On the code before the change, the three moves go red. The tool says "Run <id>'s current seal
 *     could not be read before the verdict: HTTP 409", and posts nothing. The folder's words are
 *     "Sealed file work/the-work.txt differs from seal" for the first move, "The tip moved after seal"
 *     for the second, and "The tip cannot be sealed while files are outside its commit" for the third.
 *     The refusals read from the commit go red too, because the header is not read and the folder is.
 *   - Take the read from the commit out of `verifyRunSeal`, so that the header reads the folder again,
 *     and the same cases go red for the same reasons.
 *
 * ---------------------------------------------------------------------------------------
 * A VERDICT THE DOOR REFUSED FOR ANOTHER REASON (wave 13u round 72)
 * ---------------------------------------------------------------------------------------
 *
 * When the door refuses a verdict, the tool reads the run again to find the worker and tell it. That read did not send
 * the header, so on a moved folder it was refused 409, and the tool said "the check of this run names no agent it
 * serves" and told nobody. Now it sends the header, and when the read fails anyway it says so and with what status.
 * The second hook moment, as the door refuses the verdict, is for that last case. On the code before the change, both
 * cases go red on "names no agent it serves".
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { FROM_ITS_COMMIT, SEAL_READ_HEADER } from '../src/config/seal-read-header.mjs'
import { aMadeUpCheckSession, theInspectorsRowNames } from './inspector-tool-fixture.ts'
import { theInvariantsTheRulesList } from '../src/server/lib/invariants.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})
const AS_THE_SECRETARY = asAgent(THE_TEST_OFFICES_SECRETARY.handle)
const FROM_THE_COMMIT = { ...AS_THE_SECRETARY, [SEAL_READ_HEADER]: FROM_ITS_COMMIT }

let t: TestDb
let app: FastifyInstance
let api = ''
let bin = ''
/** Where the tool cuts its check worktrees, as tests/a-whole-check-reaches-its-verdict.test.ts says why. */
let worktrees = ''
let inspectorId = ''
const checkouts: string[] = []

/**
 * WHAT THE SERVER DOES TO THE WORKER'S FOLDER AS IT ANSWERS THE ASSEMBLY OF ONE RUN, or as its verdict door refuses
 * that run's verdict, or null. Taken once, so the move happens once.
 */
let theNextRound: { run: string; after: 'the assembly' | 'a refused verdict'; moves: () => void } | null = null

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

function git(checkout: string, ...argv: string[]): string {
  return execFileSync('git', argv, { cwd: checkout, encoding: 'utf8' }).trim()
}

/** A repository of its own, with the work on branch `the-work`, cut from `main`. */
function aCheckout(): string {
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-moved-folder-'))
  checkouts.push(checkout)
  git(checkout, 'init', '-q', '-b', 'main')
  git(checkout, 'config', 'user.email', 'a-test@example.invalid')
  git(checkout, 'config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\n')
  git(checkout, 'add', '-A')
  git(checkout, 'commit', '-q', '-m', 'Before the work')
  git(checkout, 'checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\nAnd what the worker built.\n')
  git(checkout, 'commit', '-qam', 'The work under check')
  return checkout
}

/** A worker of its own, and a finished run it filed for itself, which the office seals as it is filed. */
let workers = 0
async function aWorkerWithAFinishedRun(title: string, checkout: string): Promise<{ run: string; sealed: string; handle: string; worker: string }> {
  workers += 1
  const handle = `the-worker-${String(workers)}`
  const worker = await register(AS_THE_SECRETARY, { handle, name: `The Worker ${String(workers)}`, role: 'worker', workArea: ['work'] })
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: checkout, doing: 'the work under check', cutFrom: 'main' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const run = (reply.json() as { record: { id: string } }).record.id
  const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: AS_THE_SECRETARY })
  expect(read.statusCode, read.body).toBe(200)
  const sealed = (read.json() as { submission: { seal: { git?: { commit: string } } } | null }).submission?.seal.git?.commit
  expect(sealed, 'the finished run was not given a git seal').toBe(git(checkout, 'rev-parse', 'HEAD'))
  return { run, sealed: sealed!, handle, worker }
}

function standInClaude(body: string): void {
  const file = join(bin, 'claude')
  writeFileSync(file, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\n${body}\n`)
  chmodSync(file, 0o755)
}

function printsARelease(): string {
  const answer = { verdict: 'released', traced: syntheticTrace(t, ['work/the-work.txt']), check: 'Read the brief, the chapters and the changes. Nothing is missing.', chaptersRead: [] }
  const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
  return `cat >/dev/null; printf '%s' '${envelope}'`
}

/**
 * A refusal the verdict door refuses for a reason that is not the seal: it rests on an invariant USER.md does not list.
 * The number is read from USER.md, one past the last it lists.
 */
function printsARefusalOnAnInvariantNotListed(): { body: string; invariant: number } {
  const invariant = Math.max(...(theInvariantsTheRulesList().listed ?? []).map((one) => one.number)) + 1
  const answer = { verdict: 'refused', check: 'Read the brief and the changes.', missing: [{ what: 'a case the change needs', kind: 'data' }], says: { invariant }, chaptersRead: [] }
  const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
  return { body: `cat >/dev/null; printf '%s' '${envelope}'`, invariant }
}

/** The one message with this title, as its body and whom it went to, or undefined because there is none. */
async function theMessageTitled(title: string): Promise<{ body: string; to: { kind: string; id: string }[] } | undefined> {
  const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: AS_THE_SECRETARY })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { records: { title: string; data: Record<string, unknown> }[] }).records.filter((one) => one.title === title)
  expect(found.length, `messages titled "${title}"`).toBeLessThanOrEqual(1)
  const one = found[0]
  return one === undefined ? undefined : { body: String(one.data['body'] ?? ''), to: (one.data['to'] ?? []) as { kind: string; id: string }[] }
}

function inspect(run: string, checkout: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host.
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--model', 'none', '--on-the-host', '--check', aMadeUpCheckSession()],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_CHECK_WORKTREES: worktrees, PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  giveFixtureSeats(app)
  app.addHook('onSend', async (request, reply, payload) => {
    const now = theNextRound
    const at = now === null ? null : now.after === 'the assembly' ? { url: `/api/checks/${now.run}/assembled`, status: 201 } : { url: `/api/checks/${now.run}`, status: 400 }
    if (now !== null && at !== null && request.method === 'POST' && request.url === at.url && reply.statusCode === at.status) {
      theNextRound = null
      now.moves()
    }
    return payload
  })
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))
  worktrees = mkdtempSync(join(tmpdir(), 'mole-office-check-worktrees-'))
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  inspectorId = await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names the model --model names below, none, with native
  // data, so the check starts from the row's selection and not from the compatibility list, which names no such model.
  await theInspectorsRowNames(app, 'none', AS_THE_PERSON)
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const checkout of checkouts) rmSync(checkout, { recursive: true, force: true })
  rmSync(worktrees, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

describe('a check whose worker folder moved on while it ran', () => {
  it.each([
    {
      move: 'to a new branch at the sealed commit, with a sealed file changed and not committed',
      moves: (checkout: string) => {
        git(checkout, 'switch', '-q', '-c', 'the-next-round')
        writeFileSync(join(checkout, 'work', 'the-work.txt'), 'The next round began here.\n')
      },
      theFolderSays: 'Sealed file work/the-work.txt differs from seal',
    },
    {
      move: 'to a new branch from main, with a sealed file changed and committed',
      moves: (checkout: string) => {
        git(checkout, 'switch', '-q', '-c', 'the-next-round', 'main')
        writeFileSync(join(checkout, 'work', 'the-work.txt'), 'The next round began here.\n')
        git(checkout, 'commit', '-qam', 'The next round')
      },
      theFolderSays: 'The tip moved after seal',
    },
    {
      // THE MORNING THE PROBLEM WAS FOUND: the next round changed a test file, and the read answered this.
      move: 'to a new branch at the sealed commit, with a file the seal does not hold added',
      moves: (checkout: string) => {
        git(checkout, 'switch', '-q', '-c', 'the-next-round')
        mkdirSync(join(checkout, 'tests'), { recursive: true })
        writeFileSync(join(checkout, 'tests', 'the-next-round.test.ts'), '// The next round began here.\n')
      },
      theFolderSays: 'The tip cannot be sealed while files are outside its commit',
    },
  ])('posts its verdict when the folder moved $move', async ({ moves, theFolderSays }) => {
    const checkout = aCheckout()
    const { run, sealed } = await aWorkerWithAFinishedRun('A run whose folder moved on during its check', checkout)
    theNextRound = { run, after: 'the assembly', moves: () => moves(checkout) }
    standInClaude(printsARelease())
    const ran = await inspect(run, checkout)

    // THE REFUSAL THIS FILE EXISTS FOR would land here, in the tool's own error channel.
    expect(ran.err).not.toContain('could not be read before the verdict')
    expect(ran.code, ran.err).toBe(0)
    expect(theNextRound, 'the server never moved the folder, so this case tested nothing').toBe(null)
    expect(ran.out).toContain('The check answered: released.')

    // THE FOLDER REALLY MOVED, and a reading without the header still reads it and refuses.
    const inTheFolder = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: AS_THE_SECRETARY })
    expect(inTheFolder.statusCode, inTheFolder.body).toBe(409)
    expect(inTheFolder.body).toContain(theFolderSays)

    // READ FROM THE COMMIT, the run is released by the inspector, on the sealed commit, and the reading says how it read.
    const fromTheCommit = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: FROM_THE_COMMIT })
    expect(fromTheCommit.statusCode, fromTheCommit.body).toBe(200)
    const said = fromTheCommit.json() as {
      submission: { seal: { git: { commit: string } }; readFrom?: string }
      stands: { released: { by: { id: string }; read: { tip: string | null; ofItsOwn: boolean } | null } | null; unreleasedFinish: boolean }
    }
    expect(said.submission.seal.git.commit).toBe(sealed)
    expect(said.submission.readFrom).toContain(`was read from commit ${sealed}`)
    expect(said.submission.readFrom).toContain('the run\'s worktree was not read')
    expect(said.stands.unreleasedFinish).toBe(false)
    expect(said.stands.released?.by.id).toBe(inspectorId)
    expect(said.stands.released?.read?.tip).toBe(sealed)
    expect(said.stands.released?.read?.ofItsOwn).toBe(true)
  })

  // A VERDICT THE DOOR REFUSES FOR ANOTHER REASON still reaches the worker when the folder moved on (wave 13u round 72).
  // The tool reads the run again to find whom to tell (`theRefusedVerdictIsDelivered`). Without the header that read is
  // refused 409 on a moved folder, and the tool said, falsely, that the check names no agent it serves.
  it('tells the worker of a verdict the door refused for another reason, with the door\'s words, after the folder moved on', async () => {
    const checkout = aCheckout()
    const { run, handle, worker } = await aWorkerWithAFinishedRun('A run whose refused verdict is told after its folder moved on', checkout)
    theNextRound = {
      run,
      after: 'the assembly',
      moves: () => {
        git(checkout, 'switch', '-q', '-c', 'the-next-round', 'main')
        writeFileSync(join(checkout, 'work', 'the-work.txt'), 'The next round began here.\n')
        git(checkout, 'commit', '-qam', 'The next round')
      },
    }
    const refusal = printsARefusalOnAnInvariantNotListed()
    standInClaude(refusal.body)
    const ran = await inspect(run, checkout)

    expect(theNextRound, 'the server never moved the folder, so this case tested nothing').toBe(null)
    expect(ran.code).not.toBe(0)
    expect(ran.err).toContain('answered 400')
    expect(ran.out).not.toContain('names no agent it serves')
    const told = await theMessageTitled(`The check's verdict was not recorded: ${handle}`)
    expect(told, `no message reached the worker; the tool said: ${ran.out}`).toBeDefined()
    expect(told?.to).toEqual([{ kind: 'agent', id: worker }])
    expect(told?.body).toContain(`What the door said, word for word: Invariant ${String(refusal.invariant)} is not one USER.md lists.`)
    expect(told?.body).toContain("Where the run is left, in the office's words: ")
    expect(told?.body).not.toContain('Where the run stands could not be read')
    expect(ran.out).toContain('The refused verdict was sent on.')
  })

  // AND WHEN THAT READ FAILS ANYWAY, the tool says it failed and with what status. Here git's objects stop holding the
  // sealed file as the door refuses the verdict, so the read from the commit is refused too.
  it('says the read failed, and its status, when the run cannot be read again after the door refused its verdict', async () => {
    const checkout = aCheckout()
    const { run } = await aWorkerWithAFinishedRun('A run that cannot be read again after its verdict was refused', checkout)
    theNextRound = {
      run,
      after: 'a refused verdict',
      moves: () => {
        const blob = git(checkout, 'rev-parse', 'HEAD:work/the-work.txt')
        const loose = join(checkout, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
        const other = Buffer.from('not what was sealed\n')
        chmodSync(loose, 0o644)
        writeFileSync(loose, deflateSync(Buffer.concat([Buffer.from(`blob ${String(other.length)}\0`), other])))
      },
    }
    standInClaude(printsARefusalOnAnInvariantNotListed().body)
    const ran = await inspect(run, checkout)

    expect(theNextRound, 'the door never refused the verdict, so this case tested nothing').toBe(null)
    expect(ran.code).not.toBe(0)
    expect(ran.out).not.toContain('names no agent it serves')
    expect(ran.out).toContain(`The refused verdict could not be sent on: run ${run} could not be read again to find whom to tell (HTTP 409`)
  })

  it('refuses, read from the commit, a repository that no longer holds the sealed commit', async () => {
    const checkout = aCheckout()
    const { run, sealed } = await aWorkerWithAFinishedRun('A run whose sealed commit was pruned', checkout)
    git(checkout, 'switch', '-q', '-c', 'the-next-round', 'main')
    git(checkout, 'branch', '-q', '-D', 'the-work')
    git(checkout, 'reflog', 'expire', '--expire=now', '--all')
    git(checkout, 'gc', '-q', '--prune=now')
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: FROM_THE_COMMIT })
    expect(read.statusCode, read.body).toBe(409)
    expect(read.body).toContain(`does not hold its sealed commit ${sealed}`)
  })

  // Git does not check an object's bytes against its name when it reads it, so a loose object that holds other bytes
  // is the way a sealed commit's files can read differently while its id stays the same, as in
  // tests/sealed-submission.test.ts.
  it('refuses, read from the commit, a sealed commit whose sealed file git now reads with other bytes', async () => {
    const checkout = aCheckout()
    const { run } = await aWorkerWithAFinishedRun('A run whose sealed blob reads other bytes', checkout)
    const blob = git(checkout, 'rev-parse', 'HEAD:work/the-work.txt')
    const loose = join(checkout, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
    const other = Buffer.from('not what was sealed\n')
    chmodSync(loose, 0o644)
    writeFileSync(loose, deflateSync(Buffer.concat([Buffer.from(`blob ${String(other.length)}\0`), other])))
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: FROM_THE_COMMIT })
    expect(read.statusCode, read.body).toBe(409)
    expect(read.body).toContain('are not the seal\'s')
  })

  it('refuses a value of the header it does not take, rather than reading the seal either way', async () => {
    const checkout = aCheckout()
    const { run } = await aWorkerWithAFinishedRun('A run read with a header it does not take', checkout)
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: { ...AS_THE_SECRETARY, [SEAL_READ_HEADER]: 'yes' } })
    expect(read.statusCode, read.body).toBe(400)
    expect(read.body).toContain(`${SEAL_READ_HEADER} header takes one value, ${FROM_ITS_COMMIT}`)
  })
})
