#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Real Docker boundary proof. No model and no office. A labelled, synthetic in-memory ledger on
 * a random loopback port supplies only the launcher's registration/release protocol. Docker and
 * the kernel enforce the mounts. Nothing here claims the synthetic ledger is the real office.
 *
 * node tools/check-view-proof.mjs --image <mole-office-dev-image>
 * node tools/check-view-proof.mjs --image <same-image> --expose /protected/records
 * Without --image, use the one image labelled mole-office.sandbox-template=mole-office-dev;
 * zero or multiple images refuses. Build the template separately if no such image exists.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { writeInstance } from './sandbox-common.mjs'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
async function run(program, argv, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(program, argv, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk)
    child.on('error', reject)
    child.on('close', (code, signal) => done({ code: code ?? 128, out, err, signal }))
  })
}
async function checked(program, argv, options) {
  const result = await run(program, argv, options)
  if (result.code !== 0) throw new Error(`${program} failed (${result.code}): ${result.err.trim()}`)
  return result.out.trim()
}

async function observeViewContainer(container) {
  try {
    const inspected = JSON.parse(await checked('docker', ['inspect', '--type', 'container', container], { timeout: 10_000 }))
    if (!Array.isArray(inspected) || inspected.length !== 1 || !inspected[0]?.Id || inspected[0].Name !== '/' + container) {
      throw new Error('Inspect did not return exactly the named view container with its Docker id.')
    }
    const config = inspected[0].HostConfig, HostConfig = {}
    for (const field of ['Memory', 'MemorySwap', 'NanoCpus', 'PidsLimit', 'ReadonlyRootfs', 'CapDrop', 'SecurityOpt', 'NetworkMode']) {
      const value = config?.[field]
      const valid = ['Memory', 'MemorySwap', 'NanoCpus', 'PidsLimit'].includes(field) ? Number.isSafeInteger(value)
        : field === 'ReadonlyRootfs' ? typeof value === 'boolean'
        : field === 'NetworkMode' ? typeof value === 'string' && value !== ''
        : value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'))
      if (!valid) throw new Error(`Inspect HostConfig.${field} is missing or malformed.`)
      HostConfig[field] = value
    }
    const observation = { observation: 'view-container-limits', provenance: 'docker inspect --type container',
      container, Id: inspected[0].Id, HostConfig }
    process.stdout.write(JSON.stringify(observation) + '\n')
    return observation
  } catch (error) { throw new Error(`Could not observe view container ${container}: ${error.message}`) }
}

// Docker's --rm can be removing the same container while this controller cleans up.
// The message is not evidence of absence: wait for inspect to observe it.
async function dockerRemovalStep(name, argv, { timeoutMs = 30_000, pollMs = 200 } = {}) {
  const result = await run('docker', argv)
  if (result.code === 0 || /no such container/i.test(result.err)) return
  if (!/removal\b[^\n]*already in progress/i.test(result.err)) throw new Error(result.err.trim())
  const deadline = Date.now() + timeoutMs
  while (true) {
    const inspected = await run('docker', ['inspect', '--type', 'container', name], { timeout: Math.max(1, deadline - Date.now()) })
    if (inspected.code !== 0 && /no such container/i.test(inspected.err)) return
    if (inspected.code !== 0) throw new Error(`Could not inspect ${name} during removal: ${inspected.err.trim() || `exit ${inspected.code}`}`)
    if (Date.now() >= deadline) throw new Error(`${name} still exists after waiting ${timeoutMs} ms for Docker removal.`)
    await new Promise(done => setTimeout(done, Math.min(pollMs, Math.max(1, deadline - Date.now()))))
  }
}

/** Shared by the real proof and subprocess tests with stand-in Docker replies. */
export async function finishProof({ containers, root, passed, failures = [], server = null, timeoutMs = 30_000, pollMs = 200 }) {
  const errors = []
  for (const name of containers) {
    for (const argv of [['stop', '--time', '2', name], ['rm', name]]) {
      try { await dockerRemovalStep(name, argv, { timeoutMs, pollMs }) }
      catch (error) { errors.push(`Cleanup could not ${argv[0]} ${name}: ${error.message}`) }
    }
  }
  if (server !== null) {
    try { await new Promise((done, reject) => server.close(error => error ? reject(error) : done())) }
    catch (error) { errors.push(`Cleanup could not close the synthetic ledger: ${error.message}`) }
  }
  try { rmSync(root, { recursive: true, force: true }) }
  catch (error) { errors.push(`Cleanup could not remove ${root}: ${error.message}`) }
  for (const error of errors) process.stderr.write(error + '\n')
  const cleanupComplete = errors.length === 0
  const exitCode = passed && cleanupComplete ? 0 : 1
  const result = passed
    ? cleanupComplete ? 'Proof passed and cleanup is complete.' : 'Proof passed, but cleanup failed.'
    : cleanupComplete ? 'Proof failed; cleanup is complete.' : 'Proof failed and cleanup failed.'
  process.stdout.write(JSON.stringify({ final: true, proofPassed: passed, cleanupComplete, passed: exitCode === 0, exitCode, result, failures, errors }) + '\n')
  process.exitCode = exitCode
}

