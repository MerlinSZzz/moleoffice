// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, spawnSync } from 'node:child_process'
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
  it('installs the generated unit and enables it, and leaves a different existing unit alone', () => {
    const home = join(folder, 'home')
    const bin = join(folder, 'bin')
    const log = join(folder, 'systemctl.log')
    const sandboxes = join(folder, 'sandboxes')
    mkdirSync(bin, { recursive: true })
    const systemctl = join(bin, 'systemctl')
    writeFileSync(systemctl, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$ROUTER_SYSTEMCTL_LOG"\n', { mode: 0o700 })
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, ROUTER_SYSTEMCTL_LOG: log }
    const command = resolve('tools/key-router/install.mjs')
    const installed = spawnSync(process.execPath, [command, '--sandboxes', sandboxes], { env, encoding: 'utf8' })
    const unit = theProviderRouterUnitPath(home)
    expect(installed.status).toBe(0)
    expect(installed.stdout).toContain(unit)
    expect(readFileSync(unit, 'utf8')).toBe(theProviderRouterUnit({ node: process.execPath, router: resolve('tools/provider-router.mjs'), sandboxes }))
    expect(statSync(unit).mode & 0o777).toBe(0o600)
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['--user daemon-reload', '--user enable --now mole-office-keyrouter.service'])
    writeFileSync(unit, 'different unit\n')
    const refused = spawnSync(process.execPath, [command, '--sandboxes', sandboxes], { env, encoding: 'utf8' })
    expect(refused.status).not.toBe(0)
    expect(refused.stderr).toContain(unit)
    expect(readFileSync(unit, 'utf8')).toBe('different unit\n')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(2)
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
