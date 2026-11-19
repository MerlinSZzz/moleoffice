// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL OUTLIVES A SERVER RESTART, AND THE RESTARTED SERVER REACHES IT AGAIN. Wave 13u, round 1.
 *
 * This is why the terminal holder (src/holder/index.mjs) exists: every merge, restart and tray Restart stops
 * the server, and a terminal must not end with it. So this test starts
 * a real holder and a real scratch server process on a database of its own, opens a terminal through
 * the server's door as the person, stops the server by its process group, starts a new server on the
 * same database, and reaches the same terminal through it.
 *
 *   1. Before the restart: POST /api/terminals opens a shell (201), POST input types into it, and the
 *      screen of GET /api/terminals/:id/stream shows what it printed.
 *   2. The server stops. The terminal's process is still alive.
 *   3. A new server on the same database lists the same terminal, running; typing reaches it; and its
 *      stream's screen shows the output from before the restart and from after it.
 *   4. The ledger holds the holder once: one session record titled "The terminal holder", running, with
 *      the holder's pid, and one process row for it. The restart did not file it again.
 *   5. Since round 50 the holder's record carries the receipt in words that every part of the office gets, from
 *      theOwnPartUsageReceipt: the holder runs no model, and what runs in its terminals is not counted on it. The shell
 *      this test opens is a process of its own, and the test stops it by its own group, apart from the holder's.
 *
 * The test's folder holds the database, XDG_CONFIG_HOME and HOME, so the holder's socket is the test's
 * own and the live office is never reached. Every process is stopped by its process group
 * (tests/terminal-holder-stand.ts).
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - src/server/lib/terminals.ts recordTheHolder(): the search for a standing row finds none, so every
 *     server start files the holder again: case 4 goes red.
 *   - src/config/the-terminal-holder.mjs theTerminalHolderSocket(): put process.pid in the name, so no
 *     other process finds the holder's socket: red from case 1.
 *   - src/server/lib/terminals.ts recordTheHolder(): take `usageReceipt` out of the record it files: case 5
 *     goes red.
 */

import { afterAll, describe, expect, it } from 'vitest'
import { THE_TERMINAL_HOLDER, theOwnPartUsageReceipt } from '../src/config/own-rows.mjs'
import {
  aPlace,
  ask,
  groups,
  isAlive,
  startAHolder,
  startAServer,
  stopEverything,
  stopTheServer,
  theStreamsScreen,
  until,
  type HeldTerminal,
} from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

interface SessionRow {
  id: string
  title: string
  data: { state?: string; usageReceipt?: unknown; extra?: { discovered?: { pid?: number } } }
}

/** Every session record titled as the holder, in the project the test writes to. */
async function theHolderRows(api: string): Promise<SessionRow[]> {
  const read = await ask(api, '/api/records?kind=session&shape=full')
  expect(read.status, JSON.stringify(read.body).slice(0, 500)).toBe(200)
  return ((read.body['records'] ?? []) as SessionRow[]).filter((row) => row.title === THE_TERMINAL_HOLDER)
}

/** The ledger's process rows for one pid. */
async function theProcessRows(api: string, pid: number): Promise<Record<string, unknown>[]> {
  const read = await ask(api, '/api/resources')
  expect(read.status, JSON.stringify(read.body).slice(0, 500)).toBe(200)
  return ((read.body['resources'] ?? []) as Record<string, unknown>[]).filter((row) => row['type'] === 'process' && row['key'] === String(pid))
}

describe('a terminal of the office', () => {
  it('keeps running while the server restarts, and the new server reaches it and does not file the holder twice', async () => {
    const place = aPlace('restart')
    const theHolder = await startAHolder(place)
    const first = await startAServer(place)

    // 1. OPENED AND TYPED INTO THROUGH THE FIRST SERVER, as the person.
    const opened = await ask(first.api, '/api/terminals', {
      method: 'POST',
      body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'] },
    })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const terminal = opened.body['terminal'] as HeldTerminal
    groups.add(terminal.pid)
    expect(terminal.state).toBe('running')
    // The sum is worked out by the shell, so the line it prints is output and not the echo of the typing.
    const typed = await ask(first.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: 'echo before-restart-$((6*7))\r' } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(200)
    const before = await until(() => theStreamsScreen(first.api, terminal.id), (lines) => lines.includes('before-restart-42'))
    expect(before, before.join('\n')).toContain('before-restart-42')

    // THE FIRST SERVER RECORDED THE HOLDER.
    const filedFirst = await until(() => theHolderRows(first.api), (rows) => rows.length > 0)
    expect(filedFirst.map((row) => row.data.extra?.discovered?.pid)).toEqual([theHolder.pid])
    // 5. ITS RECEIPT SAYS IT RUNS NO MODEL, worked out where the server ran.
    expect(filedFirst[0]?.data.usageReceipt, 'the holder was filed without its receipt').toEqual(theOwnPartUsageReceipt(THE_TERMINAL_HOLDER, first.env))

    // 2. THE SERVER STOPS, by its process group. The terminal does not.
    await stopTheServer(first)
    expect(isAlive(first.pid), 'the first server is still running').toBe(false)
    expect(isAlive(terminal.pid), 'the terminal ended with the server').toBe(true)
    expect(isAlive(theHolder.pid), 'the holder ended with the server').toBe(true)

    // 3. A NEW SERVER ON THE SAME DATABASE AND ENVIRONMENT reaches the same terminal.
    const second = await startAServer(place, first.port)
    const listed = await ask(second.api, '/api/terminals')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect((listed.body['holder'] as { state: string; pid: number }).pid).toBe(theHolder.pid)
    const again = ((listed.body['terminals'] ?? []) as HeldTerminal[]).find((one) => one.id === terminal.id)
    expect(again?.state).toBe('running')
    expect(again?.pid).toBe(terminal.pid)
    const typedAgain = await ask(second.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: 'echo after-restart-$((6*7))\r' } })
    expect(typedAgain.status, JSON.stringify(typedAgain.body)).toBe(200)
    const after = await until(() => theStreamsScreen(second.api, terminal.id), (lines) => lines.includes('after-restart-42'))
    expect(after, after.join('\n')).toContain('before-restart-42')
    expect(after, after.join('\n')).toContain('after-restart-42')

    // 4. THE LEDGER HOLDS THE HOLDER ONCE: one session record, running, with its pid, and one process row.
    const rows = await theHolderRows(second.api)
    expect(rows.length, JSON.stringify(rows)).toBe(1)
    expect(rows[0]?.data.state).toBe('running')
    expect(rows[0]?.data.extra?.discovered?.pid).toBe(theHolder.pid)
    expect(rows[0]?.id).toBe(filedFirst[0]?.id)
    const processRows = await theProcessRows(second.api, theHolder.pid)
    expect(processRows.length, JSON.stringify(processRows)).toBe(1)

    await stopTheServer(second)
  }, 240_000)
})
