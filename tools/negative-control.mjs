// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LAUNCH A WRONG WORLD ON PURPOSE AND PRINT WHAT THE PAGE SAID.
 *
 *     node tools/negative-control.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * Criterion G7 of design/ground/ACCEPTANCE.md, which quotes problem 21:
 *
 *     As a negative control, intentionally launch a wrong-world server/database and prove
 *     diagnostics detect the mismatch rather than declaring healthy success.
 *
 * Act 3 of section 4 asks a person to do that by hand. This does the same four things to a running
 * stack and prints what the page said each time, so the act can be done by hand OR by this command,
 * and so that the answer is the page's own words rather than a summary of them.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SIX THINGS IT DOES, AND THE LAST TWO ONLY WHEN THERE IS A SECOND ADDRESS
 * ---------------------------------------------------------------------------------------------
 *
 * 1. Opens the browser app as it is. The page should say NOTHING about the world — that is the
 *    owner's F2 answer, and a run where this one shouts is a false alarm worth knowing about.
 * 2. Switches the API under the open page to a second server on a COPY of the database, on another
 *    port. The page should name the database and stop being usable.
 * 3. Opens the page fresh with every request going to that second server. The page should name the
 *    database again — this time because a copy is answering on the address this checkout calls the
 *    real one.
 * 4. Serves the page a stamp from an hour ago, which is what a browser running an old transform of
 *    `src/` looks like. The page should name the code.
 * 5. Opens the page on the address other machines reach this computer at, with nothing wrong. It
 *    should be as silent as case 1 was.
 * 6. Does case 3 again to that page: the same wrong world, reached by a page that came in on the
 *    other address. Criterion R4 of section 7.
 *
 * CASES 5 AND 6 DO NOT RUN WHEN `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` IS UNSET, which is the
 * state every installation is in until somebody sets it. They are then printed as NOT RUN with the
 * reason, and the count of skipped cases is printed at the end: a case nobody could run is not a
 * case that passed. Neither of them needs a second machine and neither pretends to be one — what
 * they show is that the page's own check survives the trip. A machine that is not this one is the
 * human act written under R5 in design/ground/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT TOUCHES
 * ---------------------------------------------------------------------------------------------
 *
 * IT NEVER WRITES TO THE CANONICAL DATABASE. It copies the file the declaration names into a
 * throwaway directory and serves the copy. The canonical stack is only read from.
 *
 * IT STOPS WHAT IT STARTS, BY PROCESS GROUP, and checks with the kernel that the group has gone and
 * that the port came back. If it cannot, it says so loudly and prints the command to finish the job,
 * because a wrong-world server left running is the exact thing this repository has been bitten by
 * five times.
 *
 * IT STOPS IT HOWEVER THIS COMMAND ENDS. The stopping is not in a `finally` alone: an error nobody
 * caught, a promise nobody awaited, a signal and `process.on('exit')` all reach the same function,
 * and it is written to run without a turn of the event loop because those callers do not get one.
 * That is `stopWhatThisCommandStarted` below, and problem `ew8aIrRksYaS` is why it is there — three
 * runs of this command left three servers on three random ports over three copies of the corpus.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { settings } from '../src/config/settings.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader, worldInWords } from '../src/config/world-header.mjs'
