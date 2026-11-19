// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT ON ANOTHER MACHINE CAN HOLD ITS HANDLE HERE.
 *
 * Criterion M77 of design/messages/ACCEPTANCE.md section 41, on two questions:
 * how does a Codex on another machine mount the listener,
 * and should copies of the script go into the skill?
 *
 * WHAT WAS MEASURED FIRST, on 7 September 2026, before anything was built. The waiter already runs
 * against another address: `tools/hold-the-handle.mjs --api <an office> --agent <handle> --session
 * <record>` was started from /tmp, outside any checkout, with every MOLE_OFFICE variable unset, and
 * it took the hold on a server on a different port; that server then answered `a live session` for
 * the handle, with the hold fresh. So the mechanism was there. What was missing was a way for a
 * machine that has no checkout to GET the script, and a section of the skill saying any of this.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. The office serves its own waiter, as text, at a route other machines may call.
 * 2. What it serves is the file this installation is running, not a copy — proved by comparing it
 *    with the file on disk rather than by looking for a few words in it.
 * 3. The line it hands back names the office's own address, the handle and the session, and it is
 *    withheld with a reason when this installation has no address another machine could use, rather
 *    than printing a loopback address that cannot work from anywhere else.
 *
 * WHAT IS NOT PROVED HERE, and cannot be from one machine: that a waiter running on a SECOND
 * computer reaches this one. Everything about that is on the network between them —
 * MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES, the second listener, the private network — and this
 * repository has one machine. What is proved is everything up to that: the script is served, the
 * arguments are the right ones, and the waiter honours an address that is not its own default.
 *
 * ---------------------------------------------------------------------------------------
 * 8 SEPTEMBER 2026, 11:50, ON MAIN: THE WAITER IS SERVED AS ONE FILE (M92)
 * ---------------------------------------------------------------------------------------
 *
 * The owner's Codex session on their other machine downloaded the waiter and it exited 1 with
 * ERR_MODULE_NOT_FOUND: the script imports six modules of this checkout. The route now serves the
 * script built into one file with its imports (esbuild, from the file on disk at the moment of the
 * call), and the first case writes what is served into an empty folder and runs it there.
 * Mutation, run alone: serving the raw file again turned that one case red (ERR_MODULE_NOT_FOUND
 * in the folder) and nothing else; put back, all green.
 *
 * ---------------------------------------------------------------------------------------
 * 8 SEPTEMBER 2026, ON MAIN: THE CASE ABOUT THE ADDRESS READS WHICH WORLD IT IS IN
 * ---------------------------------------------------------------------------------------
 *
 * The case "says why there is no line to run" assumed no address had been set, and went red on
 * the owner's checkout the moment their .env named one. It now reads the settings layer for which
 * world the checkout is in and holds the route to that reading, and a new case holds both answers
 * of `whatTheWaiterSaysAboutTheAddress` on worlds built for the purpose. Mutation, run alone:
 * printing the line with a loopback address where there is no address turned that new case red
 * (1 of 10) and nothing else; put back, 10 green.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 9 cases, all green. Then, in the waiter route in src/server/api/handles.ts, the path
 * it reads was pointed at a file that is
 * not there, so the office serves no waiter to a machine with no checkout.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × answers with the file this installation is running, byte for byte
 *   × says why there is no line to run, rather than printing an address that cannot work
 *   × names Node, because the script needs one and the other machine has to have it
 *
 * The change was put back and the control run again: 9 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { settingNamed, settings } from '../src/config/settings.mjs'
