// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IS SEALED ON ITS COMMAND'S EXIT ONLY WHEN IT SAYS IT SEALS (WzlhElg3MepN and kGtBA49SnhLf, 9 November 2026;
 * run A). Last night a map round on Terra wrote in its report that it was not done, and the launcher still sealed it
 * on its clean exit, because a clean exit, commits beyond the cut and a linked report were enough. The rule the secretary's
 * seal-wait used as a grep is now one module, tools/a-run-says-it-seals.mjs, which the launcher asks before it seals.
 * These cases are the rule itself, case for case as the secretary gave it, and how the run's last word to its starter is chosen.
 */
import { describe, expect, it } from 'vitest'
import { A_PAGE_OF_MESSAGES, PAGES_AT_MOST, theAgentsMessagesSince, theLastWordToTheStarter, whatItSays, whatTheRunSays } from '../tools/a-run-says-it-seals.mjs'

describe("what a run's message says about its seal", () => {
  it.each([
    ['I seal next.', 'seals'],
    ['Sealing now, at tip 3a9b5c98b.', 'seals'],
    ['Round EB ends: I seal next', 'seals'],
    ['I will seal when the gates pass.', 'seals'],
    ["I'm done. The report is linked.", 'seals'],
    ['We are done here.', 'seals'],
    ['I can say that I am done.', 'seals'],
    ['Round 72 is done.', 'seals'],
    ['Round EA (the timers) is done.', 'seals'],
    ['The seal of 3a9b5c98b follows.', 'seals'],
    ['I seal last, after the timing group.', 'seals'],
  ])('%s -> %s', (words, says) => {
    expect(whatItSays(words)).toBe(says)
  })

  it.each([
    ['I do not seal: the work is not done.', 'holds'],
    ["I don't seal yet; the progress report is linked.", 'holds'],
    ['I don’t seal yet.', 'holds'],
    ['I am not sealing this round.', 'holds'],
    ['Please do NOT seal this; I stopped to ask.', 'holds'],
    // HOLD WINS, whatever else the message says.
    ['I am done for now, but I do not seal: two cases are red.', 'holds'],
  ])('%s -> %s', (words, says) => {
    expect(whatItSays(words)).toBe(says)
  })

  it('reads "If main has moved, I will not seal" as a condition beside a seal, not a hold (9 October 2026)', () => {
    expect(whatItSays('I seal next. If main has moved, I will not seal.')).toBe('seals')
  })

  it('reads a progress report that says nothing of a seal as silent, and no words as silent', () => {
    expect(whatItSays('Not done: three of five items are built; the rest is in NEXT.md.')).toBe('silent')
    expect(whatItSays('')).toBe('silent')
    expect(whatItSays(undefined)).toBe('silent')
  })
})