import { whereIsTheApi, whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'
import { aCopyOfALiveDatabase } from './a-copy-of-a-live-database.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Everything printed goes through here, so that a run reads as one report. */
const said = []
function say(line = '') {
  said.push(line)
  console.log(line)
}

/** Stop, with the reason, and without pretending anything was proved. */
function stop(why) {
  console.error(`\nThe negative control did not run: ${why}`)
  process.exit(1)
}

/**
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS COMMAND STARTED, AND THE ONE FUNCTION THAT ENDS IT
 * ---------------------------------------------------------------------------------------------
 *
 * WHAT WENT WRONG, MEASURED. Problem `ew8aIrRksYaS`. The fifth GROUND verifier ran this command
 * three times on 4 September 2026. All four cases said what they should every time, and every time
 * the command then died on an unhandled rejection — `route.fetch: Request context disposed`, on
 * `GET /api/events`, the channel the browser app now holds open on every page. The `finally` that
 * stops the wrong-world server never ran, because Node ends the process on an unhandled rejection
 * rather than unwinding it. Three runs left three servers listening on 45353, 41611 and 46035, each
 * over a copy of the corpus in its own `/tmp` directory, none of them on any list, and the two lines
 * this command prints when it cannot stop its own server were never printed. The command whose whole
 * subject is a stray server on a wrong database had become a way of making them.
 *
 * SO THE CLEANUP IS NOT IN A `finally` ALONE. It is here, it is synchronous, it runs at most once,
 * and it is reached from five places: the ordinary end of the run, an error nobody caught, a promise
 * nobody awaited, a signal, and `process.on('exit')`, which fires however the process ends short of
 * SIGKILL.
 *
 * IT IS SYNCHRONOUS BECAUSE THE PATHS THAT NEED IT CANNOT AWAIT. An `exit` handler and a signal
 * handler get no more turns of the event loop, so signalling, waiting and deleting are all done
 * without one.
 *
 * THE ORDER MATTERS: signal the group, wait until the kernel says the group is gone, and only then
 * delete the copy. Deleting first would leave a server serving a database that no longer exists,
 * which is the incident this repository already has one of.
 */
const started = { group: null, directory: null }
let alreadyStopped = false

/** Wait, without a turn of the event loop, because the callers of this cannot have one. */
function waitWithoutTheEventLoop(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Has every process of that group ended? Read from `/proc`, not from a signal.
 *
 * WHY NOT `process.kill(-group, 0)`, MEASURED. A process that has ended and has not yet been reaped
 * — a zombie — is still a member of its group and still answers a signal check. This function is
 * called from paths that block the event loop, and a blocked event loop is exactly when Node cannot
 * run the handler that reaps its own child. So the signal check answered "still running" for the
 * whole six seconds it was asked, on 4 September 2026, about a server that had already exited.
 *
 * A zombie holds no port, no database and no memory. It has ended, and this says so.
 *
 * If `/proc` cannot be read this answers "not gone", which prints the two lines a person needs
 * rather than deleting a database out from under something that may still be serving it.
 */
function theGroupIsGone(group) {
  let entries
  try {
    entries = readdirSync('/proc')
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    let stat
    try {
      stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
    } catch {
      // It ended between the listing and the read, which is one fewer process in any group.
      continue
    }
    // THE COMMAND IS IN BRACKETS AND MAY HOLD SPACES, so the fields after it are counted from the
    // last bracket rather than by splitting the whole line. After the bracket come the state, the
    // parent's pid, and then the process group.
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    if (Number(after[2]) !== group) continue
    if (after[0] === 'Z') continue
    return false
  }
  return true
}

/**
 * Stop the wrong-world server by its group and delete its copy of the database.
 *
 * @param {string} why what brought us here, printed so a reader of the output knows
 * @returns {boolean} true when there is nothing left of it, false when a person has to finish
 */
function stopWhatThisCommandStarted(why) {
  if (alreadyStopped) return true
  alreadyStopped = true
  const { group, directory } = started
  if (group === null && directory === null) return true

  say('')
  say(`Stopping what this command started (${why}).`)
  let gone = true
  if (group !== null) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Already gone, which is the state this was trying to reach.
    }
    gone = false
    for (let tries = 0; tries < 60 && !gone; tries += 1) {
      if (theGroupIsGone(group)) {
        gone = true
        break
      }
      waitWithoutTheEventLoop(100)
    }
  }
  if (!gone) {
    say(`THE WRONG WORLD IS STILL RUNNING. Stop it by group and delete the copy:`)
    say(`    kill -TERM -${String(group)}`)
    say(`    rm -rf ${String(directory)}`)
    return false
  }
  say(`The wrong world is stopped: process group ${String(group)} is gone.`)
  if (directory !== null) {
    rmSync(directory, { recursive: true, force: true })
    say(`The copy of the database is deleted (${directory}).`)
  }
  return true
}

// FIVE WAYS OUT, AND ALL OF THEM COME THROUGH THE SAME FUNCTION.
process.on('exit', () => {
  stopWhatThisCommandStarted('the command ended')
})
process.on('uncaughtException', (err) => {
  console.error(`\nThe negative control hit an error nobody caught: ${String(err && err.stack ? err.stack : err)}`)
  stopWhatThisCommandStarted('an error nobody caught')
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  console.error(`\nThe negative control hit a rejection nobody awaited: ${String(err && err.stack ? err.stack : err)}`)
  stopWhatThisCommandStarted('a rejection nobody awaited')
  process.exit(1)
})
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopWhatThisCommandStarted(`it was sent ${signal}`)
    process.exit(1)
  })
}

/** A port nobody is on: bind zero, read what the kernel gave, let it go. */
async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

