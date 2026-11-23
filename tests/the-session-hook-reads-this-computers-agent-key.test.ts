// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK SENDS THIS COMPUTER'S AGENT KEY, AND THE OFFICE'S KEY ONLY WHERE NO ENTRY KEY FILE EXISTS.
 *
 * The entry press on the Settings page makes one agent for this computer's coding-tool sessions, and keeps its key in
 * `entry-agent-key` and the agent's registry id in `entry-agent`, beside the office's key file
 * (src/config/the-entrys-agent.mjs). The session hook sends that key for a session that holds no key and names no
 * agent. Its last resort, the office's own key, goes only where the entry key file does not exist at all. A file that
 * is there and fails a check, or whose key the office refuses, never brings the office's key back. A session that
 * names an agent and holds no key of it sends the name alone, on every computer.
 *
 * WHAT IS REAL. The hook is spawned as Claude Code spawns it, from tools/session-hook.mjs, with a payload on stdin and an
 * environment that holds only what the case sets, so no agent and no key of the shell that runs this test reaches it.
 * In the first part it asks a stand-in on a free port, which writes down the headers of each request. In the last part
 * it asks this file's own office, made by freshDb: the entry agent and its key are made by the press's own function on
 * the person's press, and the key window is closed by the person's made-up key before the session starts. Every key
 * here is made up, and every file is in this test's own folders. No assertion prints a key.
 *
 * RED BEFORE THE CODE. The hook read no entry file, so every case with sound files sent the office's key, the cases
 * with an unsound file sent it too, and the named agent sent the office's key under its name. The words the cases read
 * come from src/config/the-entrys-agent.mjs, which did not exist, so the import fails in every case that reads them.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

const KEY = 'x-mole-office-key'
const ACTOR = 'x-mole-office-actor-id'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const OFFICE_KEY = 'made-up-office-key-not-a-real-one'
const ENTRY_KEY = 'e0'.repeat(32)
const OWN_KEY = 'a1'.repeat(32)
const ENTRY_AGENT = 'madeUpEntryAgentId01'
const AGENT = 'made-up-agent-for-the-entry-key-test'

/** Whether a value is this file's made-up entry key, as a yes or no, so a failing assertion never prints it. */
const isTheEntrysKey = (value: unknown): boolean => value === ENTRY_KEY

/** The environment of every hook run: this process's, without any MOLE_ or SANDBOX_ variable, and the case's own. */
function theHooksEnvironment(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith('MOLE_') && !name.startsWith('SANDBOX_')) env[name] = value
  }
  return { ...env, ...extra }
}

/** Run the hook once, as Claude Code runs it, and hand back what it printed. */
async function theHookRuns(
  mode: 'start' | 'end',
  env: Record<string, string>,
  cwd: string,
  payload: Record<string, unknown>,
): Promise<{ status: number | null; output: string }> {
  const child = spawn(process.execPath, [HOOK, mode], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d: Buffer) => { output += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => { output += d.toString('utf8') })
  child.stdin.on('error', () => {})
  child.stdin.end(JSON.stringify(payload))
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, output }
}

