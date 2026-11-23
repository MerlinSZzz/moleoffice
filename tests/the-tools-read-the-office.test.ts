// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C9, THE LAST CLAUSE: the sweep and the listeners tool read the office as the one list.
 *
 * `design/messages/ACCEPTANCE.md` section 8: *the listeners and stray tools read the office as the
 * one list.*
 *
 * ---------------------------------------------------------------------------------------
 * TWO TOOLS, TWO SOURCES, AND THE DIFFERENCE IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * `tools/listeners.mjs` asks a running Mole Office, because that is the whole of its design: it
 * holds no second reading of what a Mole Office process looks like, and with nothing answering it
 * says so and stops. So it reads the office through `GET /api/office/worlds`.
 *
 * `tools/stray-servers.mjs` reads the machine and asks no server, because that is what makes it
 * useful when nothing is answering. So it reads the MIRROR, which is the office written down for
 * exactly that reader — and is the first thing in this product that needed the mirror at all.
 *
 * Both are run for real. The listeners tool needs a Mole Office to ask, so this file starts one of
 * its own on a free port against a throwaway database, and stops it by the group id it wrote down.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MIRROR_FILE } from '../src/shared/worlds.ts'
import { apiServerArguments, TEST_DATABASE_PREFIX } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SWEEPER = join(REPO, 'tools', 'stray-servers.mjs')
const LISTENERS = join(REPO, 'tools', 'listeners.mjs')
const CLOSER = join(REPO, 'tools', 'close-worlds-nobody-serves.mjs')

const dirs: string[] = []

/** A port nothing is listening on, taken by opening a socket and giving it straight back. */
function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      if (at === null || typeof at === 'string') {
        probe.close(() => {
          fail(new Error('the probe socket reported no port'))
        })
        return
      }
      const chosen = at.port
      probe.close(() => {
        ok(chosen)
      })
    })
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Run the sweep with its database pointed at a directory this test owns. */
function sweep(env: Record<string, string>): string {
  const run = spawnSync(process.execPath, [SWEEPER, `--database-prefix=${TEST_DATABASE_PREFIX}`], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  })
  return `${run.stdout}${run.stderr}`
}

describe('the sweep reads the office out of the mirror', () => {
  it('names every world the office says is open, with what it is and where it answers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-sweep-mirror-'))
    dirs.push(dir)
    const database = join(dir, 'panelx.db')
    writeFileSync(
      join(dirname(database), MIRROR_FILE),
      JSON.stringify({
        writtenAt: '2026-09-04 12:00:00',
        writtenBy: 'aaaaaaaaaaaaaaaa',
        worlds: [
          {
            id: 'w1',
            name: 'my world',
            kind: 'home',
            startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
            checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
            head: '905d1df',
            databaseIdentity: 'aaaaaaaaaaaaaaaa',
            address: 'http://127.0.0.1:41800',
            standing: 'canonical',
            parentWorld: null,
            bornAt: '2026-09-04 09:00:00',
            diedAt: null,
            diedBecause: null,
            installation: 'this-installation',
          },
          {
            id: 'w2',
            name: "builder-au's citizens",
            kind: 'agent-made',
            startedBy: { kind: 'agent', id: 'builder-au' },
            checkout: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
            head: '91ad217',
            databaseIdentity: 'bbbbbbbbbbbbbbbb',
            address: 'http://127.0.0.1:41801',
            standing: 'scratch',
            parentWorld: 'w1',
            bornAt: '2026-09-04 10:00:00',
            diedAt: '2026-09-04 11:00:00',
            diedBecause: 'the supervisor stopped its server',
            installation: 'this-installation',
          },
        ],
        visits: [],
      }),
      'utf8',
    )

    const said = sweep({ MOLE_OFFICE_DB: database })
    expect(said).toContain('2026-09-04 12:00:00')
    expect(said).toContain('my world')
    expect(said).toContain('aaaaaaaaaaaaaaaa')
    expect(said).toContain('http://127.0.0.1:41800')
    // A WORLD THAT HAS ENDED IS NOT OPEN, so it is not on this list. The sweep is about what is
    // running now, and a dead world named as open would be the wrong answer to its only question.
    expect(said).not.toContain("builder-au's citizens")
  })

  it('says a main world has written no list, and never that there are no worlds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-sweep-nomirror-'))
    dirs.push(dir)
    const said = sweep({ MOLE_OFFICE_DB: join(dir, 'panelx.db') })
    expect(said).toContain('has written no list')
    expect(said).toContain('That is not an empty office')
    expect(said).toContain(join(dir, MIRROR_FILE))
  })
})