/**
 * WHAT `GET /api/health` SAYS ABOUT ITSELF: healthy or not, why not, and which world answered.
 *
 * Criterion G7's words are *reported as a mismatch, never as a green health check*, and until
 * 4 September 2026 this route answered `{"ok":true}` on a server serving a copy of the database
 * from the real address. Problem `ZTDmG8IcF5wY`. A page and the session hook read the world header
 * and refused; a shell check or a monitoring probe read the body and saw green.
 *
 * @returns the reading, or null when nothing answered or the reply was not a Mole Office's
 */
async function healthAt(api) {
  try {
    const res = await fetch(`${api}/api/health`, {
      headers: { 'x-mole-office-workspace': settings().workspace },
      signal: AbortSignal.timeout(4000),
    })
    const body = await res.json()
    if (typeof body !== 'object' || body === null || typeof body.ok !== 'boolean') return null
    return { ok: body.ok, wrong: body.wrong ?? [], world: body.world ?? null, grace: body.code?.grace ?? null }
  } catch {
    return null
  }
}

/** One reply's world, or null when nothing answered or nothing said. */
async function worldAt(api) {
  try {
    const res = await fetch(`${api}/api/health`, {
      headers: { 'x-mole-office-workspace': settings().workspace },
      signal: AbortSignal.timeout(4000),
    })
    const read = parseWorldHeader(res.headers.get(WORLD_HEADER))
    return read.ok ? read.world : null
  } catch {
    return null
  }
}

/** What the page is saying about the world right now, in the page's own words. */
async function whatThePageSaid(page) {
  return await page.evaluate(() => {
    const banner = document.querySelector('.px-ww')
    return {
      banner: banner === null ? null : (banner.textContent ?? '').replace(/\s+/g, ' ').trim(),
      blocked: document.querySelector('.px-ww-block') !== null,
    }
  })
}

/**
 * A CASE THAT DID NOT RUN, AND WHY, WHICH IS NOT THE SAME AS A CASE THAT PASSED.
 *
 * There was no such thing here until 4 September 2026, because every case applied to every
 * installation. The remote case does not: it is about the address other machines reach this
 * computer at, and unset is the state every installation is in. Counting a case nobody could run as
 * a pass would be this command telling somebody their remote page had been checked when nothing had
 * looked at it — invariant 5 of USER.md, *distinguish nothing is there from nobody has looked*.
 *
 * A skipped case counts towards neither the failures nor the passes. The line at the end says how
 * many were skipped, so a run where the interesting case did not happen cannot read as a clean one.
 */
function reportSkipped(number, what, why) {
  skipped += 1
  say('')
  say(`${String(number)}. ${what}`)
  say(`   NOT RUN: ${why}`)
}

/** One case, printed the same way whatever it found. */
function report(number, what, expected, found) {
  say('')
  say(`${String(number)}. ${what}`)
  say(`   expected: ${expected}`)
  if (found.banner === null) {
    say('   the page said: nothing about the world, and the page is usable.')
    return
  }
  say(`   the page said: ${found.banner}`)
  say(`   the page is usable: ${found.blocked ? 'no, the banner blocks it' : 'YES — the banner is drawn but nothing is blocked'}`)
}

// ------------------------------------------------------------------------------- the run

const declared = settings()
const api = whereIsTheApi()
const web = whereIsTheWebApp()

say('THE NEGATIVE CONTROL — a wrong world launched on purpose, and what the page said.')
say('')
say(`This checkout declares its API at ${api}, its browser app at ${web},`)
say(`and its database at ${declared.databasePath} (identity ${databaseIdentity(declared.databasePath).id}).`)

const canonical = await worldAt(api)
if (canonical === null) {
  stop(
    `nothing answered at ${api} with a ${WORLD_HEADER} header. Start the canonical stack first ` +
      '(npm run dev), or point this at another one with MOLE_OFFICE_API.',
  )
}
say(`The world answering there is: ${worldInWords(canonical)}.`)

let browserApp
try {
  browserApp = await fetch(`${web}/`, { signal: AbortSignal.timeout(4000) })
} catch {
  stop(`nothing answered at ${web}. Start the browser app first (npm run dev), or set MOLE_OFFICE_WEB.`)
}
if (!browserApp.ok) stop(`${web} answered ${String(browserApp.status)} rather than serving the app.`)

if (!existsSync(declared.databasePath)) {
  stop(`the database this checkout declares, ${declared.databasePath}, is not there, so there is nothing to copy.`)
}

