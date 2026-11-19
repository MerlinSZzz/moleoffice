#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FIND MOLE OFFICE SERVERS THAT NOBODY IS WAITING FOR, AND SAY WHAT THEY ARE HOLDING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Eight browser tests start a real Mole Office server of their own, each on a temporary database, and
 * each spawns it with `detached: true`. Detaching is right: it puts the child in its own process
 * GROUP so one signal takes the whole tree, which is what `stopGroup` needs.
 *
 * It has a second effect nobody accounted for. A detached child is NOT in its parent's process
 * group, so when the parent is killed the child is sent nothing at all. The only thing that stops
 * it is `stopGroup`, and `stopGroup` is called from `afterAll`. **Any way of ending a run that
 * skips `afterAll` leaks the whole tree, permanently.** A vitest worker killed on a timeout, a run
 * interrupted, a shell torn down when an agent finishes — none of them run `afterAll`.
 *
 * Measured on 18 August 2026: eight of them, all started within one second of each other at
 * 13:04:40, still running four and a half hours later, each holding a port and a database under
 * /tmp. One parallel test run had been killed as a unit.
 *
 * THE REPAIR IS NOW IN PLACE and this is what tells you it has stopped working. `liveApp` in
 * tests/helpers.ts is the one owner of a test server's lifecycle; it stops what it started from
 * `exit`, `SIGINT`, `SIGTERM` and `uncaughtException` as well as from `afterAll`; and each child
 * watches the pid that started it, which is the only part a SIGKILLed parent cannot defeat.
 * tests/no-stray-servers.test.ts runs this tool on every test run, so the sweep happens without
 * anybody remembering to sweep.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NEVER TOUCH
 * ---------------------------------------------------------------------------------------
 *
 * A process is a stray only if ALL of these hold. Anything else is left alone and, with --verbose,
 * said out loud, because a sweeper that quietly decides something is rubbish is worse than none.
 *
 *   - it is a Mole Office API server or its Vite, RUNNING IN THIS CHECKOUT — judged by the process's own
 *     working directory, because `tsx src/server/index.ts` names the file relatively and a second
 *     checkout on this machine spells it exactly the same way;
 *   - its MOLE_OFFICE_DB is under the system temporary directory, so it is not anybody's real work;
 *   - it has been reparented, meaning the process that started it is gone;
 *   - it is older than the grace period, so a server starting up right now is never a stray.
 *
 * The development server is excluded by the second rule alone: its database is data/panelx.db.
 *
 * `--database-prefix=<path>` NARROWS THE SECOND RULE, and tests/no-stray-servers.test.ts is why.
 * This repository tells you to start a server with `setsid`, which leaves a live, wanted server
 * with no parent — the same shape as a leak, and this tool cannot tell the two apart. A person
 * sweeping the machine wants to see both, so the default is unchanged. The test may only fail the
 * suite for a server the SUITE made, and what tells those apart is where the database is: the test
 * passes the path its own helper builds them under.
 *
 * BOTH HALVES OF A TEST SERVER ARE LOOKED FOR, not just the API. Each is spawned in a process group
 * of its own, so a leak leaves two groups, and measured on 18 August 2026 a SIGKILLed parent left
 * both of them holding a port. A sweeper that could only see one half would report a clean machine
 * with a Vite still on it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS WHEN IT COULD NOT LOOK, AND WHY THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * Two faults were measured on 27 August 2026 and both are fixed here.
 *
 * IT CRASHED UNDER THE MACHINE'S DEFAULT NODE. `node` on PATH is 18; `import.meta.dirname`, which
 * this file used to find itself with, arrived in node 21. A person sweeping by hand without nvm
 * loaded got `TypeError: The "paths[0]" argument must be of type string`, which names no cause and
 * no remedy. It finds itself with `fileURLToPath(import.meta.url)` now, which has worked since node
 * 10. It also imports the product's judgement of a process from a TypeScript file, so it needs
 * node 22.18 or later; under an older node it says that in words and stops with exit code 2.
 *
 * IT REPORTED A CLEAN MACHINE WHILE A VITE THIS PROJECT'S OWN TOOLING HAD STARTED SAT IN A DELETED
 * WORKTREE. That process was excluded by the first rule — its working directory was not this
 * checkout — and being excluded, it was printed nowhere at all, not even as spared. The rule is
 * right: a sweeper must never end somebody else's work. Being silent about it was not. A Mole Office
 * server or Vite running in ANOTHER directory is now counted and listed as not this checkout's,
 * with its directory, and marked when that directory has been deleted, which is the case where no
 * checkout is waiting for it. It never affects the exit code, because it is not this sweep's to
 * judge.
 *
 * AND THE CLOSING SENTENCE NEVER SAYS "CLEAN" ON ITS OWN. It says how many processes were looked
 * at, how many were spared and why, how many belong to another directory, and how many could not
 * be read at all. "I looked and found nothing" and "I could not look" are opposite answers.
 *
 * EXIT CODES. 0 nothing to stop here, 1 strays found, 2 this sweep could not be made at all.
 */

import { readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { settingValue } from '../src/config/settings.mjs'
// The words a person reads for a world, from the one table. That table is JavaScript; its own header
// says why.
import { wordForAKindOfWorld, wordForAStanding } from '../src/config/world-words.mjs'

/**
 * WHERE THIS FILE IS, WITHOUT `import.meta.dirname`.
 *
 * It used to be `resolve(import.meta.dirname, '..')`. `import.meta.dirname` arrived in node 21 and
 * the node on this machine's PATH is 18, so a person sweeping by hand without nvm loaded got
 * `TypeError: The "paths[0]" argument must be of type string. Received undefined` — a stack trace
 * naming neither node nor the requirement, in place of an answer about their machine.
 * `fileURLToPath(import.meta.url)` is the same fact and has worked since node 10.
 */
const HERE = fileURLToPath(import.meta.url)

/**
 * Whether this file was RUN, as opposed to imported.
 *
 * `tests/telling-a-live-process-from-a-claim.test.ts` imports this file under plain node to check
 * that `moleOfficePartOf` below is the one in src/server/lib/mole-office-parts.ts. Without this the
 * import would run the whole sweep and call `process.exit`.
 */
const RUN_AS_A_COMMAND = process.argv[1] !== undefined && resolve(process.argv[1]) === HERE

const REPO = resolve(HERE, '..', '..')
const TMP = tmpdir()
/**
 * WHERE `tools/isolated-mole-office.mjs` PUTS ITS COPY OF THE CORPUS, and the reason this constant exists.
 *
 * This sweeper's rule was "the database is under the temporary directory", and every real leak this
 * project has had came from an instance started by that tool — which does NOT put its copy under
 * /tmp. It puts it in `.logs/isolated/<name>/copy.db`, inside the checkout. So the tool built to find
 * leaked servers could not see the servers most likely to leak. One from 05:27 was still running five
 * hours later, adopted by the session manager, its own `where.json` already deleted, and this sweeper
 * reported a clean machine three times while it sat there.
 *
 * A copy of the corpus made for a test is scratch wherever it was put. The other two conditions do
 * the work of not touching a live one: an instance somebody is still using has a parent that is
 * waiting for it, and one that has just started is inside the grace period.
 */
const ISOLATED = resolve(REPO, '.logs', 'isolated')

/**
 * THE PROCESS GROUPS `tools/isolated-mole-office.mjs` STILL BELIEVES IT IS RUNNING.
 *
 * That tool writes `where.json` when an instance answers and DELETES it when the instance is stopped,
 * so the file is the register of what somebody is still using. It is the discriminator this sweeper
 * needs and did not have: an isolated instance is DETACHED on purpose — that is what lets one signal
 * take the whole tree — and a detached child is adopted by the session manager the moment its starter
 * returns. So "it has been adopted" is true of every isolated instance, wanted or not, and cannot
 * tell them apart. `where.json` can.
 *
 * A group named here is spared however old it is. A group whose database is an isolated copy and which
 * NOTHING names is abandoned: its `where.json` is gone, so either it was stopped and survived the
 * stop, or the thing that started it died without stopping it. Both are exactly what this sweeper is
 * for.
 */
function registeredGroups() {
  const groups = new Map()
  let names = []
  try {
    names = readdirSync(ISOLATED)
  } catch {
    return groups
  }
  for (const name of names) {
    let where
    try {
      where = JSON.parse(readFileSync(`${ISOLATED}/${name}/where.json`, 'utf8'))
    } catch {
      continue
    }
    for (const key of ['apiPgid', 'webPgid']) {
      if (typeof where[key] === 'number') groups.set(where[key], name)
    }
  }
  return groups
}

const REGISTERED = registeredGroups()
/** Younger than this and it may simply be starting up. Seconds. */
const GRACE = Number(settingValue('MOLE_OFFICE_STRAY_GRACE'))
/** When given, only a database under this path counts. Everything else is spared, and says so. */
const ONLY_UNDER =
  process.argv.find((arg) => arg.startsWith('--database-prefix='))?.slice('--database-prefix='.length) ?? TMP

function read(pid, what) {
  try {
    return readFileSync(`/proc/${pid}/${what}`, 'utf8')
  } catch {
    return null
  }
}

/** The environment of a process, as a map. Null when it cannot be read (not ours, or gone). */
function environOf(pid) {
  const raw = read(pid, 'environ')
  if (raw === null) return null
  const out = new Map()
  for (const entry of raw.split('\0')) {
    const eq = entry.indexOf('=')
    if (eq > 0) out.set(entry.slice(0, eq), entry.slice(eq + 1))
  }
  return out
}

function statOf(pid) {
  const raw = read(pid, 'stat')
  if (raw === null) return null
  // The command is in brackets and may contain spaces, so read after the last ')'.
  const after = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
  return { ppid: Number(after[1]), pgid: Number(after[2]), startTicks: Number(after[19]) }
}

function ageSeconds(startTicks) {
  const uptime = Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0])
  const hz = 100 // Linux USER_HZ. Wrong only on kernels nobody here runs.
  return Math.round(uptime - startTicks / hz)
}