describe("the run's last word to its starter", () => {
  const run = { createdAt: '2026-11-09 01:00:00', data: { servingAgentId: 'W0rkerAgent1', servingAgent: 'w13x-map-terra', startedAt: '2026-11-09 01:00:05' } }
  const message = (id: string, sentAt: string, body: string, from = 'W0rkerAgent1', to = ['Sup3rvisor01']) => ({
    id, sentAt, title: '', body, sentBy: { kind: 'agent', id: from }, to: to.map((one) => ({ kind: 'agent', id: one })),
  })

  it('is the newest message since the run began, from its agent, with its starter among the recipients', () => {
    const messages = [
      message('older', '2026-11-09 01:10:00', 'I seal next.'),
      message('newest', '2026-11-09 02:40:00', 'Not done: the map is half drawn; progress in the report.'),
      message('to-someone-else', '2026-11-09 02:50:00', 'I seal next.', 'W0rkerAgent1', ['SomebodyElse']),
      message('from-someone-else', '2026-11-09 02:55:00', 'I seal next.', 'SomebodyElse'),
      message('before-the-run', '2026-11-08 23:00:00', 'I seal next.'),
    ]
    expect(theLastWordToTheStarter(messages, { agentIds: ['W0rkerAgent1'], starterIds: ['Sup3rvisor01'], since: '2026-11-09 01:00:05' })?.id).toBe('newest')
    expect(whatTheRunSays(run, messages, ['Sup3rvisor01'])).toEqual({ says: 'silent', message: 'newest' })
  })

  it('says seals when the newest such message says it seals, and silent when the run said nothing to its starter', () => {
    const sealed = [message('a', '2026-11-09 01:10:00', 'Progress only.'), message('b', '2026-11-09 03:00:00', 'Round DO is done. I seal next.')]
    expect(whatTheRunSays(run, sealed, ['Sup3rvisor01'])).toEqual({ says: 'seals', message: 'b' })
    expect(whatTheRunSays(run, [], ['Sup3rvisor01'])).toEqual({ says: 'silent', message: null })
    expect(whatTheRunSays(run, sealed, ['NotTheStarter'])).toEqual({ says: 'silent', message: null })
  })

  it('takes, of two messages sent in the same second, the one the pool stored later, which it lists after the other', () => {
    // The pool's order: newest moment first, then the order the rows were stored (NEWEST_FIRST in src/server/lib/messages.ts).
    const sameSecond = [
      message('newer-moment', '2026-11-09 03:00:01', 'Progress only.', 'W0rkerAgent1', ['SomebodyElse']),
      message('stored-first', '2026-11-09 03:00:00', 'I seal next.'),
      message('stored-second', '2026-11-09 03:00:00', 'Not done: two of five items are built.'),
    ]
    expect(whatTheRunSays(run, sameSecond, ['Sup3rvisor01'])).toEqual({ says: 'silent', message: 'stored-second' })
    expect(whatTheRunSays(run, [sameSecond[2]!, sameSecond[1]!], ['Sup3rvisor01'])).toEqual({ says: 'seals', message: 'stored-first' })
  })

  it('reads the agent by its name as well as its id, and times written with a T', () => {
    const named = [message('c', '2026-11-09T03:00:00.000Z', 'I seal next.', 'w13x-map-terra')]
    expect(whatTheRunSays(run, named, ['Sup3rvisor01'])).toEqual({ says: 'seals', message: 'c' })
  })
})

/**
 * THE AGENT'S MESSAGES ARE READ PAGE BY PAGE UNTIL THE LAST WORD IS KNOWN (10 November 2026). One page of the newest 50 was read
 * before, so a run whose agent had sent 50 messages to others since its word read as silent. A stand-in pool answers pages of
 * the list it holds, newest first, with the `next` request the real pool names.
 */
