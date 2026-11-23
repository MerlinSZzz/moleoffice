// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { closeSync, fstatSync, openSync, readSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPanelEnv } from '../src/server/lib/env.ts'

const here = fileURLToPath(import.meta.url)

function options(argv: string[]): { command: string; to?: string; from?: string; into?: string; upTo?: string; whole: boolean; json: boolean } {
  const [command, ...args] = argv
  if (command !== 'make' && command !== 'restore' && command !== 'migrate-internal') throw new Error('Choose make or restore.')
  const out: { command: string; to?: string; from?: string; into?: string; upTo?: string; whole: boolean; json: boolean } = { command, whole: false, json: false }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--whole' && command === 'make') out.whole = true
    else if (arg === '--json' && command !== 'migrate-internal') out.json = true
    else if ((arg === '--to' && command === 'make') || ((arg === '--from' || arg === '--into' || arg === '--up-to') && command === 'restore')) {
      const value = args[++i]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a folder or name after it.`)
      if (arg === '--to') out.to = value
      else if (arg === '--from') out.from = value
      else if (arg === '--into') out.into = value
      else out.upTo = value
    } else throw new Error(`I do not know the option ${String(arg)}.`)
  }
  if (command === 'make' && !out.to) throw new Error('Make needs --to followed by a folder.')
  if (command === 'restore' && (!out.from || !out.into)) throw new Error('Restore needs --from and --into, each followed by a folder.')
  return out
}

/** Each database phase gets a new process and only the new database path. */
async function runPhases(database: string, exportFolder: string): Promise<void> {
  const output = join(dirname(database), '.restore-output')
  const env = { ...process.env, MOLE_OFFICE_DB: database }
  const phases = [
    [here, 'migrate-internal'],
    [fileURLToPath(new URL('./import.ts', import.meta.url)), '--from', exportFolder, '--apply'],
  ]
  for (const phase of phases) {
    const fd = openSync(output, 'w')
    let result
    try { result = spawnSync(process.execPath, ['--import', 'tsx', ...phase], { env, stdio: ['ignore', fd, fd], shell: false }) }
    finally { closeSync(fd) }
    if (result.error || result.status !== 0) {
      const log = openSync(output, 'r')
      let words: string
      try {
        const size = fstatSync(log).size
        const tail = Buffer.alloc(Math.min(size, 65536))
        readSync(log, tail, 0, tail.length, size - tail.length)
        words = tail.toString('utf8')
      } finally { closeSync(log) }
      unlinkSync(output)
      throw new Error(`${result.error?.message ?? `Process exited ${String(result.status)}`}. ${words}`)
    }
    unlinkSync(output)
  }
}

async function main(): Promise<void> {
  const parsed = options(process.argv.slice(2))
  loadPanelEnv()
  if (parsed.command === 'migrate-internal') {
    const { sqlite } = await import('../src/server/db/client.ts')
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    migrateInPlace(sqlite, fileURLToPath(new URL('../drizzle', import.meta.url)))
    sqlite.close()
    return
  }
  if (parsed.command === 'make') {
    const { openTheStoreToExport } = await import('../src/server/lib/the-store-to-export.ts')
    const store = openTheStoreToExport()
    try {
      console.log(`database: ${store.name}`)
      const { makePack } = await import('../src/server/lib/pack/make.ts')
      const result = await makePack({ to: parsed.to!, database: store.name, whole: parsed.whole })
      if (parsed.json) console.log(JSON.stringify({ ...result, record: 'No pack record was filed. This command is for drills and made-up offices.' }, null, 2))
      else console.log(`${result.name}\nNo pack record was filed. This command is for drills and made-up offices.`)
    } finally { store.close() }
  } else {
    const { RESTORED_DATABASE_NAME, restorePack } = await import('../src/server/lib/pack/restore.ts')
    console.log(`database: ${join(resolve(parsed.into!), RESTORED_DATABASE_NAME)}`)
    const result = await restorePack({ from: parsed.from!, into: parsed.into!, upTo: parsed.upTo, runPhases })
    if (parsed.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`${result.folder}\n${result.notes.join('\n')}`)
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
