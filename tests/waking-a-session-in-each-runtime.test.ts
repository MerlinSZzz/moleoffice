// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY TOOL, AND WHAT EACH ONE LETS A MESSAGE DO TO A SESSION THAT IS ALREADY RUNNING.
 *
 * Criterion H5 of design/messages/ACCEPTANCE.md section 10: the first point is agreed, with one more
 * added — the same must also be built and tested on Codex and OpenCode.
 *
 * WHAT IS PROVED HERE, and it is a narrow thing said plainly: every runtime this product serves has
 * a measurement, each measurement names the version and the day it was taken, and the waiter's act
 * follows from it rather than from a branch somebody wrote separately. A runtime that cannot be
 * woken says so, and says what happens instead.
 *
 * WHAT IS NOT PROVED HERE, and cannot be by a test. Whether a real Claude Code session is invoked
 * again when a background command exits, and whether a real OpenCode session takes a message posted
 * to its port, are facts about those tools on this machine. They were measured by hand on
 * 4 September 2026 and the measurements are in `src/shared/waking.ts` with what was seen. A test
 * that started a real session of each tool would be a test of somebody else's software and would
 * spend a model call every time the suite ran.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { HOW_TO_WAKE, WAKING_ACTS, whatTheWaiterDoes } from '../src/shared/waking.ts'
import { apiApp, freshDb, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-waking-'))
let transcriptNumber = 0

/**
 * A transcript on disk for a session that is answering.
 *
 * Criterion M126: a live process alone is not answering without a transcript on record, so a
 * fixture that expects "a live session" writes one and points its record at it.
 */
function aTranscript(): string {
  transcriptNumber += 1
  const path = join(transcripts, `waking-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'answering' }] },
    })}\n`,
  )
  return path
}

describe('every runtime this product serves has a measurement', () => {
  it('names every runtime word and nothing else, so a runtime added later cannot go unmeasured', () => {
    expect(Object.keys(HOW_TO_WAKE).sort()).toEqual([...AGENT_RUNTIMES].sort())
  })

  it.each([...AGENT_RUNTIMES])('%s says what was found, against which version, and on what day', (runtime) => {
    const known = HOW_TO_WAKE[runtime]

    expect(WAKING_ACTS).toContain(known.act)
    // A VERSION AND A DAY, so a later version behaving differently is visible rather than silent.
    //
    // A PRE-RELEASE SUFFIX IS A VERSION TOO, since 13 September 2026. The pattern took three numbers
    // and nothing else, and the dsh this machine runs is @deepseek-ai/dsh 0.1.5-rc.1. Writing 0.1.5
    // to satisfy the pattern would have been a measurement against a version nobody ran, which is
    // the invented-evidence rule; the pattern takes the real shape instead. It still refuses an
    // empty string, a word, or "unknown", which is what it was for.
    expect(known.measuredAgainst).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$/)
    expect(known.measuredOn).toMatch(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/)
    // AND A REAL PARAGRAPH, not a label. What was found is the thing a reader needs.
    expect(known.says.length).toBeGreaterThan(200)
  })

  it('says plainly, for the one that cannot be woken, what happens to a message instead', () => {
    const codex = HOW_TO_WAKE.codex

    expect(codex.canBeWoken).toBe(false)
    expect(codex.act).toBe('print-it-and-stop')
    // THE REASON, NOT ONLY THE ANSWER. This is the measurement, and it names what refused.
    expect(codex.says).toContain('app-server daemon')
    expect(codex.says).toContain('standalone')
    expect(codex.says).toContain('waits in that terminal')
  })

  it('says nothing reaches a running Kimi CLI session, and which surfaces nobody measured', () => {
    // KIMI CLI WAS ADDED to the list of runtimes served. The
    // row has to say the same kind of thing Codex's does — that this is what is KNOWN, not that
    // there is no way in — because two surfaces were never tried and the table has to say which.
    const kimi = HOW_TO_WAKE.kimi

    expect(kimi.canBeWoken).toBe(false)
    expect(kimi.act).toBe('print-it-and-stop')
    expect(kimi.measuredAgainst).toBe('1.50.0')
    expect(kimi.measuredOn).toBe('2026-09-05')
    // THE HEADLESS SHAPE, which is the reason nothing reaches a session: a run starts, answers and
    // exits, so there is no session sitting there to reach.
    expect(kimi.says).toContain('kimi --print')
    // AND THE TWO NOBODY TRIED, named rather than left out, with the word that says so.
    expect(kimi.says).toContain('kimi web')
    expect(kimi.says).toContain('--wire')
    expect(kimi.says).toContain('NEITHER WAS MEASURED')
    expect(kimi.says).toContain('FRAMEWORK-SURVEY-2026-09.md')
    // NOTHING NEEDED FROM A CALLER, and no second measurement, because there is no flag that opens
    // a way into an interactive session the way codex --remote does.
    expect(kimi.needs).toBeNull()
    expect(kimi.startedAnotherWay).toBeNull()
    // AND THE WAITER DOES THE SAME THING WHATEVER IT IS TOLD, as it does for Codex.
    expect(whatTheWaiterDoes('kimi', null).act).toBe('print-it-and-stop')
    expect(whatTheWaiterDoes('kimi', 'http://127.0.0.1:29971').act).toBe('print-it-and-stop')
  })

  it('says what each of the two that can be woken needs from a caller', () => {
    // CLAUDE CODE NEEDS NOTHING: the wake is this waiter exiting.
    expect(HOW_TO_WAKE['claude-code'].canBeWoken).toBe(true)
    expect(HOW_TO_WAKE['claude-code'].needs).toBeNull()
    // OPENCODE NEEDS THE ADDRESS, because nothing can work out which port a session picked.
    expect(HOW_TO_WAKE.opencode.canBeWoken).toBe(true)
    expect(String(HOW_TO_WAKE.opencode.needs)).toContain('--port')
  })
})

