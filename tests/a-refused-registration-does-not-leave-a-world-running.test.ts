// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD MOLE OFFICE REFUSED TO RECORD IS STOPPED, SO EXIT 1 MEANS NOTHING IS RUNNING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `tools/isolated-mole-office.mjs` starts both servers and only then asks Mole Office to write the
 * world down: one ledger row for the API and one for the browser app. That order is deliberate —
 * the row must name the process group that really owns the world — but a refusal there used to
 * leave the two servers running while the tool exited 1. A running world and a failed one then
 * read exactly the same from the exit code, and the caller could not tell whether anything had
 * been left on this machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE REFUSES A LEDGER ROW AND NOT A LEASE
 * ---------------------------------------------------------------------------------------
 *
 * When this file was first written the tool took leases here as well, and the stand-in below
 * refused one of those. A decision removed the lease design,
 * and with it `takeToolLease` and `holdTheWorld`; the tool now writes ledger rows and nothing else.
 * A stand-in that refuses `/api/leases` therefore refuses a door this tool never knocks on, the
 * world is written down without trouble, and the file proves nothing. What is measured here is the
 * criterion, not the door: a registration the office refuses does not leave a world running.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The office here is a small stand-in that answers every door the tool uses and REFUSES THE SECOND
 * ledger row with a 409, which is a real refusal and not a dead office: the world really does start,
 * which the first row's acceptance proves. The second row is the refused one on purpose, because
 * that is the harder case — one row is already in the ledger, and the rollback has to release it or
 * the office is left saying a stopped world is up. The tool must then release what it wrote, stop
 * the world it started, delete its copy and its directory, and exit 1 saying that nothing is
 * running. The ports the rollback reports must really be free, because "nothing is running" is the
 * claim being tested.
 *
 * The choice made in the tool is rolling back rather than exiting 0. A world nobody registered is
 * not a world anybody can find or stop, and exit 0 would report success for it.
 *
 * i9VElsSu06sE mutation: start the isolated API with plain tsx again. The case "releases what it
 * wrote, stops it, frees its ports, and exits 1 with nothing running" turns red on
 * apiRuntime.supervisor.watching. Before accepting the first row the stand-in reads the already
 * running world's runtime. That runtime reads its actual parent command, so an unused watcher
 * command cannot pass. The git-rewrite tests prove that this supervisor reloads changed code;
 * this case proves isolated start uses it and still stops it. No extra world or browser is needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'isolated-mole-office.mjs')
/** Where the tool puts one instance. A refusal must leave nothing here. */
const ISOLATED = join(REPO, '.logs', 'isolated')
/** The run the world is written down against. `--show-to-the-person` refuses without one. */
const RUN = 'stub-run'
/** The refusal the stand-in gives, in the office's own words, so the tool's report can be read. */
const REFUSAL = 'The ledger will not take a second row for this world while the first one is open.'

interface RefusingOffice {
  api: string
  close: () => Promise<void>
  counts: { rowsAsked: number; released: string[]; apiRuntime: RuntimeRecord | null }
}

/**
 * A stand-in office that answers every door this tool uses and refuses the SECOND ledger row.
 *
 * It answers `/api/runtime` because the tool reads it BEFORE it starts anything, and a refusal
 * there would end the run with no world ever built — which would pass every assertion below about
 * nothing being left running while proving none of them.
 */
function officeThatRefusesTheSecondRow(name: string): Promise<RefusingOffice> {
  return new Promise((ok, bad) => {
    const counts = { rowsAsked: 0, released: [] as string[], apiRuntime: null as RuntimeRecord | null }
    const server = createHttpServer((req, res) => {
      req.resume()
      const url = req.url ?? ''
      const method = req.method ?? 'GET'
      const say = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      // WHERE OTHER MACHINES REACH THIS OFFICE. `null` is a real answer: an office nobody else can
      // reach says so, and this file is not about addresses.
      if (method === 'GET' && url === '/api/runtime') return say(200, { addresses: { forOtherMachines: null } })
      if (method === 'GET' && url === `/api/records/${RUN}`) {
        return say(200, { record: { id: RUN, data: { servingAgent: 'a-stand-in' } } })
      }
      if (method === 'GET' && url === '/api/participants') return say(200, { agents: [] })
      // `stop` asks the ledger before it stops a world; this one holds nothing.
      // It says the question back, as the real door does.
      if (method === 'GET' && url.startsWith('/api/resources/holding?')) {
        const query = new URL(url, 'http://stand-in').searchParams
        const askedAbout = { ports: (query.get('ports') ?? '').split(',').filter((one) => one !== '').map(Number), database: query.get('database') }
        return say(200, { askedAbout, holders: [], openButGone: [], says: 'No live ledger row holds them.' })
      }
      if (method === 'POST' && url === '/api/resources') {
        counts.rowsAsked += 1
        if (counts.rowsAsked === 1) {
          // where.json is written before registration, and its address belongs to this test's world.
          const where = JSON.parse(readFileSync(join(ISOLATED, name, 'where.json'), 'utf8')) as { api: string }
          void fetch(where.api + '/api/runtime', {
            headers: { 'x-mole-office-workspace': 'default' },
            signal: AbortSignal.timeout(5000),
          }).then(async (answer) => {
            if (!answer.ok) throw new Error(`the world's runtime answered ${answer.status}`)
            counts.apiRuntime = await answer.json() as RuntimeRecord
            say(201, { resource: { id: 'stub-row-1' } })
          }).catch((error: unknown) => say(500, { error: String(error) }))
          return
        }
        return say(409, { error: REFUSAL })
      }
      const releasing = /^\/api\/resources\/([^/]+)\/release$/.exec(url)
      if (method === 'POST' && releasing !== null) {
        counts.released.push(releasing[1] as string)
        return say(200, { released: true })
      }
      return say(200, {})
    })
    server.on('error', bad)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        bad(new Error('the stand-in office got no port'))
        return
      }
      ok({
        api: `http://127.0.0.1:${String(address.port)}`,
        close: () => new Promise((done) => server.close(() => done())),
        counts,
      })
    })
  })
}

