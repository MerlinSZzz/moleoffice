#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOX KEEP-ALIVE, PROVED IN A REAL CONTAINER. On the host only: it needs docker and the devcontainer CLI, and
 * a sandbox has neither. No office, no model and no ledger row.
 *
 *   node tools/keep-alive-proof.mjs                   the template as it is
 *   node tools/keep-alive-proof.mjs --old-keep-alive  the mutation: the template as it was before 15 October 2026
 *
 * It starts a throwaway container from sandboxes/mole-office-dev with the devcontainer CLI, as `tools/sandbox.mjs up`
 * does, from a copy of the template's devcontainer.json. The copy differs from the template only in its folders, which
 * are fresh scratch folders, in a container name and label of its own, and in its network. The template's is the
 * host's, which would share this machine's ports with the container; the proof needs none, so it has none.
 * --old-keep-alive also puts back "init": true and drops "overrideCommand": false, so the CLI's own shell keeps the
 * container running under docker's init, as it did then.
 *
 * It prints what docker started (Path, Args, HostConfig.Init), the container's processes and pid 1's command. Then, as
 * uid 1000 inside, asking docker after each step whether the container still runs:
 *   1. `kill -TERM -1`, with a `sleep 600` of its own running, which must end, so the signal is seen to have been sent;
 *   2. `pkill sleep`, the same way;
 *   3. SIGTERM to every process group it can see but its own. kill(2) cannot name group 1, because -1 means every
 *      process, so pid 1 is sent SIGTERM by its pid instead;
 *   4. SIGTERM, SIGINT, SIGHUP and SIGKILL to pid 1.
 * Then `docker stop --time 10`, which must end the container with exit 0 before the 10 seconds are up, and the
 * container's log, which must hold the keep-alive's refusals from steps 3 and 4 and its line obeying docker stop. Then
 * it removes the container and the scratch folders. The image the CLI built is left, so a second run starts at once.
 *
 * THE PROOF PASSES only if the keep-alive is pid 1 with no docker init, the container survives every step, its log says
 * what it refused, and docker stop ends it as above. With --old-keep-alive the container ends at step 1 with exit 0
 * and the proof fails: that is the mutation going red. The last line is JSON, as tools/check-view-proof.mjs's is.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const TEMPLATE = join(repo, 'sandboxes', 'mole-office-dev')
const KEEP_ALIVE = '/usr/local/lib/mole-office/keep-alive'
const AS_UID_1000 = ['--user', '1000:1000']
const BYSTANDER = 'sleep 600'

const options = process.argv.slice(2)
const old = options.includes('--old-keep-alive')
const unknown = options.filter((one) => one !== '--old-keep-alive')
if (unknown.length > 0) {
  process.stderr.write(`keep-alive proof: ${unknown.join(' ')} is not an option here; the one option is --old-keep-alive\n`)
  process.exit(2)
}

function run(program, argv, { timeoutMs = 30_000, env = process.env } = {}) {
  return new Promise((done) => {
    const child = spawn(program, argv, { stdio: ['ignore', 'pipe', 'pipe'], env, timeout: timeoutMs, killSignal: 'SIGKILL' })
    let out = '', err = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.on('error', (why) => done({ code: null, out, err: `${err}${why.message}` }))
    child.on('close', (code, signal) => done({ code, out, err: signal === null ? err : `${err}ended by ${signal}` }))
  })
}
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const say = (line) => process.stdout.write(`keep-alive proof: ${line}\n`)
const failures = []
const fail = (why) => {
  failures.push(why)
  say(`FAILED: ${why}`)
}

for (const [program, argv] of [['docker', ['version', '--format', '{{.Server.Version}}']], ['devcontainer', ['--version']]]) {
  const answer = await run(program, argv)
  if (answer.code !== 0) {
    process.stderr.write(`keep-alive proof: ${program} did not answer (${answer.err.trim() || `exit ${String(answer.code)}`}). This proof runs on the host, which has docker and the devcontainer CLI. Nothing was started.\n`)
    process.exit(2)
  }
  say(`${program} ${answer.out.trim()}`)
}

