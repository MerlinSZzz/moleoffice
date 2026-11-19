// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHILD CLOSES THE INSPECTOR CONNECTION, NOT THE COLLECTOR.
 *
 * tools/office-diagnostic-report.mjs ends a report by asking the child's inspector to close
 * (`node:inspector`'s close(), its fixed cleanup call). It used to close its own WebSocket at once
 * after sending that call. The two closes crossed, the child's connection was left half closed, and
 * when the child then exited, Node 22 crashed it with SIGSEGV on its inspector thread
 * (WsHandler::OnCloseFrameWritten). Whole-suite runs on 22 October 2026 lost three children that
 * way. A stand-in crashed 6 times in 1,000 with the collector's close sent 0 to 19 ms after the call,
 * and not once in 800 with the child left to close. The collector now waits for the child to end the
 * connection, and closes its side only if the child has not by the time left for the TCP proof.
 *
 * The crash is a race, so this file does not wait for one. It records, on a real child's real
 * inspector, the order in which the connection closed: the cleanup call is sent, the child closes the
 * connection, and only then does the collector's own close() run, on a socket already closed.
 * Mutation: put back the collector's close() right after the call; the order turns red every time.
 *
 * THE CHILD IS ASKED ONLY ONCE IT RUNS. SIGUSR1 ends a Node process that has not yet set up its handler
 * for it, which Node does in the first milliseconds after it starts, before any of the child's own code.
 * So the test waits for the stand-in's first line. It used to send at once, and the child lived only
 * because the test's first read of `globalThis.WebSocket`, between the start and the request, made Node
 * load its WebSocket code first. In a process where that was already loaded, the request came within a
 * millisecond, and the child died of the signal every time (wave 13n round K).
 */
import { afterEach, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordInspectorAddress, requestDiagnosticReport } from '../tools/office-diagnostic-report.mjs'

const STAND_IN = `
  // A diagnostic stand-in: a little work every 50 ms, so a pause lands, and TERM ends it with 0.
  process.on('SIGTERM', () => process.exit(0))
  setInterval(() => { let sum = 0; for (let i = 0; i < 100000; i++) sum += i }, 50)
  console.log('running')
`

afterEach(() => { vi.unstubAllGlobals() })

it('sends the cleanup call, lets the child close the connection, and closes its own side only after', async () => {
  // Made before the child starts, so the time from its start to the request does not depend on whether
  // this process has loaded Node's WebSocket code yet.
  const seen: string[] = []
  const Real = globalThis.WebSocket
  const states = ['connecting', 'open', 'closing', 'closed']
  class Recording extends Real {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.addEventListener('close', () => seen.push('the connection closed'))
    }
    override send(data: Parameters<InstanceType<typeof Real>['send']>[0]): void {
      if (String(data).includes("getBuiltinModule('node:inspector').close()")) seen.push('the cleanup call sent')
      super.send(data)
    }
    override close(code?: number, reason?: string): void {
      seen.push(`the collector's close() on a socket ${states[this.readyState]}`)
      super.close(code, reason)
    }
  }
  vi.stubGlobal('WebSocket', Recording)
  const root = mkdtempSync(join(tmpdir(), 'mole-office-inspector-close-stand-in-'))
  mkdirSync(join(root, '.logs'))
  const child = spawn(process.execPath, ['--inspect-port=0', '--report-exclude-env', '--report-exclude-network', '-e', STAND_IN],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', TZ: 'Etc/UTC' } })
  const ended = new Promise<string>((done) => child.on('exit', (code, signal) => done(signal ?? `exit ${String(code)}`)))
  let reading = true
  child.stderr.on('data', (chunk) => { if (reading) for (const line of String(chunk).split('\n')) recordInspectorAddress(root, child.pid!, line) })
  const running = new Promise<void>((done, fail) => {
    child.stdout.once('data', () => done())
    child.once('exit', (code, signal) => fail(new Error(`The stand-in ended (${signal ?? `exit ${String(code)}`}) before it said it runs.`)))
  })
  try {
    await running
    const result = await requestDiagnosticReport(child.pid!, root)
    expect(result.incomplete).toEqual([])
    expect(seen).toEqual(['the cleanup call sent', 'the connection closed', "the collector's close() on a socket closed"])
    const saved = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(saved.inspectorClosed).toBe(true)
    expect(saved.stack.length).toBeGreaterThan(0)
    child.kill('SIGTERM')
    expect(await ended).toBe('exit 0')
  } finally {
    reading = false
    child.kill('SIGKILL')
    rmSync(root, { recursive: true, force: true })
  }
})
