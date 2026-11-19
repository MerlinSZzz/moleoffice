// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL HOLDER IS RESTARTED BY THE PERSON'S CONFIRMED PRESS, AND ONLY BY ITS LEDGER ROW. Wave 13u round 23, in
 * src/server/lib/the-holders-restart.ts.
 *
 * A real holder and a real scratch server run on a database of this test's own, in a folder of its own, so the
 * holder's socket is the test's and the live office and its holder are never reached. Every terminal here is made up:
 * a shell, a sleep, and a sleep that ignores SIGHUP. Every process is stopped by its process group
 * (tests/terminal-holder-stand.ts), the new holder too.
 *
 *   1. An agent, with its own key, is refused 403 terminalsOnlyThePerson, and the holder and its terminals run on.
 *   2. A body that does not say what was shown is refused 400 terminalHolderRestartBadBody, and nothing is stopped.
 *   3. A confirmation that did not show every terminal, or showed another holder, is refused 409
 *      terminalHolderRestartChanged, and nothing is stopped.
 *   4. The confirmed restart: the old holder is gone, a new one answers with another pid, the terminals that ran are
 *      ended, the answer carries the old holder's last log line naming the terminal that ignored SIGHUP, and the ledger
 *      says so: the old process row released with the restart's note, by the person, and one live row for the new holder.
 *   5. With no holder running, the press is refused 409 terminalHolderRestartNoHolder.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - lib/the-holders-restart.ts: the check for terminals the press did not show is taken out: case 3 goes red.
 *   - lib/the-holders-restart.ts: the release is asked without `force`, so the ledger refuses while the holder's session
 *     runs: case 4 goes red, answered terminalHolderRestartNotSignalled.
 *   - api/terminals.ts: the restart door does not ask onlyThePerson: case 1 goes red.
 */

import { howTheHolderIsNotThisCopys } from '../src/config/the-terminal-holder.mjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aPlace,
  AS_AN_AGENT,
  ask,
  groups,
  isAlive,
  startAHolderNamingACopy,
  REPO,
  startAServer,
  stopEverything,
  stopTheGroup,
  type HeldTerminal,
  type Place,
  type ScratchServer,
  type AHolderNamingACopy,
} from './terminal-holder-stand.ts'

let place: Place
let server: ScratchServer
let namedHolder: AHolderNamingACopy
let theFirstHolder: AHolderNamingACopy['holder']
let anAgent: Record<string, string>

beforeAll(async () => {
  place = aPlace('restart-press')
  // ITS OUTPUT GOES TO ITS LOG, as the service command sends it, so its last line can be read after it stops.
  namedHolder = await startAHolderNamingACopy(place, { toTheLog: true })
  theFirstHolder = namedHolder.holder
  // THE HOLDER ON, as in an installed office, so the press may start a new one. A test server's is off otherwise.
  server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
  const registered = await ask(server.api, '/api/agents/started', {
    method: 'POST',
    body: { handle: AS_AN_AGENT['x-mole-office-actor-id'], name: 'Some agent', role: 'worker' },
  })
  if (registered.status !== 201) throw new Error(`The agent could not be registered: ${JSON.stringify(registered.body)}`)
  const key = String((registered.body['whatToGiveIt'] as { key?: unknown } | undefined)?.key ?? '')
  if (key === '') throw new Error(`The agent was given no key: ${JSON.stringify(registered.body)}`)
  anAgent = { ...AS_AN_AGENT, 'x-mole-office-key': key }
}, 120_000)

afterAll(stopEverything, 60_000)

interface TheList {
  holder: { state: string; pid?: number; startedAt?: string | null; anotherCopy?: { copy: string; pid: number; startedAt: string | null }; says?: string }
  terminals: HeldTerminal[] | null
}

async function theList(): Promise<TheList> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return listed.body as unknown as TheList
}

/** What the confirming press sends back: the holder and every terminal it was shown. */
async function whatThePressShows(): Promise<{ pid: number; startedAt: string | null; terminals: string[] }> {
  const now = await theList()
  expect(now.holder.state, JSON.stringify(now.holder)).toBe('running')
  return { pid: now.holder.pid!, startedAt: now.holder.startedAt ?? null, terminals: (now.terminals ?? []).map((one) => one.id) }
}

async function open(command: string, args: string[]): Promise<HeldTerminal> {
  const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command, args, cols: 80, rows: 24 } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  return terminal
}

/** Ask the press. A holder it started is recorded for stopping at the end, whatever the case then expects. */
async function restart(body: unknown, headers?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await ask(server.api, '/api/terminals/holder/restart', { method: 'POST', body, ...(headers === undefined ? {} : { headers }) })
  const started = answer.body['holder'] as { pid?: unknown } | undefined
  if (typeof started?.pid === 'number') groups.add(started.pid)
  return answer
}

