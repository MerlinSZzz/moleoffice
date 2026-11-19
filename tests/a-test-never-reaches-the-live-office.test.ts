// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST NEVER REACHES THE LIVE OFFICE. Problem E1SWGJK7wG68, 26 September 2026.
 *
 * The incident: a mutation run removed a tool's refusal of the office's port. The tool found the
 * live office on 127.0.0.1, on the configured port, took it for its own, and sent it GET /api/health. Sandboxes share
 * this machine's network, so nothing stood in the way.
 *
 * tools/live-office-guard.mjs now stands in the way. vitest.config.ts reads the live office's ports
 * when vitest loads it (tools/live-office-ports.mjs) and loads the guard into every test process
 * through NODE_OPTIONS. The guard refuses a connection to those ports on this machine's own addresses
 * while the four office variables are unset.
 *
 * NOTHING HERE EVER CONNECTS TO THE REAL LIVE OFFICE, even when the guard is taken out. Every "live
 * office" below is a stand-in on a free port. The ports are read once, by the test runner, so this
 * file runs the runner itself, on fixture test files in a folder of its own, with this checkout's
 * vitest.config.ts, and gives that runner both sources in its environment:
 *   - MOLE_OFFICE_PORT names the first stand-in. It is the setting this checkout's office reads its
 *     own port from, and the guard reads it the same way.
 *   - SANDBOX_DIR names a folder made here, whose instance.json says the sandbox writes to the second
 *     stand-in. That is where a sandbox records the office it was made against.
 * A fixture test then starts a small tool as a child, the way a test starts one, once for each case,
 * and writes down what each child did.
 *
 * THE MUTATION THAT TURNS THIS RED: take `console.warn(guardEveryTestProcess())` out of
 * vitest.config.ts. Then no test process loads the guard, the stand-ins receive the requests, and
 * every case that expects a refusal fails.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REFUSAL_CODE, THE_OFFICE_VARIABLES } from '../tools/live-office-guard.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')

const FOLDER = mkdtempSync(join(tmpdir(), 'live-office-guard-'))
afterAll(() => rmSync(FOLDER, { recursive: true, force: true }))

/** A file made here, with its folders. */
function aFile(path: string, text: string): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

/** A sandbox's folder made here, whose instance.json holds `instance`. */
function aSandboxFolder(name: string, instance: string): string {
  aFile(join(FOLDER, name, 'instance.json'), instance)
  return join(FOLDER, name)
}

/**
 * A small tool, as a test starts one. Like the incident's tool, it catches a failed connection and
 * carries on, so only the guard can make it fail. It says what happened on its standard output.
 */
const TOOL = aFile(
  join(FOLDER, 'tool.mjs'),
  `import http from 'node:http'
import net from 'node:net'
const [how, host, port] = process.argv.slice(2)
const url = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port + '/api/health'
try {
  if (how === 'fetch') {
    const answer = await fetch(url)
    console.log('reached ' + answer.status)
  } else if (how === 'http') {
    await new Promise((done, failed) => {
      http.get(url, (answer) => { console.log('reached ' + answer.statusCode); answer.resume(); answer.on('end', done) }).on('error', failed)
    })
  } else if (how === 'net') {
    await new Promise((done, failed) => {
      const socket = net.connect(Number(port), host, () => socket.write('GET /api/health HTTP/1.0\\r\\n\\r\\n'))
      socket.setTimeout(1500, () => { console.log('no answer'); socket.destroy(); done() })
      socket.on('data', () => { console.log('reached'); socket.destroy(); done() })
      socket.on('error', failed)
    })
  }
} catch (error) {
  console.log('failed ' + (error?.cause?.code ?? error?.code))
}
await new Promise((done) => setTimeout(done, 100))
`,
)

/** A stand-in on a free port that counts every connection and every request it receives. */
interface StandIn {
  readonly port: number
  readonly connections: () => number
  readonly requests: string[]
  readonly server: Server
}