/** Host observations of synthetic protected sources, separate from the command's errno claims. */
export function snapshotProtected(paths) {
  return paths.map(root => {
    if (!existsSync(root)) return { path: root, state: 'absent' }
    const entries = []
    const visit = (file, path) => {
      const stat = lstatSync(file)
      const listing = stat.isDirectory() ? readdirSync(file).sort() : null
      entries.push({ path, size: stat.size, mode: stat.mode, inode: stat.ino,
        sha256: stat.isFile() ? createHash('sha256').update(readFileSync(file)).digest('hex') : null, listing })
      if (listing !== null) for (const child of listing) visit(join(file, child), path === '' ? child : path + '/' + child)
    }
    visit(root, '')
    return { path: root, state: 'present', entries }
  })
}

/** Host observations of every published controller evidence file, before trusting its contents. */
export function observeEvidenceFiles(descriptor) {
  return [join(dirname(descriptor.out), 'start.json'), descriptor.receipt, descriptor.out, descriptor.err, descriptor.exit, descriptor.details].map(path => {
    const held = lstatSync(path)
    const mode = (held.mode & 0o777).toString(8).padStart(4, '0')
    const observation = { observation: 'controller-evidence-mode', path, mode }
    process.stdout.write(JSON.stringify(observation) + '\n')
    if (held.mode & 0o022) throw new Error(`Controller evidence ${path} is group- or world-writable (mode ${mode}).`)
    return observation
  })
}