describe('the restart press for the terminal holder', () => {
  let shell: HeldTerminal
  let sleeper: HeldTerminal
  let deaf: HeldTerminal

  it('1: refuses an agent with its own key, and the holder and its terminals run on', async () => {
    shell = await open('/bin/bash', ['--noprofile', '--norc'])
    sleeper = await open('/bin/sleep', ['300'])
    // A TERMINAL THAT IGNORES SIGHUP, so the old holder waits for it and its last line names it.
    deaf = await open('/bin/sh', ['-c', 'trap "" HUP; while :; do sleep 1; done'])
    const shown = await whatThePressShows()
    const refused = await restart({ expect: shown }, anAgent)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body['code']).toBe('terminalsOnlyThePerson')
    expect(isAlive(theFirstHolder.pid)).toBe(true)
    expect(await whatThePressShows()).toEqual(shown)
  }, 60_000)

  it('2: refuses a body that does not say what was shown, and nothing is stopped', async () => {
    for (const body of [{}, { expect: { pid: theFirstHolder.pid } }, { expect: await whatThePressShows(), also: true }]) {
      const refused = await restart(body)
      expect(refused.status, JSON.stringify(refused.body)).toBe(400)
      expect(refused.body['code']).toBe('terminalHolderRestartBadBody')
    }
    expect(isAlive(theFirstHolder.pid)).toBe(true)
  }, 60_000)

  it('3: refuses a confirmation that did not show every terminal, or showed another holder, and nothing is stopped', async () => {
    const shown = await whatThePressShows()
    const withoutOne = await restart({ expect: { ...shown, terminals: shown.terminals.filter((id) => id !== sleeper.id) } })
    expect(withoutOne.status, JSON.stringify(withoutOne.body)).toBe(409)
    expect(withoutOne.body['code']).toBe('terminalHolderRestartChanged')
    expect(String(withoutOne.body['error'])).toContain(sleeper.id)
    const anotherHolder = await restart({ expect: { ...shown, pid: shown.pid + 1 } })
    expect(anotherHolder.status, JSON.stringify(anotherHolder.body)).toBe(409)
    expect(anotherHolder.body['code']).toBe('terminalHolderRestartChanged')
    expect(isAlive(theFirstHolder.pid)).toBe(true)
    for (const one of [shell, sleeper, deaf]) expect(isAlive(one.pid), `terminal ${one.id}`).toBe(true)
  }, 60_000)

  it('4: restarts the holder it was shown, ends its terminals, and the ledger says so', async () => {
    const shown = await whatThePressShows()
    const restarted = await restart({ expect: shown })
    expect(restarted.status, JSON.stringify(restarted.body)).toBe(200)
    const answer = restarted.body as { stopped: { pid: number }; holder: { state: string; pid: number }; ended: number; itsLastWord: string | null }
    expect(answer.stopped.pid).toBe(theFirstHolder.pid)
    expect(answer.ended).toBe(3)
    expect(answer.holder.state).toBe('running')
    expect(answer.holder.pid).not.toBe(theFirstHolder.pid)
    expect(isAlive(theFirstHolder.pid), 'the old holder still runs').toBe(false)
    expect(isAlive(shell.pid), 'the shell still runs').toBe(false)
    expect(isAlive(sleeper.pid), 'the sleep still runs').toBe(false)
    // THE OLD HOLDER'S OWN LAST LINE names the terminal that ignored SIGHUP. That process is stopped by its group below.
    expect(answer.itsLastWord).toContain('had not ended')
    expect(answer.itsLastWord).toContain(String(deaf.pid))

    const now = await theList()
    expect(now.holder.pid).toBe(answer.holder.pid)
    expect(now.terminals).toEqual([])

    const ledger = await ask(server.api, '/api/resources?includeReleased=true')
    expect(ledger.status, JSON.stringify(ledger.body).slice(0, 500)).toBe(200)
    const rows = (ledger.body['resources'] ?? []) as { type: string; key: string; releasedAt: string | null; releasedBy: string | null; releaseNote: string | null }[]
    const old = rows.filter((row) => row.type === 'process' && row.key === String(theFirstHolder.pid))
    expect(old.length, JSON.stringify(rows)).toBe(1)
    expect(old[0]?.releasedAt).not.toBeNull()
    expect(old[0]?.releasedBy).toMatch(/^human:/)
    expect(old[0]?.releaseNote).toContain('restarted by the person from Settings')
    const fresh = rows.filter((row) => row.type === 'process' && row.key === String(answer.holder.pid))
    expect(fresh.length, JSON.stringify(rows)).toBe(1)
    expect(fresh[0]?.releasedAt).toBeNull()
  }, 90_000)

  const oldCopy = { from: 'bundle' as const, root: REPO, build: { version: 'beta.1', commit: 'a-made-up-commit', builtAt: '2026-11-04 10:00' } }

  it('another copy from this root with an open row is replaced', async () => {
    const current = await theList()
    await stopTheGroup(current.holder.pid!)
    namedHolder = await startAHolderNamingACopy(place, { toTheLog: true })
    expect((await theList()).holder.state).toBe('running')
    namedHolder.names(oldCopy)
    const now = await theList()
    expect(now.holder.state).toBe('unusable')
    expect(now.holder.anotherCopy?.copy).toContain(oldCopy.build.version)
    expect(now.holder.anotherCopy?.copy).toContain(REPO)
    expect(Array.isArray(now.terminals)).toBe(true)
    const copy = now.holder.anotherCopy!
    const restarted = await restart({ expect: { pid: copy.pid, startedAt: copy.startedAt, terminals: now.terminals!.map((one) => one.id) } })
    expect(restarted.status, JSON.stringify(restarted.body)).toBe(200)
    expect(isAlive(copy.pid)).toBe(false)
    expect((restarted.body['holder'] as { state: string }).state).toBe('running')
    const ledger = await ask(server.api, '/api/resources?includeReleased=true')
    const row = (ledger.body['resources'] as { key: string; type: string; releasedAt: string | null; releaseNote: string | null }[]).find((one) => one.type === 'process' && one.key === String(copy.pid))
    expect(row?.releasedAt).not.toBeNull()
    expect(row?.releaseNote).toContain('restarted by the person from Settings')
  }, 90_000)

  it('another root is refused, naming the copy and root', async () => {
    const current = await theList()
    await stopTheGroup(current.holder.pid!)
    namedHolder = await startAHolderNamingACopy(place)
    const recorded = await theList()
    const shown = { pid: recorded.holder.pid!, startedAt: recorded.holder.startedAt ?? null, terminals: [] }
    const other = { ...oldCopy, root: '/tmp/another-copy-of-mole-office/' }
    namedHolder.names(other)
    const now = await theList()
    expect(now.holder.state).toBe('unusable')
    expect(now.holder.anotherCopy).toBeUndefined()
    const refused = await restart({ expect: shown })
    expect(refused.body['code']).toBe('terminalHolderRestartNoHolder')
    expect(String(refused.body['error'])).toContain(other.root)
    expect(String(refused.body['error'])).toContain(other.build.version)
    expect(isAlive(shown.pid)).toBe(true)
  }, 60_000)

  it('another copy from this root without an open row is refused', async () => {
    await stopTheGroup(namedHolder.holder.pid)
    await namedHolder.close()
    namedHolder = await startAHolderNamingACopy(place)
    namedHolder.names(oldCopy)
    const now = await theList()
    const copy = now.holder.anotherCopy!
    expect(copy).toBeDefined()
    const refused = await restart({ expect: { pid: copy.pid, startedAt: copy.startedAt, terminals: now.terminals!.map((one) => one.id) } })
    expect(refused.body['code']).toBe('terminalHolderRestartNotSignalled')
    expect(isAlive(copy.pid)).toBe(true)
    namedHolder.names(null)
  }, 60_000)

  it('classifies a nameless holder and a holder from another root for an installed copy', () => {
    const install = { from: 'bundle', root: REPO, build: { version: 'beta.6', commit: 'c', builtAt: 't' } }
    const nameless = howTheHolderIsNotThisCopys({ pid: 1 }, install)
    expect(nameless?.mayBeReplaced).toBe(true)
    expect(nameless?.namesNoCopy).toBe(true)
    const other = howTheHolderIsNotThisCopys({ pid: 1, copy: { ...oldCopy, root: '/tmp/another-copy-of-mole-office/' } }, install)
    expect(other?.mayBeReplaced).toBe(false)
    expect(other?.sameRoot).toBe(false)
  })

  it('5: refuses when no holder runs, and starts none', async () => {
    const now = await theList()
    expect(now.holder.state).toBe('running')
    await stopTheGroup(now.holder.pid!)
    const refused = await restart({ expect: { pid: now.holder.pid!, startedAt: now.holder.startedAt ?? null, terminals: [] } })
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body['code']).toBe('terminalHolderRestartNoHolder')
    expect((await theList()).holder.state).toBe('not running')
  }, 60_000)
})
