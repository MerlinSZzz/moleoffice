// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic Docker and ledger for check-view launcher tests. No mount protection is simulated. */
import { createServer } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { FROM_THE_CONTAINER_TO_THE_HOST } from './container-path-on-the-host.ts'

export const CHECK_VIEW_DOCKER = String.raw`#!/usr/bin/env node
// Stand-in Docker: asserts launch construction; it does not enforce filesystem permissions.
const fs = require('fs'), path = require('path'), cp = require('child_process')
const root = process.env.CHECK_VIEW_FAKE
const argv = process.argv.slice(2)
const config = JSON.parse(fs.readFileSync(path.join(root, 'docker.json')))
const calls = path.join(root, 'calls.jsonl')
if (argv[0] === 'inspect') {
  // A CONTAINER THIS STAND-IN MADE is answered as it was made; any other name is the instance.
  const made = path.join(root, argv[argv.length - 1] + '.container.json')
  if (fs.existsSync(made)) { console.log('[' + fs.readFileSync(made, 'utf8') + ']'); process.exit(0) }
  if (config.breakSpec) fs.writeFileSync(config.breakSpec, '{}')
  console.log(JSON.stringify([config.instance])); process.exit(0)
}
if (argv[0] !== 'run') {
  fs.appendFileSync(calls, JSON.stringify({ argv }) + '\n')
  console.error('The stand-in refuses any fallback or unknown operation.'); process.exit(93)
}
let i = 1, mounts = [], env = {}, name, cwd, network, hostName
for (; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--hostname=')) hostName = a.slice('--hostname='.length)
  if (['--rm', '--init', '-i'].includes(a) || /^--[a-z-]+=/.test(a)) continue
  if (['--name', '--network', '--user', '--cap-drop', '--security-opt', '--label', '--entrypoint', '--mount', '--env-file', '-w', '-e'].includes(a)) {
    const v = argv[++i]
    if (a === '--network') network = v
    if (a === '--mount') mounts.push(v)
    if (a === '--name') name = v
    if (a === '-w') cwd = v
    if (a === '-e') { const at = v.indexOf('='); env[v.slice(0, at)] = v.slice(at + 1) }
    if (a === '--env-file') for (const line of fs.readFileSync(v, 'utf8').split('\n')) {
      const at = line.indexOf('='); if (at > 0) env[line.slice(0, at)] = line.slice(at + 1)
    }
    continue
  }
  break
}
const image = argv[i++]
fs.appendFileSync(calls, JSON.stringify({ argv, mounts, name, image, envNames: Object.keys(env) }) + '\n')
if (config.fail) { console.error('synthetic Docker startup failure'); process.exit(125) }
// THE HOST NAME DOCKER GIVES IT: the one asked for, unless the case has docker ignore it; else on the host's network the
// host's own, and elsewhere the first twelve of its id. docker inspect answers it from this file.
const id = require('crypto').randomBytes(32).toString('hex')
const Hostname = hostName !== undefined && !config.hostNameIgnored ? hostName : network === 'host' ? require('os').hostname() : id.slice(0, 12)
fs.writeFileSync(path.join(root, name + '.container.json'), JSON.stringify({ Id: id, Name: '/' + name, Config: { Hostname }, HostConfig: { NetworkMode: network } }))
fs.writeFileSync(path.join(root, name + '.pid'), String(process.pid))
const pairs = mounts.map(m => Object.fromEntries(m.split(',').map(p => { const k = p.indexOf('='); return k < 0 ? [p, true] : [p.slice(0,k), p.slice(k+1)] })))
const toTheHost = ${FROM_THE_CONTAINER_TO_THE_HOST}
const mapped = s => toTheHost(s, pairs.map(m => [m.target, m.source]))
for (const k of Object.keys(env)) env[k] = mapped(env[k])
// The image env is deliberately tainted, as an image could be. The launcher must explicitly clear it.
const command = argv.slice(i).map(mapped)
setTimeout(() => {
 const child = cp.spawn(process.execPath, command, { env: { ...config.imageEnv, ...env }, cwd: mapped(cwd), stdio: 'inherit' })
 child.on('exit', (code, signal) => process.exit(code ?? 128))
}, config.delay ?? 0)
`

export async function checkViewLedger(root: string) {
  const rows: any[] = []
  const requests: { method: string; path: string; body: any }[] = []
  const server = createServer(async (req, reply) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw === '' ? {} : JSON.parse(raw)
    requests.push({ method: req.method!, path: req.url!, body })
    reply.setHeader('content-type', 'application/json')
    if (req.method === 'POST' && req.url === '/api/resources') {
      const key = body.type === 'process' ? String(body.pidInContainer ?? body.key) : body.key
      const row = { ...body, key, id: 'synthetic-row-' + rows.length, releasedAt: null, pgid: body.type === 'process' ? Number(key) : null }
      rows.push(row)
      reply.statusCode = 201
      reply.end(JSON.stringify({ resource: row }))
    } else if (req.url?.endsWith('/release')) {
      const row = rows.find(r => r.id === req.url!.split('/')[3])
      if (!row) { reply.statusCode = 404; reply.end('{}'); return }
      row.releasedAt = 'synthetic release observed'
      appendFileSync(join(root, 'releases.jsonl'), JSON.stringify({ id: row.id, type: row.type }) + '\n')
      if (row.type === 'container') for (const native of rows.filter(r => r.type === 'process' && r.container === row.key)) {
        try { process.kill(-Number(native.key), 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e }
      }
      const pid = row.type === 'process' ? Number(row.key) : existsSync(join(root, row.key + '.pid')) ? Number(readFileSync(join(root, row.key + '.pid'), 'utf8')) : null
      if (pid) { try { process.kill(-pid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e } }
      reply.end(JSON.stringify({ resource: row }))
    } else { reply.statusCode = 404; reply.end(JSON.stringify({ error: 'Synthetic ledger has no such door.' })) }
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { rows, requests, api: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>(done => server.close(() => done())) }
}

export function writeCheckViewDocker(root: string, instanceDir: string, fail = false) {
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'bin/docker'), CHECK_VIEW_DOCKER, { mode: 0o755 })
  writeFileSync(join(root, 'docker.json'), JSON.stringify({ fail, imageEnv: { PATH: process.env.PATH }, instance: {
    Id: 'synthetic-inspector', Name: '/mole-office-sandbox-inspector', State: { Running: true },
    Config: { Image: 'synthetic-inspector-image', User: '1000:1000', Env: ['MOLE_OFFICE_API=synthetic-office', 'MOLE_AGENT_KEY=synthetic-key'] },
    HostConfig: { NetworkMode: 'none', Memory: 1 }, Mounts: [{ Type: 'bind', Source: instanceDir, Destination: instanceDir, RW: true }],
  } }))
}
