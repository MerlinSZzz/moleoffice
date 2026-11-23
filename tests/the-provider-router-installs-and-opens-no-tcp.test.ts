// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, readdirSync, readlinkSync, statSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theKeySlotsFile, theProviderRouterUnit, theProviderRouterUnitPath, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

let folder = ''
beforeAll(() => { folder = aTestDatabaseFolder('unit') })
afterAll(() => { if (folder) removeThisTestFolder(folder) })

describe('the host router unit', () => {
  it('installs the generated unit and enables it, and leaves a different existing unit alone', async () => {
    const home = join(folder, 'home')
    const bin = join(folder, 'bin')
    const log = join(folder, 'systemctl.log')
    const sandboxes = join(folder, 'sandboxes')
    // THE OFFICE THE MADE-UP STABLE UNIT SERVES: install reads its port and database from `systemctl show`, its key from
    // the keys.json beside the database, and asks its GET /api/runtime before it writes the unit.
    const data = join(folder, 'stable-data')
    const database = join(data, 'office.db')
    mkdirSync(data, { recursive: true })
    writeFileSync(database, '')
    writeFileSync(join(data, 'keys.json'), JSON.stringify({ office: 'made-up-stable-office-key' }), { mode: 0o600 })
    const office = createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      port: (office.address() as AddressInfo).port, supervisor: { pid: 4242 }, repository: { path: resolve('.') }, database: { path: database },
    })))
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    const api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
    const show = join(folder, 'stable.show')
    writeFileSync(show, `MainPID=4242\nExecStart={ path=/usr/bin/env ; argv[]=/usr/bin/env -i MOLE_OFFICE_PORT=${(office.address() as AddressInfo).port} MOLE_OFFICE_DB=${database} /made-up/node /made-up/server.mjs ; ignore_errors=no }\nActiveState=active\n`)
    mkdirSync(bin, { recursive: true })
    const systemctl = join(bin, 'systemctl')
    writeFileSync(systemctl, '#!/bin/sh\nif [ "$2" = show ]; then cat "$ROUTER_SYSTEMCTL_SHOW"; exit 0; fi\nprintf "%s\\n" "$*" >> "$ROUTER_SYSTEMCTL_LOG"\n', { mode: 0o700 })
    const env = { HOME: home, PATH: `${bin}:${process.env.PATH}`, ROUTER_SYSTEMCTL_LOG: log, ROUTER_SYSTEMCTL_SHOW: show }
    const command = resolve('tools/key-router/install.mjs')
    // Not spawnSync: the made-up office answers in this process, which answers nothing while spawnSync waits.
    const run = () => new Promise<{ status: number | null, stdout: string, stderr: string }>((done, reject) => {
      const child = spawn(process.execPath, [command, '--sandboxes', sandboxes], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (part: Buffer) => { stdout += part.toString() })
      child.stderr.on('data', (part: Buffer) => { stderr += part.toString() })
      child.once('error', reject)
      child.once('close', (status) => done({ status, stdout, stderr }))
    })
    try {
      const installed = await run()
      const unit = theProviderRouterUnitPath(home)
      expect(installed.status).toBe(0)
      expect(installed.stdout).toContain(unit)
      expect(readFileSync(unit, 'utf8')).toBe(theProviderRouterUnit({ node: process.execPath, router: resolve('tools/provider-router.mjs'), sandboxes, office: { api, database } }))
      expect(statSync(unit).mode & 0o777).toBe(0o600)
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['--user daemon-reload', '--user enable --now mole-office-keyrouter.service'])
      writeFileSync(unit, 'different unit\n')
      const refused = await run()
      expect(refused.status).not.toBe(0)
      expect(refused.stderr).toContain(unit)
      expect(readFileSync(unit, 'utf8')).toBe('different unit\n')
      expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(2)
    } finally {
      await new Promise<void>((done) => office.close(() => done()))
    }
  })

  it('opens a sandbox socket while holding no listening TCP socket', async () => {
    const home = join(folder, 'serve-home')
    const keysDir = join(folder, 'db')
    const sandboxes = join(folder, 's')
    mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
    chmodSync(join(home, '.config', 'mole-office'), 0o700)
    writeFileSync(theKeySlotsFile(home), JSON.stringify({ version: 1, slots: [] }), { mode: 0o600 })
    mkdirSync(keysDir, { recursive: true })
    writeFileSync(join(keysDir, 'keys.json'), JSON.stringify({ office: 'made-up-office-key' }), { mode: 0o600 })
    mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
    aRouterFolderFor(join(sandboxes, '.run', 'a'))
    const office = createServer((_req, res) => res.writeHead(200).end('{}'))
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    const api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
    const child = spawn(process.execPath, [resolve('tools/provider-router.mjs'), 'serve', '--sandboxes', sandboxes, '--api', api], {
      env: { ...process.env, HOME: home, MOLE_OFFICE_DB: join(keysDir, 'office.db') }, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    })
    const stopped = new Promise<void>((done) => child.once('exit', () => done()))
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('router did not start')), 10_000)
        child.stderr.on('data', (part: Buffer) => { if (part.toString().includes('listening on')) { clearTimeout(timeout); done() } })
        child.once('exit', () => { clearTimeout(timeout); reject(new Error('router exited early')) })
      })
      await new Promise<void>((done, reject) => {
        const req = request({ socketPath: theRouterControlSocket(sandboxes), method: 'POST', path: '/open', headers: { 'content-type': 'application/json' } }, (res) => {
          res.resume(); res.on('end', () => res.statusCode === 200 ? done() : reject(new Error(`open answered ${res.statusCode}`)))
        })
        req.on('error', reject); req.end('{"sandbox":"a"}')
      })
      const pid = child.pid!
      const ownInodes = new Set(readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
        try { const match = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${pid}/fd/${fd}`)); return match ? [match[1]!] : [] } catch { return [] }
      }))
      expect(ownInodes.size).toBeGreaterThan(0)
      // machine-wide on purpose: the kernel TCP tables let us match only this child process's socket inodes.
      const tables = ['tcp', 'tcp6'].map((name) => readFileSync(`/proc/${pid}/net/${name}`, 'utf8')).join('\n')
      const listening = tables.split('\n').map((line) => line.trim().split(/\s+/)).filter((cols) => cols[3] === '0A' && ownInodes.has(cols[9]!))
      expect(listening).toEqual([])
    } finally {
      if (child.exitCode === null && child.pid) process.kill(-child.pid, 'SIGTERM')
      await stopped
      await new Promise<void>((done) => office.close(() => done()))
    }
  }, 20_000)
})