/**
 * THE TWO SENTENCES THAT WERE MEASURED FALSE ON 5 SEPTEMBER 2026, AND WHAT THE TABLE SAYS NOW.
 *
 * Problem `20EZGdlvhyS1`. The table said a running Codex session could not be reached here, and that
 * a running Claude Code session could not be reached at all. Both were measurements of what somebody
 * had tried, written as facts about the tool, and both turned out narrower than they read. A table
 * of measurements goes quietly out of date, so this pins its words to the two runs that corrected it.
 *
 * IT PINS THE FACTS, NOT THE PROSE. Each expectation names something that was measured — a version,
 * a day, a flag, a variable, a path, a file — so rewording a paragraph leaves it green and dropping
 * a measurement does not. One expectation is not a measurement and is deliberate: the sentence
 * saying Mole Office does not use the Codex route yet is pinned by the id of the proposal that
 * decides whether it ever will, because a table claiming a capability the product does not have is
 * the failure this exists to prevent.
 */
describe('the table carries both measurements, and says which one is used', () => {
  it('says an ordinary Codex session cannot be reached and a --remote one can, naming both runs', () => {
    const codex = HOW_TO_WAKE.codex

    // THE 4 SEPTEMBER MEASUREMENT, unchanged: this is a session started the ordinary way, and it is
    // what the waiter still acts on.
    expect(codex.canBeWoken).toBe(false)
    expect(codex.measuredOn).toBe('2026-09-04')
    expect(codex.act).toBe('print-it-and-stop')

    // THE 5 SEPTEMBER MEASUREMENT, beside it rather than instead of it.
    const other = codex.startedAnotherWay
    expect(other, 'the 5 September Codex measurement is not in the table').not.toBeNull()
    expect(other?.canBeWoken).toBe(true)
    expect(other?.measuredOn).toBe('2026-09-05')
    expect(other?.measuredAgainst).toBe('0.147.0')
    // WHAT HAS TO BE TRUE OF THE SESSION: the one word that decides it, and what it joins.
    expect(String(other?.startedWith)).toContain('--remote')
    expect(String(other?.startedWith)).toContain('app-server --listen')
    // WHAT WAS SENT, and where the run is written down.
    expect(String(other?.says)).toContain('turn/start')
    expect(String(other?.says)).toContain('CODEX-WAKE-EXPERIMENT.md')
    // AND THAT MOLE OFFICE DOES NOT DO IT, and that whether it ever will is an open proposal for the owner to settle.
    expect(String(other?.says)).toContain('MOLE OFFICE DOES NOT DO THIS YET')
    expect(String(other?.says)).toContain('is an open proposal, which is the owner’s to settle')
  })

  it('names the Claude Code inbox socket, and says the exit is what Mole Office actually uses', () => {
    const said = HOW_TO_WAKE['claude-code'].says

    // THE SOCKET: the version it appeared in, the two variables, and where the files are.
    expect(said).toContain('2.1.224')
    expect(said).toContain('CLAUDE_CODE_MESSAGING_SOCKET')
    expect(said).toContain('CLAUDE_CODE_MESSAGING_TOKEN')
    expect(said).toContain('/run/user/1000/cc-socks/')
    expect(said).toContain('2.1.259')
    expect(said).toContain('FRAMEWORK-SURVEY-2026-09.md')
    // PRESENT IS NOT WORKING. Delivery was never tried, and the table has to say so rather than let
    // a reader read "the socket is there" as "a message goes through it".
    expect(said).toContain('DELIVERY WAS NOT TESTED')
    // AND WHAT IS ACTUALLY USED, which is the other one.
    expect(said).toContain('for-agents/hold-the-handle.mjs')
    expect(HOW_TO_WAKE['claude-code'].act).toBe('exit-and-be-invoked-again')
    // HOW THE SESSION WAS STARTED CHANGES NOTHING HERE, so there is no second measurement to carry.
    expect(HOW_TO_WAKE['claude-code'].startedAnotherWay).toBeNull()
  })

  it('leaves the waiter doing exactly what it did, because nothing about the product changed', () => {
    // THE MEASUREMENT MOVED AND THE BEHAVIOUR DID NOT. Codex is the point of this one: the table now
    // says a session can be reached, and the waiter still prints and stops, because Mole Office does
    // not start Codex sessions with --remote.
    expect(whatTheWaiterDoes('codex', null).act).toBe('print-it-and-stop')
    expect(whatTheWaiterDoes('claude-code', null).act).toBe('exit-and-be-invoked-again')
  })
})

