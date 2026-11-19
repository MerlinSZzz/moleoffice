// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MEASURE THE WORKER'S QUEUE READS PER MINUTE, measured and not estimated.
 *
 * Stands up a scratch server of its own (a temporary database, a free port, the message worker it
 * would start disabled) and then starts the REAL message worker as its own process, pointed at it,
 * with the fake runtime available and an empty queue. It waits for the worker's first queue read,
 * lets the worker run for exactly the window below, stops the worker's process group, and counts
 * the `worker.queue` rows the window's api_calls table holds. The machine's load average is read
 * before and after and printed beside the result.
 *
 * Run it twice — once on the code before the cadence change, once after — under `nice -n 19`,
 * back to back, so the two readings share the machine's conditions.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const CHECKOUT = process.cwd().replace(/\/$/, '')
const WINDOW_MS = 60_000

/** A free port, closed again the moment it is found. */
async function aFreePort(): Promise<number> {
  return await new Promise((go) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as { port: number }).port
      probe.close(() => go(port))
    })
  })
}

const port = await aFreePort()
const dir = mkdtempSync(join(tmpdir(), 'mole-office-w2-measure-'))
const db = join(dir, 'measure.db')
const env: NodeJS.ProcessEnv = {
  ...process.env,
  MOLE_OFFICE_DB: db,
  MOLE_OFFICE_PORT: String(port),
  MOLE_OFFICE_MESSAGE_WORKER: 'off',
}

process.stdout.write(`The scratch office is being built on 127.0.0.1:${String(port)} with ${db}\n`)

process.env.MOLE_OFFICE_DB = db
const client = await import(join(CHECKOUT, 'src/server/db/client.ts'))
const { migrateInPlace } = await import(join(CHECKOUT, 'src/server/db/migrate.ts'))
migrateInPlace(client.sqlite, join(CHECKOUT, 'drizzle'))
const { buildApp } = await import(join(CHECKOUT, 'src/server/index.ts'))
const built = await buildApp({ production: false, webAppUrl: `http://127.0.0.1:${String(port + 1)}`, logLevel: false })
await built.app.ready()
await built.app.listen({ host: '127.0.0.1', port })
process.stdout.write('The scratch office is serving.\n')

const workerLog: string[] = []
const worker = spawn('node_modules/.bin/tsx', [join(CHECKOUT, 'src/worker/index.ts'), '--api', `http://127.0.0.1:${String(port)}`], {
  cwd: CHECKOUT,
  env: { ...env, MOLE_OFFICE_FAKE_RUNTIME: join(CHECKOUT, 'tests/fake-runtime.mjs') },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
worker.stdout.on('data', (chunk: Buffer) => workerLog.push(String(chunk)))
worker.stderr.on('data', (chunk: Buffer) => workerLog.push(`stderr: ${String(chunk)}`))
const pgid = worker.pid

const loadBefore = await (await import('node:os')).loadavg()

/** The worker is working when its first queue read is in the table, or 30 seconds have passed. */
let firstQueueAt: number | null = null
const startedAt = Date.now()
while (Date.now() - startedAt < 30_000) {
  await new Promise((go) => setTimeout(go, 500))
  const row = client.sqlite.prepare("SELECT MIN(at_ms) AS at FROM api_calls WHERE operation = 'worker.queue'").get() as { at: number | null }
  if (row.at !== null) {
    firstQueueAt = row.at
    break
  }
}
if (firstQueueAt === null) {
  process.stdout.write(`The worker never read the queue. Its log:\n${workerLog.join('')}\n`)
  if (pgid !== undefined && pgid !== null) process.kill(-pgid, 'SIGTERM')
  await built.app.close()
  client.sqlite.close()
  rmSync(dir, { recursive: true, force: true })
  process.exit(1)
}

await new Promise((go) => setTimeout(go, WINDOW_MS))
const endedAt = Date.now()
const loadAfter = await (await import('node:os')).loadavg()

if (pgid !== undefined && pgid !== null) {
  try {
    process.kill(-pgid, 'SIGTERM')
  } catch {
    // Already gone; the count below is still the count of what ran.
  }
}
await new Promise((go) => setTimeout(go, 1_000))

const counted = client.sqlite
  .prepare("SELECT COUNT(*) AS n, MIN(at_ms) AS firstAt, MAX(at_ms) AS lastAt FROM api_calls WHERE operation = 'worker.queue' AND at_ms >= ? AND at_ms <= ?")
  .get(firstQueueAt, endedAt) as { n: number; firstAt: number; lastAt: number }
const windowMs = Math.max(1, counted.lastAt - counted.firstAt)
const perMinute = (counted.n / windowMs) * 60_000

process.stdout.write(
  [
    `window: from the first queue read to the last, ${String(Math.round(windowMs / 1000))} s`,
    `queue reads in the window: ${String(counted.n)}`,
    `QUEUE READS PER MINUTE: ${perMinute.toFixed(1)}`,
    `load average before: ${loadBefore.map((one) => one.toFixed(2)).join(' ')}`,
    `load average after: ${loadAfter.map((one) => one.toFixed(2)).join(' ')}`,
  ].join('\n') + '\n',
)

writeFileSync(join(dir, 'worker.log'), workerLog.join(''))
await built.app.close()
client.sqlite.close()
rmSync(dir, { recursive: true, force: true })
