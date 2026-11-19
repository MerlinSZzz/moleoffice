// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const implementation = new URL('../tools/stable/stable-bootstrap-support.mjs', import.meta.url).href
const load = () => import(/* @vite-ignore */ implementation)
const folders = theFoldersThisFileMakes()
const owned: Array<{ child: ChildProcess; startTime: string }> = []

async function fixtureProcess(existing?: string, withChild = false, childListens = false, withDatabase = true) {
  const { bootstrapProcessIdentity } = await load()
  const folder = existing ?? folders.make('process')
  mkdirSync(join(folder, 'home'), { mode: 0o700, recursive: true })
  const env = { PATH: process.env.PATH, HOME: join(folder, 'home'), ...(withDatabase ? { MOLE_OFFICE_DB: join(folder, 'synthetic.db') } : {}), MOLE_OFFICE_PORT: '43001', MOLE_OFFICE_MESSAGE_WORKER: 'off', SYNTHETIC_UNREQUESTED_SECRET: 'fixture-never-collected' }
  // A listening child holds a free loopback port and writes its number to child.port.
  const childCode = childListens ? `const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>require('node:fs').writeFileSync(${JSON.stringify(join(folder, 'child.port'))},String(s.address().port),{mode:0o600}))` : 'setInterval(()=>{},1000)'
  const code = withChild ? `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{env:${JSON.stringify(env)},stdio:'ignore'});writeFileSync(${JSON.stringify(join(folder, 'child.pid'))},String(child.pid),{mode:0o600});setInterval(()=>{},1000);` : 'setInterval(()=>{},1000)'
  const child = spawn(process.execPath, ['-e', code], {
    cwd: folder, detached: true, stdio: 'ignore',
    env,
  })
  if (!child.pid) throw new Error('The recorded fixture process did not spawn.')
  const identity = bootstrapProcessIdentity(child.pid)
  owned.push({ child, startTime: identity.startTime })
  return { folder, child, identity }
}

afterEach(async () => {
  try {
    const { bootstrapProcessIdentity } = await load()
    for (const row of owned.splice(0)) {
      const pid = row.child.pid!
      if (row.child.exitCode !== null || row.child.signalCode !== null) continue
      const identity = bootstrapProcessIdentity(pid)
      if (identity.pgid !== pid || identity.startTime !== row.startTime) throw new Error('Fixture group identity changed; no cleanup signal sent.')
      const ended = new Promise<void>(resolve => row.child.once('exit', () => resolve()))
      process.kill(-pid, 'SIGTERM')
      await ended
    }
  } finally {
    folders.removeEveryOne()
  }
})

