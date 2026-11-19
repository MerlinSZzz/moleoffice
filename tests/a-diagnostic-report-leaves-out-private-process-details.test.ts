// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Real Node reports from stand-in children only. The marker is invented in each test.
 * An agent's opUgaM3bK1T4 requires removal at every depth after a tsx worker retained the marker.
 * Mutations: remove flags and deletion together; replace recursion with root-only deletion;
 * remove deletion for a child started as an older supervisor would start it.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { spawn as actualSpawn, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestDiagnosticReport } from '../tools/office-diagnostic-report.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const exclusionFlags = ['--report-exclude-env', '--report-exclude-network']

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.doUnmock('node:child_process')
})

it.each([
  { launch: 'with the exclusion flags', legacy: false },
  { launch: 'without the exclusion flags, like an older supervisor', legacy: true },
])('saves no environment, network interfaces, host name or generated marker $launch', async ({ legacy }) => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-private-report-stand-in-'))
  const marker = `invented-diagnostic-stand-in-${randomUUID()}`
  let owner: Awaited<ReturnType<typeof import('../tools/serve-dev.mjs').serveDev>> | undefined
  try {
    const port = await new Promise<number>((done, fail) => {
      const probe = createServer()
      probe.once('error', fail)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') throw new Error('No stand-in port.')
        probe.close(() => done(address.port))
      })
    })
    mkdirSync(join(root, 'src/server'), { recursive: true })
    mkdirSync(join(root, 'src/worker'), { recursive: true })
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'src/worker/index.ts'), '// diagnostic privacy test stand-in\n')
    writeFileSync(join(root, 'src/server/index.ts'), `
      // A stand-in HTTP child. No office code or authored records are served.
      import { createServer } from 'node:http'
      import { writeFileSync } from 'node:fs'
      import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
      const owner = process.argv.find((arg) => arg.startsWith('--stop-with-pid='))
      if (!owner) throw new Error('The stand-in needs its owner.')
      const starter = aWatchOnTheStarter(Number(owner.slice('--stop-with-pid='.length)))
      setInterval(() => { if (starter().state === 'gone') process.exit(0) }, 250).unref()
      process.on('SIGTERM', () => process.exit(0))
      createServer((_req, res) => res.end(JSON.stringify({ pid: process.pid }))).listen({ fd: 3 }, () => {
        writeFileSync('stand-in.json', JSON.stringify({ pid: process.pid,
          excludeEnv: process.report.excludeEnv, excludeNetwork: process.report.excludeNetwork }))
      })
    `)
    vi.stubEnv('MOLE_OFFICE_PORT', String(port))
    vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
    vi.resetModules()
    // Even a red mutation must not write inherited process variables into its fixture report.
    vi.doMock('node:child_process', async (original) => ({
      ...(await original<typeof import('node:child_process')>()),
      spawn: (command: string, args: readonly string[], options: SpawnOptions) => {
        if (options.cwd !== root || !args.includes('src/server/index.ts')) return actualSpawn(command, args, options)
        return actualSpawn(command, legacy ? args.filter((arg) => !exclusionFlags.includes(arg)) : args,
          { ...options, env: { PATH: '/usr/local/bin:/usr/bin:/bin', TZ: 'Etc/UTC', DIAGNOSTIC_STAND_IN_VALUE: marker } })
      },
    }))
    const { serveDev } = await import('../tools/serve-dev.mjs')
    owner = await serveDev({ root, writeItDown: false, say: () => {} })
    const deadline = Date.now() + 10_000
    while (!existsSync(join(root, 'stand-in.json')) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 25))
    }
    expect(existsSync(join(root, 'stand-in.json'))).toBe(true)
    const state = JSON.parse(readFileSync(join(root, 'stand-in.json'), 'utf8'))
    const result = await requestDiagnosticReport(state.pid, root)
    expect(result.incomplete).toEqual([])
    const bytes = readFileSync(result.path, 'utf8')
    // Check bytes first. On a mutation, do not print a raw environment object in assertion output.
    expect(bytes.includes(marker), 'The invented environment marker reached the file.').toBe(false)
    const saved = JSON.parse(bytes)
    const privateFields: string[] = []
    function checkEveryDepth(value: unknown, path: string): void {
      if (value === null || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (key === 'environmentVariables' || (path.endsWith('.header') && ['networkInterfaces', 'host'].includes(key))) {
          privateFields.push(`${path}.${key}`)
        }
        checkEveryDepth(child, `${path}.${key}`)
      }
    }
    checkEveryDepth(saved.report, 'report')
    expect(privateFields).toEqual([])
    expect(state.excludeEnv).toBe(!legacy)
    expect(state.excludeNetwork).toBe(!legacy)
    expect(Object.keys(saved)).toEqual(['stack', 'report', 'pid', 'hangAt', 'inspectorUrl', 'inspectorClosed', 'incomplete'])
    expect(saved.pid).toBe(state.pid)
    expect(saved.inspectorClosed).toBe(true)
    expect(saved.stack.length).toBeGreaterThan(0)
    expect(saved.report.header.processId).toBe(state.pid)
    expect(saved.report.header.cwd).toBe(root)
    expect(saved.report.header.commandLine).toContain('src/server/index.ts')
    expect(saved.report.javascriptStack).toBeTypeOf('object')
    expect(saved.report.javascriptHeap.usedMemory).toBeGreaterThan(0)
    expect(saved.report.javascriptHeap.totalMemory).toBeGreaterThanOrEqual(saved.report.javascriptHeap.usedMemory)
    expect(Array.isArray(saved.report.libuv)).toBe(true)
    expect(saved.report.resourceUsage).toBeTypeOf('object')
    expect(saved.report.workers.length).toBeGreaterThan(0)
  } finally {
    await owner?.stop()
    rmSync(root, { recursive: true, force: true })
  }
}, 25_000)
