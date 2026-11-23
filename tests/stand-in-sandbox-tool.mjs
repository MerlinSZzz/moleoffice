#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR tools/sandbox.mjs, FOR THE MERGE TOOL'S TESTS ONLY.
 * SYNTHETIC: it starts no container. The merger is given it with --sandbox-tool; the message worker never passes that flag,
 * so the queue itself always runs tools/sandbox.mjs.
 *
 * It takes the same words as tools/sandbox.mjs for the four calls the merger makes, and writes every
 * call, one JSON line each, to <sandboxes>/calls.jsonl, so a test can prove what went through it:
 *
 *   status [<name>...] --json a report in the launcher's own shape for each name, or, with no name,
 *                             for every folder in <sandboxes>, as tools/sandbox.mjs does: the instance,
 *                             its folder, and whether its "container" is running.
 *   up <template> --name <n> --from <root> [--network <none|bridge|host>] ... --json
 *                             makes <sandboxes>/<n>/ and answers the launcher's JSON line, whose
 *                             "network" is the one it was given, or null when no --network was given.
 *   exec <n> --wait --plain-env --timeout <s> --cwd <dir> -- <command...>
 *                             runs the command HERE, to its end, and exits with its code. Like the real
 *                             sandbox, it refuses a --cwd outside the instance folder, because a
 *                             container can write nowhere else, and it runs the command with no
 *                             MOLE_OFFICE_ or SANDBOX_ variable, as --plain-env does. An instance that
 *                             is not running is refused with the launcher's own sentence, and exit 1.
 *                             As the real helper does, it prints "sandbox-start: started {...}" on
 *                             stderr as the command starts, and never before a refusal.
 *   down <n> --force          marks the "container" stopped.
 *
 * STAND_IN_SANDBOX_REFUSE_UP=1 in the environment makes `up` fail, as it does with no docker.
 * STAND_IN_SANDBOX_NETWORK=<word> makes `up` answer that word as its "network", whatever it was
 * given, so a test can make it answer "host".
 * STAND_IN_SANDBOX_EXEC_ENDS=<how>:<text> ends each exec whose command, or whose --cwd, contains <text>, with the
 * sandboxes folder itself written as <sandboxes> first, so a text never matches the path the test runs from,
 * the way the real launcher ends one, as tools/sandbox.mjs and tools/sandbox-start.mjs were read on 25
 * September 2026:
 * STAND_IN_SANDBOX_EXEC_ENDS_SKIP=<count> lets that many matching commands finish first, so the pair fixture
 * can let the integration build finish and still stop the later build it is testing.
 *   down     the instance was brought down just before: it is marked stopped, and the exec is
 *            refused with the launcher's sentence, exit 1. Every later exec is refused too, until the next up.
 *   unregistered  the office did not answer the launcher's ask for the command's process row: the
 *            launcher's line and the helper's giving up are printed, the command never runs, exit 1.
 *   stopped  the container is stopped under the running command: once the command has printed
 *            something, its group gets SIGKILL, the instance is marked stopped, and the exec exits 137
 *            with no line of its own, as docker exec does.
 *   limit    the --timeout is reached: once the command has printed something, the helper's two
 *            lines are printed, its group gets SIGTERM, and the exec exits 124.
 * STAND_IN_SANDBOX_NO_ROOM=<n> makes the first n execs of a build or test (--wait --plain-env) refuse with exit 75 before
 * anything starts, in the words tools/sandbox.mjs uses when the machine has under 80 GB free (a decision, read
 * on 4 October 2026). The count is kept in <sandboxes>/.no-room-refused.
 * STAND_IN_SANDBOX_NO_ROOM_UP=<n> makes the first n `up`s refuse with exit 75 before anything is made, in the words
 * tools/sandbox.mjs uses when the machine has not the memory a new container may take (its memory admission;
 * 1R4wqZ70yUA0); the count is kept in <sandboxes>/.no-room-up-refused.
 * STAND_IN_SANDBOX_DOWN_FAILS=1 makes `down` fail and leave the "container" running, in the words
 * tools/sandbox.mjs used when the office stalled (problem JyLatHZdiDM5).
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, lstatSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { localStamp } from '../src/shared/time.ts'
import { theReCreatableMergeParts } from '../tools/sandbox-common.mjs'