describe('the listeners tool reads the office out of the server it already asks', () => {
  /**
   * A REAL SERVER, ASKED BY THE REAL TOOL. A test that read the tool's source for a path would pass
   * over a tool that mentions the path and never calls it, which is what the first version of this
   * did: the mutation that pointed the fetch somewhere else left the path in the sentence beside it
   * and the test went on passing.
   */
  let child: ChildProcess | undefined
  let api = ''
  let dir = ''

  beforeAll(async () => {
    // NOT ON `dirs`, WHICH `afterEach` EMPTIES. The server this block starts outlives the first
    // test in it, and deleting the database under a running server is the fault this whole product
    // has a rule about.
    dir = mkdtempSync(join(tmpdir(), 'mole-office-listeners-office-'))
    const port = await freePort()
    api = `http://127.0.0.1:${String(port)}`
    child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        LOG_LEVEL: 'warn',
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_DB: join(dir, 'panelx.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_NO_WATCH: '1',
      },
    })
    for (let tries = 0; tries < 180; tries += 1) {
      try {
        if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) return
      } catch {
        // not answering yet
      }
      await new Promise((ok) => setTimeout(ok, 500))
    }
    throw new Error(`the server this test started never answered ${api}/api/health`)
  }, 120_000)

  afterAll(() => {
    // BY THE GROUP ID WRITTEN DOWN WHEN IT WAS STARTED, never by a pattern. Chapter 2 rule 1 of the
    // office regulations, and the incident behind it is problem LD9Yor6qIVVC.
    if (child?.pid === undefined || child.pid === null) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('names the world that server registered for itself, with the facts the office stores', () => {
    const run = spawnSync(process.execPath, [LISTENERS, '--api', api], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    const said = `${run.stdout}${run.stderr}`
    expect(said, 'the tool said nothing about the office').toContain('open at the office')
    // The server registered itself under a test runner, so its world is a test world and the tool
    // draws the reader's words for that rather than the stored one.
    expect(said).toContain('a test started it')
    expect(said).toContain('a scratch stack')
    expect(said).toContain('born ')
  })

  /**
   * A WORLD OPEN AT THE OFFICE AND SERVED BY NOTHING IS CLOSED, WITH THE REASON IT WAS GIVEN.
   *
   * Problem `JTdajUUs23_M`: nine of these were sitting in the owner's office, every one a scratch
   * server that had started, told the office so, and gone. A process killed with SIGKILL runs no
   * shutdown and reports nothing, so the row has to be closed by somebody asking the address
   * whether anything is there. That is what this tool does, and this drives the whole of it through
   * the real routes against a real server.
   */
  it('leaves a world alone while something is answering for it', () => {
    const run = spawnSync(process.execPath, [CLOSER, '--api', api], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    const said = `${run.stdout}${run.stderr}`
    expect(said, 'the tool said nothing about the world the server registered').toContain('ALIVE')
    expect(said).toContain('Every world open at the office is being served')
    expect(said).not.toContain('ENDED')
  })

  it('closes one nothing answers for, and only when it is told to', async () => {
    // A WORLD ON A PORT NOTHING IS ON. `freePort` hands back a port that was free and then let go,
    // so nothing is listening on it — which is exactly the state a world whose server was killed
    // leaves behind.
    const gone = await freePort()
    const registered = await fetch(`${api}/api/office/worlds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'mole-office/the-api-server',
      },
      body: JSON.stringify({
        name: 'a world whose server was killed',
        kind: 'agent-made',
        databaseIdentity: 'bbbbbbbbbbbbbbbb',
        address: `http://127.0.0.1:${String(gone)}`,
        standing: 'scratch',
        installation: 'this-installation',
      }),
    })
    expect(registered.status).toBe(201)

    const looked = spawnSync(process.execPath, [CLOSER, '--api', api], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    const first = `${looked.stdout}${looked.stderr}`
    expect(first).toContain('ENDED')
    expect(first).toContain('a world whose server was killed')
    expect(first).toContain('Nothing was changed')

    // AND IT REALLY CHANGED NOTHING, which is the half a printed sentence cannot prove.
    const between = await (await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })).json()
    expect(between.worlds.find((one: { name: string }) => one.name === 'a world whose server was killed').diedAt).toBeNull()

    const closed = spawnSync(process.execPath, [CLOSER, '--api', api, '--close'], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    expect(`${closed.stdout}${closed.stderr}`).toContain('closed a world whose server was killed')

    const after = await (await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })).json()
    const row = after.worlds.find((one: { name: string }) => one.name === 'a world whose server was killed')
    expect(row.diedAt).not.toBeNull()
    expect(row.diedBecause).toContain('nothing serves this world any more')
    expect(row.diedBecause).toContain(String(gone))
    // AND THE WORLD THAT IS BEING SERVED IS STILL OPEN. A sweep that closed everything would pass
    // every assertion above and be the worst possible outcome.
    expect(after.worlds.filter((one: { diedAt: string | null }) => one.diedAt === null)).toHaveLength(1)
  })

  it('calls a world ended when its port is answering for another world, and says which', async () => {
    // THE PORT WAS REUSED, which is the third answer and the reason "did anything answer" is not
    // enough on its own. The row below claims the address this test's server is really on, so
    // something DOES answer — as a different database. A tool that only asked whether anything
    // answered would call this world alive for ever.
    const registered = await fetch(`${api}/api/office/worlds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'mole-office/the-api-server',
      },
      body: JSON.stringify({
        name: 'a world whose port was taken',
        kind: 'agent-made',
        databaseIdentity: 'cccccccccccccccc',
        address: api,
        standing: 'scratch',
        installation: 'this-installation',
      }),
    })
    expect(registered.status).toBe(201)

    const run = spawnSync(process.execPath, [CLOSER, '--api', api, '--close'], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    const said = `${run.stdout}${run.stderr}`
    expect(said).toContain('a world whose port was taken')
    expect(said).toContain('is answering for the database')

    const after = await (await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })).json()
    const row = after.worlds.find((one: { name: string }) => one.name === 'a world whose port was taken')
    expect(row.diedAt).not.toBeNull()
    expect(row.diedBecause).toContain('not cccccccccccccccc')
    // AND THE WORLD THAT REALLY IS ON THAT ADDRESS IS UNTOUCHED.
    expect(after.worlds.filter((one: { diedAt: string | null }) => one.diedAt === null)).toHaveLength(1)
  })

  it('leaves a world with no address alone, and never looks at one that is already dead', async () => {
    // NOTHING TO ASK IS NOT THE SAME AS NOTHING ANSWERED. A row with no address recorded cannot be
    // checked at all, and closing it because nobody could think of a way to check it would be the
    // fabricated evidence this repository forbids. It is named and left.
    const registered = await fetch(`${api}/api/office/worlds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'mole-office/the-api-server',
      },
      body: JSON.stringify({
        name: 'a world that never said where it answers',
        kind: 'agent-made',
        databaseIdentity: 'dddddddddddddddd',
        standing: 'scratch',
        installation: 'this-installation',
      }),
    })
    expect(registered.status).toBe(201)

    const run = spawnSync(process.execPath, [CLOSER, '--api', api, '--close'], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_WORKSPACE: 'default' },
      timeout: 60_000,
    })
    const said = `${run.stdout}${run.stderr}`
    expect(said).toContain('LEFT ALONE')
    expect(said).toContain('a world that never said where it answers')
    expect(said).toContain('nothing to ask')
    // AND THE WORLDS ALREADY CLOSED BY THE TESTS ABOVE ARE NOT LOOKED AT AGAIN. A sweep that walks
    // the dead ones costs a request each and prints a world as ending twice.
    expect(said).not.toContain('a world whose server was killed')
    expect(said).not.toContain('a world whose port was taken')

    const after = await (await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })).json()
    const row = after.worlds.find((one: { name: string }) => one.name === 'a world that never said where it answers')
    expect(row.diedAt).toBeNull()
  })

})

