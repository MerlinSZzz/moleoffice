// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The exclusive-lock guard: taken alone, refused by a live WAL reader, and taken over a killed writer's frames. */
import { afterEach, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const implementation = new URL('../tools/database-holders.mjs', import.meta.url).href
const load = () => import(/* @vite-ignore */ implementation)
const folders: string[] = []
const children: ChildProcess[] = []
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
    child.kill('SIGKILL')
    await ended
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function database(name = 'made-up.db') {
  const folder = aTestDatabaseFolder('guard'); folders.push(folder)
  const file = join(folder, name)
  const db = new Database(file)
  try { db.exec("CREATE TABLE made_up (value TEXT); INSERT INTO made_up VALUES ('made up for this fixture')") } finally { db.close() }
  return { folder, file }
}

function waitForReady(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    let said = ''
    child.stdout?.on('data', chunk => {
      said += String(chunk)
      if (said.includes('ready')) resolve()
    })
    child.once('exit', code => { if (!said.includes('ready')) reject(new Error(`The fixture child exited ${String(code)} before it was ready.`)) })
    setTimeout(() => reject(new Error('The fixture child did not become ready.')), 10000).unref()
  })
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await ended
}

const readerCode = `const Database=require('better-sqlite3');const db=new Database(process.argv[1],{fileMustExist:true,timeout:0});db.pragma('journal_mode = WAL');db.exec('BEGIN');db.prepare('SELECT count(*) FROM made_up').get();process.stdout.write('ready\\n');setInterval(()=>{},1000);`

it('takes the lock with no holder and leaves the database bytes unchanged', async () => {
  const { file } = database(), before = sha(file)
  const guard = await (await load()).theExclusiveLockGuard(file)
  expect(guard).toMatchObject({ taken: true })
  expect(guard.before.sha256).toBe(before); expect(guard.after.sha256).toBe(before)
  expect(guard.before.size).toBe(guard.after.size)
  expect(sha(file)).toBe(before)
})

it('refuses with SQLITE_BUSY while its own child holds a live WAL connection, then takes the lock after the child stops', async () => {
  const { file } = database()
  const child = spawn(process.execPath, ['-e', readerCode, file], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  await waitForReady(child)
  // The child's last write is the WAL header it sets before it says ready. Taking the bytes after
  // that read makes the refusal's claim about the guard alone: the guard changes nothing.
  const before = sha(file)
  const refused = await (await load()).theExclusiveLockGuard(file)
  expect(refused).toMatchObject({ taken: false, code: 'SQLITE_BUSY' })
  expect(refused.says).toBe('The exclusive database lock could not be taken: SQLITE_BUSY.')
  expect(refused.before.sha256).toBe(before); expect(sha(file)).toBe(before)
  await stop(child)
  const afterChild = sha(file)
  const taken = await (await load()).theExclusiveLockGuard(file)
  expect(taken).toMatchObject({ taken: true })
  expect(taken.before.sha256).toBe(afterChild); expect(taken.after.sha256).toBe(afterChild)
})

it('takes the lock over frames a SIGKILLed writer left and shows the folded database and the gone -wal', async () => {
  const { file } = database()
  const writerCode = `const Database=require('better-sqlite3');const db=new Database(process.argv[1],{fileMustExist:true,timeout:0});db.pragma('journal_mode = WAL');db.pragma('wal_autocheckpoint = 0');db.exec('BEGIN');for(let i=0;i<200;i++)db.prepare('INSERT INTO made_up VALUES (?)').run('x'.repeat(200));db.exec('COMMIT');process.stdout.write('ready\\n');setInterval(()=>{},1000);`
  const child = spawn(process.execPath, ['-e', writerCode, file], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  await waitForReady(child)
  expect(existsSync(file + '-wal')).toBe(true)
  expect(statSync(file + '-wal').size).toBeGreaterThan(0)
  const oldHash = sha(file)
  const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGKILL')
  await ended
  const guard = await (await load()).theExclusiveLockGuard(file)
  expect(guard).toMatchObject({ taken: true })
  expect(guard.before.sha256).toBe(oldHash)
  expect(guard.before.wal.exists).toBe(true); expect(guard.before.wal.size).toBeGreaterThan(0)
  expect(guard.after.sha256).not.toBe(guard.before.sha256)
  expect(guard.after.wal.exists).toBe(false); expect(guard.after.wal.size).toBeNull()
  expect(sha(file)).toBe(guard.after.sha256)
})