describe('the session hook and this computer’s entry key, against a stand-in office', () => {
  let scratch = ''
  let home = ''
  let office: Server
  let officeAt = ''
  let asked: IncomingHttpHeaders[] = []
  /** Whether the stand-in answers 401 to a request that carries the entry key, as an office that never gave it. */
  let refuseTheEntrysKey = false

  beforeAll(async () => {
    scratch = aTestDatabaseFolder('the-hook-reads-the-entry-key')
    home = join(scratch, 'home')
    mkdirSync(home, { recursive: true })
    // THE OFFICE'S KEY FILE, made up, beside a made-up database path, so a hook that sent the office's key would be seen
    // sending it. The entry files go beside it, where keysPathFrom in src/config/settings.mjs puts the key file.
    mkdirSync(join(scratch, 'db'), { recursive: true })
    writeFileSync(join(scratch, 'db', 'keys.json'), JSON.stringify({ office: OFFICE_KEY }), { mode: 0o600 })
    office = createServer((req, res) => {
      asked.push(req.headers)
      req.resume()
      if (refuseTheEntrysKey && isTheEntrysKey(req.headers[KEY])) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'A stand-in office that never gave this key.' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', () => done()))
    officeAt = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  }, 60_000)

  afterAll(async () => {
    await new Promise<void>((done) => office.close(() => done()))
    rmSync(scratch, { recursive: true, force: true })
  })

  const theEnvironment = (extra: Record<string, string> = {}): Record<string, string> =>
    theHooksEnvironment({
      HOME: home,
      MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
      MOLE_OFFICE_API: officeAt,
      MOLE_OFFICE_DB: join(scratch, 'db', 'panelx.db'),
      ...extra,
    })

  /** The two entry files of this file's made-up office, named by the module the press and the hook read them by. */
  async function theFiles(): Promise<{ folder: string; key: string; agent: string }> {
    const { theEntrysFilesBeside } = await import('../src/config/the-entrys-agent.mjs')
    return theEntrysFilesBeside(join(scratch, 'db', 'keys.json'))
  }

  /** Take both entry files away, whatever they are. */
  async function noEntryFiles(): Promise<void> {
    const files = await theFiles()
    rmSync(files.key, { recursive: true, force: true })
    rmSync(files.agent, { recursive: true, force: true })
  }

  /** Put the two entry files in place, private unless the case says otherwise. */
  async function theEntryFiles(key = `${ENTRY_KEY}\n`, agent: string | null = `${ENTRY_AGENT}\n`, keyMode = 0o600): Promise<void> {
    await noEntryFiles()
    const files = await theFiles()
    writeFileSync(files.key, key, { mode: keyMode })
    chmodSync(files.key, keyMode)
    if (agent !== null) {
      writeFileSync(files.agent, agent, { mode: 0o600 })
      chmodSync(files.agent, 0o600)
    }
  }

  /** Run the hook's start against the stand-in, and hand back what it printed and the requests that named an actor. */
  async function aStart(extra: Record<string, string> = {}): Promise<{ output: string; naming: IncomingHttpHeaders[] }> {
    asked = []
    const ran = await theHookRuns('start', theEnvironment(extra), home, { session_id: 'made-up-conversation-entry-key', hook_event_name: 'SessionStart' })
    const naming = asked.filter((one) => one[ACTOR] !== undefined)
    expect(naming.length, `the hook made no request that names an actor. What it printed:\n${ran.output}`).toBeGreaterThan(0)
    return { output: ran.output, naming }
  }

  /** Whether any request or the output carries the office's key or the path of its key file. */
  const theOfficesKeyShows = (got: { output: string; naming: IncomingHttpHeaders[] }): boolean =>
    got.naming.some((one) => one[KEY] === OFFICE_KEY) || got.output.includes(OFFICE_KEY) || got.output.includes(join(scratch, 'db', 'keys.json'))

  it('with sound entry files, a session that holds no key and names no agent sends the entry key under the entry agent’s id', async () => {
    await theEntryFiles()
    const got = await aStart()
    for (const headers of got.naming) {
      expect(headers[ACTOR], got.output).toBe(ENTRY_AGENT)
      expect(isTheEntrysKey(headers[KEY]), 'the hook did not send the entry key').toBe(true)
    }
    expect(theOfficesKeyShows(got), "the hook sent or printed the office's key").toBe(false)
    expect(got.output.includes(ENTRY_KEY), 'the hook printed the entry key').toBe(false)
  }, 60_000)

  it('with no entry key file at all, the office’s key goes under the hook’s own name, as its last resort', async () => {
    await noEntryFiles()
    const { THE_SESSION_HOOK_ID } = await import('../src/shared/participants.ts')
    const got = await aStart()
    for (const headers of got.naming) {
      expect(headers[ACTOR], got.output).toBe(THE_SESSION_HOOK_ID)
      expect(headers[KEY] === OFFICE_KEY, "the hook did not send the office's key where no entry key file exists").toBe(true)
    }
  }, 60_000)

  /** Each file the hook refuses, and which of the two files its start line names. */
  const UNSOUND: readonly { name: string; names: 'key' | 'agent'; put: (files: { key: string; agent: string }) => Promise<void> }[] = [
    { name: 'a key file other users may read', names: 'key', put: async () => await theEntryFiles(`${ENTRY_KEY}\n`, `${ENTRY_AGENT}\n`, 0o644) },
    { name: 'a key file that holds no key', names: 'key', put: async () => await theEntryFiles('not a key at all\n') },
    {
      name: 'a folder where the key file is',
      names: 'key',
      put: async (files) => {
        await noEntryFiles()
        mkdirSync(files.key, { mode: 0o700 })
        writeFileSync(files.agent, `${ENTRY_AGENT}\n`, { mode: 0o600 })
      },
    },
    {
      name: 'a link where the key file is',
      names: 'key',
      put: async (files) => {
        await noEntryFiles()
        const real = join(scratch, 'a-sound-key-elsewhere')
        rmSync(real, { force: true })
        writeFileSync(real, `${ENTRY_KEY}\n`, { mode: 0o600 })
        symlinkSync(real, files.key)
        writeFileSync(files.agent, `${ENTRY_AGENT}\n`, { mode: 0o600 })
      },
    },
    { name: 'a key file with no entry agent file beside it', names: 'key', put: async () => await theEntryFiles(`${ENTRY_KEY}\n`, null) },
    { name: 'an entry agent file that holds no registry id', names: 'agent', put: async () => await theEntryFiles(`${ENTRY_KEY}\n`, 'not an id!\n') },
  ]

  for (const one of UNSOUND) {
    it(`with ${one.name}, no key goes, never the office’s, and the start lines name the file and why`, async () => {
      const files = await theFiles()
      await one.put(files)
      const { theEntrysFilesRead, theEntrysKeyFileWasNotUsedLine } = await import('../src/config/the-entrys-agent.mjs')
      const { THE_SESSION_HOOK_ID } = await import('../src/shared/participants.ts')
      const read = theEntrysFilesRead({ MOLE_OFFICE_DB: join(scratch, 'db', 'panelx.db') })
      expect(read.is, 'the fixture is not a file the reader refuses').toBe('refused')
      const got = await aStart()
      for (const headers of got.naming) {
        expect(headers[ACTOR], got.output).toBe(THE_SESSION_HOOK_ID)
        expect(headers[KEY] === undefined, 'the hook sent a key though the entry key file was refused').toBe(true)
      }
      expect(theOfficesKeyShows(got), "an unsound entry key file brought the office's key back").toBe(false)
      expect(got.output).toContain(theEntrysKeyFileWasNotUsedLine(read.is === 'refused' ? read.why : ''))
      // THE LINE NAMES THE FILE IT REFUSED. The agent file's path is the start of the key file's, so the agent file's case
      // is told apart by not naming the key file.
      const why = read.is === 'refused' ? read.why : ''
      if (one.names === 'key') expect(why, 'the line does not name the key file').toContain(files.key)
      else {
        expect(why, 'the line does not name the entry agent file').toContain(files.agent)
        expect(why.includes(files.key), 'the line names the key file, not the entry agent file').toBe(false)
      }
      expect(got.output.includes(ENTRY_KEY), 'the hook printed what the key file holds').toBe(false)
    }, 60_000)
  }

  it('with an entry key the office refuses, the requests after the refusal carry no key, never the office’s, and the start lines say so', async () => {
    await theEntryFiles()
    const { theOfficeRefusedTheEntrysKeyLine } = await import('../src/config/the-entrys-agent.mjs')
    const { THE_SESSION_HOOK_ID } = await import('../src/shared/participants.ts')
    refuseTheEntrysKey = true
    let got: { output: string; naming: IncomingHttpHeaders[] }
    try {
      got = await aStart()
    } finally {
      refuseTheEntrysKey = false
    }
    const first = got.naming.findIndex((one) => isTheEntrysKey(one[KEY]))
    expect(first, 'the hook never sent the entry key, so the case proved nothing').toBeGreaterThanOrEqual(0)
    const after = got.naming.slice(first + 1).filter((one) => !isTheEntrysKey(one[KEY]))
    expect(after.length, 'no request was asked again after the refusal').toBeGreaterThan(0)
    for (const headers of after) {
      expect(headers[ACTOR], got.output).toBe(THE_SESSION_HOOK_ID)
      expect(headers[KEY] === undefined, 'a request after the refusal carried a key').toBe(true)
    }
    expect(isTheEntrysKey(got.naming.at(-1)?.[KEY]), 'the last request still carried the refused key').toBe(false)
    expect(theOfficesKeyShows(got), "a refused entry key brought the office's key back").toBe(false)
    expect(got.output).toContain(theOfficeRefusedTheEntrysKeyLine((await theFiles()).key))
  }, 60_000)

  for (const withTheFiles of [true, false]) {
    it(`a session that names an agent and holds no key sends the name alone, ${withTheFiles ? 'with' : 'without'} the entry files, and says so once`, async () => {
      if (withTheFiles) await theEntryFiles()
      else await noEntryFiles()
      const { aNamedAgentWithoutAKeyLine } = await import('../src/config/the-entrys-agent.mjs')
      const got = await aStart({ MOLE_OFFICE_AGENT: AGENT })
      for (const headers of got.naming) {
        expect(headers[ACTOR], got.output).toBe(AGENT)
        expect(headers[KEY] === undefined, 'the hook sent a key under a name that holds none').toBe(true)
      }
      expect(theOfficesKeyShows(got), "the hook sent the office's key under the agent's name").toBe(false)
      expect(got.output.split(aNamedAgentWithoutAKeyLine(AGENT)).length - 1, got.output).toBe(1)
    }, 60_000)
  }

  it('a session with a key of its own sends that key, with the entry files there', async () => {
    await theEntryFiles()
    const got = await aStart({ MOLE_OFFICE_AGENT: AGENT, MOLE_AGENT_KEY: OWN_KEY })
    for (const headers of got.naming) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY] === OWN_KEY, 'the hook did not send the session’s own key').toBe(true)
    }
    expect(theOfficesKeyShows(got), "the hook sent the office's key").toBe(false)
  }, 60_000)
})