describe('bootstrap process observations', () => {
  it('returns only allowlisted requested variables without collecting an unrequested secret', async () => {
    const { readNamedProcessVariables } = await load()
    const f = await fixtureProcess()
    const observed = readNamedProcessVariables(f.child.pid, ['MOLE_OFFICE_DB', 'MOLE_OFFICE_MESSAGE_WORKER'])
    expect(observed).toEqual({ MOLE_OFFICE_DB: join(f.folder, 'synthetic.db'), MOLE_OFFICE_MESSAGE_WORKER: 'off' })
    expect(JSON.stringify(observed)).not.toContain('fixture-never-collected')
    expect(() => readNamedProcessVariables(f.child.pid, ['SYNTHETIC_UNREQUESTED_SECRET'])).toThrow(/allowlist/i)
  })

  it('refuses an identical non-descendant decoy before accepting its recorded topology', async () => {
    const { bootstrapProcessIdentity, verifyLocalTopology } = await load()
    const supervisor = await fixtureProcess(), decoy = await fixtureProcess(supervisor.folder)
    // Same argv is deliberately insufficient; the two processes are siblings.
    const record = (f: Awaited<ReturnType<typeof fixtureProcess>>) => ({
      ...bootstrapProcessIdentity(f.child.pid), groupLeader: { pid: f.child.pid, startTime: f.identity.startTime },
      cwd: realpathSync(`/proc/${f.child.pid}/cwd`), argv: readFileSync(`/proc/${f.child.pid}/cmdline`, 'utf8').split('\0').filter(Boolean),
    })
    const original = record(supervisor), other = record(decoy)
    const config = {
      topology: { supervisor: original, server: other, worker: null },
      database: join(supervisor.folder, 'synthetic.db'), servicePort: 43001,
      serviceHome: join(supervisor.folder, 'home'), serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off' }, listeners: [], releaseCheckPort: 0,
    }
    // Match explicit nonsecret settings, so only lineage can reject this decoy.
    expect(() => verifyLocalTopology(config)).toThrow(/descendant/i)
    await delay(10)
    expect(bootstrapProcessIdentity(decoy.child.pid).startTime).toBe(decoy.identity.startTime)
    expect(decoy.child.exitCode).toBeNull()
  })

  it('refuses an omitted named original supervisor override without collecting other variables', async () => {
    const { bootstrapProcessIdentity, verifyLocalTopology } = await load()
    const f = await fixtureProcess(undefined, true)
    const childFile = join(f.folder, 'child.pid')
    for (let n = 0; n < 200 && !existsSync(childFile); n++) await delay(10)
    const server = Number(readFileSync(childFile, 'utf8'))
    const record = (pid: number) => ({ ...bootstrapProcessIdentity(pid), groupLeader: { pid: f.child.pid!, startTime: f.identity.startTime }, cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) })
    const config = { topology: { supervisor: record(f.child.pid!), server: record(server), worker: null }, database: join(f.folder, 'synthetic.db'), servicePort: 43001, serviceHome: join(f.folder, 'home'), serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off' }, listeners: [], releaseCheckPort: 0 }
    expect(() => verifyLocalTopology(config)).not.toThrow()
    expect(() => verifyLocalTopology({ ...config, serviceSettings: {} })).toThrow(/omitted|record.*override|override.*record/i)
  })

  it('refuses a scratch release-check port held even by a recorded server', async () => {
    const { bootstrapProcessIdentity, verifyLocalTopology } = await load()
    const f = await fixtureProcess(undefined, true, true)
    const childFile = join(f.folder, 'child.pid'), portFile = join(f.folder, 'child.port')
    for (let n = 0; n < 200 && !(existsSync(childFile) && existsSync(portFile)); n++) await delay(10)
    const server = Number(readFileSync(childFile, 'utf8')), held = Number(readFileSync(portFile, 'utf8'))
    const record = (pid: number) => ({ ...bootstrapProcessIdentity(pid), groupLeader: { pid: f.child.pid!, startTime: f.identity.startTime }, cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) })
    const config = { topology: { supervisor: record(f.child.pid!), server: record(server), worker: null }, database: join(f.folder, 'synthetic.db'), servicePort: 43001, serviceHome: join(f.folder, 'home'), serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off' }, listeners: [], releaseCheckPort: 0 }
    // The recorded topology passes with a scratch port nothing listens on, so only the port can refuse below.
    expect(() => verifyLocalTopology(config)).not.toThrow()
    // The recorded server listens on the scratch port: the scratch port may be held by nothing, so it is refused.
    expect(() => verifyLocalTopology({ ...config, releaseCheckPort: held })).toThrow(/scratch release-check port is occupied/)
  })

  it('takes the database from the checkout\'s .env for a process started without MOLE_OFFICE_DB, as the data-folder move starts the office', async () => {
    const { bootstrapProcessIdentity, verifyLocalTopology } = await load()
    const f = await fixtureProcess(undefined, true, false, false)
    const childFile = join(f.folder, 'child.pid')
    for (let n = 0; n < 200 && !existsSync(childFile); n++) await delay(10)
    const server = Number(readFileSync(childFile, 'utf8'))
    const record = (pid: number) => ({ ...bootstrapProcessIdentity(pid), groupLeader: { pid: f.child.pid!, startTime: f.identity.startTime }, cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) })
    const checkout = realpathSync(f.folder), envFile = join(checkout, '.env')
    const config = { developmentRepository: checkout, topology: { supervisor: record(f.child.pid!), server: record(server), worker: null }, database: join(checkout, 'synthetic.db'), servicePort: 43001, serviceHome: join(f.folder, 'home'), serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off' }, listeners: [], releaseCheckPort: 0 }
    // Neither process carries MOLE_OFFICE_DB, so the database is the one the checkout's .env names, read as the server reads it.
    expect(readFileSync(`/proc/${server}/environ`, 'utf8')).not.toContain('MOLE_OFFICE_DB=')
    writeFileSync(envFile, `MOLE_OFFICE_DB=${join(checkout, 'synthetic.db')}\n`, { mode: 0o600 })
    expect(() => verifyLocalTopology(config)).not.toThrow()
    // A relative value is resolved against the checkout, as the server resolves it.
    writeFileSync(envFile, 'MOLE_OFFICE_DB=./synthetic.db\n', { mode: 0o600 })
    expect(() => verifyLocalTopology(config)).not.toThrow()
    writeFileSync(envFile, `MOLE_OFFICE_DB=${join(checkout, 'another.db')}\n`, { mode: 0o600 })
    expect(() => verifyLocalTopology(config)).toThrow(/database, port or home differs/)
    // With no .env the server opens the default database, which is not the configured one.
    rmSync(envFile)
    expect(() => verifyLocalTopology(config)).toThrow(/database, port or home differs/)
  })
})