const argv = process.argv.slice(2)
const verb = argv[0]
const chosen = { targets: [], command: null }
for (let i = 1; i < argv.length; i += 1) {
  const word = argv[i]
  if (word === '--') {
    chosen.command = argv.slice(i + 1)
    break
  }
  if (['--json', '--wait', '--plain-env', '--no-dsh', '--force'].includes(word)) chosen[word.slice(2)] = true
  else if (word.startsWith('--')) chosen[word.slice(2)] = argv[(i += 1)]
  else chosen.targets.push(word)
}
const sandboxes = resolve(chosen.sandboxes)
mkdirSync(sandboxes, { recursive: true })
const record = (line) => appendFileSync(join(sandboxes, 'calls.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), verb, ...line })}\n`)
const folderOf = (name) => join(sandboxes, name)
const stateOf = (name) => (existsSync(join(folderOf(name), 'instance.json')) ? JSON.parse(readFileSync(join(folderOf(name), 'instance.json'), 'utf8')) : null)

if (verb === 'status') {
  const names =
    chosen.targets.length > 0 ? chosen.targets : readdirSync(sandboxes, { withFileTypes: true }).filter((one) => one.isDirectory() && !one.name.startsWith('.')).map((one) => one.name)
  // ONE CALL, ONE LINE: `name` is the one name asked about, as before, and `names` is every name when there are others.
  record(chosen.targets.length === 1 ? { name: chosen.targets[0] } : { names: chosen.targets })
  const reports = names.map((name) => {
    const held = stateOf(name)
    return held === null
      ? { instance: name, folder: folderOf(name), says: `${folderOf(name)} is not a sandbox: it holds no instance.json.` }
      : { instance: name, template: held.template, folder: folderOf(name), from: held.from, container: { name: `stand-in-${name}`, docker: held.running ? 'running' : 'exited' } }
  })
  process.stdout.write(`${JSON.stringify({ sandboxes, reports })}\n`)
} else if (verb === 'up') {
  const name = chosen.name
  record({ name, template: chosen.targets[0], from: chosen.from, noDsh: chosen['no-dsh'] === true, network: chosen.network ?? null, label: chosen.label ?? null })
  const noRoomUp = Number(process.env['STAND_IN_SANDBOX_NO_ROOM_UP'] ?? '0')
  if (noRoomUp > 0) {
    const counted = join(sandboxes, '.no-room-up-refused')
    const refused = existsSync(counted) ? Number(readFileSync(counted, 'utf8')) : 0
    if (refused < noRoomUp) {
      writeFileSync(counted, String(refused + 1))
      process.stderr.write(`sandbox: the machine has 20 GiB of memory available, under the 24 GiB this start needs: the 16 GiB the sandbox may still take under its 16 GiB limit, and 8 GiB kept for the desktop and the office. Nothing was started; sandbox ${name} can start once that much memory is free.\n`)
      process.exit(75)
    }
  }
  if (process.env['STAND_IN_SANDBOX_REFUSE_UP'] === '1') {
    process.stderr.write('sandbox: docker is not installed, or not on PATH, so nothing was done. (stand-in)\n')
    process.exit(1)
  }
  mkdirSync(folderOf(name), { recursive: true })
  writeFileSync(join(folderOf(name), 'instance.json'), JSON.stringify({ template: chosen.targets[0], from: chosen.from, running: true, labels: chosen.label ? Object.fromEntries([chosen.label.split(/=(.*)/s).slice(0, 2)]) : {} }))
  process.stdout.write(`${JSON.stringify({ instance: name, template: chosen.targets[0], container: 'f'.repeat(64), containerName: `stand-in-${name}`, resource: 'stand-in-row', folder: folderOf(name), network: process.env['STAND_IN_SANDBOX_NETWORK'] ?? chosen.network ?? null })}\n`)
} else if (verb === 'exec') {
  const name = chosen.targets[0]
  const cwd = resolve(chosen.cwd)
  // THE COMMIT THE COMMAND RAN ON, when its cwd is a checkout of its own, read before it runs: the merge tool's clear takes
  // work/main and a bus's trees once the entry is final (5 October 2026), so a test proves afterwards from this which tree
  // a build or a suite ran in.
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel', 'HEAD'], { encoding: 'utf8' })
  const [topLevel, head] = top.status === 0 ? top.stdout.trim().split('\n') : []
  record({ name, cwd, command: chosen.command, wait: chosen.wait === true, plainEnv: chosen['plain-env'] === true, timeout: chosen.timeout ?? null, head: topLevel !== undefined && existsSync(cwd) && topLevel === realpathSync(cwd) ? head : null })
  const [how, text] = (() => {
    const ends = process.env['STAND_IN_SANDBOX_EXEC_ENDS'] ?? ''
    const at = ends.indexOf(':')
    return at === -1 ? [null, null] : [ends.slice(0, at), ends.slice(at + 1)]
  })()
  if (how !== null && !['down', 'unregistered', 'stopped', 'limit'].includes(how)) {
    process.stderr.write(`stand-in sandbox tool: STAND_IN_SANDBOX_EXEC_ENDS names no way to end an exec: ${how}\n`)
    process.exit(2)
  }
  // THE TEXT IS MATCHED WITH THIS STAND-IN'S OWN SANDBOXES FOLDER WRITTEN AS <sandboxes>, so it meets only what the merge tool
  // chose (a folder inside a sandbox, a report name, a command) and never the place the test itself runs from. On 25 September
  // 2026 the queue ran these tests in a checkout at <its sandbox>/work/clone, so "work/clone" was in every path and matched
  // every exec (entry c1BhnpK0ex34).
  // NO ROOM: exit 75 before anything is filed or started, as the real launcher's roomForABuildOrTest refuses.
  const noRoom = Number(process.env['STAND_IN_SANDBOX_NO_ROOM'] ?? '0')
  if (noRoom > 0 && chosen.wait === true && chosen['plain-env'] === true) {
    const counted = join(sandboxes, '.no-room-refused')
    const refused = existsSync(counted) ? Number(readFileSync(counted, 'utf8')) : 0
    if (refused < noRoom) {
      writeFileSync(counted, String(refused + 1))
      process.stderr.write('sandbox: the machine has 71.2 GB free where the sandboxes are, under the 80 GB a new build or test run needs. Nothing was started; it can start once space is freed.\n')
      process.exit(75)
    }
  }
  let endsHere = how !== null && `${chosen.command.join(' ')} ${cwd}`.split(sandboxes).join('<sandboxes>').includes(text)
  const skip = Number(process.env['STAND_IN_SANDBOX_EXEC_ENDS_SKIP'] ?? '0')
  if (!Number.isSafeInteger(skip) || skip < 0) throw new Error('STAND_IN_SANDBOX_EXEC_ENDS_SKIP must be a nonnegative integer')
  if (endsHere && skip > 0) {
    const file = join(folderOf(name), '.exec-ends-matches')
    const matches = (existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0) + 1
    writeFileSync(file, String(matches))
    if (matches <= skip) endsHere = false
  }
  const stop = () => writeFileSync(join(folderOf(name), 'instance.json'), JSON.stringify({ ...stateOf(name), running: false }))
  if (endsHere && how === 'down') stop()
  const held = stateOf(name)
  if (held === null) {
    process.stderr.write(`sandbox: There is no sandbox called ${name} in ${sandboxes}. node tools/sandbox.mjs status lists them.\n`)
    process.exit(1)
  }
  if (!held.running) {
    process.stderr.write(`sandbox: The sandbox ${name} is not running (docker says it is exited). Start it with node tools/sandbox.mjs up.\n`)
    process.exit(1)
  }
  const rel = relative(folderOf(name), cwd)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('/')) {
    process.stderr.write(`sandbox: ${cwd} is outside the instance folder, so the sandbox could not write there. (stand-in)\n`)
    process.exit(1)
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('MOLE_OFFICE_') && !key.startsWith('SANDBOX_') && key !== 'MOLE_AGENT_KEY'))
  const [program, ...rest] = chosen.command
  if (endsHere && how === 'unregistered') {
    const why = 'nothing answered (fetch failed) (stand-in)'
    process.stderr.write(`sandbox: the ledger refused to register pid 4242 in container stand-in-${name} (${why}), so the command never runs.\n`)
    process.stderr.write(`sandbox-start: The launcher on the host could not register pid 4242 in container stand-in-${name}: ${why} The command never ran.\n`)
    process.exit(1)
  }
  process.stderr.write(`sandbox-start: started ${JSON.stringify({ instance: name, cwd, command: chosen.command, waits: true, timeoutSeconds: Number(chosen.timeout ?? 0), plainEnv: chosen['plain-env'] === true, standIn: true })}\n`)
  if (!endsHere) {
    const ran = spawnSync(program, rest, { cwd, env, stdio: 'inherit' })
    process.exit(ran.status ?? 1)
  }
  const child = spawn(program, rest, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let cut = false
  const cutOff = () => {
    if (cut) return
    cut = true
    if (how === 'stopped') {
      process.kill(-child.pid, 'SIGKILL')
      stop()
    } else {
      process.stderr.write(`sandbox-start: the command reached its limit of ${String(chosen.timeout)} s: its group gets SIGTERM now, and SIGKILL in 30 s if anything is left.\n`)
      process.kill(-child.pid, 'SIGTERM')
    }
  }
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    cutOff()
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    cutOff()
  })
  child.on('close', () => {
    if (how === 'stopped') process.exit(137)
    process.stderr.write(`sandbox-start: the command ended: it was stopped at its limit of ${String(chosen.timeout)} s. This helper exits 124.\n`)
    process.exit(124)
  })
} else if (verb === 'down') {
  const name = chosen.targets[0]
  record({ name, force: chosen.force === true })
  if (process.env['STAND_IN_SANDBOX_DOWN_FAILS'] === '1') {
    process.stderr.write('sandbox: the ledger did not answer (fetch failed); asking again in 2 seconds (stand-in)\n')
    process.stderr.write('sandbox: The ledger did not stop the sandbox, so nothing was stopped (nothing answered (fetch failed); read again, the ledger still holds the row open). (stand-in)\n')
    process.exit(1)
  }
  const held = stateOf(name)
  if (held !== null) writeFileSync(join(folderOf(name), 'instance.json'), JSON.stringify({ ...held, running: false }))
} else if (verb === 'clear') {
  const name = chosen.targets[0]
  record({ name, force: chosen.force === true })
  const held = stateOf(name)
  if (!held?.labels?.['mole-office.merge-entry'] || held.running || process.env['STAND_IN_SANDBOX_CLEAR_FAILS'] === '1') {
    process.stderr.write('sandbox: stand-in refused clear; nothing was removed.\n')
    process.exit(1)
  }
  const bytesIn = (path) => !existsSync(path) ? 0 : lstatSync(path).isDirectory() ? readdirSync(path).reduce((sum, child) => sum + bytesIn(join(path, child)), 0) : lstatSync(path).size
  const removed = theReCreatableMergeParts(folderOf(name)).map((part) => ({ path: join(folderOf(name), part), bytes: bytesIn(join(folderOf(name), part)) }))
  for (const part of removed) rmSync(part.path, { recursive: true, force: true })
  const clearedAt = held.clearedAt ?? localStamp(new Date())
  writeFileSync(join(folderOf(name), 'instance.json'), JSON.stringify({ ...held, clearedAt }))
  process.stdout.write(`${JSON.stringify({ instance: name, clearedAt, removed, bytesFreed: removed.reduce((sum, part) => sum + part.bytes, 0) })}\n`)
} else {
  process.stderr.write(`stand-in sandbox tool: no verb ${String(verb)}\n`)
  process.exit(2)
}
