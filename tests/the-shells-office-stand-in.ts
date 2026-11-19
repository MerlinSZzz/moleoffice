// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR THE OFFICE AN AGENT'S SHELL NAMES, and the shell that names it (problem JQ3yaANBi1JC).
 *
 * A sandbox gives its agent's shell MOLE_OFFICE_API naming the owner's live office, with the run, the agent
 * and its key. On 4 October a hand run of register-myself.mjs from such a shell registered an agent "x" in
 * the live office. The installed-office tests run their drivers from a shell like that, with the address
 * naming this stand-in, and fail when anything reaches it.
 *
 * The stand-in is never started as an office and never given to anything as one: only the shell's variables
 * name it. Every request that reaches it is kept, and answered 503, so a step that reached it also fails on
 * its own.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

export interface TheShellsOffice {
  /** Its address, as an agent's shell would carry it in MOLE_OFFICE_API. */
  readonly address: string
  /** `METHOD path` of every request that reached it, in order. */
  readonly reached: string[]
  readonly close: () => Promise<void>
}

export async function aStandInForTheShellsOffice(): Promise<TheShellsOffice> {
  const reached: string[] = []
  const server = createServer((request, response) => {
    reached.push(`${String(request.method)} ${String(request.url)}`)
    response.writeHead(503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'This is the stand-in for the office an agent\'s shell names, and no test step may reach it.' }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const where = server.address()
  const address = `http://127.0.0.1:${String(typeof where === 'object' && where !== null ? where.port : 0)}`
  return { address, reached, close: () => new Promise<void>((done) => server.close(() => done())) }
}

/** What a sandbox gives its agent's shell (tools/sandbox-start.mjs), with the stand-in as the office. */
export function anAgentsShell(theShellsOffice: string): NodeJS.ProcessEnv {
  return {
    MOLE_OFFICE_API: theShellsOffice,
    MOLE_OFFICE_WORKSPACE: 'the-shells-project',
    MOLE_OFFICE_SESSION: 'the-shells-own-run',
    MOLE_OFFICE_AGENT: 'the-shells-agent',
    MOLE_AGENT_KEY: 'a'.repeat(64),
  }
}

/** Run a program to its end without holding up this process, so the stand-in can answer meanwhile. */
export function runToItsEnd(program: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(program, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    child.on('close', (status) => {
      clearTimeout(timer)
      done({ status, stdout, stderr })
    })
  })
}