const tag = randomBytes(4).toString('hex')
const name = `mole-office-keep-alive-proof-${tag}`
const label = `mole-office.keep-alive-proof=${tag}`
const root = mkdtempSync(join(tmpdir(), 'mole-office-keep-alive-proof-'))
const dir = join(root, 'sandbox')
const main = join(root, 'main-checkout')
// THE FOLDERS THE TEMPLATE MOUNTS, made here, because docker cannot make a folder inside a read-only mount.
for (const folder of [join(dir, 'home'), join(main, 'data'), join(main, 'node_modules', '.vite-temp')]) mkdirSync(folder, { recursive: true })
const copy = JSON.parse(readFileSync(join(TEMPLATE, 'devcontainer.json'), 'utf8'))
copy.build = { ...copy.build, dockerfile: resolve(TEMPLATE, copy.build.dockerfile ?? 'Dockerfile'), context: resolve(TEMPLATE, copy.build.context ?? '.') }
copy.runArgs = [...(copy.runArgs ?? []).filter((one) => !one.startsWith('--network=')), '--network=none', `--name=${name}`, `--label=${label}`]
if (old) {
  copy.init = true
  delete copy.overrideCommand
}
const config = join(root, 'devcontainer.json')
writeFileSync(config, `${JSON.stringify(copy, null, 2)}\n`)

say(old
  ? `THE MUTATION: the old keep-alive, the CLI's own shell under docker's init. The proof is expected to fail.`
  : 'the template as it is: the image\'s keep-alive as pid 1, with no docker init.')
say(`starting ${name} with the devcontainer CLI. A first build of the image takes minutes.`)
const up = await run('devcontainer', ['up', '--workspace-folder', dir, '--config', config, '--id-label', label, '--mount-workspace-git-root', 'false'], {
  timeoutMs: 30 * 60_000,
  env: { ...process.env, SANDBOX_DIR: dir, SANDBOX_MAIN_CHECKOUT: main },
})
let outcome = null
try {
  outcome = JSON.parse(up.out.trim().split('\n').pop() ?? '')
} catch {
  outcome = null
}
const id = outcome?.outcome === 'success' && /^[0-9a-f]{64}$/.test(String(outcome.containerId)) ? outcome.containerId : null

const inside = (argv) => run('docker', ['exec', ...AS_UID_1000, id, ...argv])
async function stillRunning() {
  const answer = await run('docker', ['inspect', '--type', 'container', '--format', '{{.State.Running}} {{.State.ExitCode}}', id])
  if (answer.code !== 0) return { running: false, exitCode: null, why: answer.err.trim() }
  const [running, exitCode] = answer.out.trim().split(' ')
  return { running: running === 'true', exitCode: Number(exitCode), why: null }
}
async function logs() {
  const answer = await run('docker', ['logs', id])
  return `${answer.out}${answer.err}`
}
async function bystanderRunning() {
  return (await inside(['pgrep', '-fx', BYSTANDER])).code === 0
}

/** STEPS 1 TO 4, each run as uid 1000 inside the container. */
const EVERY_GROUP = String.raw`
my $own = getpgrp;
my %groups;
opendir my $proc, '/proc' or die "no /proc: $!";
for my $pid (grep { /^\d+$/ } readdir $proc) {
  open my $stat, '<', "/proc/$pid/stat" or next;
  my $line = <$stat>;
  $line =~ s/^.*\) //s;
  $groups{(split / /, $line)[2]} = 1;
}
for my $group (sort { $a <=> $b } keys %groups) {
  if ($group == $own) { print "group $group: its own, not signalled\n"; next }
  if ($group == 1) { print "group 1: kill(2) cannot name it, so pid 1 was sent SIGTERM: ", (kill('TERM', 1) ? 'sent' : "refused, $!"), "\n"; next }
  print "group $group: SIGTERM ", (kill('TERM', -$group) ? 'sent' : "refused, $!"), "\n";
}`
const steps = [
  { what: 'kill -TERM -1', argv: ['sh', '-c', 'kill -TERM -1; echo "kill -TERM -1 exited $?"'], bystander: true },
  { what: 'pkill sleep', argv: ['sh', '-c', 'pkill sleep; echo "pkill sleep exited $?"'], bystander: true },
  { what: 'SIGTERM to every process group it can see but its own', argv: ['perl', '-e', EVERY_GROUP], bystander: false },
  {
    what: 'SIGTERM, SIGINT, SIGHUP and SIGKILL to pid 1',
    argv: ['sh', '-c', 'for s in TERM INT HUP KILL; do kill -s $s 1; echo "kill -s $s 1 exited $?"; sleep 0.2; done'],
    bystander: false,
  },
]