describe('what the waiter does follows from the measurement', () => {
  it('wakes a Claude Code session by stopping, which is the only way in', () => {
    expect(whatTheWaiterDoes('claude-code', null).act).toBe('exit-and-be-invoked-again')
    // AND AN ADDRESS CHANGES NOTHING: there is nowhere to send it.
    expect(whatTheWaiterDoes('claude-code', 'http://127.0.0.1:29971').act).toBe('exit-and-be-invoked-again')
  })

  it('sends a message straight into an OpenCode session when it was told where', () => {
    expect(whatTheWaiterDoes('opencode', 'http://127.0.0.1:29971').act).toBe('send-it-to-the-session')
  })

  it('and tells an OpenCode session with no address which of the two reasons it is', () => {
    const said = whatTheWaiterDoes('opencode', null)

    // NOT "IT CANNOT BE WOKEN", which would be false and would send somebody looking at the wrong
    // thing. OpenCode can be; this one did not say where, and the sentence says how to.
    expect(said.act).toBe('print-it-and-stop')
    expect(said.says).toContain('can be reached from outside')
    expect(said.says).toContain('--wake http://127.0.0.1:')
  })

  it('prints and stops for Codex, whatever it is told', () => {
    expect(whatTheWaiterDoes('codex', null).act).toBe('print-it-and-stop')
    // AN ADDRESS DOES NOT MAKE IT POSSIBLE. A Codex session serves nothing to post to, so honouring
    // one would be sending a message somewhere nobody is listening and calling it delivered.
    expect(whatTheWaiterDoes('codex', 'http://127.0.0.1:29971').act).toBe('print-it-and-stop')
  })
})

