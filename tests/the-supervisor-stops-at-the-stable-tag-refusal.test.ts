// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUPERVISOR STOPS AT THE STABLE CHECKOUT'S REFUSAL, AND THE PORT SAYS WHY.
 *
 * The stable office runs from its own clone at a dated tag of its last upgrade. A server started
 * from a checkout that is not at one refuses with `THE_STABLE_TAG_REFUSAL_EXIT_CODE` (78). The secretary was
 * told: "The refusal is not a crash, so the restart count and the summons do not see it" (the
 * supervisor's answer, message P2rXxeXnN_FL). So the supervisor writes the server's own sentence
 * where the page can read it, starts the stand-in with it, arms no backoff and starts no server
 * again.
 *
 * WHAT IS PROVED HERE, ONE SCENE DRIVEN OVER A SCRATCH CHECKOUT, as
 * tests/the-supervisor-stops-at-the-guards-refusal.test.ts drives the real supervisor with `serveDev`:
 *
 *   1. The child is started exactly once, and after longer than the first backoff (0.5s) the count
 *      still says one, so no backoff was armed and no second start came.
 *   2. The refusal file holds the child's own sentence, written once, and after it the two steps that
 *      put the copy back (THE_STABLE_TAG_PUT_BACK). The agent asked to put the copy back meets the
 *      refusal in the log, the refusal file and the 503 body, so the steps are in all three (as in
 *      kM-Vho9xqlCm).
 *   3. No trouble file is written and the run of failed starts does not move: the threshold is set
 *      to one, so a single counted failure would write the file the health check reads.
 *   4. The stand-in answers 503 on the port with that sentence and the steps, and carries
 *      `refusal: "not-at-a-dated-stable-tag"`, the fixed word the self-check reads.
 *
 * MUTATIONS, each planted alone with the branch in place and this whole file run:
 *   - let the new code count as a failed start (move the branch below the counter lines): the second
 *     scene goes red, because the one ordinary failure after the refusal reads "2 in a row" and
 *     writes the trouble file the health check reads;
 *   - let serve-dev start the server again after the new code (drop the branch's return so it falls
 *     into the ordinary backoff): the first scene's child is started again and the log says
 *     "Starting it again in", red;
 *   - drop the steps from what serve-dev writes and says (the fact is the child's sentence alone): the
 *     first scene goes red on the refusal file.
 */

import { afterAll, describe, expect, it } from 'vitest'
import { cpSync, existsSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { serveDev } from '../tools/serve-dev.mjs'
import {
  THE_STABLE_TAG_PUT_BACK,
  THE_STABLE_TAG_REFUSAL,
  THE_STABLE_TAG_REFUSAL_BEGINS,
  THE_STABLE_TAG_REFUSAL_EXIT_CODE,
} from '../src/config/stable-tag.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { readTheTrouble, theRefusalFileIn, theTroubleFileIn } from '../src/config/supervisor-trouble.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      probe.close(() => done(port))
    })
  })
}