if (id === null) {
  fail(`the devcontainer CLI did not start the container (exit ${String(up.code)}). The end of its log:\n${up.err.trim().split('\n').slice(-15).join('\n')}`)
} else {
  const started = await run('docker', ['inspect', '--type', 'container', '--format', '{{json .Path}}\t{{json .Args}}\t{{json .HostConfig.Init}}\t{{json .Config.User}}', id])
  const [path, argv, init, user] = started.out.trim().split('\t')
  say(`docker started Path ${path} with Args ${argv}; HostConfig.Init ${init}; user ${user}`)
  if (init === 'true') fail('docker was asked for its init, so the keep-alive is not pid 1')
  say(`the container's processes, as the host numbers them:\n${(await run('docker', ['top', id, '-eo', 'pid,pgid,user,args'])).out.trimEnd()}`)
  const first = (await inside(['sh', '-c', 'tr "\\0" " " < /proc/1/cmdline'])).out.trim()
  say(`pid 1 inside the container: ${first}`)
  if (!first.split(' ').includes(KEEP_ALIVE)) fail(`pid 1 is not ${KEEP_ALIVE}`)
  const deadline = Date.now() + 10_000
  while (!(await logs()).includes('keep-alive: started as pid 1, uid 1000') && Date.now() < deadline) await pause(200)
  if (!(await logs()).includes('keep-alive: started as pid 1, uid 1000')) fail('the keep-alive did not write that it started as pid 1, uid 1000')

  let ended = null
  for (const [index, step] of steps.entries()) {
    if (step.bystander) {
      await run('docker', ['exec', '-d', ...AS_UID_1000, id, ...BYSTANDER.split(' ')])
      for (let tries = 0; tries < 50 && !(await bystanderRunning()); tries++) await pause(100)
      if (!(await bystanderRunning())) fail(`step ${index + 1}: the ${BYSTANDER} it starts first did not start`)
    }
    say(`step ${index + 1}, as uid 1000 inside: ${step.what}`)
    const answer = await inside(step.argv)
    for (const line of `${answer.out}${answer.err}`.trim().split('\n').filter(Boolean)) say(`  ${line}`)
    await pause(1000)
    const now = await stillRunning()
    if (!now.running) {
      ended = { step: index + 1, what: step.what, ...now }
      fail(`the container ended after step ${index + 1} (${step.what}) with exit ${String(now.exitCode)}${now.why === null ? '' : `; docker said: ${now.why}`}`)
      break
    }
    say(`  the container is still running`)
    if (step.bystander && (await bystanderRunning())) fail(`step ${index + 1}: the ${BYSTANDER} is still running, so the signal was not seen to be sent`)
    else if (step.bystander) say(`  the ${BYSTANDER} it started ended, so the signal was sent`)
  }

  if (ended === null) {
    const before = Date.now()
    const stop = await run('docker', ['stop', '--time', '10', id], { timeoutMs: 60_000 })
    const took = Date.now() - before
    const now = await stillRunning()
    say(`docker stop --time 10 took ${String(took)} ms; the container's exit code is ${String(now.exitCode)}`)
    if (stop.code !== 0) fail(`docker stop failed: ${stop.err.trim()}`)
    if (now.running) fail('the container is still running after docker stop')
    if (now.exitCode !== 0) fail(`docker stop ended the container with exit ${String(now.exitCode)}, not 0, so the keep-alive did not obey its SIGTERM`)
    if (took >= 10_000) fail('docker stop took its whole 10 seconds, so it ended the container with SIGKILL')
  }

  const written = await logs()
  say(`the container's log:\n${written.trimEnd()}`)
  if (ended === null) {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      if (!written.includes(`keep-alive: refused ${signal} from pid `)) fail(`the log holds no refusal of ${signal}`)
    }
    if (!written.includes('keep-alive: SIGTERM from outside the container, so the container ends now, with exit 0')) fail('the log does not say the keep-alive obeyed docker stop')
  }
}

// CLEANUP: the container by its own name, which no other container has, then the scratch folders.
const errors = []
const removed = await run('docker', ['rm', '--force', name])
if (removed.code !== 0 && !/no such container/i.test(removed.err)) errors.push(`could not remove ${name}: ${removed.err.trim()}`)
try {
  rmSync(root, { recursive: true, force: true })
} catch (error) {
  errors.push(`could not remove ${root}: ${error.message}`)
}
for (const error of errors) process.stderr.write(`keep-alive proof: cleanup ${error}\n`)
const proofPassed = failures.length === 0
const cleanupComplete = errors.length === 0
const exitCode = proofPassed && cleanupComplete ? 0 : 1
const result = proofPassed
  ? cleanupComplete ? 'Proof passed and cleanup is complete.' : 'Proof passed, but cleanup failed.'
  : cleanupComplete ? 'Proof failed; cleanup is complete.' : 'Proof failed and cleanup failed.'
process.stdout.write(`${JSON.stringify({ final: true, mode: old ? 'old keep-alive, the mutation' : 'the template as it is', proofPassed, cleanupComplete, passed: exitCode === 0, exitCode, result, failures, errors })}\n`)
process.exitCode = exitCode