// ============================================================================ the waiter itself

/**
 * THE MOUNTED SCRIPT, DRIVEN AS A SESSION DRIVES IT.
 *
 * The two acts above are decided in shared code, and this proves the script does them. It starts
 * `tools/hold-the-handle.mjs` as a real process against a real API, sends the agent a message, and
 * watches what the waiter does with it.
 *
 * A STAND-IN FOR AN OPENCODE SESSION, and it is not a pretence about OpenCode. It answers the two
 * routes a real one answers and records what it was sent, which is the whole of what the waiter
 * does to a session. Whether a REAL OpenCode session takes what is posted to those routes is a fact
 * about OpenCode, measured by hand on 4 September 2026 and written in `src/shared/waking.ts`; this
 * is about the waiter.
 */
describe('the waiter, running as a session starts it', () => {
  let t: TestDb
  let app: FastifyInstance
  let api: string
  let resources: typeof import('../src/server/lib/resources.ts')
  let agentId = ''
  let keyEnv: NodeJS.ProcessEnv = {}
  let session = ''
  /** Everything the stand-in OpenCode session was sent. */
  const sentIn: { path: string; body: string }[] = []
  let standIn: Server
  let standInAt = ''
  const started: ChildProcess[] = []

  const AS_THE_OWNER = {
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }

  beforeAll(async () => {
    t = await freshDb()
    resources = await import('../src/server/lib/resources.ts')
    const built = await apiApp()
    app = built.app
    await app.ready()
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    standIn = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += String(chunk)))
      req.on('end', () => {
        sentIn.push({ path: req.url ?? '', body })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('true')
      })
    })
    await new Promise<void>((go) => standIn.listen(0, '127.0.0.1', go))
    standInAt = `http://127.0.0.1:${String((standIn.address() as AddressInfo).port)}`
    keyEnv = await aTestAgentsKeyEnvironment(app, 'woken', dirname(t.file), 'default', 'opencode')
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'A session somebody opened',
      data: { state: 'running', runtime: 'opencode', doing: 'answering as woken' },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    /**
     * A LIVE PROCESS FOR THE SESSION, BECAUSE A SESSION THAT IS ANSWERING HAS ONE. A beating hold
     * now answers on its own, so this row is not what makes the session "a live session"; it keeps
     * the fixture describing a session that really runs. This is the test's own process,
     * registered while it runs, exactly as a session registers a process it started.
     */
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: { type: 'human', id: THE_PERSON },
    })
    const listed = (
      await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
    ).json() as { agents: { id: string; handle: string }[] }
    agentId = listed.agents.filter((a) => a.handle === 'woken')[0]?.id ?? ''
  }, 60_000)

  afterAll(async () => {
    for (const child of started) {
      // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
      if (child.pid === undefined) continue
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // Already gone, which is the outcome this wanted.
      }
    }
    await new Promise<void>((go) => standIn.close(() => go()))
    await app.close()
    t.close()
  })

  /** Start the waiter, collecting everything it prints. */
  function startTheWaiter(args: string[]): { child: ChildProcess; said: () => string; ended: Promise<number> } {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)), ...args],
      { env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS: '30' } },
    )
    started.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
    return { child, said: () => printed, ended }
  }

  /** Wait for something to become true, or say it never did. */
  async function until(what: () => boolean, within = 20_000): Promise<boolean> {
    const deadline = Date.now() + within
    while (Date.now() < deadline) {
      if (what()) return true
      await new Promise((go) => setTimeout(go, 100))
    }
    return false
  }

  async function sendTheAgentAMessage(body: string): Promise<void> {
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: { kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: agentId }] } },
    })
  }

  it('puts a message straight into an OpenCode session and goes on holding the handle', async () => {
    const waiter = startTheWaiter([
      '--agent',
      'woken',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
      '--runtime',
      'opencode',
      '--wake',
      standInAt,
    ])
    expect(await until(() => waiter.said().includes('Holding the handle'))).toBe(true)

    await sendTheAgentAMessage('The gripper has drifted again.')

    expect(await until(() => sentIn.length >= 2), `nothing reached the session: ${waiter.said()}`).toBe(true)
    expect(sentIn.map((one) => one.path)).toEqual(['/tui/append-prompt', '/tui/submit-prompt'])
    expect(sentIn[0]?.body).toContain('The gripper has drifted again.')
    // AND IT IS STILL HOLDING: nothing had to stop for the message to arrive.
    expect(waiter.child.exitCode).toBeNull()
    expect(waiter.said()).toContain('Still holding')
    const stands = (
      await app.inject({ method: 'GET', url: '/api/handles/woken', headers: AS_THE_OWNER })
    ).json() as { answering: { how: string; session: string | null } }
    // THE OFFICE CANNOT READ INSIDE AN OPENCODE SESSION, so the beating hold is the whole answer:
    // the session it names is a live session. The waiter's own output above is what proves it is
    // still holding, which is what this case is about.
    expect(stands.answering.how).toBe('a live session')
    expect(stands.answering.session).toBe(session)
    waiter.child.kill('SIGTERM')
    await waiter.ended
  }, 60_000)

  it('prints the message and stops for a Claude Code session, because stopping is what wakes it', async () => {
    const waiter = startTheWaiter([
      '--agent',
      'woken',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
      '--runtime',
      'claude-code',
    ])
    expect(await until(() => waiter.said().includes('Holding the handle'))).toBe(true)

    await sendTheAgentAMessage('And the second one, please.')

    const code = await Promise.race([
      waiter.ended,
      new Promise<number>((go) => setTimeout(() => go(-2), 20_000)),
    ])
    expect(code, `the waiter never stopped: ${waiter.said()}`).toBe(0)
    // THE SAME ENVELOPE THE RUN PROMPT CARRIES: who sent it, which project, which message. That is the
    // rule, and its one declaration is in src/shared/messages.ts.
    expect(waiter.said()).toContain('WHO SENT IT:')
    expect(waiter.said()).toContain('WRITTEN IN:')
    expect(waiter.said()).toContain('THE MESSAGE, record')
    expect(waiter.said()).toContain('And the second one, please.')
    // AND IT DID NOT LET GO OF THE HANDLE, because the session it woke is about to answer.
    const stands = (
      await app.inject({ method: 'GET', url: '/api/handles/woken', headers: AS_THE_OWNER })
    ).json() as { answering: { how: string; session: string | null } }
    // THE HOLD STILL BEATS, a few seconds old, and nothing read of the session turns it to not
    // answering: no transcript is on its record and no process of its own is recorded. So the
    // session it names is a live session, on its hold.
    expect(stands.answering.how).toBe('a live session')
    expect(stands.answering.session).toBe(session)
  }, 60_000)
})