// Embedded in a carried, read-only script. Every observation is printed where it is made.
export const CHECK_VIEW_PROBE = String.raw`
const fs = require('fs'), path = require('path'), cp = require('child_process')
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let writes = 0, ownFailures = 0, unexpected = 0, attempts = 0
const operations = {
  overwrite: p => fs.writeFileSync(path.join(p, 'file'), 'changed'),
  truncate: p => fs.truncateSync(path.join(p, 'file'), 0),
  append: p => fs.appendFileSync(path.join(p, 'file'), 'changed'),
  create: p => fs.writeFileSync(path.join(p, 'created'), 'changed'),
  rename: p => fs.renameSync(path.join(p, 'file'), path.join(p, 'renamed')),
  unlink: p => fs.unlinkSync(path.join(p, 'file')),
  chmod: p => fs.chmodSync(path.join(p, 'file'), 0o600),
  'replace-parent': p => { fs.renameSync(p, p + '.replaced'); fs.mkdirSync(p) },
  'symlink-alias': p => { const alias = path.join(process.cwd(), 'alias-' + attempts); fs.symlinkSync(p, alias); fs.appendFileSync(path.join(alias, 'file'), 'changed') },
}
for (const target of cfg.protected) if (fs.existsSync(target)) {
  const bytes = fs.readFileSync(path.join(target, 'file'))
  console.log(JSON.stringify({read:target, bytes:bytes.length, sha256:require('crypto').createHash('sha256').update(bytes).digest('hex')}))
}
for (const target of cfg.protected) for (const [operation, attempt] of Object.entries(operations)) {
  attempts++
  if (!fs.existsSync(target)) { console.log(JSON.stringify({target, operation, result:'absent'})); continue }
  try { attempt(target); writes++; console.log(JSON.stringify({target, operation, result:'WRITE SUCCEEDED'})) }
  catch (error) {
    // A preceding successful mutation can remove a target. It already made the proof red.
    // The tool maintainer's U0EtDBeCzWlD accepts EBUSY only for replacing a mount-point parent.
    const allowed = ['EROFS','EACCES'].includes(error.code) || (operation === 'replace-parent' && error.code === 'EBUSY')
    if (!allowed) unexpected++
    console.log(JSON.stringify({target, operation, result:error.code ?? String(error), allowed}))
  }
}
const file = path.join(process.cwd(), 'own.txt')
for (const [step, action] of [
  ['temporary folder', () => {
    const temporary = fs.realpathSync(require('os').tmpdir()), home = fs.realpathSync(process.env.HOME)
    if (temporary === home || temporary.startsWith(home + path.sep)) throw new Error('TMPDIR ' + temporary + ' is at or under HOME ' + home)
    const made = fs.mkdtempSync(path.join(temporary, 'check-view-proof-'))
    try {
      const file = path.join(made, 'write')
      fs.writeFileSync(file, 'temporary write')
      if (fs.readFileSync(file, 'utf8') !== 'temporary write') throw new Error('Temporary write did not persist at ' + file)
      return { path: made }
    } finally { fs.rmSync(made, { recursive:true, force:true }) }
  }],
  ['shell test', () => { const r = cp.spawnSync('sh', ['-c', 'test "$(cat own.txt)" = original'], {encoding:'utf8'}); if(r.status !== 0) throw new Error('shell test failed: '+r.stderr) }],
  ['node test', () => {
    const test = path.join(process.cwd(), 'own.test.cjs')
    fs.writeFileSync(test, "require('node:assert/strict').equal(2 + 2, 4)\n")
    const r = cp.spawnSync(process.execPath, ['--test', test], {encoding:'utf8'})
    if (r.status !== 0) throw new Error('node test failed: '+(r.error?.message ?? r.stderr + r.stdout))
  }],
  ['mutation', () => { fs.writeFileSync(file, 'mutated\n'); if(fs.readFileSync(file,'utf8') !== 'mutated\n') throw new Error('mutation did not persist') }],
  ['restore', () => { fs.writeFileSync(file, 'original\n'); const r = cp.spawnSync('sh',['-c','test "$(cat own.txt)" = original']); if(r.status !== 0) throw new Error('restore did not persist') }],
  ['private git', () => { const r = cp.spawnSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}); if(r.status !== 0 || r.stdout.trim() !== '.git') throw new Error('git administration is not private') }],
]) {
  try { const observation = action(); console.log(JSON.stringify({own:step,result:'passed',...observation})) }
  catch(error) { ownFailures++; console.log(JSON.stringify({own:step,result:'failed',why:error.message})) }
}
console.log(JSON.stringify({summary:true, attempts, protectedWrites:writes, ownFailures, unexpectedErrors:unexpected, passed:writes===0 && ownFailures===0 && unexpected===0}))
process.exitCode = writes || ownFailures || unexpected ? 1 : 0
`

// Importing the probe for a stand-in test must start nothing.
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()

