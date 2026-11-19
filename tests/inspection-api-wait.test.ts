// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic delayed API responses. No model, production database or permanent server is used. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectionApiWaitMilliseconds, inspectionOfficeBackMilliseconds } from '../src/config/inspection.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
let restart: ReturnType<typeof setTimeout> | undefined
let restarting: Promise<void> | undefined
let stopping: Promise<void> | undefined
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => {
  clearTimeout(restart)
  await restarting
  restarting = undefined
  stopping = undefined
  await fixture.close()
})

function restartAfter(milliseconds: number) {
  restart = setTimeout(() => { restarting = (stopping ?? Promise.resolve()).then(() => fixture.startOffice()) }, milliseconds)
}

/**
 * START THE OFFICE AGAIN `after` MILLISECONDS AFTER THE TOOL SAYS `words`, which it says only once a request was refused
 * and it has begun to wait. These cases used to start it 1.2 s after they began or stopped it. In the whole suite on 13
 * November 2026 the first of them went red and was green alone. A tool that takes longer than 1.2 s to reach its
 * request, as one can on a loaded machine, finds the office already back and never waits.
 */
function restartOnceItSays(words: string, after = 0) {
  let heard = false
  return (out: string) => {
    if (heard || !out.includes(words)) return
    heard = true
    restartAfter(after)
  }
}

/** A labelled model stand-in. It prints one release and records each invocation outside the tree it checks. */
function standInModel() {
  const bin = join(fixture.home, 'bin')
  mkdirSync(bin)
  const model = join(bin, 'claude')
  const count = join(fixture.home, 'model-runs')
  const envelope = JSON.stringify({ result: JSON.stringify({ verdict: 'released', check: 'Synthetic release; no model ran.', chaptersRead: [] }) })
  writeFileSync(model, `#!/bin/sh\n# Synthetic model stand-in; no model runs.\ncat >/dev/null\necho ran >> '${count}'\nprintf '%s' '${envelope}'\n`)
  chmodSync(model, 0o755)
  return { PATH: `${bin}:${process.env.PATH ?? ''}` }
}

describe('the inspection API wait is separate from the model clock', () => {
  it('reads the declared wait and refuses invalid values', () => {
    expect(inspectionApiWaitMilliseconds({})).toBe(Number(settingNamed('MOLE_OFFICE_INSPECTION_API_SECONDS').fallback) * 1000)
    expect(inspectionApiWaitMilliseconds({ MOLE_OFFICE_INSPECTION_API_SECONDS: '0.125' })).toBe(125)
    for (const value of ['0', '-1', 'later', 'Infinity', '0.0001', '2147483.648']) {
      expect(() => inspectionApiWaitMilliseconds({ MOLE_OFFICE_INSPECTION_API_SECONDS: value })).toThrow('MOLE_OFFICE_INSPECTION_API_SECONDS')
    }
  })

  // MUTATION: change the declared 120-second default, or allow non-positive/invalid office-back waits.
  it('defaults the office-back wait to two minutes and refuses bad values', () => {
    expect(settingNamed('MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS').fallback).toBe('120')
    expect(inspectionOfficeBackMilliseconds({})).toBe(120_000)
    expect(inspectionOfficeBackMilliseconds({ MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '0.125' })).toBe(125)
    for (const value of ['0', '-1', 'later', 'Infinity', '0.0001', '2147483.648']) {
      expect(() => inspectionOfficeBackMilliseconds({ MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: value })).toThrow('MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS')
    }
  })

  it('keeps waiting for the complete response when the configured limit permits it', async () => {
    fixture.state.readDelayMs = 350
    const result = await fixture.inspect([], { MOLE_OFFICE_INSPECTION_API_SECONDS: '2', MOLE_OFFICE_INSPECTION_MINUTES: '0.001' })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('GET /api/checks/fixture-run: HTTP 200')
    expect(result.out).toContain('API wait limit 2 seconds')
    expect(fixture.state.writes.filter(one => one.path.endsWith('/prompt'))).toHaveLength(1)
    expect(fixture.state.writes.filter(one => one.path.endsWith('/assembled'))).toHaveLength(1)
  })

  it('reports which read timed out and writes no assembly or verdict', async () => {
    fixture.state.readDelayMs = 350
    const result = await fixture.inspect([], { MOLE_OFFICE_INSPECTION_API_SECONDS: '0.1', MOLE_OFFICE_INSPECTION_MINUTES: '40' })
    expect(result.code).toBe(1)
    expect(result.err).toContain('/api/checks/fixture-run did not return a complete response after')
    expect(result.err).toContain('API wait limit is 0.1 seconds')
    expect(result.err).toContain('request was not retried')
    expect(fixture.state.writes).toEqual([])
  })
})