async function aStandIn(): Promise<StandIn> {
  const requests: string[] = []
  let connections = 0
  const server = createServer((request, answer) => {
    requests.push(`${request.method} ${request.url}`)
    answer.end('{"ok":true}')
  })
  server.on('connection', () => {
    connections += 1
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The stand-in has no port.')
  return { port: address.port, connections: () => connections, requests, server }
}

interface Ran {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Start `command` as a child, and wait for it to end. */
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<Ran> {
  return new Promise((done, failed) => {
    const child = spawn(command, args, { cwd: ROOT, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.on('error', failed)
    child.on('close', (code) => done({ code, stdout, stderr }))
  })
}

/**
 * Run vitest on one fixture test file, with this checkout's configuration, told that the office of
 * this checkout is on `checkoutPort` and that the sandbox's folder is `sandbox`. The four office
 * variables are unset, as for every test.
 */
function theRunner(fixture: string, checkoutPort: number, sandbox: string): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_PORT: String(checkoutPort), SANDBOX_DIR: sandbox }
  for (const name of THE_OFFICE_VARIABLES) delete env[name]
  return run(process.execPath, [VITEST, 'run', `--dir=${join(fixture, '..', '..')}`, '--no-file-parallelism', fixture], env)
}

/** An address of this machine that is not loopback, such as its LAN or tailnet address, or null. */
function anAddressThatIsNotLoopback(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const one of list ?? []) if (!one.internal && one.family === 'IPv4') return one.address
  }
  return null
}

/** One child the fixture starts: the tool's three words, and what to change in its environment. */
interface Case {
  readonly name: string
  readonly words: [string, string, number]
  /** Variables to set in the child's environment, on top of the test's own. */
  readonly set?: Record<string, string>
  /** Start the child with only PATH and these, instead of the test's own environment. */
  readonly only?: Record<string, string>
}

/**
 * The fixture: one test that starts the tool once for each case and writes down what each did. It
 * makes no connection itself. `it` is the runner's global, because the fixture's folder has no
 * node_modules to import from.
 */
function aFixtureThatStartsTheTool(path: string, cases: Case[], results: string): void {
  aFile(
    path,
    `import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const cases = ${JSON.stringify(cases)}
const once = (one) => new Promise((done) => {
  const env = one.only ? { PATH: process.env.PATH, ...one.only } : { ...process.env, ...(one.set ?? {}) }
  const child = spawn(process.execPath, [${JSON.stringify(TOOL)}, ...one.words.map(String)], { env })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  child.on('close', (code) => done({ code, stdout, stderr }))
})
it('starts the tool once for each case', async () => {
  const results = {}
  for (const one of cases) results[one.name] = await once(one)
  writeFileSync(${JSON.stringify(results)}, JSON.stringify(results))
}, 60_000)
`,
  )
}

describe('a tool a test starts never reaches the live office', () => {
  let office: StandIn
  let sandboxs: StandIn
  let own: StandIn
  let ran: Ran
  let results: Record<string, Ran>
  const sandbox = join(FOLDER, 'sandbox')
  const fixture = join(FOLDER, 'children', 'tests', 'children.test.ts')
  const hosts = ['127.0.0.1', 'localhost', '::1', anAddressThatIsNotLoopback()].filter((host): host is string => host !== null)
  const result = (name: string): Ran => {
    const one = results[name]
    if (one === undefined) throw new Error(`The fixture wrote nothing for "${name}". The runner said: ${ran.stdout}\n${ran.stderr}`)
    return one
  }

  beforeAll(async () => {
    office = await aStandIn()
    sandboxs = await aStandIn()
    own = await aStandIn()
    aSandboxFolder('sandbox', JSON.stringify({ instance: 'a-test', api: `http://127.0.0.1:${sandboxs.port}` }))
    const cases: Case[] = [
      { name: 'the checkout office', words: ['fetch', '127.0.0.1', office.port] },
      { name: "the sandbox's office", words: ['fetch', '127.0.0.1', sandboxs.port] },
      ...['fetch', 'http', 'net'].flatMap((how) => hosts.map((host): Case => ({ name: `${how} to ${host}`, words: [how, host, office.port] }))),
      { name: 'an environment of its own', words: ['fetch', '127.0.0.1', office.port], only: {} },
      { name: "a test's own office", words: ['fetch', '127.0.0.1', own.port], set: { MOLE_OFFICE_PORT: String(own.port) } },
      // 192.0.2.1 is kept for documentation and belongs to no machine, so nothing answers there.
      { name: 'another machine', words: ['net', '192.0.2.1', office.port] },
      {
        name: 'the four office variables set',
        words: ['fetch', '127.0.0.1', office.port],
        set: {
          MOLE_OFFICE_API: `http://127.0.0.1:${office.port}`,
          MOLE_OFFICE_WORKSPACE: 'default',
          MOLE_OFFICE_SESSION: 'a-session-of-this-test',
          MOLE_OFFICE_AGENT: 'a-test-agent',
        },
      },
    ]
    const written = join(FOLDER, 'children-results.json')
    aFixtureThatStartsTheTool(fixture, cases, written)
    ran = await theRunner(fixture, office.port, sandbox)
    results = JSON.parse(readFileSync(written, 'utf8')) as Record<string, Ran>
  }, 200_000)
  afterAll(async () => {
    await Promise.all([office, sandboxs, own].map((one) => new Promise((done) => one?.server.close(done))))
  })

  it("prints which ports it guards, naming this checkout's setting and the sandbox's instance.json", () => {
    const said = `${ran.stdout}\n${ran.stderr}`
    expect(said).toContain(`Every test process refuses connections to port ${office.port} and ${sandboxs.port}`)
    expect(said).toContain(`The port ${office.port} is MOLE_OFFICE_PORT in the test runner's environment.`)
    expect(said).toContain(
      `The port ${sandboxs.port} is the port of http://127.0.0.1:${sandboxs.port}, the office this sandbox writes to, as ${join(sandbox, 'instance.json')} says.`,
    )
    expect(ran.code, said).toBe(0)
  })

  it("refuses the incident on this checkout's office port: the tool sends nothing, and fails", () => {
    const one = result('the checkout office')
    expect(one.stderr).toContain(`Refused a connection to 127.0.0.1:${office.port}.`)
    expect(one.stderr).toContain(`The port ${office.port} is MOLE_OFFICE_PORT in the test runner's environment.`)
    expect(one.stderr).toContain(`The test file: ${fixture}.`)
    expect(one.stdout).toContain(`failed ${REFUSAL_CODE}`)
    expect(one.code, one.stderr).not.toBe(0)
  })

  it('refuses the incident on the port of the office the sandbox writes to, and names its instance.json', () => {
    const one = result("the sandbox's office")
    expect(one.stderr).toContain(`Refused a connection to 127.0.0.1:${sandboxs.port}.`)
    expect(one.stderr).toContain(`as ${join(sandbox, 'instance.json')} says.`)
    expect(one.stdout).toContain(`failed ${REFUSAL_CODE}`)
    expect(one.code, one.stderr).not.toBe(0)
    expect(sandboxs.requests).toEqual([])
    expect(sandboxs.connections()).toBe(0)
  })

  it("refuses fetch, http and net alike, by loopback, by name and by this machine's other address", () => {
    for (const how of ['fetch', 'http', 'net']) {
      for (const host of hosts) {
        const one = result(`${how} to ${host}`)
        expect(one.stdout, `${how} to ${host}: ${one.stderr}`).toContain(`failed ${REFUSAL_CODE}`)
        expect(one.code, `${how} to ${host}`).not.toBe(0)
      }
    }
  })

  it('refuses a child that a test starts with an environment of its own', () => {
    const one = result('an environment of its own')
    expect(one.stdout, one.stderr).toContain(`failed ${REFUSAL_CODE}`)
    expect(one.code).not.toBe(0)
  })

  it("still reaches a test's own office, started on a free port and named in MOLE_OFFICE_PORT", () => {
    const one = result("a test's own office")
    expect(one.stdout, one.stderr).toContain('reached 200')
    expect(one.code).toBe(0)
    expect(own.requests).toEqual(['GET /api/health'])
  })

  it("lets a connection to an address that is not this machine's through, even on the office's port", () => {
    const one = result('another machine')
    expect(one.stdout).not.toContain(REFUSAL_CODE)
    expect(one.stderr).not.toContain('Refused a connection')
    expect(one.code).toBe(0)
  })

  it('refuses nothing while the four office variables are set, as for an agent writing to its office', () => {
    const one = result('the four office variables set')
    expect(one.stdout, one.stderr).toContain('reached 200')
    expect(one.code).toBe(0)
    // That one request is the only one the stand-in for this checkout's office received.
    expect(office.requests).toEqual(['GET /api/health'])
    expect(office.connections()).toBe(1)
  })
})

/**
 * THE TEST PROCESS ITSELF IS GUARDED, AND THE RUN FAILS. The fixture fetches the stand-in from inside
 * the test process and catches the failure, as a careless test would. vitest must still fail the run.
 */
describe('a connection from inside a test process fails the run', () => {
  let office: StandIn
  let ran: Ran
  let broken: Ran
  const fixture = join(FOLDER, 'inside', 'tests', 'inside.test.ts')
  beforeAll(async () => {
    office = await aStandIn()
    aFile(
      fixture,
      [
        "it('reaches the office and catches the failure', async () => {",
        `  try { await fetch('http://127.0.0.1:${office.port}/api/health') } catch {}`,
        '  await new Promise((done) => setTimeout(done, 200))',
        '})',
        '',
      ].join('\n'),
    )
    ran = await theRunner(fixture, office.port, aSandboxFolder('inside-sandbox', JSON.stringify({ api: 'http://127.0.0.1:9' })))
    // A sandbox whose instance.json cannot be read cannot say which office it writes to.
    broken = await theRunner(fixture, office.port, aSandboxFolder('broken-sandbox', '{"api": '))
  }, 200_000)
  afterAll(async () => {
    await new Promise((done) => office?.server.close(done))
  })

  it('refuses the connection, says so, fails the run, and the stand-in receives nothing', () => {
    const said = `${ran.stdout}\n${ran.stderr}`
    expect(said).toContain(`Refused a connection to 127.0.0.1:${office.port}.`)
    expect(said).toContain(`The test file: ${fixture}.`)
    // The fixture caught the failed connection, so what fails the run is the guard's second throw.
    expect(said).toContain('This process was stopped because it tried to reach the live office.')
    expect(ran.code, said).not.toBe(0)
    expect(office.requests).toEqual([])
    expect(office.connections()).toBe(0)
  })

  it('stops the run before any test starts when the sandbox cannot say which office it writes to', () => {
    const said = `${broken.stdout}\n${broken.stderr}`
    expect(said).toContain('No test runs: This sandbox cannot say which office it writes to:')
    expect(said).toContain(join(FOLDER, 'broken-sandbox', 'instance.json'))
    expect(broken.code, said).not.toBe(0)
    expect(said).not.toContain('Refused a connection')
    expect(office.connections()).toBe(0)
  })
})