/**
 * THE DEV SUPERVISOR CLOSES THE WORLD ITS OWN SERVER SERVES, AND NOT ONE MORE.
 *
 * `sayThisWorldHasEnded` used to close every open row the list came back with. At the office that
 * is every world there is: the citizens verifier stopped the main world's supervisor and watched it
 * write `died_at` on to a second world that was answering HTTP 200 at that moment and went on
 * answering. Away from the office the list comes from the mirror and carries the office's ids, so
 * every close answered 404 and both rows stayed open. Problem `u3E5zXnwWqzd`.
 */
describe('the dev supervisor closing the world it serves', () => {
  let child: ChildProcess | undefined
  let api = ''
  let dir = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-supervisor-close-'))
    const port = await freePort()
    api = `http://127.0.0.1:${String(port)}`
    child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        LOG_LEVEL: 'warn',
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_DB: join(dir, 'panelx.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_NO_WATCH: '1',
      },
    })
    for (let tries = 0; tries < 180; tries += 1) {
      try {
        if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) return
      } catch {
        // not answering yet
      }
      await new Promise((ok) => setTimeout(ok, 500))
    }
    throw new Error(`the server this test started never answered ${api}/api/health`)
  }, 120_000)

  afterAll(() => {
    if (child?.pid === undefined || child.pid === null) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('closes its own world and leaves every other open world alone', async () => {
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
    // A SECOND WORLD AT THE SAME OFFICE, answering nothing. It stands for the one the verifier had
    // answering HTTP 200 while it was marked dead.
    const registered = await fetch(`${api}/api/office/worlds`, {
      method: 'POST',
      headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-api-server' },
      body: JSON.stringify({
        name: 'somebody else’s world',
        kind: 'agent-made',
        databaseIdentity: 'ffffffffffffffff',
        address: 'http://127.0.0.1:41999',
        standing: 'scratch',
        installation: 'this-installation',
      }),
    })
    expect(registered.status).toBe(201)

    const { sayThisWorldHasEnded } = await import('../tools/serve-dev.mjs')
    const said = await sayThisWorldHasEnded(api, 'default')
    expect(said).toContain('closed at the office')
    expect(said, 'the supervisor closed a world its server does not serve').not.toContain('somebody else')

    const after = (await (
      await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { worlds: { name: string; databaseIdentity: string; diedAt: string | null; diedBecause: string | null }[] }
    const theirs = after.worlds.find((one) => one.name === 'somebody else’s world')
    expect(theirs?.diedAt, 'a world this supervisor does not serve was closed').toBeNull()
    const mine = after.worlds.find((one) => one.databaseIdentity !== 'ffffffffffffffff')
    expect(mine?.diedAt).not.toBeNull()
    expect(mine?.diedBecause).toContain('the dev supervisor was told to stop')
  })

  /**
   * AND A LIST THAT CAME FROM THE MIRROR IS NOT THIS SERVER'S TO CLOSE.
   *
   * This is the verifier's second measurement: away from the office the list comes from the office's
   * mirror and carries the OFFICE's ids, which this world's database has never heard of, so every
   * close answered 404 and the supervisor printed *no world could be closed at the office* with
   * both rows left open.
   *
   * A STAND-IN SERVER RATHER THAN A REAL ONE, and the reason is the guard of `JTdajUUs23_M`: a
   * server started under a test runner reads no mirror at all, so no real server this suite can
   * start will ever answer `from: 'the mirror'`. What is being tested is a decision this function
   * makes about a reply, so the test gives it the reply.
   */
  it('closes nothing when the list it can read came from the office’s mirror', async () => {
    const { createServer } = await import('node:http')
    const asked: string[] = []
    const stub = createServer((req, res) => {
      asked.push(`${String(req.method)} ${String(req.url)}`)
      res.setHeader('content-type', 'application/json')
      res.setHeader(
        'x-mole-office-world',
        'db=aaaaaaaaaaaaaaaa; repo=%2Fhome%2Fsomeone%2Fpx-citizens; head=905d1df; port=41998; standing=scratch',
      )
      res.end(
        JSON.stringify({
          from: 'the mirror',
          worlds: [{ id: 'an-office-id', name: 'my world', databaseIdentity: 'aaaaaaaaaaaaaaaa', diedAt: null }],
        }),
      )
    })
    await new Promise<void>((ok) => stub.listen(0, '127.0.0.1', ok))
    const address = stub.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      const { sayThisWorldHasEnded } = await import('../tools/serve-dev.mjs')
      const said = await sayThisWorldHasEnded(`http://127.0.0.1:${String(port)}`, 'default')
      expect(said).toContain('mirror')
      expect(said).toContain('was not closed here')
      expect(asked, 'the supervisor tried to close a row whose id belongs to another database').toEqual([
        'GET /api/office/worlds',
      ])
    } finally {
      await new Promise<void>((ok) => stub.close(() => ok()))
    }
  })

  it('says nothing was closed when this server serves no open world', async () => {
    // The first test closed it, so a second call has nothing of its own left to close — and must
    // still not reach for anybody else's.
    const { sayThisWorldHasEnded } = await import('../tools/serve-dev.mjs')
    const said = await sayThisWorldHasEnded(api, 'default')
    expect(said).toContain('no world open at this server is the one it serves')
    const after = (await (
      await fetch(`${api}/api/office/worlds`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { worlds: { name: string; diedAt: string | null }[] }
    expect(after.worlds.find((one) => one.name === 'somebody else’s world')?.diedAt).toBeNull()
  })
})