describe("the agent's messages, page by page", () => {
  const run = { createdAt: '2026-11-10 01:00:00', data: { servingAgentId: 'W0rkerAgent1', startedAt: '2026-11-10 01:00:05' } }
  const message = (id: string, sentAt: string, body: string, to = ['Sup3rvisor01']) => ({
    id, sentAt, title: '', body, sentBy: { kind: 'agent', id: 'W0rkerAgent1' }, to: to.map((one) => ({ kind: 'agent', id: one })),
  })
  /** The pool's pages over `all`, newest first as given, and the paths it was asked. */
  const aPool = (all: unknown[]) => {
    const asked: string[] = []
    const readAPage = async (path: string) => {
      asked.push(path)
      const url = new URL(path, 'http://stand-in')
      const limit = Number(url.searchParams.get('limit')), offset = Number(url.searchParams.get('offset') ?? '0')
      const page = all.slice(offset, offset + limit)
      const left = all.length - offset - page.length
      url.searchParams.set('offset', String(offset + page.length))
      // THE REAL POOL NAMES ITS NEXT PAGE AS A REQUEST, 'GET /api/messages?…' (theNextPage in src/server/api/messages.ts): a bare
      // path here hid that the reader followed it as a path (the inspector, vynMLPwuEjnE).
      return { messages: page, left, truncated: left > 0, next: left > 0 ? `GET ${url.pathname}${url.search}` : null }
    }
    return { asked, readAPage }
  }
  /** `count` messages to somebody else, one a second back from `from`. */
  const toOthers = (count: number, from: string) => Array.from({ length: count }, (_, i) => {
    const at = new Date(`${from.replace(' ', 'T')}Z`)
    at.setUTCSeconds(at.getUTCSeconds() - i)
    return message(`other${String(i)}`, at.toISOString().slice(0, 19).replace('T', ' '), 'Progress for someone else.', ['SomebodyElse'])
  })

  it('reads past a first page of messages to others to the word the run sent its starter', async () => {
    const pool = aPool([...toOthers(A_PAGE_OF_MESSAGES + 20, '2026-11-10 03:00:00'), message('theWord', '2026-11-10 02:00:00', 'Round X is done. I seal next.')])
    const read = await theAgentsMessagesSince(pool.readAPage, run, ['Sup3rvisor01'])
    expect(read.complete).toBe(true)
    expect(pool.asked).toHaveLength(2)
    // THE WORDS ARE ASKED FOR BY NAME, because the pool answers without them when no shape is named.
    expect(pool.asked[0]).toBe(`/api/messages?sender=agent%3AW0rkerAgent1&limit=${String(A_PAGE_OF_MESSAGES)}&full=1`)
    expect(pool.asked[1]).toBe(`/api/messages?sender=agent%3AW0rkerAgent1&limit=${String(A_PAGE_OF_MESSAGES)}&full=1&offset=${String(A_PAGE_OF_MESSAGES)}`)
    expect(whatTheRunSays(run, read.messages, ['Sup3rvisor01'])).toEqual({ says: 'seals', message: 'theWord' })
  })

  it('reads one page when that page holds the word and an older message after it', async () => {
    const pool = aPool([message('theWord', '2026-11-10 02:00:00', 'I seal next.'), message('older', '2026-11-10 01:30:00', 'Progress.'), ...toOthers(A_PAGE_OF_MESSAGES * 3, '2026-11-10 01:20:00')])
    const read = await theAgentsMessagesSince(pool.readAPage, run, ['Sup3rvisor01'])
    expect(pool.asked).toHaveLength(1)
    expect(whatTheRunSays(run, read.messages, ['Sup3rvisor01'])).toEqual({ says: 'seals', message: 'theWord' })
  })

  it('reads the next page when the word is the oldest on its page, for a message of the same second stored after it', async () => {
    // The pool lists two of one second in the order they were stored, so the one on the next page is the later word.
    const all = [...toOthers(A_PAGE_OF_MESSAGES - 1, '2026-11-10 03:00:00'), message('stored-first', '2026-11-10 02:00:00', 'I seal next.'), message('stored-second', '2026-11-10 02:00:00', 'Not done: two of five items are built.')]
    const pool = aPool(all)
    const read = await theAgentsMessagesSince(pool.readAPage, run, ['Sup3rvisor01'])
    expect(pool.asked).toHaveLength(2)
    expect(whatTheRunSays(run, read.messages, ['Sup3rvisor01'])).toEqual({ says: 'silent', message: 'stored-second' })
  })

  it('stops at the page that goes back past the run\'s start, and reads a run that said nothing as silent', async () => {
    const pool = aPool([...toOthers(A_PAGE_OF_MESSAGES + 10, '2026-11-10 01:05:00'), ...toOthers(A_PAGE_OF_MESSAGES * 3, '2026-11-09 23:00:00')])
    const read = await theAgentsMessagesSince(pool.readAPage, run, ['Sup3rvisor01'])
    expect(read.complete).toBe(true)
    expect(pool.asked).toHaveLength(2)
    expect(whatTheRunSays(run, read.messages, ['Sup3rvisor01'])).toEqual({ says: 'silent', message: null })
  })

  it('follows no next page that is not a request of the same door, and says the reading is not complete', async () => {
    const asked: string[] = []
    const read = await theAgentsMessagesSince(async (path: string) => {
      asked.push(path)
      return { messages: toOthers(A_PAGE_OF_MESSAGES, '2026-11-10 06:00:00'), left: 5, truncated: true, next: 'GET /api/records?kind=session' }
    }, run, ['Sup3rvisor01'])
    expect(asked).toHaveLength(1)
    expect(read.complete).toBe(false)
    expect(read).toHaveProperty('why', expect.stringContaining('not a request of GET /api/messages'))
  })

  it('says it is not complete after PAGES_AT_MOST pages with no word, rather than reading the run as silent', async () => {
    const pool = aPool(toOthers(A_PAGE_OF_MESSAGES * (PAGES_AT_MOST + 2), '2026-11-10 06:00:00'))
    const read = await theAgentsMessagesSince(pool.readAPage, run, ['Sup3rvisor01'])
    expect(read.complete).toBe(false)
    expect(pool.asked).toHaveLength(PAGES_AT_MOST)
    expect(read).toHaveProperty('why', expect.stringContaining('more than'))
  })
})