/** Wait until `test` is happy, or say what the last reading was. */
async function until(test: () => boolean | Promise<boolean>, what: string, within = 30_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (await test()) return
    await sleep(100)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s`)
}

/** A scratch checkout the supervisor can watch, with the tools and source of this one. */
function aScratchCheckout(what: string): string {
  const dir = aTestDatabaseFolder(what)
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'public', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  return dir
}

/** How many lines a file has, and zero when it is not there. */
function howManyLines(file: string): number {
  if (!existsSync(file)) return 0
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '').length
}

/** The supervisor's own lines, kept apart from any other scene's. */
function aRecorder(): { lines: string[]; say: (line: string) => void; said: (what: string) => number } {
  const lines: string[] = []
  return {
    lines,
    say: (line) => lines.push(line),
    said: (what) => lines.filter((line) => line.includes(what)).length,
  }
}

/**
 * THE CHILD THAT REFUSES IN THE SERVER'S OWN WORDS. It imports a file the server is built from, so
 * the set the supervisor watches is not empty, and it leaves a line per run so the test can count
 * the starts.
 */
const A_CHILD_THAT_IS_NOT_AT_A_DATED_TAG = `
import { appendFileSync } from 'node:fs'
import './watched.ts'
const marker = process.env.MOLE_OFFICE_TEST_STARTS
if (typeof marker === 'string') appendFileSync(marker, 'started\\n')
process.stderr.write(String(process.env.MOLE_OFFICE_TEST_REFUSAL) + '\\n')
process.exit(Number(process.env.MOLE_OFFICE_TEST_EXIT))
`

const THE_HEAD_SHA_THE_CASE_MAKES_UP = '0123456789abcdef0123456789abcdef01234567'
const THE_SENTENCE_THE_CASE_MAKES_UP =
  `${THE_STABLE_TAG_REFUSAL_BEGINS} and HEAD is refs/heads/stable at ${THE_HEAD_SHA_THE_CASE_MAKES_UP}, ` +
  'and no dated tag names that commit.'

/**
 * THE CHILD THAT REFUSES, THEN CRASHES ONCE, THEN SERVES: the scene that shows whether the refusal
 * moved the run of failed starts. The crash file is renamed as it crashes, so the start after it
 * serves and the count can be read from what the supervisor says and writes.
 */
const A_CHILD_THAT_REFUSES_THEN_CRASHES = `
import { appendFileSync, existsSync, renameSync } from 'node:fs'
import { createServer } from 'node:http'
import './watched.ts'
const marker = process.env.MOLE_OFFICE_TEST_STARTS
if (typeof marker === 'string') appendFileSync(marker, 'started\\n')
if (existsSync('the-crash-comes-next')) {
  renameSync('the-crash-comes-next', 'the-crash-happened')
  process.stderr.write('Error: an ordinary made-up crash, not the stable checkout\\n')
  process.exit(1)
}
if (!existsSync('the-crash-happened')) {
  process.stderr.write(String(process.env.MOLE_OFFICE_TEST_REFUSAL) + '\\n')
  process.exit(Number(process.env.MOLE_OFFICE_TEST_EXIT))
}
const server = createServer((request, reply) => {
  if (request.method === 'GET' && request.url === '/api/health') {
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify({ ok: true }))
    return
  }
  reply.writeHead(404)
  reply.end('{}')
})
server.listen(process.env.MOLE_OFFICE_LISTEN_FD ? { fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) } : { port: Number(process.env.MOLE_OFFICE_PORT) })
process.on('SIGTERM', () => server.close(() => process.exit(0)))
`

/** Every folder this file made, removed when it is done. */
const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
  for (const name of [
    'MOLE_OFFICE_PORT',
    'MOLE_OFFICE_DB',
    'MOLE_OFFICE_WORKSPACE',
    'MOLE_OFFICE_TEST_STARTS',
    'MOLE_OFFICE_TEST_REFUSAL',
    'MOLE_OFFICE_TEST_EXIT',
    'MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING',
  ]) {
    delete process.env[name]
  }
})

describe('the supervisor stops at the stable checkout’s refusal', () => {
  it('starts the refused server once, counts it as nothing, writes the sentence, and lets the stand-in answer 503 with it', async () => {
    const dir = aScratchCheckout('stable-tag-refusal')
    dirs.push(dir)
    writeFileSync(join(dir, 'src/server/index.ts'), A_CHILD_THAT_IS_NOT_AT_A_DATED_TAG)
    writeFileSync(join(dir, 'src/server/watched.ts'), 'export const watched = 1\n')
    const starts = join(dir, 'starts.log')
    const port = await freePort()
    process.env['MOLE_OFFICE_PORT'] = String(port)
    process.env['MOLE_OFFICE_DB'] = join(dir, 'office.db')
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    process.env['MOLE_OFFICE_TEST_REFUSAL'] = THE_SENTENCE_THE_CASE_MAKES_UP
    process.env['MOLE_OFFICE_TEST_EXIT'] = String(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
    // One counted failure would write the trouble file the health check reads, so its absence is the count's evidence.
    process.env['MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING'] = '1'
    const said = aRecorder()
    const supervisor = await serveDev({ root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => existsSync(theRefusalFileIn(dir)), 'the refusal file to be written')
      const written = readFileSync(theRefusalFileIn(dir), 'utf8').trim()
      expect(written).toBe(`${THE_SENTENCE_THE_CASE_MAKES_UP} ${THE_STABLE_TAG_PUT_BACK}`)
      // The refusal file and the log line name stable's HEAD, which is what the port watch and the
      // agent who puts the copy back read while the office is down.
      expect(written).toContain(THE_HEAD_SHA_THE_CASE_MAKES_UP)
      expect(said.lines.some((line) => line.includes(THE_HEAD_SHA_THE_CASE_MAKES_UP))).toBe(true)
      expect(said.said(THE_SENTENCE_THE_CASE_MAKES_UP)).toBe(1)
      expect(said.said(`${THE_SENTENCE_THE_CASE_MAKES_UP} ${THE_STABLE_TAG_PUT_BACK}`)).toBe(1)
      // Longer than the ordinary first backoff (0.5s), so a restart that should not come would have come.
      await sleep(3_000)
      expect(howManyLines(starts)).toBe(1)
      expect(said.said('Starting it again in')).toBe(0)
      expect(said.said('the server stopped on its own')).toBe(0)
      expect(readTheTrouble(dir)).toBeNull()
      expect(existsSync(theTroubleFileIn(dir))).toBe(false)
      let answered: Response | null = null
      const stopAt = Date.now() + 30_000
      while (answered === null && Date.now() < stopAt) {
        try {
          const reply = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(4_000) })
          if (reply.status === 503) answered = reply
        } catch {
          // The stand-in is not listening yet. The socket holds the connection until it is.
        }
        if (answered === null) await sleep(100)
      }
      if (answered === null) throw new Error('the stand-in did not answer 503 on the port')
      expect(answered.headers.get(STAND_IN_HEADER)).toBe(String(process.pid))
      const body = /** @type {{ error?: string, refusal?: string }} */ (await answered.json())
      expect(body.error).toContain(`${THE_SENTENCE_THE_CASE_MAKES_UP} ${THE_STABLE_TAG_PUT_BACK}`)
      expect(body.refusal).toBe(THE_STABLE_TAG_REFUSAL)
    } finally {
      await supervisor.stop()
    }
  }, 60_000)

  it('counts the refusal as nothing, so the one ordinary failure after it is the first in a row', async () => {
    const dir = aScratchCheckout('stable-tag-not-counted')
    dirs.push(dir)
    writeFileSync(join(dir, 'src/server/index.ts'), A_CHILD_THAT_REFUSES_THEN_CRASHES)
    writeFileSync(join(dir, 'src/server/watched.ts'), 'export const watched = 1\n')
    const starts = join(dir, 'starts.log')
    process.env['MOLE_OFFICE_PORT'] = String(await freePort())
    process.env['MOLE_OFFICE_DB'] = join(dir, 'office.db')
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    process.env['MOLE_OFFICE_TEST_REFUSAL'] = THE_SENTENCE_THE_CASE_MAKES_UP
    process.env['MOLE_OFFICE_TEST_EXIT'] = String(THE_STABLE_TAG_REFUSAL_EXIT_CODE)
    process.env['MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING'] = '2'
    const said = aRecorder()
    const supervisor = await serveDev({ root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => existsSync(theRefusalFileIn(dir)), 'the refusal to be written')
      expect(howManyLines(starts)).toBe(1)
      // The next start crashes once, then the start after it serves. One ordinary failure follows the
      // refusal, so the count is 1: below the threshold of 2, and no trouble file is written.
      writeFileSync(join(dir, 'the-crash-comes-next'), 'the next start crashes\n')
      utimesSync(join(dir, 'src/server/watched.ts'), new Date(), new Date())
      await until(() => howManyLines(starts) >= 3, 'the start after the one ordinary crash')
      expect(said.said('1 in a row')).toBe(1)
      expect(said.said('2 in a row')).toBe(0)
      expect(readTheTrouble(dir)).toBeNull()
      expect(existsSync(theTroubleFileIn(dir))).toBe(false)
    } finally {
      await supervisor.stop()
    }
  }, 60_000)
})
