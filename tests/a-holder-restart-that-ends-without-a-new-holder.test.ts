// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTART OF THE TERMINAL HOLDER THAT ENDS WITHOUT A NEW HOLDER IS REFUSED BY ITS CODE, AND THE OLD HOLDER'S
 * SESSION ROW SAYS RUNNING ONLY WHILE IT RUNS. Wave 13u round 35 (src/server/lib/the-holders-restart.ts).
 *
 * tests/the-terminal-holder-restarts-from-settings.test.ts meets the press's other refusals and a full restart. These
 * are the three ways it can end after the old holder was signalled, each with a place, a holder and a scratch server
 * of its own, so the holder's socket is the test's and the live office and its holder are never reached:
 *
 *   1. The old holder still runs six seconds after SIGTERM: refused 504 terminalHolderRestartStillRuns. No new holder is
 *      started, its ledger row is closed, and its session row still says running, because it does. The holder here is
 *      MADE UP for this test: a small program that answers hello and list in the holder's words, holds no terminal and
 *      ignores SIGTERM. It is stopped by its group with SIGKILL at the end of the case.
 *   2. The old holder goes and MOLE_OFFICE_TERMINAL_HOLDER is off, as on any test server: refused 502
 *      terminalHolderRestartNotStarted. No holder answers, and the old holder's session row is closed as gone.
 *   3. The old holder goes and the new one is started and does not answer within the start's ten seconds: refused 504
 *      terminalHolderRestartNoAnswer. The new holder is left running, and the old holder's session row is closed as gone.
 *      The new holder is the real one, made slow by a file of this test's own that its server passes in NODE_OPTIONS:
 *      in a process started on the holder's program it waits twenty seconds before the holder's own code runs.
 *
 * Every process is stopped by its process group (tests/terminal-holder-stand.ts).
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - lib/the-holders-restart.ts: the check that the old holder still runs after the wait is taken out: case 1 goes red.
 *   - lib/the-holders-restart.ts: the refusal for a holder that is turned off is taken out: case 2 goes red.
 *   - lib/the-holders-restart.ts: the refusal for a new holder that does not answer is taken out: case 3 goes red.
 *   - lib/the-holders-restart.ts: the old holder's row is not asked about before the refusal: cases 2 and 3 go red.
 *   - lib/own-rows.ts: the close does not ask whether the process is gone: case 1 goes red.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { THE_HOLDER_PROTOCOL } from '../src/config/the-terminal-holder.mjs'
import {
  aPlace,
  ask,
  groups,
  isAlive,
  startAHolder,
  startAServer,
  stopEverything,
  stopTheGroup,
  THE_HOLDER,
  until,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

interface TheList {
  holder: { state: string; pid?: number; startedAt?: string | null }
  terminals: unknown[] | null
}

async function theList(server: ScratchServer): Promise<TheList> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return listed.body as unknown as TheList
}

/** Ask the press with what GET /api/terminals shows now, as the confirming press does. */
async function restartWhatIsShown(server: ScratchServer): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = await theList(server)
  expect(now.holder.state, JSON.stringify(now.holder)).toBe('running')
  const shown = { pid: now.holder.pid!, startedAt: now.holder.startedAt ?? null, terminals: [] }
  return ask(server.api, '/api/terminals/holder/restart', { method: 'POST', body: { expect: shown } })
}

interface TheOldHolder {
  processRow: { releasedAt: string | null; releaseNote: string | null }
  session: { state?: unknown; closedBecause?: unknown }
}

/** The holder's process row in the ledger, and the session row it stands under. */
async function theRowsOf(server: ScratchServer, pid: number): Promise<TheOldHolder> {
  const ledger = await ask(server.api, '/api/resources?includeReleased=true')
  expect(ledger.status, JSON.stringify(ledger.body).slice(0, 500)).toBe(200)
  const rows = (ledger.body['resources'] ?? []) as { type: string; key: string; sessionRecordId: string; releasedAt: string | null; releaseNote: string | null }[]
  const mine = rows.filter((row) => row.type === 'process' && row.key === String(pid))
  expect(mine.length, JSON.stringify(rows)).toBe(1)
  const read = await ask(server.api, `/api/records/${mine[0]!.sessionRecordId}`)
  expect(read.status, JSON.stringify(read.body).slice(0, 500)).toBe(200)
  return { processRow: mine[0]!, session: (read.body['record'] as { data: TheOldHolder['session'] }).data }
}