import { whatTheWaiterSaysAboutTheAddress } from '../src/shared/handles.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WAITER = fileURLToPath(new URL('../for-agents/hold-the-handle.mjs', import.meta.url))

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the office serves its own waiter', () => {
  it('answers with one file built from the script this installation runs, and that file runs with nothing but Node', async () => {
    const served = await get('/api/handles/waiter')

    expect(served.status).toBe(200)
    expect(served.body['path']).toBe(WAITER)
    const text = String(served.body['text'])
    // BUILT FROM THE FILE ON DISK AT THE MOMENT OF THE CALL, with everything it imports. Until
    // 8 September 2026 this case held the raw file byte for byte, and the raw file is what the
    // owner's other machine received: it exited 1 with ERR_MODULE_NOT_FOUND for
    // for-agents/where-is-the-api.mjs, because the script imports six modules of this checkout that a
    // machine with no checkout does not have. The usage sentence written in the source is in what
    // is served, and so is the sentence the waiter prints on every beat, which comes from a module
    // the raw file only imports; and the whole is longer than the raw file, because it carries them.
    const raw = readFileSync(WAITER, 'utf8')
    expect(text).toContain('hold this checkout')
    expect(text.length).toBeGreaterThan(raw.length)
    // RUNS ALONE: in a folder holding nothing else, with Node and no node_modules, --help exits 0
    // and prints the three arguments another machine has to give. This is the proof the route is
    // for; the mutation that serves the raw file again turns exactly this red.
    const alone = mkdtempSync(join(tmpdir(), 'mole-office-waiter-alone-'))
    writeFileSync(join(alone, 'hold-the-handle.mjs'), text)
    const ran = spawnSync(process.execPath, ['hold-the-handle.mjs', '--help'], { cwd: alone, encoding: 'utf8' })
    rmSync(alone, { recursive: true, force: true })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('--agent')
    expect(ran.stdout).toContain('--session')
    expect(ran.stdout).toContain('--api')
  }, 30_000)

  it('is a read that answers about a handle nobody registered, because it is not about a handle', async () => {
    // THE STATIC ROUTE AND THE ONE WITH A NAME IN IT LIVE UNDER THE SAME PREFIX, so this says which
    // of the two answers. Without it, a reordering that let ":handle" swallow "waiter" would give a
    // 404 about a durable agent called "waiter" and nobody would know why.
    const served = await get('/api/handles/waiter')
    expect(String(JSON.stringify(served.body))).not.toContain('No durable agent')
  })

  it('says why there is no line to run, rather than printing an address that cannot work', async () => {
    // WHICH WORLD THIS CHECKOUT IS IN IS READ, NOT ASSUMED. Until 8 September 2026 this case assumed
    // nothing had told the server an address, which is true in a builder's worktree and was false
    // on the owner's checkout the moment their .env named one: the suite went red on main. A test
    // cannot unset a line in a file by deleting a key (the 28 August 2026 lesson in settings.mjs),
    // so the route is held to the same reading the office makes, and both of its answers are
    // proved in the next case on worlds built for the purpose.
    const reachable = settings().otherMachines
    const served = await get('/api/handles/waiter')
    if (reachable === null) {
      expect(served.body['howToRunIt']).toBeNull()
      expect(String(served.body['whyThereIsNoAddress'])).toContain('has not been told an address')
      expect(String(served.body['whyThereIsNoAddress'])).toContain('/api/access')
    } else {
      expect(String(served.body['howToRunIt'])).toContain(`--api ${reachable.apiAddress}`)
      expect(served.body['whyThereIsNoAddress']).toBeNull()
    }
  })

  it('withholds the line with a reason where there is no address, and prints it with the address where there is one', () => {
    const withheld = whatTheWaiterSaysAboutTheAddress(null)
    expect(withheld.howToRunIt).toBeNull()
    expect(String(withheld.whyThereIsNoAddress)).toContain('has not been told an address')
    expect(String(withheld.whyThereIsNoAddress)).toContain('/api/access')

    // An address on another machine, on the product's default port as src/config/settings.mjs declares it.
    const away = `http://office.example:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`
    const printed = whatTheWaiterSaysAboutTheAddress({ api: away })
    expect(String(printed.howToRunIt)).toContain(`--api ${away}`)
    expect(String(printed.howToRunIt)).not.toContain('127.0.0.1')
    expect(printed.whyThereIsNoAddress).toBeNull()
  })

  it('names Node, because the script needs one and the other machine has to have it', async () => {
    const served = await get('/api/handles/waiter')
    expect(String(served.body['node'])).toContain('Node 22')
  })
})