/**
 * THE COMMAND LINE AGAINST A STAND-IN OFFICE on loopback, as seal-wait.sh will call it (node tools/a-run-says-it-seals.mjs
 * <run> --api <address>). A run whose record names no agent it serves cannot be answered for: the command says it could not
 * read it and exits 1, as the launcher's theRunsLastWordToItsStarter does, rather than printing "silent" (the inspector's
 * point at run 64vmaPsvDkMV's release, eB1A_TQHPBWu). A run that names its agent and said it seals prints "seals".
 */
describe('the command line', () => {
  /** This process's environment, asking as a stand-in agent that holds no key: no key goes to the stand-in office. */
  const theToolsEnvironment = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_AGENT: 'Sup3rvisor01' }
    delete env.MOLE_AGENT_KEY
    delete env.MOLE_AGENT_KEY_FILE
    return env
  }
  const runTheTool = async (records: Record<string, unknown>, messages: unknown[]) => {
    const { createServer } = await import('node:http')
    const { spawn } = await import('node:child_process')
    const server = createServer((request, answer) => {
      const url = new URL(request.url ?? '/', 'http://stand-in')
      const id = decodeURIComponent(url.pathname.replace('/api/records/', ''))
      answer.setHeader('content-type', 'application/json')
      if (url.pathname.startsWith('/api/records/') && records[id] !== undefined) return answer.end(JSON.stringify({ record: records[id] }))
      // THE MESSAGES ARE ANSWERED AS THE REAL POOL ANSWERS A PAGE: cut by limit and offset, with the next page named as its request.
      if (url.pathname === '/api/messages') {
        const limit = Number(url.searchParams.get('limit') ?? String(messages.length)), offset = Number(url.searchParams.get('offset') ?? '0')
        const page = messages.slice(offset, offset + limit), left = Math.max(0, messages.length - offset - page.length)
        url.searchParams.set('offset', String(offset + page.length))
        return answer.end(JSON.stringify({ messages: page, left, truncated: left > 0, next: left > 0 ? `GET ${url.pathname}${url.search}` : null }))
      }
      answer.statusCode = 404
      answer.end('{}')
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
    const port = (server.address() as { port: number }).port
    try {
      return await new Promise<{ code: number | null; out: string; err: string }>((done) => {
        const child = spawn(process.execPath, ['tools/a-run-says-it-seals.mjs', 'run000000001', '--api', `http://127.0.0.1:${port}`], {
          env: theToolsEnvironment(),
        })
        let out = ''
        let err = ''
        child.stdout.on('data', (chunk) => (out += String(chunk)))
        child.stderr.on('data', (chunk) => (err += String(chunk)))
        child.on('close', (code) => done({ code, out, err }))
      })
    } finally {
      server.close()
    }
  }

  it('says it could not read a run whose record names no agent it serves, and exits 1', async () => {
    const said = await runTheTool({ run000000001: { id: 'run000000001', kind: 'session', createdAt: '2026-11-09 01:00:00', data: { state: 'running' } } }, [])
    expect(said.code).toBe(1)
    expect(said.err).toContain('It could not be read')
    expect(said.err).toContain('names no agent it serves')
    expect(said.out).toBe('')
  }, 30_000)

  /** The session that started the run: it serves the supervisor, the run's starter. */
  const starting = { id: 'startSess001', kind: 'session', createdAt: '2026-11-09 00:59:00', data: { state: 'running', servingAgentId: 'Sup3rvisor01' } }
  it('prints what the run said when its record names its agent and the session that started it', async () => {
    const record = { id: 'run000000001', kind: 'session', createdAt: '2026-11-09 01:00:00', data: { state: 'running', servingAgentId: 'W0rker000001', parentAttachment: 'startSess001' } }
    const word = { id: 'msgSeal00001', sentAt: '2026-11-09 02:00:00', title: 'The run ends', body: 'I seal next.', sentBy: { id: 'W0rker000001' }, to: [{ kind: 'agent', id: 'Sup3rvisor01' }] }
    const said = await runTheTool({ run000000001: record, startSess001: starting }, [word])
    expect(said.code, said.err).toBe(0)
    expect(said.out.trim()).toBe('seals (message msgSeal00001)')
  }, 30_000)

  /**
   * ITS STARTER IS THE AGENT ITS STARTING SESSION SERVES, NEVER THE CALLER (10 November 2026). The command asked as the caller
   * and counted the caller among the starters, so a run's message to an inspector or a secretary asking about it read as its
   * word to its starter. Here the caller is Sup3rvisor01 (theToolsEnvironment), and the run was started by Another0001.
   */
  it('does not read a message to the caller as the word to its starter when somebody else started the run', async () => {
    const record = { id: 'run000000001', kind: 'session', createdAt: '2026-11-09 01:00:00', data: { state: 'running', servingAgentId: 'W0rker000001', parentAttachment: 'startSess002' } }
    const another = { id: 'startSess002', kind: 'session', createdAt: '2026-11-09 00:59:00', data: { state: 'running', servingAgentId: 'Another0001' } }
    const toTheCaller = { id: 'msgCaller001', sentAt: '2026-11-09 02:00:00', title: '', body: 'I seal next.', sentBy: { id: 'W0rker000001' }, to: [{ kind: 'agent', id: 'Sup3rvisor01' }] }
    const said = await runTheTool({ run000000001: record, startSess002: another }, [toTheCaller])
    expect(said.code, said.err).toBe(0)
    expect(said.out.trim()).toBe('silent')
  }, 30_000)

  it('reads the word on the second page the real pool names, as its request', async () => {
    const record = { id: 'run000000001', kind: 'session', createdAt: '2026-11-09 01:00:00', data: { state: 'running', servingAgentId: 'W0rker000001', parentAttachment: 'startSess001' } }
    const others = Array.from({ length: A_PAGE_OF_MESSAGES + 30 }, (_, i) => ({ id: `msgOther${String(i).padStart(4, '0')}`, sentAt: `2026-11-09 03:${String(59 - Math.floor(i / 60)).padStart(2, '0')}:${String(59 - (i % 60)).padStart(2, '0')}`, title: '', body: 'Progress for someone else.', sentBy: { id: 'W0rker000001' }, to: [{ kind: 'agent', id: 'SomebodyElse' }] }))
    const word = { id: 'msgSeal00002', sentAt: '2026-11-09 02:00:00', title: 'The run ends', body: 'Round Z is done. I seal next.', sentBy: { id: 'W0rker000001' }, to: [{ kind: 'agent', id: 'Sup3rvisor01' }] }
    const said = await runTheTool({ run000000001: record, startSess001: starting }, [...others, word])
    expect(said.code, said.err).toBe(0)
    expect(said.out.trim()).toBe('seals (message msgSeal00002)')
  }, 30_000)

  it('says it could not read a run that names no session that started it, and exits 1', async () => {
    const record = { id: 'run000000001', kind: 'session', createdAt: '2026-11-09 01:00:00', data: { state: 'running', servingAgentId: 'W0rker000001' } }
    const word = { id: 'msgSeal00001', sentAt: '2026-11-09 02:00:00', title: '', body: 'I seal next.', sentBy: { id: 'W0rker000001' }, to: [{ kind: 'agent', id: 'Sup3rvisor01' }] }
    const said = await runTheTool({ run000000001: record }, [word])
    expect(said.code).toBe(1)
    expect(said.err).toContain('names no session that started it')
    expect(said.out).toBe('')
  }, 30_000)
})