const dir = mkdtempSync(join(tmpdir(), 'mole-office-negative-control-'))
// WRITTEN DOWN BEFORE IT IS FILLED. From here on every way out of this command deletes it.
started.directory = dir
const copy = join(dir, 'a-copy-of-the-database.db')
// MADE BY SQLITE, SO THE WRITE-AHEAD LOG IS IN IT (problem E5xPIN9WRI0u): a copy of the file alone missed it.
aCopyOfALiveDatabase(declared.databasePath, copy)
const port = await freePort()
const wrongApi = `http://127.0.0.1:${String(port)}`

say('')
say(`The wrong world: a copy of that database at ${copy},`)
say(`identity ${databaseIdentity(copy).id}, served on ${wrongApi}.`)

const env = { ...process.env, MOLE_OFFICE_DB: copy, MOLE_OFFICE_PORT: String(port), LOG_LEVEL: 'warn' }
delete env['VITEST']
delete env['VITEST_WORKER_ID']
const child = spawn(join(repo, 'node_modules/.bin/tsx'), ['src/server/index.ts'], {
  cwd: repo,
  env,
  detached: true,
  stdio: 'ignore',
})
child.unref()
// THE GROUP, WRITTEN DOWN AT THE START, which is the only id this command ever signals. A detached
// child is the leader of its own group, so its pid is its group.
started.group = child.pid
say(`It is pid ${String(child.pid)}, process group ${String(child.pid)}. This command stops it before it exits.`)
say('')
say(
  'It is NOT written into the “Running on this machine” list, and that is deliberate: its own list is inside the ' +
    'copy, which is deleted at the end of this command, so a row there would tell nobody anything. If ' +
    'this command is interrupted, stop it by group with the line printed at the end.',
)