async function main() {
  const args = process.argv.slice(2)
  let image = null, expose = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--image' && args[i + 1]) image = args[++i]
    else if (args[i] === '--expose' && args[i + 1]) expose = args[++i]
    else throw new Error('Use --image <inspector-image> and optionally --expose <protected-container-path>.')
  }
  const root = mkdtempSync(join(tmpdir(), 'mole-office-check-view-proof-'))
  const suffix = randomBytes(5).toString('hex')
  const instanceName = `proof-${suffix}`, instance = join(root, 'sandboxes', instanceName)
  const checkRoot = join(instance, 'check-views', 'proof-check')
  const work = join(checkRoot, 'work'), home = join(checkRoot, 'home'), temporary = join(checkRoot, 'tmp')
  const containerName = `mole-office-sandbox-${instanceName}`
  const rows = [], containerNames = new Set([containerName])
  const failures = []
  let server = null, receipt = null, proofPassed = false, viewObservation = null
  let interrupted = null
  const handlers = Object.fromEntries(['SIGTERM','SIGINT','SIGHUP'].map(signal => [signal, () => {
    interrupted = signal
    for (const name of containerNames) dockerRemovalStep(name, ['stop', '--time', '2', name]).catch(error => process.stderr.write(error.message + '\n'))
  }]))
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler)
  try {
    if (image === null) {
      const images = [...new Set((await checked('docker', ['image', 'ls', '--filter', 'label=mole-office.sandbox-template=mole-office-dev', '--format', '{{.ID}}'])).split('\n').filter(Boolean))]
      if (images.length !== 1) throw new Error(`Found ${images.length} inspector-template images. Name one with --image.`)
      image = images[0]
    }
    const template = JSON.parse(await checked('docker', ['image', 'inspect', image]))[0]
    if (template.Config?.Labels?.['mole-office.sandbox-template'] !== 'mole-office-dev') throw new Error('The proof requires an image labelled as the inspector template mole-office-dev.')
    for (const folder of [work, home]) mkdirSync(folder, { recursive: true })
    mkdirSync(temporary, { mode: 0o700 })
    await checked('git', ['init', '-q', work])
    writeFileSync(join(work, 'own.txt'), 'original\n')
    const labels = ['records','prompt','metadata','helper','sibling','submitted','main','git','office']
    const mounts = labels.map(label => {
      const host = join(checkRoot, label)
      mkdirSync(host)
      writeFileSync(join(host, 'file'), `Synthetic ${label}; not real office data.\n`)
      return { host, container: `/protected/${label}` }
    })
    // A real main repository and a private clone, both made only for this proof.
    const main = join(checkRoot, 'main')
    await checked('git', ['init', '-q', main])
    await checked('git', ['-C', main, 'add', 'file'])
    await checked('git', ['-C', main, '-c', 'user.name=Synthetic proof', '-c', 'user.email=proof@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic input'])
    rmSync(join(work, '.git'), { recursive:true })
    rmSync(join(work, 'own.txt'))
    await checked('git', ['clone', '--no-local', '-q', main, work])
    writeFileSync(join(work, 'own.txt'), 'original\n')
    rmSync(join(checkRoot, 'submitted/file'))
    await checked('git', ['clone', '--no-local', '-q', main, join(checkRoot, 'submitted')])
    mounts.find(m => m.container === '/protected/git').host = join(main, '.git')
    writeFileSync(join(main, '.git/file'), 'Synthetic git administration probe.\n')
    const exposed = expose === null ? null : mounts.find(m => m.container === expose || m.container === '/protected/' + expose)
    if (expose !== null && !exposed) throw new Error(`--expose must name one of ${mounts.map(m => m.container).join(', ')}.`)
    const script = join(checkRoot, 'scripts')
    mkdirSync(script)
    writeFileSync(join(script, 'probe.cjs'), CHECK_VIEW_PROBE)
    writeFileSync(join(script, 'file'), 'Synthetic trusted command input.\n')
    const protectedPaths = [...mounts.map(m => m.container), '/probe', join(root, 'outputs')]
    writeFileSync(join(script, 'config.json'), JSON.stringify({ protected: protectedPaths }))
    const protectedSources = [...mounts.map(m => m.host), script]
    const before = snapshotProtected(protectedSources)
    process.stdout.write(JSON.stringify({ snapshot:'before', protected:before }) + '\n')
    const spec = { check: 'proof-check', instance: instanceName,
      readOnly: [mounts[0], mounts[1], mounts[2], mounts[3]].filter(m => m !== exposed).concat([{ host: script, container: '/probe' }]),
      private: [{ host: work, container: '/work' }, { host: home, container: '/check/home' },
        { host: temporary, container: '/check/tmp' }, ...(exposed === null ? [] : [exposed])],
      outputs: { dir: join(root, 'outputs') } }
    const specFile = join(root, 'view.json')
    writeFileSync(specFile, JSON.stringify(spec), { mode: 0o600 })
    // Both copies, as up writes them: the launcher reads the host's, beside the instance folder; the helper inside reads the folder's.
    writeInstance(instance, { instance: instanceName, workspace: 'proof', container: { name: containerName } })
    server = createServer(async (request, response) => {
      try {
        let bytes = ''; for await (const chunk of request) bytes += chunk
        const body = bytes === '' ? {} : JSON.parse(bytes)
        response.setHeader('content-type', 'application/json')
        if (request.method === 'POST' && request.url === '/api/resources') {
          let key = body.key, pgid = null
          if (body.type === 'process') {
            const top = await checked('docker', ['top', body.container, '-eo', 'pid,pgid'])
            const found = top.split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number)).find(([pid]) => {
              try { return Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/^NSpid:\s+(.+)$/m)?.[1].trim().split(/\s+/).pop()) === body.pidInContainer }
              catch(error) { if(error.code === 'ENOENT') return false; throw error }
            })
            if (!found) throw new Error('The synthetic ledger could not map the real container gate pid to its host group.')
            key = String(found[0]); pgid = found[1]
            // The native command is still gated here. --rm can remove the view before --wait returns.
            if (!rows.some(row => row.type === 'container' && row.key === body.container && row.id !== 'proof-instance')) {
              throw new Error('The process did not name a registered view container.')
            }
            viewObservation = await observeViewContainer(body.container)
          }
          const row = { ...body, key, id: `proof-row-${rows.length}`, pgid, released: false }
          rows.push(row); if (row.type === 'container') containerNames.add(row.key)
          response.statusCode = 201; response.end(JSON.stringify({ resource: row })); return
        }
        const row = rows.find(r => request.url === `/api/resources/${r.id}/release`)
        if (request.method === 'POST' && row) {
          if (row.type === 'container') {
            await dockerRemovalStep(row.key, ['stop', '--time', '2', row.key])
          } else {
            try { process.kill(-Number(row.key), 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
          }
          row.released = true; response.end(JSON.stringify({ resource: row })); return
        }
        response.statusCode = 404; response.end(JSON.stringify({ error: 'This synthetic proof ledger has no other API.' }))
      } catch(error) { response.statusCode = 500; response.end(JSON.stringify({ error: error.message })) }
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const api = `http://127.0.0.1:${server.address().port}`
    // Register before starting, even in this synthetic proof ledger.
    rows.push({ id:'proof-instance', type:'container', key:containerName, released:false })
    await checked('docker', ['run', '--rm', '--detach', '--name', containerName, '--network', 'none', '--user', '1000:1000',
      '--memory=256m', '--memory-swap=256m', '--cpus=1', '--pids-limit=64', image, 'sleep', '300'])
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MOLE_OFFICE_|MOLE_AGENT_KEY$|SANDBOX_RUN_KEY$|MOLE_CHECK_VIEW_CONTROLLER$)/.test(key)))
    const launchUmask = 0o002, previousUmask = process.umask(launchUmask)
    let launched
    try {
      launched = await run(process.execPath, [join(repo, 'tools/sandbox.mjs'), 'exec', instanceName, '--sandboxes', join(root, 'sandboxes'),
      '--api', api, '--workspace', 'proof', '--as', 'synthetic-proof-controller', '--session', 'synthetic-proof-run',
      '--check-view', specFile, '--cwd', work, '--json', '--no-office-variables', '--wait', '--timeout', '60', '--', 'node', '/probe/probe.cjs', '/probe/config.json'], { env })
    } finally { process.umask(previousUmask) }
    const descriptor = launched.out.trim() === '' ? null : JSON.parse(launched.out.trim())
    if (!descriptor) throw new Error(`The check view did not start (${launched.code}): ${launched.err}`)
    observeEvidenceFiles(descriptor)
    const output = readFileSync(descriptor.out, 'utf8')
    process.stdout.write(output)
    if (readFileSync(descriptor.err, 'utf8') !== '') process.stderr.write(readFileSync(descriptor.err, 'utf8'))
    receipt = JSON.parse(readFileSync(descriptor.receipt, 'utf8'))
    if (viewObservation?.container !== descriptor.view?.container || viewObservation?.container !== receipt.view?.container) {
      throw new Error('The descriptor and receipt do not name the observed view container.')
    }
    const summary = output.trim().split('\n').map(line => JSON.parse(line)).find(row => row.summary)
    const after = snapshotProtected(protectedSources)
    const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after)
    process.stdout.write(JSON.stringify({ snapshot:'after', protected:after, unchanged:protectedUnchanged }) + '\n')
    if (!viewObservation.HostConfig.CapDrop?.includes('ALL')) failures.push('HostConfig.CapDrop does not include ALL.')
    if (!viewObservation.HostConfig.SecurityOpt?.includes('no-new-privileges')) failures.push('HostConfig.SecurityOpt does not include no-new-privileges.')
    const passed = failures.length === 0 && summary?.passed === true && protectedUnchanged && launched.code === 0 && receipt.code === 0 && receipt.released.length === 2 && interrupted === null
    proofPassed = passed
    process.stdout.write(JSON.stringify({ proof: 'real Docker', ledger: 'synthetic protocol stand-in; no office', image,
      exposed: exposed?.container ?? null, launchUmask: launchUmask.toString(8).padStart(4, '0'), commandExit: launched.code, receiptExit: receipt.code,
      ledgerReleased: receipt.released.length, protectedUnchanged, passed,
      note: exposed === null ? undefined : 'After a successful exposed write, later ENOENT can follow a rename or unlink. Counts are unchanged; the successful writes already fail the proof.' }) + '\n')
  } catch (error) {
    failures.push(error.message)
    process.stdout.write(JSON.stringify({ proof:'real Docker', passed:false, error:error.message }) + '\n')
  } finally {
    await finishProof({ containers: containerNames, root, passed: proofPassed, failures, server })
    for (const [signal, handler] of Object.entries(handlers)) process.removeListener(signal, handler)
  }
}