/** A database the product's own migration built, so the tool has a real corpus to copy and serve. */
function buildADatabase(file: string): void {
  const built = spawnSync(
    process.execPath,
    [join(REPO, 'node_modules/.bin/tsx'), join(REPO, 'src/server/db/migrate.ts')],
    { cwd: REPO, encoding: 'utf8', timeout: 120_000, env: { ...process.env, MOLE_OFFICE_DB: file } },
  )
  expect(built.status, `${built.stdout ?? ''}${built.stderr ?? ''}`).toBe(0)
}

/**
 * Run the tool the way an operator does, and hand back everything it produced.
 *
 * ASYNCHRONOUS, WHICH IS NOT A STYLE CHOICE. The stand-in office lives in this process, and the
 * tool asks it questions while it runs. A synchronous spawn would block this process's event loop,
 * so the stand-in could never answer and the tool would wait until the timeout — a deadlock that
 * looks exactly like a hung tool. The child is killed if it outlives its budget.
 */
function run(
  args: readonly string[],
  env: Record<string, string>,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...args], {
      cwd: REPO,
      env: { ...process.env, ...env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    const deadline = setTimeout(() => {
      child.kill('SIGKILL')
    }, 180_000)
    child.on('error', (error) => {
      clearTimeout(deadline)
      done({ status: -1, stdout, stderr: stderr + String(error) })
    })
    child.on('close', (code) => {
      clearTimeout(deadline)
      done({ status: code ?? -1, stdout, stderr })
    })
  })
}

/** True when nothing is listening on this port. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const probe = createServer()
    probe.on('error', () => ok(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => ok(true)))
  })
}

describe('a world Mole Office refused to record is not left running behind an exit 1', () => {
  let dir: string
  let name: string
  let source: string
  let office: RefusingOffice

  const atTheOffice = (): Record<string, string> => ({
    MOLE_OFFICE_API: office.api,
    MOLE_OFFICE_WORKSPACE: 'default',
  })

  beforeEach(async () => {
    dir = aTestDatabaseFolder('refused-row')
    name = `t-refused-${Math.random().toString(36).slice(2, 8)}`
    source = join(dir, 'source.db')
    buildADatabase(source)
    office = await officeThatRefusesTheSecondRow(name)
  })

  afterEach(async () => {
    // IF THE TOOL LEFT THE WORLD RUNNING — which is the defect this file is about — stop it by the
    // tool's own name, so a mutation run cannot leak two servers onto this machine.
    if (existsSync(join(ISOLATED, name))) {
      await run(['stop', name], atTheOffice())
    }
    if (existsSync(join(ISOLATED, name))) {
      throw new Error(
        `the world "${name}" was left running and its own stop did not end it; something is on this ` +
          'machine still. `node tools/stray-servers.mjs` names what.',
      )
    }
    await office.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('releases what it wrote, stops it, frees its ports, and exits 1 with nothing running', async () => {
    const out = await run(['start', name, '--from', source, '--show-to-the-person', '--run', RUN], atTheOffice())

    // THE ROW REALLY WAS REFUSED, AND THE WORLD REALLY HAD STARTED FIRST. Fewer than two asks would
    // mean the refusal never happened and this proved nothing about a world being left behind.
    expect(
      office.counts.rowsAsked,
      `the tool did not ask twice to write the world down:\n${out.stdout}${out.stderr}`,
    ).toBe(2)
    expect(office.counts.apiRuntime, 'the started world did not report its runtime').not.toBeNull()
    expect(office.counts.apiRuntime?.supervisor.watching, 'the isolated API is serving code nobody watches').toBe(true)
    expect(office.counts.apiRuntime?.supervisor.kind).toBe('the dev supervisor')
    expect(office.counts.apiRuntime?.supervisor.restartedBecause).toBe('the first start')
    expect(out.status, `it did not exit 1:\n${out.stdout}${out.stderr}`).toBe(1)
    expect(out.stderr).toContain('refused to record this world')
    expect(out.stderr).toContain(REFUSAL)

    // THE ROW THAT WAS ACCEPTED WAS GIVEN BACK, so the office does not go on saying a stopped world
    // is up. This is the whole reason the tool records each row as it is made.
    expect(office.counts.released, 'the accepted ledger row was not released').toEqual(['stub-row-1'])

    // NOTHING IS RUNNING, AND NOTHING IS LEFT BEHIND TO BE FOUND LATER.
    expect(out.stderr, 'the rollback did not say nothing is running').toContain('Nothing is running')
    expect(existsSync(join(ISOLATED, name)), 'the instance directory was left behind').toBe(false)
    const ports = /ports (\d+) and (\d+) came back/.exec(out.stderr)
    expect(ports, `the rollback did not say which ports came back:\n${out.stderr}`).not.toBeNull()
    expect(await portIsFree(Number(ports?.[1]))).toBe(true)
    expect(await portIsFree(Number(ports?.[2]))).toBe(true)
  }, 240_000)
})