let failures = 0
/** Cases that did not apply to this installation. Never a pass and never a failure. */
let skipped = 0
try {
  let wrong = null
  for (let tries = 0; tries < 120; tries += 1) {
    wrong = await worldAt(wrongApi)
    if (wrong !== null) break
    await sleep(500)
  }
  if (wrong === null) stop(`the second server never answered on ${wrongApi}.`)
  say('')
  say(`The wrong world is up and answering: ${worldInWords(wrong)}.`)
  if (wrong.database === canonical.database) {
    stop('the second server opened the same database as the canonical one, so there is no wrong world to test with.')
  }

  /**
   * THE BROWSER DRIVER, WHICH IS `playwright` EXCEPT WHEN THIS COMMAND'S OWN TEST IS DRIVING IT.
   *
   * `tests/the-negative-control-stops-what-it-starts.test.ts` runs this command with a stand-in
   * whose `close()` rejects the way a disposed context does, and then reads the machine to see
   * whether the wrong-world server was stopped and its copy of the database deleted. There is no
   * other way to make a real Chromium reject on cue, and the fault this command was fixed for is
   * exactly what happens after that rejection.
   *
   * The name has no `MOLE_OFFICE_` prefix on purpose: it is not a setting of this product, it is
   * one command's test seam, and `tests/one-configuration-source.test.ts` requires every
   * `MOLE_OFFICE_` variable to be read by the declaration alone.
   */
  const driver = process.env['NEGATIVE_CONTROL_BROWSER'] ?? 'playwright'
  const { chromium } = await import(driver)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  /**
   * Send every API request the page makes to the wrong world instead.
   *
   * THE CHANNEL IS NOT SENT ANYWHERE. `GET /api/events` is a stream the browser app holds open on
   * every page on purpose, so `route.fetch` on it never settles; when the browser closed, that
   * pending fetch rejected with nobody awaiting it and ended this command before its cleanup could
   * run. Problem `ew8aIrRksYaS`.
   *
   * IT IS ABORTED RATHER THAN PASSED THROUGH, and that is not tidiness. `src/web/lib/channel.ts`
   * reads the world header off the stream's first reply and announces a disagreement on it. A
   * stream answered by the canonical world while every other reply came from the copy would put
   * the RIGHT world in front of the page's own check, and case 3 below — a page answered end to end
   * by the copy — would then be reporting a difference this command did not make. No case here is
   * about the channel, and a page with no channel draws no banner of its own.
   *
   * EVERY HANDLER SWALLOWS A DISPOSAL. A request can still be in flight when the route is taken
   * off or the browser goes away, and Playwright then refuses the fulfil. That is ordinary; what it
   * must never be is the end of this process.
   */
  const sendTheApiElsewhere = async () => {
    await page.route('**/api/**', async (route) => {
      try {
        const moved = new URL(route.request().url())
        if (moved.pathname.endsWith('/api/events')) {
          await route.abort()
          return
        }
        const response = await route.fetch({ url: `${wrongApi}${moved.pathname}${moved.search}` })
        await route.fulfill({ response })
      } catch {
        // The page or the browser went away while this request was in flight. See the note above.
      }
    })
  }

  try {
    // 1 — the stack as it is.
    await page.goto(`${web}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1500)
    const asItIs = await whatThePageSaid(page)
    report(1, 'the browser app as it is', 'nothing about the world; the page usable', asItIs)
    if (asItIs.banner !== null) failures += 1

    // 1b — AND WHAT THE HEALTH CHECK SAYS ABOUT EACH OF THE TWO SERVERS.
    //
    // Both are meant to be healthy here, and for different reasons. The canonical stack is the real
    // one. The wrong-world server is a throwaway on a port of its own, and a throwaway working
    // properly is not a fault — the fault is a throwaway answering where the real one should be,
    // which is what the sentence below reports when it happens.
    const healthHere = await healthAt(api)
    const healthThere = await healthAt(wrongApi)
    say('')
    say('1b. what GET /api/health says about each server')
    for (const [where, reading] of [
      [api, healthHere],
      [wrongApi, healthThere],
    ]) {
      if (reading === null) {
        say(`   ${where} — nothing readable answered.`)
        failures += 1
        continue
      }
      const standing = reading.world === null ? 'no world on the body' : reading.world.standing.kind
      say(`   ${where} — ok: ${String(reading.ok)}, standing: ${standing}`)
      for (const line of reading.wrong) say(`      ${line}`)
    }
    if (healthHere === null || !healthHere.ok) {
      say('   THE CANONICAL STACK IS NOT ANSWERING HEALTHY. That is the control, and it should be.')
      failures += 1
    }
    if (healthThere !== null && healthThere.world === null) {
      say('   THE HEALTH REPLY CARRIES NO WORLD. It must carry one always, healthy or not.')
      failures += 1
    }

    // 2 — the API switched under an open page.
    await sendTheApiElsewhere()
    await page.goto(`${web}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(2000)
    const switched = await whatThePageSaid(page)
    report(2, 'the API switched under the open page', 'the banner names the database, and blocks the page', switched)
    if (switched.banner === null || !switched.blocked) failures += 1

    // 3 — a page whose whole life is against the copy, opened on the canonical address.
    await page.goto(`${web}/?negative-control=copy#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(2500)
    const wholePage = await whatThePageSaid(page)
    report(
      3,
      'a page opened on this address, answered from end to end by the copy',
      'the banner names the database behind this page, and blocks the page',
      wholePage,
    )
    if (wholePage.banner === null || !wholePage.blocked) failures += 1
    await page.unroute('**/api/**')

    // 4 — a stale stamp, served.
    const theStampModule = (url) => url.pathname.includes('virtual:mole-office-served')
    await page.route(theStampModule, async (route) => {
      try {
      const response = await route.fetch()
      const original = await response.text()
      const then = new Date(Date.now() - 60 * 60 * 1000)
      const pad = (n) => String(n).padStart(2, '0')
      const stamp =
        `${String(then.getFullYear())}-${pad(then.getMonth() + 1)}-${pad(then.getDate())} ` +
        `${pad(then.getHours())}:${pad(then.getMinutes())}:${pad(then.getSeconds())}`
      await route.fulfill({
        response,
        body: original.replace(/export const servedAt = "[^"]*"/, `export const servedAt = ${JSON.stringify(stamp)}`),
      })
      } catch {
        // The page or the browser went away while this request was in flight.
      }
    })
    await page.goto(`${web}/?negative-control=stamp#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // LONG ENOUGH FOR THE GRACE TO RUN OUT. The page draws nothing about old code until the
    // staleness has lasted longer than MOLE_OFFICE_STALE_CODE_GRACE, and then it asks once more.
    // The grace is read off the health reply rather than assumed, because it is a setting.
    await sleep(((healthHere?.grace ?? 15) + 4) * 1000)
    const stale = await whatThePageSaid(page)
    report(4, 'a stamp from an hour ago, served to the page', 'the banner names the code this page is running', stale)
    if (stale.banner === null || !stale.blocked) failures += 1
    await page.unroute(theStampModule)

    /**
     * 5 — THE SAME THING OVER THE NETWORK: A PAGE THAT CAME IN ON THE ADDRESS FOR OTHER MACHINES.
     *
     * Criterion R4 of design/ground/ACCEPTANCE.md section 7. Cases 1 to 4 are all about a page on
     * 127.0.0.1, and a page that arrived from somewhere else is the question problem 19 asks. It is
     * the same two readings in the same order — nothing when the world is right, the banner when it
     * is not — asked of a page served on the other address.
     *
     * IT DOES NOT NEED A SECOND MACHINE and it is not pretending to be one. What it proves is that
     * the page's own check survives the trip: the page came in on a different address, its API is
     * reached through that address, and the world header is readable there. A machine that is not
     * this one is the human act under R5, and this command says so rather than implying otherwise.
     *
     * UNSET IS A SKIP AND NEVER A PASS. Every installation has this off until somebody sets it.
     */
    const forOtherMachines = declared.otherMachines
    if (forOtherMachines === null) {
      reportSkipped(
        5,
        'a page that came in on the address for other machines, answered by the copy',
        'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is not set, so nothing is served to another machine and ' +
          'there is no second address to open the page on. Set it in .env and restart the stack to run this case.',
      )
    } else {
      const remoteWeb = forOtherMachines.webAddress
      let remoteAnswers = false
      try {
        remoteAnswers = (await fetch(`${remoteWeb}/`, { signal: AbortSignal.timeout(4000) })).ok
      } catch {
        remoteAnswers = false
      }
      if (!remoteAnswers) {
        // NOT A SKIP. The declaration names this address, so nothing answering there is a fault:
        // either the running stack was started before the line was added, or a door failed to open.
        say('')
        say('5. a page that came in on the address for other machines, answered by the copy')
        say(`   expected: the browser app to answer at ${remoteWeb}, because the declaration names that address`)
        say(`   NOTHING ANSWERED THERE. Either this stack was started before the line was added to .env, or the`)
        say('   browser app could not open its door. Restart the stack and look for the "other machines" line.')
        failures += 1
      } else {
        // 5a — the right world, over the other address. It must be as silent as case 1 was.
        await page.goto(`${remoteWeb}/?negative-control=remote-right#/`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await sleep(2000)
        const remoteRight = await whatThePageSaid(page)
        report(
          5,
          `a page opened on ${remoteWeb}, the address for other machines, with nothing wrong`,
          'nothing about the world; the page usable',
          remoteRight,
        )
        if (remoteRight.banner !== null) failures += 1

        // 5b — and the same page answered from end to end by the copy. This is the negative control.
        await sendTheApiElsewhere()
        await page.goto(`${remoteWeb}/?negative-control=remote-copy#/`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await sleep(2500)
        const remoteWrong = await whatThePageSaid(page)
        report(
          6,
          `a page opened on ${remoteWeb} and answered from end to end by the copy`,
          'the banner names the database behind this page, and blocks the page',
          remoteWrong,
        )
        if (remoteWrong.banner === null || !remoteWrong.blocked) failures += 1
        await page.unroute('**/api/**')
      }
    }
  } finally {
    // THE ROUTES COME OFF BEFORE THE BROWSER GOES, so a request still in flight is refused by a
    // handler that is still there to catch the refusal rather than by a context that has gone.
    await page.unroute('**/api/**').catch(() => {})
    await browser.close().catch((err) => {
      say(`The browser would not close: ${err instanceof Error ? err.message : String(err)}.`)
    })
  }
} finally {
  // STOP WHAT WAS STARTED, BY GROUP. This is the same function every other way out of this command
  // reaches, and it reads the kernel rather than assuming.
  if (!stopWhatThisCommandStarted('the run is over')) failures += 1
  // AND THE PORT ITSELF, which is what act 3 of section 4 of design/ground/ACCEPTANCE.md asks to
  // see. A gone process group and a free port are two readings, and this command takes both.
  if ((await worldAt(wrongApi)) === null) {
    say(`${wrongApi} is free again.`)
  } else {
    say(`SOMETHING IS STILL ANSWERING ON ${wrongApi}, after the group this command started has gone.`)
    failures += 1
  }
}

say('')
if (skipped > 0) {
  say(`${String(skipped)} case${skipped === 1 ? '' : 's'} did not run. The lines above say why, and a case nobody`)
  say('could run is not a case that passed.')
}
if (failures === 0) {
  say('Every case that ran said what it should: the wrong world was detected each time, the right one was')
  say('silent, and the health check carried the world on its body for both of them.')
  process.exit(0)
}
say(`${String(failures)} of the cases did not say what it should. The lines above are what really happened.`)
process.exit(1)