// ============================================================ the waiter across a restart

/**
 * THE API GOES AWAY AND COMES BACK, AND THE WAITER IS STILL HOLDING.
 *
 * Problem `Dm8eX0oNrVS5`, measured by the coordinator on the live stack on 5 September 2026. The
 * API restarts under its supervisor at every merge. When it did, the waiter's stream died mid-read
 * with undici's `TypeError: terminated`, nothing caught it, and the process exited 1 inside two
 * minutes — leaving the session it belonged to answering as nobody with nothing on screen to say so.
 *
 * THIS DRIVES THE REAL SCRIPT AGAINST A REAL SERVER THAT IS REALLY STOPPED. A stub that closed a
 * socket would prove something about a stub; what broke was a stream held open by one process and
 * cut when that process died, and this is that. The server is listened on a port of its own and
 * closed with `app.close()`, which drops every held connection exactly as a supervisor's restart
 * does, and a second one is opened on the same port afterwards.
 *
 * THE CONNECTIONS ARE CUT, NOT WAITED OUT. The waiter holds a request at the waiting door for up to
 * thirty seconds, and `app.close()` on its own waits for that request to end before it lets go.
 * Until 25 September 2026 this case waited out that thirty seconds, and the hold then ended in an
 * ordinary answer rather than a dropped stream. `closeAllConnections` cuts it, which is the fault
 * this describe is about.
 */
