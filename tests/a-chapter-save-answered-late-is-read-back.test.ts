// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { rmSync } from 'node:fs'
import { prepareRoundChapters, saveRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { ROUND_CHAPTERS, savedChaptersLine, type RoundChapters } from '../src/shared/round-chapters/manifest.ts'
import { madeUpRound } from './round-chapters-fixture.ts'

type OfficeAnswer = { status: number | null; body?: any; why?: string; code?: string | null }
type StandInOptions = { saves: boolean; patchStatus?: number; delayMs?: number }

const REQUEST_TIMEOUT_MS = 500
const PATCH_ANSWER_DELAY_MS = 1500

/** A stand-in office holding one run, whose PATCH stores at once and answers after `delayMs`. */
async function aStandInOffice(manifest: RoundChapters, options: StandInOptions) {
  const runPath = '/api/records/synthetic'
  const data: Record<string, any> = { extra: {} }
  let runReads = 0
  let checkReads = 0
  let gaveUp: OfficeAnswer | null = null
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stand-in')
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && url.pathname === runPath) {
      runReads++
      reply(200, { record: { data } })
      return
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/checks/')) {
      checkReads++
      reply(200, { chapters: savedChaptersLine(manifest) })
      return
    }
    if (req.method === 'PATCH' && url.pathname === runPath) {
      let text = ''
      req.on('data', (chunk: Buffer) => { text += chunk.toString() })
      req.on('end', () => {
        const patch = JSON.parse(text).dataPatch as { extra?: Record<string, unknown>; territory?: unknown }
        if (options.saves) {
          data.extra = { ...(data.extra as Record<string, unknown>), ...(patch.extra ?? {}) }
          if (Object.hasOwn(patch, 'territory')) data.territory = patch.territory
        }
        const answer = () => {
          if (options.patchStatus !== undefined && options.patchStatus !== 200) reply(options.patchStatus, { error: 'the stand-in refused the save' })
          else reply(200, { record: { data } })
        }
        const delay = options.delayMs ?? 0
        if (delay <= 0) answer()
        else {
          const timer = setTimeout(() => { timers.delete(timer); answer() }, delay)
          timers.add(timer)
        }
      })
      return
    }
    reply(404, { error: 'not found' })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const request = async (method: string, path: string, body?: unknown): Promise<OfficeAnswer> => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const text = await response.text()
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { parsed = { error: text } }
      return { status: response.status, body: parsed }
    } catch (why) {
      const error = why as Error & { cause?: { code?: unknown } }
      const code = error.cause?.code ?? error.name
      gaveUp = { status: null, why: error.message, code: typeof code === 'string' ? code : null }
      return gaveUp
    }
  }
  const stop = async () => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  return {
    request,
    gaveUp: () => gaveUp,
    savedManifest: () => data.extra?.[ROUND_CHAPTERS] as unknown,
    runReads: () => runReads,
    checkReads: () => checkReads,
    stop,
  }
}

const aManifest = (withTerritory = true) => {
  const f = madeUpRound()
  if (!withTerritory) rmSync(f.brief + '.round.json')
  return prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief }).manifest
}

describe('a chapter save answered late is read back', () => {
  it('goes on when the manifest was saved before the patch gave up', async () => {
    const manifest = aManifest()
    const office = await aStandInOffice(manifest, { saves: true, delayMs: PATCH_ANSWER_DELAY_MS })
    try {
      const answer = await saveRoundChapters({ id: 'synthetic', manifest, request: office.request })
      const late = office.gaveUp()
      expect(late?.status).toBeNull()
      expect(late?.code).toBeTruthy()
      expect(answer).not.toBeNull()
      expect(answer).toContain(late!.code!)
      expect(answer).toContain(late!.why!)
      expect(office.savedManifest()).toEqual(manifest)
    } finally {
      await office.stop()
    }
  })

  it('throws when the office saved nothing and did not answer', async () => {
    const manifest = aManifest(false)
    const office = await aStandInOffice(manifest, { saves: false, delayMs: PATCH_ANSWER_DELAY_MS })
    try {
      await expect(saveRoundChapters({ id: 'synthetic', manifest, request: office.request })).rejects.toThrow()
      expect(office.savedManifest()).toBeUndefined()
    } finally {
      await office.stop()
    }
  })

  it('throws on a refusal with a status and does not read the run back', async () => {
    const manifest = aManifest()
    const office = await aStandInOffice(manifest, { saves: false, patchStatus: 409 })
    try {
      await expect(saveRoundChapters({ id: 'synthetic', manifest, request: office.request })).rejects.toThrow()
      expect(office.runReads()).toBe(1)
    } finally {
      await office.stop()
    }
  })
})