/** A MADE-UP HOLDER: it answers hello and list in the holder's words, holds no terminal, and ignores SIGTERM. */
function startAHolderThatIgnoresSigterm(place: Place): number {
  const program = join(place.dir, 'made-up-holder.mjs')
  writeFileSync(
    program,
    [
      "import { createServer } from 'node:net'",
      'const [socket, database, protocol] = process.argv.slice(2)',
      "process.on('SIGTERM', () => {})",
      'createServer((connection) => {',
      "  let pending = ''",
      "  connection.setEncoding('utf8')",
      "  connection.on('data', (chunk) => {",
      '    pending += chunk',
      "    for (let end = pending.indexOf('\\n'); end >= 0; end = pending.indexOf('\\n')) {",
      '      const asked = JSON.parse(pending.slice(0, end))',
      '      pending = pending.slice(end + 1)',
      "      const answer = asked.op === 'hello' ? { ok: true, protocol: Number(protocol), pid: process.pid, startedAt: null, database }",
      "        : asked.op === 'list' ? { ok: true, terminals: [] } : { ok: false, error: 'This made-up holder answers hello and list only.' }",
      "      connection.write(JSON.stringify({ id: asked.id, ...answer }) + '\\n')",
      '    }',
      '  })',
      '}).listen(socket)',
      '',
    ].join('\n'),
  )
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  const child = spawn(process.execPath, [program, place.socket, place.database, String(THE_HOLDER_PROTOCOL)], {
    cwd: place.dir,
    env: { ...process.env, ...place.env },
    detached: true,
    stdio: 'ignore',
  })
  if (child.pid === undefined) throw new Error('The made-up holder could not be started: no process was made.')
  groups.add(child.pid)
  child.unref()
  return child.pid
}

describe('a restart of the terminal holder that ends without a new holder', () => {
  it('1: the old holder still runs after SIGTERM: refused StillRuns, none is started, and its session row still says running', async () => {
    const place = aPlace('rs-still')
    const madeUp = startAHolderThatIgnoresSigterm(place)
    const server = await startAServer(place)
    const listed = await until(() => theList(server), (now) => now.holder.pid === madeUp)
    expect(listed.holder.pid, JSON.stringify(listed.holder)).toBe(madeUp)

    const refused = await restartWhatIsShown(server)
    expect(refused.status, JSON.stringify(refused.body)).toBe(504)
    expect(refused.body['code']).toBe('terminalHolderRestartStillRuns')
    expect(isAlive(madeUp), 'the made-up holder ended').toBe(true)
    expect((await theList(server)).holder.pid, 'another holder answers').toBe(madeUp)
    const rows = await theRowsOf(server, madeUp)
    expect(rows.processRow.releasedAt).not.toBeNull()
    expect(rows.processRow.releaseNote).toContain('restarted by the person from Settings')
    expect(rows.session.state, JSON.stringify(rows.session)).toBe('running')

    // IT IGNORES SIGTERM, so it is stopped by its group with SIGKILL after half a second.
    await stopTheGroup(madeUp, 500)
  }, 120_000)

  it('2: the old holder goes and a new one is turned off: refused NotStarted, and the old session row is closed as gone', async () => {
    const place = aPlace('rs-off')
    const old = await startAHolder(place, { toTheLog: true })
    // THE HOLDER OFF, as on every test server, so no new holder is started.
    const server = await startAServer(place)

    const refused = await restartWhatIsShown(server)
    expect(refused.status, JSON.stringify(refused.body)).toBe(502)
    expect(refused.body['code']).toBe('terminalHolderRestartNotStarted')
    expect(isAlive(old.pid), 'the old holder still runs').toBe(false)
    expect((await theList(server)).holder.state).toBe('off')
    const rows = await theRowsOf(server, old.pid)
    expect(rows.processRow.releasedAt).not.toBeNull()
    expect(rows.session.state, JSON.stringify(rows.session)).toBe('finished')
    expect(String(rows.session.closedBecause)).toContain(`its process ${String(old.pid)} is gone`)
  }, 120_000)

  it('3: the new holder does not answer in time: refused NoAnswer, it is left running, and the old session row is closed as gone', async () => {
    const place = aPlace('rs-slow')
    const old = await startAHolder(place, { toTheLog: true })
    const slow = join(place.dir, 'a-slow-holder.mjs')
    // ITS PID IS WRITTEN DOWN FIRST, so its group is stopped at the end whatever the press answers.
    const slowPid = join(place.dir, 'a-slow-holder.pid')
    writeFileSync(
      slow,
      [
        "// FOR ONE TEST: a process started on the holder's program waits twenty seconds before the holder's code runs.",
        "import { writeFileSync } from 'node:fs'",
        `if (process.argv[1] === ${JSON.stringify(THE_HOLDER)}) {`,
        `  writeFileSync(${JSON.stringify(slowPid)}, String(process.pid))`,
        '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000)',
        '}',
        '',
      ].join('\n'),
    )
    const server = await startAServer(place, undefined, {
      MOLE_OFFICE_TERMINAL_HOLDER: 'on',
      NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(slow).href}`.trim(),
    })

    const refused = await restartWhatIsShown(server)
    const theNewOne = existsSync(slowPid) ? Number(readFileSync(slowPid, 'utf8')) : null
    if (theNewOne !== null) groups.add(theNewOne)
    expect(refused.status, JSON.stringify(refused.body)).toBe(504)
    expect(refused.body['code']).toBe('terminalHolderRestartNoAnswer')
    expect(theNewOne, 'no holder was started').not.toBeNull()
    expect(String(refused.body['error'])).toContain(`A new holder, process ${String(theNewOne)}, was started`)
    expect(isAlive(theNewOne!), 'the new holder was not left running').toBe(true)
    expect(isAlive(old.pid), 'the old holder still runs').toBe(false)
    const rows = await theRowsOf(server, old.pid)
    expect(rows.processRow.releasedAt).not.toBeNull()
    expect(rows.session.state, JSON.stringify(rows.session)).toBe('finished')
    expect(String(rows.session.closedBecause)).toContain(`its process ${String(old.pid)} is gone`)
  }, 120_000)
})