/** Where a process is running, or null when it cannot be read (not ours, or gone). */
function cwdOf(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

/**
 * What this command line is to Mole Office, or null when it is nothing to do with us.
 *
 * THIS IS THE PRODUCT'S OWN JUDGEMENT, IMPORTED. src/server/lib/mole-office-parts.ts is the one
 * place it is made; src/server/lib/resources.ts uses the same function. That file imports nothing,
 * so this sweep still asks no server and opens no database.
 *
 * Node reads that file by stripping its types, which node 22.18 and later do by default. An older
 * node, or one started with type stripping turned off, cannot import it at all. So this sweep says
 * so and stops with exit code 2, rather than crash with a stack trace that names neither node nor
 * the requirement.
 *
 * It is exported so that tests/telling-a-live-process-from-a-claim.test.ts can check it is that
 * very function and not a copy.
 */
if (!process.features.typescript) {
  console.error(
    `This sweep imports src/server/lib/mole-office-parts.ts, and this node (${process.version}) does not read ` +
      'TypeScript, so NOTHING was checked. It needs node 22.18 or later with type stripping on. ' +
      'This is not a report that the machine is clean.',
  )
  process.exit(2)
}
export const { moleOfficePartOf } = await import('../src/server/lib/mole-office-parts.ts')

/**
 * WHETHER THIS PROCESS HAS BEEN ADOPTED, WHICH IS THE ONLY EVIDENCE THAT NOBODY IS WAITING FOR IT.
 *
 * THE OBVIOUS TEST IS WRONG AND IT WAS IN THIS FILE FIRST. `ppid === 1` assumes an orphan is
 * adopted by init. On a machine running a systemd user session it is adopted by the SESSION
 * MANAGER instead — pid 2299 here — so every one of the eight real strays this tool was written for
 * had a live parent by that test and the tool reported "no strays" while eight of them held ports.
 * It was caught by making one deliberately and watching the tool spare it, which is the only reason
 * this comment exists rather than a false clean bill of health.
 *
 * So the question is not the parent's NUMBER, it is what the parent IS. init, a kernel thread, a
 * session manager or a parent that has itself gone are all "nobody is waiting". Anything else — a
 * shell, a test runner, a supervisor — is somebody, and the process is left alone.
 */
function reparented(ppid) {
  if (ppid <= 2) return true
  const cmd = read(ppid, 'cmdline')
  if (cmd === null) return true // the parent went between reading the child and reading it
  const args = cmd.split('\0').filter(Boolean).join(' ')
  if (args === '') return true // a kernel thread has an empty cmdline
  return /(^|\/)(systemd|init|launchd)(\s|$)/.test(args)
}

if (RUN_AS_A_COMMAND) {
  /**
   * WHERE A PROCESS IS RUNNING, AND WHETHER THAT DIRECTORY IS STILL THERE.
   *
   * Linux marks the working-directory link of a deleted directory with " (deleted)", and there is no
   * other sign of it. A dev server whose worktree was removed goes on running out of a directory that
   * is not on disk, and nothing is waiting for it, because whatever removed the directory is gone.
   */
  function whereItRuns(pid) {
    const link = cwdOf(pid)
    if (link === null) return { cwd: null, deleted: false }
    if (link.endsWith(' (deleted)')) return { cwd: link.slice(0, -' (deleted)'.length), deleted: true }
    return { cwd: link, deleted: false }
  }

  /** Everything running in this checkout, judged. */
  const strays = []
  const spared = []
  /** Mole Office servers running in some OTHER directory. Counted and listed, never judged. */
  const elsewhere = []
  /** Mole Office-shaped processes whose /proc entry could not be read far enough to judge them. */
  const unreadable = []

  let entries
  try {
    entries = readdirSync('/proc').filter((d) => /^\d+$/.test(d))
  } catch (err) {
    console.error(
      `/proc could not be listed (${err instanceof Error ? err.message : String(err)}), so NOTHING was checked. ` +
        'This is not a report that the machine is clean.',
    )
    process.exit(2)
  }

  for (const dir of entries) {
    const pid = Number(dir)
    const cmd = read(pid, 'cmdline')
    if (cmd === null) continue
    const argv = cmd.split('\0').filter(Boolean)
    const args = argv.join(' ')
    const part = moleOfficePartOf(args)
    if (part === null) continue

    const { cwd, deleted } = whereItRuns(pid)
    const stat = statOf(pid)
    if (cwd === null || stat === null) {
      // Another user's process, or one that exited between the two reads. Either way this sweep
      // cannot say whose it is, and saying nothing at all is what let a stray sit for two days.
      unreadable.push({ pid, part, args: args.slice(0, 120) })
      continue
    }
    if (cwd !== REPO) {
      elsewhere.push({ pid, part, pgid: stat.pgid, cwd, deleted, args: args.slice(0, 120) })
      continue
    }

    const env = environOf(pid)
    const db = env?.get('MOLE_OFFICE_DB') ?? null
    const age = ageSeconds(stat.startTicks)

    const why = []
    const scratch = db !== null && (db.startsWith(ONLY_UNDER) || db.startsWith(ISOLATED))
    if (db === null) why.push('nothing set MOLE_OFFICE_DB, so which database it holds is unknown')
    else if (!scratch) why.push(`its database is ${db}, which is neither under ${ONLY_UNDER} nor a copy in ${ISOLATED}`)
    const registered = REGISTERED.get(stat.pgid)
    if (registered !== undefined) {
      why.push(`\`isolated-mole-office.mjs\` still lists it as instance "${registered}", so somebody is using it`)
    }
    if (!reparented(stat.ppid)) {
      why.push(`its parent ${String(stat.ppid)} is a process that could still be waiting for it`)
    }
    if (age < GRACE) why.push(`it is ${String(age)}s old, younger than the ${String(GRACE)}s grace period`)

    const row = { pid, part, pgid: stat.pgid, ppid: stat.ppid, db, age, args: args.slice(0, 120) }
    if (why.length === 0) strays.push(row)
    else spared.push({ ...row, why })
  }

  const verbose = process.argv.includes('--verbose')

  if (spared.length > 0 && verbose) {
    console.log(`Left alone (${String(spared.length)}):`)
    for (const s of spared) console.log(`  pid ${String(s.pid)}, ${s.part} — ${s.why.join('; ')}`)
    console.log('')
  }

  /**
   * WHAT IS RUNNING SOMEWHERE ELSE, ALWAYS PRINTED.
   *
   * Not under --verbose. This list is the fault this sweep had on 27 August 2026: a Vite from a
   * worktree of this project, in a directory the project had deleted, running for two days, reported
   * by nothing. It is printed whether or not anything was found here, because a person reading "no
   * strays" needs to know the sentence has a boundary.
   */
  if (elsewhere.length > 0) {
    const n = elsewhere.length
    console.log(
      `${String(n)} Mole Office ${n === 1 ? 'process is' : 'processes are'} running in ANOTHER directory. Not this ` +
        "sweep's to judge and not counted above; listed so they are not invisible:",
    )
    for (const e of elsewhere) {
      console.log(
        `  pid ${String(e.pid)}, group ${String(e.pgid)}, ${e.part} — ${e.cwd}` +
          (e.deleted ? ' (DELETED — no checkout is waiting for this one)' : ''),
      )
    }
    console.log('')
  }

  if (unreadable.length > 0) {
    const n = unreadable.length
    console.log(
      `${String(n)} Mole Office ${n === 1 ? 'process' : 'processes'} could not be read far enough to judge — another ` +
        "user's, or gone between two reads:",
    )
    for (const u of unreadable) console.log(`  pid ${String(u.pid)}, ${u.part}`)
    console.log('')
  }

  /**
   * THE CLOSING SENTENCE, WHICH NEVER SAYS "CLEAN" ON ITS OWN.
   *
   * The old one was "No stray Mole Office servers. Checked every API server and Vite running in <REPO>."
   * That is accurate and it reads as "checked this machine", which is how a stray in another
   * directory and a process nobody could read both disappeared behind a clean bill of health.
   */
  function boundary() {
    const said = [`Looked at every process on this machine and judged the ones running in ${REPO}`]
    said.push(`${String(spared.length)} left alone here for a stated reason (--verbose to see them)`)
    if (elsewhere.length > 0) said.push(`${String(elsewhere.length)} running in another directory, listed above`)
    if (unreadable.length > 0) said.push(`${String(unreadable.length)} that could not be read at all, listed above`)
    return `${said.join('; ')}.`
  }

  // THE OFFICE, READ FROM THE MIRROR AND NOT FROM AN API. Criterion C3: *the listeners and stray
  // tools read the office as the one list.* This tool reads the machine and never asks a server —
  // that is what makes it useful when nothing is answering — and the mirror is the office written
  // down for exactly that reader. A world named here is one the office believes is still open, so a
  // group below that serves one is a stray the office has not been told about.
  printTheOffice()

  if (strays.length === 0) {
    console.log(`No stray Mole Office servers in ${REPO}. ${boundary()}`)
    process.exit(0)
  }

  console.log(
    `${String(new Set(strays.map((s) => s.pgid)).size)} stray Mole Office process group(s): started by ` +
      `something that is gone, holding a scratch copy of the corpus — under ${ONLY_UNDER}, or an ` +
      `isolated instance nothing is waiting for.\n`,
  )
  const groups = [...new Set(strays.map((s) => s.pgid))]
  // ONE ROW PER GROUP. A server started this way is a tree — npm, then tsx, then node — and printing
  // each member reads as four strays when it is one. The group is also the thing you signal, so the
  // row and the remedy are about the same object.
  const byGroup = new Map()
  for (const s of strays) if (!byGroup.has(s.pgid) || s.pid < byGroup.get(s.pgid).pid) byGroup.set(s.pgid, s)
  for (const s of byGroup.values()) {
    const mins = Math.round(s.age / 60)
    const members = strays.filter((x) => x.pgid === s.pgid).length
    console.log(`  group ${String(s.pgid)}  ${s.part}  ${String(mins)} min old  ${String(members)} process(es)`)
    console.log(`      ${s.db ?? '(no database named)'}`)
  }
  console.log(`\n${boundary()}`)
  // A group, never a pid: a server started this way is `tsx` and then the node process it runs, and
  // killing the one you can see leaves the other holding the port.
  console.log(`\nStop them by GROUP, never by pid:`)
  console.log(`    ${groups.map((g) => `kill -TERM -${String(g)}`).join('; ')}`)
  console.log(`\nThen check the ports came back with \`ss -ltn\`, which is the only thing that proves it.`)
  process.exit(1)
}

/**
 * WHICH WORLDS THE OFFICE BELIEVES ARE OPEN, read from the mirror the main world writes.
 *
 * A world open at the office and served by nothing is the same fault this tool is about, seen from
 * the other side: the sweep finds a process nobody is waiting for, and this finds a row nothing is
 * answering for. Both are printed and neither is acted on, because this tool names and never
 * signals.
 *
 * NO MIRROR IS A REAL ANSWER AND NOT AN EMPTY OFFICE. It is said in those words: a main world that
 * has never run has written no file, and reading that as "there are no worlds" is the substitution
 * this repository forbids.
 *
 * IT MATCHES NO WORLD TO A GROUP, and that is deliberate. A world is named by the identity of its
 * database — a hash of the file's path and its creation time — and this tool would have to work that
 * out for itself to pair the two, which is the same fact computed in a second place. The two lists
 * are printed side by side and the reader does the pairing, which is one line of thought and no new
 * way to be wrong.
 */
function printTheOffice() {
  const where = resolve(settingValue('MOLE_OFFICE_DB'), '..', 'worlds.json')
  let said
  try {
    said = JSON.parse(readFileSync(where, 'utf8'))
  } catch {
    // Catching to the letter of invariant 4: what is handled here is "there is no mirror to read",
    // and what is done about it is to say so rather than to print a list nobody wrote.
    console.log(`The office has written no list this sweep can read at ${where}, so no world is named below.`)
    console.log('That is not an empty office: it is a main world that has not written one.\n')
    return
  }
  const live = (said.worlds ?? []).filter((one) => one.diedAt === null)
  console.log(`The office's own list, written ${String(said.writtenAt)} and read from ${where}:`)
  if (live.length === 0) console.log('  no world is open.')
  for (const one of live) {
    console.log(
      `  ${String(one.name)} — ${wordForAKindOfWorld(one.kind)}, ${wordForAStanding(one.standing)}, database ` +
        `${String(one.databaseIdentity)}, ` +
        `${one.address === null || one.address === undefined ? 'no address recorded' : String(one.address)}`,
    )
  }
  // AND WHO ASKS WHETHER ANYTHING IS STILL THERE. This tool names and never acts, and it reads the
  // machine rather than asking a server, so it cannot tell a world that is being served from one
  // whose process was killed. That is a different reading and it has its own tool.
  if (live.length > 0) {
    console.log('  Whether anything is still serving these: node tools/close-worlds-nobody-serves.mjs')
  }
  console.log('')
}