describe('a session wired by the entry press is filed, stamped and ended after the key window closed', () => {
  /** Made-up values for this file's own office. */
  const PERSONS_KEY = 'b5'.repeat(32)
  const THIS_OFFICES_KEY = 'c6'.repeat(32)
  const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  let t: TestDb
  let app: FastifyInstance
  let url = ''
  let proxy: Server
  let proxyAt = ''
  const seen: IncomingHttpHeaders[] = []
  const made: string[] = []
  const notes: string[] = []

  beforeAll(async () => {
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    t = await freshDb()
    const { forgetTheWorldsOwnAuthority } = await import('../src/server/lib/worldauthority.ts')
    forgetTheWorldsOwnAuthority()
    writeFileSync(
      join(dirname(t.file), 'keys.json'),
      `${JSON.stringify({ person: PERSONS_KEY, office: THIS_OFFICES_KEY, providers: {} }, null, 2)}\n`,
      { mode: 0o600 },
    )
    app = (await apiApp()).app
    await app.ready()
    await app.listen({ host: '127.0.0.1', port: 0 })
    url = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    // A STAND-IN IN FRONT OF THIS FILE'S OFFICE that forwards every request and answer whole, and writes down the
    // headers of each request, so a request that carried the office's key would be seen.
    proxy = createServer((req, res) => {
      void (async () => {
        seen.push(req.headers)
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string' && name !== 'host' && name !== 'content-length') headers[name] = value
        }
        const answer = await fetch(`${url}${req.url ?? '/'}`, {
          method: req.method ?? 'GET',
          headers,
          ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks).toString('utf8') }),
        })
        const text = await answer.text()
        for (const [name, value] of answer.headers) {
          if (name !== 'content-length' && name !== 'content-encoding' && name !== 'transfer-encoding') res.setHeader(name, value)
        }
        res.statusCode = answer.status
        res.end(text)
      })().catch((err: unknown) => {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(err) }))
      })
    })
    await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', () => done()))
    proxyAt = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
  }, 120_000)

  afterAll(async () => {
    for (const note of notes.splice(0)) rmSync(note, { force: true })
    for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
    await new Promise<void>((done) => proxy?.close(() => done()))
    await app?.close()
    t?.close()
  })

  it('under the entry agent, proved by its own key, with no office key in any request', async () => {
    // THE PRESS'S KEY STEP, on the person's own press, as the entry door runs it after the entry's lines are written.
    const { giveTheEntrysAgentItsKey } = await import('../src/server/lib/an-agents-key-file.ts')
    const { theEntrysFilesBeside } = await import('../src/config/the-entrys-agent.mjs')
    const { theSessionNotePath } = await import('../src/config/the-session-note.mjs')
    const pressed = giveTheEntrysAgentItsKey({ type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' }, 'default')
    expect(pressed.thisComputersKey, pressed.says).toBe('held')
    const files = theEntrysFilesBeside(join(dirname(t.file), 'keys.json'))
    expect(existsSync(files.key), 'the press kept no key file beside the office’s key file').toBe(true)
    const entry = readFileSync(files.agent, 'utf8').trim()
    const row = t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ? AND retired = 0').get(entry) as { handle: string } | undefined
    expect(row, 'the entry agent file names no live agent').toBeDefined()

    // THE PERSON CLOSES THE WINDOW WITH THEIR KEY, through a listener, as the owner closed the office's.
    const closed = await fetch(`${url}/api/office/key-window/close`, { method: 'POST', headers: { ...PERSON, 'x-mole-office-key': PERSONS_KEY } })
    expect(closed.status, await closed.text()).toBe(200)

    const home = mkdtempSync(join(tmpdir(), 'mole-office-entry-key-home-'))
    const startedIn = mkdtempSync(join(tmpdir(), 'mole-office-entry-key-start-'))
    made.push(home, startedIn)
    const conversation = `entry-key-${String(Date.now())}-${String(Math.random()).slice(2)}`
    const transcript = join(home, `${conversation}.jsonl`)
    writeFileSync(transcript, '')
    const note = theSessionNotePath(conversation)
    expect(note, 'the conversation names no note').not.toBeNull()
    notes.push(note!)
    const env = theHooksEnvironment({
      HOME: home,
      MOLE_OFFICE_API: proxyAt,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_DB: t.file,
      MOLE_HOOK_DETAILS_FOLDER: join(home, 'hook-details'),
    })
    const payload = (event: string) => ({ session_id: conversation, cwd: startedIn, transcript_path: transcript, hook_event_name: event })

    const started = await theHookRuns('start', env, startedIn, payload('SessionStart'))
    expect(started.status, started.output).toBe(0)
    expect(existsSync(note!), `the hook filed no record, so it wrote no note. It said:\n${started.output}`).toBe(true)
    const run = String((JSON.parse(readFileSync(note!, 'utf8')) as { id?: unknown }).id ?? '')
    expect(run, 'the note names no record').not.toBe('')
    const first = t.client.sqlite
      .prepare('SELECT actor_type AS actorType, actor_id AS actorId, proved_by AS provedBy FROM revisions WHERE record_id = ? AND seq = 1')
      .get(run) as { actorType: string; actorId: string; provedBy: string | null }
    expect(first.actorType).toBe('agent')
    expect([entry, row!.handle], 'the session was not filed under the entry agent').toContain(first.actorId)
    expect(first.provedBy, 'the filing was not proved by an agent’s key').toBe('an-agent-key')
    const stamped = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as {
      extra?: { discovered?: { externalId?: unknown } }
    }
    expect(stamped.extra?.discovered?.externalId, 'the filing carries no stamp of the conversation').toBe(conversation)

    const ended = await theHookRuns('end', env, startedIn, payload('SessionEnd'))
    expect(ended.status, ended.output).toBe(0)
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as { state?: unknown }
    expect(data.state, 'the hook did not end the session').toBe('finished')

    expect(seen.length, 'no request went through the stand-in').toBeGreaterThan(0)
    expect(seen.some((one) => one[KEY] === THIS_OFFICES_KEY), "a request carried the office's key").toBe(false)
    expect(`${started.output}${ended.output}`.includes(THIS_OFFICES_KEY), "the hook printed the office's key").toBe(false)
  }, 120_000)
})
