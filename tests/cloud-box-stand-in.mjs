#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A made-up cloud box. It runs the door's actual bash script locally, with fake Docker and npm. */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, renameSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const key = args[args.indexOf('-i') + 1]
const config = JSON.parse(readFileSync(key, 'utf8'))
appendFileSync(config.calls, `${JSON.stringify({ args, env: process.env })}\n`)
const loginText = `made-up failure at ${config.login ?? 'fixture'}@runner.example.invalid:/home/${config.login ?? 'fixture'}/PROJECTS/mole-office`
if (config.mode === 'ssh-login-fails' && args.includes('bash')) {
  console.error(loginText)
  console.log(JSON.stringify({ ran: false, reason: loginText }))
  process.exit(75)
}
if (config.mode === 'push-login-fails' && args.some((word) => word.includes('git-receive-pack'))) {
  console.error(loginText)
  process.exit(255)
}
if (config.mode === 'unreachable' && args.some((word) => word.includes('git-receive-pack'))) {
  console.error('made-up: connection to 192.0.2.91 and 2001:db8::91 failed')
  process.exit(255)
}
if (args.some((word) => word.includes('git-receive-pack'))) {
  const child = spawn('git', ['receive-pack', config.repository], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  let script = ''
  for await (const chunk of process.stdin) script += chunk
  const action = script.match(/^# cloud-suite: (\w+)/m)?.[1]
  // The door's own script, before any made-up failure below is put in front of it, when a case asks to read it.
  if (config.scripts !== undefined) writeFileSync(join(config.scripts, `${action}.sh`), script)
  // These shell functions inject labelled host failures into the actual remote script.
  const missing = config.mode.match(/^no-host-(node|docker|git|flock|timeout|tar|sha256sum)$/)?.[1]
  if (missing) script = `command() { if [ "$1" = -v ] && [ "$2" = ${missing} ]; then return 1; fi; builtin command "$@"; }\n${script}`
  if (config.mode === 'cleanup-node-fails' && action === 'cleanup') {
    script = `node() { if [ -e "$clone" ] || [ -e "$run_home" ]; then touch "$HOME/mask-before-removal"; fi; echo 'made-up broken node at 192.0.2.91' >&2; return 127; }\n${script}`
  }
  const blockedFolder = { 'cache-fails': '/cloud-suite/runs', 'clone-fails': '/clone', 'home-fails': '/.cloud-home-', 'outputs-fail': '/reports' }[config.mode]
  if (blockedFolder && action === 'run') {
    script = `mkdir() { case "$*" in *${blockedFolder}*) echo 'made-up permission denied' >&2; return 1;; esac; command mkdir "$@"; }\nexport -f mkdir\n${script}`
  }
  // A made-up transfer delay distinguishes the box's own run time from the caller's elapsed time.
  if (action === 'artifacts' && config.mode === 'green') await new Promise((done) => setTimeout(done, 200))
  // The two worlds take turns holding exactly the same absolute paths. No production path is rewritten.
  if (!existsSync(config.savedWork)) {
    renameSync(config.work, config.savedWork)
    if (existsSync(config.remoteWork)) renameSync(config.remoteWork, config.work)
    else mkdirSync(config.work)
  }
  if (config.mode === 'addresses' && action === 'run') {
    console.log('made-up transport: 192.0.2.91 2001:db8::91 ::1 ::ffff:192.0.2.91 [fe80::1234%eth0]')
    console.error('made-up transport: runner.example.invalid')
    console.error('made-up transport: failed at 2001:db8::91: permission denied; connected to 2001:db8::91.')
  }
  if (config.mode === 'logins' && action === 'run') {
    console.log(loginText)
    console.error(`made-up stderr at ${config.login}@another.example.invalid and /home/${config.login}`)
  }
  if (action === 'artifacts' && config.mode === 'manifest-unmasked') {
    // Transfer corruption after the real remote mask exercises the real local refusal.
    const manifest = join(config.work, 'reports', 'expected.json')
    const entries = JSON.parse(readFileSync(manifest, 'utf8'))
    entries[0].projectName = 'fixture@runner.example.invalid:/home/fixture at 192.0.2.91'
    writeFileSync(manifest, JSON.stringify(entries))
  }
  if (action === 'artifacts' && config.mode === 'manifest-not-returned') rmSync(join(config.work, 'reports', 'expected.json'))
  if (action === 'artifacts' && config.mode === 'manifest-directory') {
    rmSync(join(config.work, 'reports', 'expected.json'))
    mkdirSync(join(config.work, 'reports', 'expected.json'))
  }
  if (action === 'run' && config.mode === 'manifest-exists') {
    script = `touch() { command touch "$@"; if [ "$1" = "$state/home" ]; then command mkdir -p "$(dirname "$manifest")"; printf 'made-up existing manifest\\n' >"$manifest"; fi; }\nexport -f touch\n${script}`
  }
  // A MADE-UP RESULT LINE THE BOX'S SCRIPT NEVER WRITES: an installed lock, or the hash of its packages, that is not a
  // sha256, or one beside a build that failed, or a reason it could not hash them beside a failed build or beside the
  // hash (criterion 23); no CPUs, or the box's 16 made-up CPUs as workers where
  // the runner file names 7 (criterion 24). The real script's last line gets the made-up field, so the host's refusal
  // is exercised.
  const wrongResult = action === 'run' ? {
    'lock-not-hex': { installedLock: 'made-up-not-hex' },
    'lock-on-build': { installedLock: 'f'.repeat(64) },
    'packages-not-hex': { installedPackages: 'made-up-not-hex' },
    'packages-on-build': { installedPackages: 'f'.repeat(64) },
    'unread-on-build': { installedPackagesUnread: 'made-up reason' },
    'unread-beside-packages': { installedPackagesUnread: 'made-up reason' },
    'cpus-zero': { cpus: 0 },
    'workers-not-the-fewer': { workers: 16 },
  }[config.mode] : undefined
  // A BOX WHOSE ENVIRONMENT SETS A VARIABLE nproc HONOURS, to a made-up 2 (criterion 24).
  const openMp = { 'omp-num-threads': { OMP_NUM_THREADS: '2' }, 'omp-thread-limit': { OMP_THREAD_LIMIT: '2' } }[config.mode]
  const child = spawn('bash', ['-s'], {
    cwd: config.home,
    env: { PATH: `${config.bin}:${process.env.PATH}`, HOME: config.home, CLOUD_STAND_IN_KEY: key, ...openMp },
    stdio: ['pipe', wrongResult === undefined ? 'inherit' : 'pipe', 'inherit'],
  })
  let printed = ''
  if (wrongResult !== undefined) child.stdout.on('data', (chunk) => { printed += chunk })
  child.stdin.end(script)
  child.on('close', (code) => {
    if (wrongResult !== undefined) {
      const lines = printed.split('\n')
      const last = lines.findLastIndex((line) => line.startsWith('{"phase":'))
      if (last !== -1) lines[last] = JSON.stringify({ ...JSON.parse(lines[last]), ...wrongResult })
      process.stdout.write(lines.join('\n'))
    }
    if (existsSync(config.savedWork)) {
      if (existsSync(config.remoteWork)) throw new Error('made-up remote world was not put away')
      renameSync(config.work, config.remoteWork)
      renameSync(config.savedWork, config.work)
    }
    process.exit(code ?? 1)
  })
}