describe('the waiter across a restart of the API', () => {
  let t: TestDb
  let first: FastifyInstance
  let second: FastifyInstance | null = null
  let port = 0
  let api = ''
  let resources: typeof import('../src/server/lib/resources.ts')
  let agentId = ''
  let session = ''
  /** The agent's own key, made in this test's database and never printed. */
  let agentKey = ''
  const started: ChildProcess[] = []

  const AS_THE_OWNER = {
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }

  beforeAll(async () => {
    t = await freshDb()
    resources = await import('../src/server/lib/resources.ts')
    first = (await apiApp()).app
    await first.ready()
    await first.listen({ host: '127.0.0.1', port: 0 })
    port = (first.server.address() as AddressInfo).port
    api = `http://127.0.0.1:${String(port)}`
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'Across a restart',
      data: { handle: 'across-a-restart', runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The terminal that stayed open',
      data: {
        state: 'running',
        runtime: 'claude-code',
        doing: 'answering as across-a-restart',
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId: 'waking-across-a-restart',
            logPath: aTranscript(),
            resumeCommand: null,
            startedAt: null,
            entryPoint: null,
          },
        },
      },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    /**
     * A LIVE PROCESS FOR THE SESSION, BECAUSE A SESSION THAT IS ANSWERING HAS ONE. Criterion M106:
     * the waiter's beat is no longer the only fact the handle door reads. This is the test's own
     * process, registered while it runs.
     */
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: { type: 'human', id: THE_PERSON },
    })
    const listed = (
      await first.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
    ).json() as { agents: { id: string; handle: string }[] }
    agentId = listed.agents.filter((a) => a.handle === 'across-a-restart')[0]?.id ?? ''
    // THE WAITER PROVES ITSELF WITH THE AGENT'S OWN KEY, which a decision asks of every agent's
    // tool. The hold door refuses a hold that comes with no key (keys wave piece 7), and
    // the office-key fallback reads a file in this test's folder, which was seen gone mid-run on 26 September 2026.
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    agentKey = makeAnAgentKey(agentId, null)
  }, 60_000)

  afterAll(async () => {
    for (const child of started) {
      // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
      if (child.pid === undefined) continue
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // Already gone, which is the outcome this wanted.
      }
    }
    if (second !== null) await second.close()
    await first.close().catch(() => undefined)
    t.close()
    rmSync(transcripts, { recursive: true, force: true })
  })

  /** Whichever server is up now. */
  function up(): FastifyInstance {
    return second ?? first
  }

  async function until(what: () => boolean | Promise<boolean>, within = 40_000): Promise<boolean> {
    const deadline = Date.now() + within
    while (Date.now() < deadline) {
      if (await what()) return true
      await new Promise((go) => setTimeout(go, 200))
    }
    return false
  }

  it('does not stop when the stream dies, keeps beating, and takes the next message', async () => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
        '--agent',
        'across-a-restart',
        '--session',
        session,
        '--api',
        api,
        '--workspace',
        'default',
        '--runtime',
        'claude-code',
      ],
      { env: { ...process.env, MOLE_AGENT_KEY: agentKey, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS: '600' } },
    )
    started.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    let stopped: number | null = null
    child.on('exit', (code) => (stopped = code ?? -1))
    expect(await until(() => printed.includes('Holding the handle'))).toBe(true)

    // THE API GOES AWAY, dropping the stream this waiter is reading, exactly as a merge does.
    // `close` on its own waits for every open request to end, and the waiter's hold runs for thirty
    // seconds, so the hold would end in an ordinary answer and nothing would be dropped. Cutting
    // every connection as the close begins is what a restart does. A request that arrives after this
    // is answered at once, with a 503, because the close has already shut the routes.
    const closing = first.close()
    first.server.closeAllConnections()
    await closing
    // NOTHING IS PRINTED WHILE THE OFFICE IS AWAY: the outage is one line when it answers again
    // . The office's own timing sets the beat, so a beat may or may not fall
    // in these three seconds, and the line below takes either of the two ways the waiter says it.
    await new Promise((go) => setTimeout(go, 3_000))
    expect(printed, 'the waiter said something while the office was away').not.toMatch(/^Mole Office /m)
    // AND IT IS STILL RUNNING. This is the whole of problem Dm8eX0oNrVS5: it used to be gone by now.
    expect(stopped, `the waiter stopped when the stream died: ${printed}`).toBeNull()

    // AND THE API COMES BACK ON THE SAME PORT.
    second = (await apiApp()).app
    await second.ready()
    await second.listen({ host: '127.0.0.1', port })
    expect(stopped, `the waiter stopped while the API was coming back: ${printed}`).toBeNull()

    // AND IT IS STILL HOLDING THE HANDLE, which is what the session it belongs to depends on.
    const stands = (
      await up().inject({ method: 'GET', url: '/api/handles/across-a-restart', headers: AS_THE_OWNER })
    ).json() as { answering: { how: string; session: string } }
    expect(stands.answering.how).toBe('a live session')
    expect(stands.answering.session).toBe(session)

    // AND A MESSAGE WRITTEN NOW STILL REACHES IT, and the waiter says the office is back before it
    // hands the message on. THE MESSAGE IS WRITTEN BEFORE THE WAITER HAS SAID SO, on purpose. The
    // waiter says the office is back when its next ask is answered, and that ask is a hold of up to
    // thirty seconds. A message answers it at once, so this case does not wait out the hold.
    await up().inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'message',
        title: 'after the restart',
        data: { body: 'Are you still there after the restart?', to: [{ kind: 'agent', id: agentId }] },
      },
    })
    expect(await until(() => printed.includes('Are you still there after the restart?')), printed).toBe(true)
    const back = printed.search(/^Mole Office (was away|would not say what is waiting for "across-a-restart" from) \d/m)
    expect(back, `the waiter never said the office was back: ${printed}`).toBeGreaterThan(-1)
    expect(back, 'the waiter handed the message on before it said the office was back').toBeLessThan(
      printed.indexOf('Are you still there after the restart?'),
    )
    expect(await until(() => stopped === 0), `the waiter never woke its session: ${printed}`).toBe(true)
  }, 120_000)

  it('takes a message that was written while the API was away, once it is back', async () => {
    // THE HOLD IS STILL THE SESSION'S: the waiter above stopped to wake its session and kept it.
    const before = (
      await up().inject({ method: 'GET', url: '/api/handles/across-a-restart', headers: AS_THE_OWNER })
    ).json() as { answering: { how: string } }
    expect(before.answering.how).toBe('a live session')

    // A MESSAGE ARRIVES WITH NO WAITER RUNNING, which is what the gap between two waiters is.
    await up().inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'message',
        title: 'while nothing was listening',
        data: { body: 'This one was written while nothing was listening.', to: [{ kind: 'agent', id: agentId }] },
      },
    })

    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
        '--agent',
        'across-a-restart',
        '--session',
        session,
        '--api',
        api,
        '--workspace',
        'default',
        '--runtime',
        'claude-code',
      ],
      { env: { ...process.env, MOLE_AGENT_KEY: agentKey, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS: '600' } },
    )
    started.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))

    // NO EVENT WILL EVER BE SENT FOR IT — it was written before this waiter connected, and a server
    // that restarted cannot replay past its own restart. It is read from what is waiting instead.
    expect(
      await until(() => printed.includes('This one was written while nothing was listening.')),
      `the waiter never picked up the message written while it was away: ${printed}`,
    ).toBe(true)
  }, 120_000)
})