describe('Tj0gSo-y1I6h — only a request that never reached the office is asked again', () => {
  // MUTATION: no wait on ECONNREFUSED. The refused initial request ends instead of completing assembly.
  it('waits for a refused connection before the model runs and then completes the same request', async () => {
    await fixture.stopOffice()
    const result = await fixture.inspect([], { MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '6' }, {}, restartOnceItSays('connection refused; waiting up to 6 seconds'))
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('connection refused; waiting up to 6 seconds for the office to come back.')
    expect(result.out).toMatch(/waited \d+\.\d{2} seconds; the office is back\. Sending the same request once more\./)
    expect(fixture.state.writes.filter(one => one.path.endsWith('/assembled'))).toHaveLength(1)
    expect(fixture.state.requests.some(one => one.path === '/api/health')).toBe(true)
  })

  // MUTATION: no wait on ECONNREFUSED. The verdict is absent though the stand-in has already released.
  it('waits when the verdict connection is refused, posts it once and runs the model once', async () => {
    let reads = 0
    fixture.state.onRequest = (request, reply) => {
      if (request.method !== 'GET' || request.url !== `/api/checks/${fixture.run}` || ++reads !== 2) return
      // The seal re-read finishes normally, but the listener closes before the verdict can connect.
      reply.setHeader('connection', 'close')
      stopping = fixture.stopOffice()
    }
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()], { ...standInModel(), MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '6' }, true,
      restartOnceItSays(`POST /api/checks/${fixture.run}: connection refused; waiting up to 6 seconds`))
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('POST /api/checks/fixture-run: connection refused; waiting up to 6 seconds')
    expect(result.out).toMatch(/POST \/api\/checks\/fixture-run: waited \d+\.\d{2} seconds; the office is back/)
    const verdicts = fixture.state.writes.filter(one => one.path === `/api/checks/${fixture.run}`)
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0]?.body['verdict']).toBe('released')
    expect(readFileSync(join(fixture.home, 'model-runs'), 'utf8')).toBe('ran\n')
    expect(reads).toBe(2)
  })

  // MUTATION: no wait on ECONNREFUSED, or leave the receipt PATCH outside askAndHear. The receipt is not stored.
  it('waits for a refused receipt PATCH, stores it once and still posts the verdict', async () => {
    const check = aMadeUpCheckSession()
    const path = `/api/records/${check}`
    fixture.state.records[check] = { status: 200, body: { record: { kind: 'session', data: { runtime: 'claude-code' } } } }
    fixture.state.onRequest = (request, reply) => {
      if (request.method !== 'GET' || request.url !== path) return
      reply.setHeader('connection', 'close')
      stopping = fixture.stopOffice()
    }
    const result = await fixture.inspect(['--check', check], { ...standInModel(), MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '6' }, true,
      restartOnceItSays(`PATCH ${path}: connection refused; waiting up to 6 seconds`))
    expect(result.code, result.err).toBe(0)
    expect(fixture.state.requests.filter(one => one.path === path && one.method === 'PATCH')).toHaveLength(1)
    expect(fixture.state.writes.filter(one => one.path === path)[0]?.body['dataPatch']['usageReceipt']).toBeDefined()
    expect(fixture.state.writes.filter(one => one.path === `/api/checks/${fixture.run}`)).toHaveLength(1)
    expect(result.out).toContain(`PATCH ${path}: connection refused; waiting up to 6 seconds`)
    expect(result.out).toContain(`The usage receipt is stored on this check's session ${check}.`)
  })

  // THE STAND-IN'S 503 (wave 13x, round 8). The dev supervisor's stand-in answers during every restart after a
  // landing, and says nothing was written, so the verdict is sent again once the office answers.
  // MUTATION: leave the stand-in's 503 as an answer in askAndHear. The tool ends 1 with no verdict stored.
  it("waits when the stand-in answers the verdict, posts it again and stores it once", async () => {
    let restartedAt = 0
    fixture.state.onRequest = (request, reply) => {
      const verdict = request.method === 'POST' && request.url === `/api/checks/${fixture.run}`
      const health = request.url === '/api/health'
      if ((verdict && restartedAt === 0) || (health && performance.now() - restartedAt < 1_200)) {
        if (restartedAt === 0) restartedAt = performance.now()
        request.resume()
        reply.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5', [STAND_IN_HEADER]: '1' })
        reply.end(JSON.stringify({ error: 'A synthetic stand-in: no server is answering. Nothing was read or written.' }))
        return true
      }
    }
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()], { ...standInModel(), MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '6' }, true)
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain(`POST /api/checks/${fixture.run}: the dev supervisor answered for the office that no server is running`)
    expect(result.out).toMatch(/waited \d+\.\d{2} seconds; the office is back\. Sending the same request once more\./)
    expect(fixture.state.requests.filter(one => one.method === 'POST' && one.path === `/api/checks/${fixture.run}`)).toHaveLength(2)
    const verdicts = fixture.state.writes.filter(one => one.path === `/api/checks/${fixture.run}`)
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0]?.body['verdict']).toBe('released')
  })

  // MUTATION: retry every failure. The accepted verdict is seen twice even though its first reply was lost.
  it('does not ask again when the office accepted the verdict and destroyed its connection', async () => {
    let accepted = 0
    fixture.state.onRequest = (request) => {
      if (request.method !== 'POST' || request.url !== `/api/checks/${fixture.run}`) return
      accepted += 1
      request.resume()
      request.on('end', () => request.socket.destroy())
      return true
    }
    const result = await fixture.inspect(['--check', aMadeUpCheckSession()], { ...standInModel(), MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '0.2' }, true)
    expect(accepted).toBe(1)
    expect(result.code).toBe(1)
    expect(result.err).toContain('No response was substituted and the request was not retried. The failure may have reached the office.')
    expect(result.out).not.toContain('waiting up to')
    expect(fixture.state.requests.filter(one => one.path === '/api/health')).toEqual([])
  })

  // MUTATION: remove the office-back deadline. The emergency restart lets the mutant end, but too late and successfully.
  it('ends after the short bound when the office never comes back within it', async () => {
    await fixture.stopOffice()
    // Cleanup guard for the no-bound mutation: the office comes back 3 s after the tool says it waits, and a correct tool
    // has ended before then. The guard's clock starts at that sentence, not at the case's start, so the tool's own start
    // on a loaded machine is not counted against the bound.
    const started = performance.now()
    const result = await fixture.inspect([], { MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '0.2' }, {}, restartOnceItSays('connection refused; waiting up to 0.2 seconds', 3_000))
    const elapsed = performance.now() - started
    expect(result.code, result.err).toBe(1)
    expect(elapsed).toBeGreaterThanOrEqual(200)
    expect(restarting, 'the tool ended before the guard started the office again').toBeUndefined()
    expect(result.err).toMatch(/Waited 0\.\d{2} seconds for the office \(limit 0\.2 seconds\); the office never came back\./)
    expect(result.err).toContain('No response was substituted and the request was not retried.')
    expect(fixture.state.requests).toEqual([])
  })
})
