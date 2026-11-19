#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { refuseToRemoveIfAnybodyIsIn } from './live-processes.mjs'
/**
 * THE PROOF HARNESS FOR ROUND NINE. It runs a named proof against a running Mole Office and prints one
 * line per proof saying what it measured on the screen.
 *
 *     node tools/accept.mjs                      start an instance of its own, run every proof, stop it
 *     node tools/accept.mjs --only P-rail,P-jump run some of them
 *     node tools/accept.mjs --against <web> --api <api>   use an instance somebody else started
 *     node tools/accept.mjs --record-baseline    write down today's result as the pre-step baseline
 *     node tools/accept.mjs --self-test          prove the four refusals fire, on four specimen proofs
 *
 * WHY IT EXISTS. This repository has 295 test files and not one of them asserts anything about what
 * is on a screen. Round eight passed its own acceptance tests and left the owner looking at the same
 * defects, because the tests asserted what was STORED. Two rules follow, they are §1.2 of
 * design/ROUND-NINE-PLAN.md, and this file is where they are enforced rather than promised:
 *
 *   1. Never a percentage, a ratio, a character count or a count of elements as a proof. The record
 *      page already answers 95.6 % of its pixels and every answer is wrong. A share is maximised by
 *      the wrapper that produces the defect.
 *   2. Assert what is DRAWN and what a person CAN DO, never what is stored. "The annotation stores a
 *      target" is true of every failing case in the failure matrix.
 *
 * WHAT A PROOF IS. One object with `{id, what, needs, run(screen, api, fixture)}`, and `run` returns
 * `{state: 'held' | 'broken', measured, evidence}`. `state` is the ASSERTION's result and nothing
 * else: the verdict printed beside the id is worked out by the harness, because a proof that names
 * its own verdict can name itself passed. The mapping from one to the other is `verdictFor` below.
 *
 * THE FOUR REFUSALS, each enforced here and not in the proof:
 *
 *   REFUSED   — the proof declares a measurement that is a share, a ratio, or a count of elements
 *               carrying an attribute. `run` is never called.
 *   WEAK      — the run read an API reply and never read the screen. It never counts toward done.
 *   TOO-WEAK  — the assertion holds, and the recorded baseline says it also held on the pre-step
 *               tree. A proof that was already passing before the step proves nothing about it.
 *   UNPROVEN  — the assertion holds, and either no baseline was ever recorded for it, or no mutation
 *               was recorded that broke it. A run that never started looks exactly like a run that
 *               failed, and a test that would pass with its feature deleted is not a test.
 *
 * UNPROVEN AND TOO-WEAK REPLACE A PASS, NEVER A FAIL. A failing measurement needs no mutation to be
 * believed: the thing it asserts is visibly absent and the number beside it says by how much. It is
 * the passes that have to earn it.
 *
 * WHERE IT RUNS. Against an instance started by the worktree recipe in
 * design/ROUND-NINE-CAMPAIGN-LOG.md — its own git worktree, its own node_modules link, its own
 * VACUUM INTO copy of the corpus — and never against the owner's dev server on 8787 and 5173. It
 * refuses those two ports by number. It stops what it started from a `finally`, because a proof tool
 * that leaks a server is a poor joke; this project has had five orphaned-process incidents.
 *
 * WHY THE ROUTE LIST IS PARSED. `FLAT_ROUTES` in src/web/components/router.tsx is the one place the
 * set of pages is written down. A copy here would go stale the day a page is added, and the harness
 * would then prove nothing about the route that appeared. A proof names routes by NAME and the
 * harness resolves the address; a proof naming a route the router does not have is REFUSED.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { recordPrefixFrom } from './read-the-router.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { canonicalDatabasePath, settings as declaredSettings } from '../src/config/settings.mjs'
// HOW A COPY IS EMPTIED OF KEY HASHES, REWRITTEN AND SEARCHED, declared once for every program that
// copies the database.
import { emptyAndScrub, hashesLeftAfterAtMostOneRewrite, keyHashesACopyIsSearchedFor } from '../src/config/what-a-copy-must-not-carry.mjs'
import { fileNameStamp, localStamp } from '../src/shared/time.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, '.logs', 'accept')
const BASELINE = join(OUT, 'baseline.json')
const ROUTER = join(ROOT, 'src', 'web', 'components', 'router.tsx')
/**
 * AND WHERE THE GRAMMAR THE ROUTER USED TO HOLD NOW LIVES.
 *
 * FLAT_ROUTES and the `Route` union moved to src/shared/addresses.ts on 9 September 2026, so the
 * write door could read them as well as the shell (criterion M97). `recordPath` stayed in the
 * router. `readRoutes` below reads the two as one string, because they are one declaration split by
 * which program may import it.
 */
const ADDRESSES = join(ROOT, 'src', 'shared', 'addresses.ts')
/**
 * The owner's own servers. Never started, never stopped, never written to.
 *
 * Read from src/config/settings.mjs rather than written out, so that moving either port in `.env`
 * moves the list of ports this harness protects. Written out, the two would have been the ports their
 * stack used to be on.
 */
const THEIR_PORTS = [declaredSettings().apiPort, declaredSettings().webPort]

// ============================================================================ the route list

/**
 * Every page the app has, read out of the router, plus the address a record page lives at.
 *
 * Two independent statements of the same fact are compared, exactly as tools/review.mjs does it:
 * `FLAT_ROUTES` gives the addresses and the `Route` union gives the names. A restructure that the
 * pattern still matches but no longer reads whole would otherwise leave this harness quietly proving
 * things about a shorter app.
 */
function readRoutes() {
  const source = [ADDRESSES, ROUTER].map((file) => readFileSync(file, 'utf8')).join('\n\n')
  const block = source.match(/const FLAT_ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (block === null) {
    throw new Error(
      `Could not find FLAT_ROUTES in ${ADDRESSES}. That map is where this harness reads the list of ` +
        `pages from. Teach this parser the new shape — do not hand-copy a page list into tools/accept.mjs.`,
    )
  }
  const routes = new Map([['home', '#/']])
  for (const entry of block[1].matchAll(/^\s*([A-Za-z0-9_$]+):\s*'([^']+)'/gm)) routes.set(entry[2], `#/${entry[1]}`)
  if (routes.size === 1) throw new Error(`FLAT_ROUTES in ${ADDRESSES} was found but read as empty.`)

  // The `Route` union is an independent statement of the same fact, and comparing the two is what
  // catches a restructure the pattern above still matches but no longer reads whole. A member that
  // declares a REQUIRED value beside its name — `{ name: 'record'; id: string }` — has no address of
  // its own and is not expected in the map; one whose extra values are all optional does.
  const union = source.match(/export type Route =([\s\S]*?)\n\n/)
  if (union === null) throw new Error(`Could not find the \`Route\` union in ${ADDRESSES}.`)
  const members = [...union[1].matchAll(/\{\s*name:\s*'([^']+)'([^}]*)\}/g)].map((m) => ({
    name: m[1],
    carriesSomething: /[A-Za-z_$][\w$]*\s*:/.test(m[2]),
  }))
  const declared = members.map((m) => m.name)
  const missed = members
    .filter((m) => !m.carriesSomething && !routes.has(m.name) && m.name !== 'unknown')
    .map((m) => m.name)
  if (missed.length > 0) {
    throw new Error(
      `The router declares pages this harness found no address for: ${missed.join(', ')}. ` +
        `Teach it how to reach them rather than letting proofs quietly skip a page.`,
    )
  }
  // `recordPath` returns the part after the hash — `/r/<id>` — because every link in the app writes
  // the hash itself. The harness navigates with whole addresses, so the hash is put back here once.
  // The parser is tools/read-the-router.mjs and is shared with tools/review.mjs and
  // tools/legibility.mjs; this file used to hold a third copy of it and all three broke together.
  const read = recordPrefixFrom(source, ROUTER)
  const prefix = read.startsWith('#') ? read : `#${read}`
  return { flat: routes, declared, recordPrefix: prefix }
}

// ============================================================================ the first refusal

/**
 * The kinds of number a proof may measure, and the kinds it may not.
 *
 * A proof declares its measurements before it runs, and a declaration naming a banned kind is
 * refused with `run` never called. The ban is not a naming convention: `elementsWithAttribute` is
 * refused by kind, and a `count` whose subject mentions an attribute selector is refused too, which
 * is the shape the banned proof actually arrives in — `document.querySelectorAll('[data-target]').length`.
 *
 * A character delta, a share or a count may still appear inside `evidence`. §1.2 allows that
 * explicitly. It may never be the thing the verdict rests on, which is what `measures` declares.
 */
const MEASURE_KINDS = new Set(['px', 'ms', 'count', 'identity', 'text', 'bool', 'key'])
const BANNED_KINDS = new Set(['share', 'ratio', 'percent', 'percentage', 'coverage', 'elementsWithAttribute'])
const ATTRIBUTE_COUNTING = /\[data-|getAttribute|querySelectorAll|\bdata-target\b/

function refusalFor(proof, routes) {
  if (!Array.isArray(proof.measures) || proof.measures.length === 0) {
    return `${proof.id} declares no measurements, so nothing can be checked before it runs.`
  }
  for (const one of proof.measures) {
    if (BANNED_KINDS.has(one.kind)) {
      return `${proof.id} rests on a ${one.kind} (${one.name}). A share is maximised by the wrapper that produces the defect; §1.2 refuses it.`
    }
    if (!MEASURE_KINDS.has(one.kind)) {
      return `${proof.id} declares the measurement ${one.name} as "${one.kind}", which is not one of ${[...MEASURE_KINDS].join(', ')}.`
    }
    if (one.kind === 'count' && ATTRIBUTE_COUNTING.test(String(one.of ?? ''))) {
      return `${proof.id} counts elements carrying an attribute (${one.name}: ${one.of}). §1.2 refuses it — an attribute count says nothing about what is drawn.`
    }
  }
  for (const name of proof.needs?.routes ?? []) {
    if (!routes.flat.has(name)) {
      return `${proof.id} needs the route "${name}" and the router has no such page. The routes are ${[...routes.flat.keys()].join(', ')}.`
    }
  }
  return null
}

/** A run may not smuggle in a measurement it did not declare, nor one named as a share. */
function measuredIsHonest(proof, measured) {
  const declared = new Set(proof.measures.map((m) => m.name))
  for (const key of Object.keys(measured ?? {})) {
    if (/share|ratio|percent|coverage|%/i.test(key)) return `returned a measurement called "${key}"`
    if (!declared.has(key)) return `returned an undeclared measurement "${key}"`
  }
  return null
}

// ============================================================================ the verdict

/** The verdict for one run. The proof says whether its assertion held; everything else is here. */
function verdictFor({ proof, result, readScreen, usedApi, baseline, mutations }) {
  if (result.error !== undefined) return { verdict: 'ERROR', why: result.error }
  if (!readScreen) {
    return {
      verdict: 'WEAK',
      why: usedApi
        ? 'read an API reply and never read the screen, so it asserts what is stored'
        : 'read neither the screen nor an API reply',
    }
  }
  if (result.state === 'broken') return { verdict: 'FAIL', why: result.why ?? 'the assertion did not hold' }
  if (result.state !== 'held') return { verdict: 'ERROR', why: `run returned state "${String(result.state)}"` }

  // THE CONTROL IS THE ONE PROOF ALLOWED TO PASS ON THE PRE-STEP TREE, because that is its entire
  // job: it says the harness, the instance and the browser worked. It still has to break under its
  // own mutation, so it cannot pass by doing nothing.
  if (proof.role !== 'control') {
    const was = baseline?.proofs?.[proof.id]
    if (was === undefined) {
      return { verdict: 'UNPROVEN', why: 'nothing recorded says this ever failed, so passing says nothing' }
    }
    if (was.verdict !== 'FAIL') {
      return { verdict: 'TOO-WEAK', why: `it also held on the pre-step tree (baseline ${was.verdict})` }
    }
  }
  const broke = mutations.filter((m) => m.broke)
  if (mutations.length === 0) return { verdict: 'UNPROVEN', why: 'no mutation was recorded, so nothing shows it can fail' }
  if (broke.length !== mutations.length) {
    const survived = mutations.filter((m) => !m.broke).map((m) => m.name)
    return { verdict: 'UNPROVEN', why: `the assertion survived a mutation that should break it: ${survived.join(', ')}` }
  }
  return { verdict: 'PASS', why: `broke under ${broke.map((m) => m.name).join(', ')}` }
}

// ============================================================================ the instance

function q(command, label, cwd) {
  const out = spawnSync(process.execPath, [join(ROOT, 'tools', 'q.mjs'), '--label', label, ...command], {
    cwd: cwd ?? ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const said = String(out.stdout ?? '') + String(out.stderr ?? '')
  if (out.status !== 0) throw new Error(`${label} failed:\n${said.slice(0, 2000)}`)
  return said
}

async function portIsFree(port) {
  return await new Promise((ok) => {
    const probe = createServer()
    probe.on('error', () => ok(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => ok(true)))
  })
}

/**
 * A Mole Office of this harness's own, in its own worktree, on its own copy of the corpus.
 *
 * The recipe is design/ROUND-NINE-CAMPAIGN-LOG.md's, and every line of it is load-bearing:
 * `tools/isolated-mole-office.mjs` copies the DATABASE and shares the CODE, so an instance started from
 * this checkout runs whatever another agent is editing right now. The worktree is what isolates the
 * code. The symlink is what stops a five-minute npm install. `VACUUM INTO` is what stops a `cp`
 * silently handing back an older database, because Mole Office runs SQLite in WAL mode.
 */
function startInstance() {
  const ref = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  const name = `accept-${String(process.pid)}`
  const place = resolve(ROOT, '..', `mole-office-wt-${name}`)
  if (existsSync(place)) throw new Error(`${place} is already there. Remove it, or stop the run that owns it.`)

  q(['git', 'worktree', 'add', '--detach', place, ref], 'accept-worktree')
  symlinkSync(join(ROOT, 'node_modules'), join(place, 'node_modules'))
  copyTheCorpusInto(place, canonicalDatabasePath())
  q(['node', 'tools/isolated-mole-office.mjs', 'start', name], 'accept-instance-start', place)
  const where = JSON.parse(readFileSync(join(place, '.logs', 'isolated', name, 'where.json'), 'utf8'))
  if (THEIR_PORTS.includes(where.apiPort) || THEIR_PORTS.includes(where.webPort)) {
    throw new Error(`The instance took one of the owner's ports (${where.apiPort}, ${where.webPort}). Nothing was run.`)
  }
  // §1.5's acceptance, checked rather than assumed: both servers must be running IN the worktree.
  for (const pid of [where.apiPgid, where.webPgid]) {
    const cwd = spawnSync('readlink', [`/proc/${String(pid)}/cwd`], { encoding: 'utf8' }).stdout.trim()
    if (cwd !== place) throw new Error(`Process ${String(pid)} is running in ${cwd}, not in the worktree ${place}.`)
  }
  return { ...where, place, ref, mine: true }
}

/**
 * COPY THE CORPUS INTO THE WORKTREE'S data/ FOLDER, WITH NO KEY HASH IN IT.
 *
 * The world is started from this copy, and tools/isolated-mole-office.mjs makes its own copy of it,
 * empties that one and serves it. This first copy stays in the worktree until `stopInstance` removes
 * the worktree, and a run that fails before then leaves it there. So it is emptied of the tables and columns a
 * copy must not carry, and searched for every key hash of `source` right after it is made (and rewritten
 * once with `VACUUM INTO` when the search still finds one), with the same functions the backup and the
 * world's copy use. From the end of `VACUUM INTO` to the end of the emptying, it holds the key hashes as rows.
 *
 * THE SOURCE'S HASHES ARE READ ON BOTH SIDES OF THE COPY, as the backup and the world's copy read them: the
 * canonical database may be the live office, and a key or a visitor token it holds when the copy is made and has
 * removed by the search is in the copy all the same, so it is searched for too.
 *
 * FAILS CLOSED. A copy that cannot be emptied, or in which a key hash of the source is still found,
 * is deleted, and this throws, so no world is started from it. The message gives a count, never a
 * hash. The source is only ever opened read-only.
 *
 * BOTH FILES ARE NAMED FROM THE DECLARATION. The caller passes the database this checkout calls
 * canonical; the copy takes its name from the source rather than being spelled again here.
 */
export function copyTheCorpusInto(place, source) {
  const pairingRefusal1 = whyThisCheckoutMayNotOpenTheDatabase(source)
  if (pairingRefusal1 !== null) throw new Error(pairingRefusal1)
  const copy = join(place, 'data', basename(source))
  const destinationRefusal = whyThisCheckoutMayNotOpenTheDatabase(copy)
  if (destinationRefusal !== null) throw new Error(destinationRefusal)
  mkdirSync(dirname(copy), { recursive: true })
  const hashes = theSourcesHashes(source)
  // THE COPY IS MADE IN THIS PROCESS. It used to be a `node -e` line quoted for a shell, run through
  // tools/q.mjs; q.mjs runs no shell since 25 September 2026, so the quotes reached node as part of the
  // script and no copy was made. VACUUM INTO reads the source read-only, write-ahead log included.
  const from = new Database(source, { readonly: true, fileMustExist: true })
  try {
    from.prepare('VACUUM INTO ?').run(copy)
  } finally {
    from.close()
  }
  const removeTheCopy = () => {
    for (const file of [copy, `${copy}-wal`, `${copy}-shm`]) rmSync(file, { force: true })
  }
  try {
    const pairingRefusal2 = whyThisCheckoutMayNotOpenTheDatabase(copy)
    if (pairingRefusal2 !== null) throw new Error(pairingRefusal2)
    const opened = new Database(copy, { fileMustExist: true })
    try {
      emptyAndScrub(opened)
    } finally {
      opened.close()
    }
  } catch (err) {
    removeTheCopy()
    throw new Error(`The copy at ${copy} could not be emptied of key hashes, so it was deleted: ${err.message}`)
  }
  // The visitors' token hashes are searched for too: `emptyAndScrub` cleared them in the copy, as it
  // does in every copy, and the world started from this one does not need them.
  theSourcesHashes(source, hashes)
  let left
  try {
    ;({ left } = hashesLeftAfterAtMostOneRewrite(copy, hashes, (file) => new Database(file, { readonly: true, fileMustExist: true })))
  } catch (err) {
    removeTheCopy()
    throw new Error(`The copy at ${copy} could not be searched for key hashes or rewritten, so it was deleted: ${err.message}`)
  }
  if (left > 0) {
    removeTheCopy()
    throw new Error(
      `${String(left)} of the ${String(hashes.size)} key hash${hashes.size === 1 ? '' : 'es'} it searched for ` +
        `${left === 1 ? 'is' : 'are'} still in the bytes of the copy at ${copy} after it was emptied and rewritten once with VACUUM INTO, so it was deleted.`,
    )
  }
  return copy
}

/**
 * Every key hash and visitor token hash `source` holds, opened read only, added to `into` when it is given.
 * @param {string} source
 * @param {Set<string>} [into]
 * @returns {Set<string>}
 */
function theSourcesHashes(source, into) {
  const original = new Database(source, { readonly: true, fileMustExist: true })
  try {
    return keyHashesACopyIsSearchedFor(original, into)
  } finally {
    original.close()
  }
}

async function stopInstance(instance) {
  if (instance === null || instance.mine !== true) return
  try {
    q(['node', 'tools/isolated-mole-office.mjs', 'stop', instance.name], 'accept-instance-stop', instance.place)
  } finally {
    // A DIRECTORY WITH A LIVE PROCESS IN IT IS NOT REMOVED. The check lives once, in
    // tools/live-processes.mjs. It used to be reached through the resource-lease design, which their decision of
    // 11 September 2026 withdrew. The check itself stays and asks the operating system
    // directly, needing no office and no network.
    refuseToRemoveIfAnybodyIsIn(instance.place)
    q(['git', 'worktree', 'remove', '--force', instance.place], 'accept-worktree-remove')
  }
  for (const port of [instance.apiPort, instance.webPort]) {
    if (!(await portIsFree(port))) throw new Error(`Port ${String(port)} is still held after stopping ${instance.name}.`)
  }
}

// ============================================================================ what a proof is handed

/**
 * The screen, and the fact that the proof looked at it.
 *
 * Every method that READS what is drawn sets `readScreen`. Navigating and pressing do not: a proof
 * that presses a control and then checks only the API reply is still a proof about storage, and the
 * second refusal is there to catch exactly that.
 */
function screenFor(page, note) {
  const seen = { readScreen: false }
  const read = (value) => {
    seen.readScreen = true
    return value
  }
  return {
    seen,
    /**
     * Go to an address, and mean it.
     *
     * GOING TO THE ADDRESS YOU ARE ALREADY ON MUST RELOAD. Mole Office is one document with the page in
     * the hash, so a `goto` to the same address is a same-document navigation: no new document, no
     * fresh state, and — the reason this cost an hour — no init script, so a mutation installed
     * between two runs of the same proof never ran and the proof read as unbreakable.
     */
    async goto(address) {
      if (page.url() === address) await page.reload({ waitUntil: 'load' })
      else await page.goto(address, { waitUntil: 'load' })
    },
    async waitFor(selector, ms = 90_000) {
      await page.waitForSelector(selector, { timeout: ms })
    },
    async wait(ms) {
      await page.waitForTimeout(ms)
    },
    async click(selector) {
      await page.click(selector)
    },
    async pressAt(x, y, button = 'left') {
      await page.mouse.click(Math.round(x), Math.round(y), { button })
    },
    async dragFrom(x1, y1, x2, y2) {
      await page.mouse.move(Math.round(x1), Math.round(y1))
      await page.mouse.down()
      await page.mouse.move(Math.round(x2), Math.round(y2), { steps: 12 })
      await page.mouse.up()
    },
    async fill(selector, text) {
      await page.fill(selector, text)
    },
    async viewport(width, height) {
      await page.setViewportSize({ width, height })
    },
    /** Read something off the rendered page. THIS is what makes a proof a proof. */
    async read(fn, arg) {
      return read(await page.evaluate(fn, arg))
    },
    async drawnText(selector) {
      return read(await page.evaluate((s) => document.querySelector(s)?.innerText ?? null, selector))
    },
    async shot(name) {
      mkdirSync(OUT, { recursive: true })
      const file = join(OUT, `${note}-${name}.png`)
      await page.screenshot({ path: file, fullPage: false })
      return read(file)
    },
    /** For anything the wrapper has no word for. Counts as reading the screen, deliberately. */
    get raw() {
      seen.readScreen = true
      return page
    },
  }
}

/** The API, and the fact that the proof asked it something. */
function apiFor(base, workspace) {
  const seen = { usedApi: false }
  const call = async (method, path, body) => {
    seen.usedApi = true
    const reply = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': workspace,
        // The caller's own key and name when it holds a key; 'accept.mjs' when it holds none.
        ...anAgentsToolHeaders({ withoutAKey: 'accept.mjs' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const said = await reply.text()
    try {
      return { status: reply.status, body: JSON.parse(said) }
    } catch {
      return { status: reply.status, body: said }
    }
  }
  return {
    seen,
    base,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
  }
}

// ============================================================================ the fixture

const SAYS_WORDS = 'accept.mjs — this comment quotes words.'
const SAYS_NOTHING = 'accept.mjs — this comment quotes nothing.'

/**
 * A review that is collecting, with two comments in it: one that quoted words and one that did not.
 *
 * IT IS WRITTEN THROUGH THE PRODUCT, not through the API. A comment posted straight to
 * `POST /api/records` would prove that the API accepts a span, which is a fact about storage and is
 * true of every failing case in the matrix. The gestures here are the ones the owner made: drag
 * across a paragraph and right-click inside the selection; and right-click on the page's own chrome
 * with nothing selected, which is how their two stored comments came to be about the whole record.
 *
 * IT WRITES TO A COPY AND ONLY EVER TO A COPY. §1.6: nothing a tester files reaches data/panelx.db.
 */
async function buildFixture(screen, api, web, routes) {
  const reports = await api.get('/api/records?kind=report&shape=full')
  const blocksOf = (r) => (Array.isArray(r.data?.blocks) ? r.data.blocks.length : 0)
  if ((reports.body.records ?? []).some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error('The report list was cut to the narrow rows, so no report page could be chosen from its blocks.')
  }
  const report = [...(reports.body.records ?? [])].sort((a, b) => blocksOf(b) - blocksOf(a))[0]
  if (report === undefined) throw new Error('No report record in the corpus copy, so no report page to point at.')

  const address = `${web}/${routes.recordPrefix}${report.id}`  // recordPrefix already carries its hash
  await screen.goto(address)
  await screen.waitFor('article.rp')
  await screen.wait(1500)

  // A review must be collecting, or a comment written on this page joins nothing.
  const reviews = await api.get('/api/reviews')
  const collecting = (reviews.body.reviews ?? []).find(
    (one) => one.state === 'collecting' && one.entry?.target?.recordId === report.id,
  )
  await screen.click('.px-review-switch')
  await screen.wait(700)
  if (collecting === undefined) {
    await screen.raw.click('.px-pane button:has-text("Start a review here")')
    await screen.wait(1200)
  } else {
    await openTheCollectingReview(screen)
  }

  const write = async (place, words) => {
    if (place === 'inside one paragraph') {
      const box = await screen.read(() => {
        const el = document.querySelector('[data-text-field][data-text-offset="0"]:not([data-text-field="title"]):not([data-text-field="summary"])')
        if (el === null) return null
        el.scrollIntoView({ block: 'center' })
        return null
      })
      void box
      await screen.wait(500)
      const r = await screen.read(() => {
        const el = document.querySelector('[data-text-field][data-text-offset="0"]:not([data-text-field="title"]):not([data-text-field="summary"])')
        const box = el.getBoundingClientRect()
        return { x: box.x, y: box.y, w: box.width }
      })
      await screen.dragFrom(r.x + 6, r.y + 10, r.x + Math.min(300, r.w - 20), r.y + 10)
      await screen.pressAt(r.x + 120, r.y + 10, 'right')
    } else {
      await screen.read(() => {
        window.scrollTo(0, 0)
        window.getSelection()?.removeAllRanges()
        return null
      })
      await screen.wait(400)
      const at = await screen.read(() => {
        const a = document.querySelector('article.rp').getBoundingClientRect()
        return { x: Math.round(a.right - 60), y: Math.round(Math.min(window.innerHeight - 80, a.top + 400)) }
      })
      await screen.pressAt(at.x, at.y, 'right')
    }
    await screen.wait(900)
    const box = await screen.raw.$('textarea[aria-label="What you want to say"]')
    if (box === null) throw new Error(`No composer opened for the fixture comment ${place}.`)
    await box.fill(words)
    await screen.wait(300)
    const add = await screen.raw.$('.px-overlays button:has-text("Add to review")')
    if (add === null) throw new Error('The composer offered no way to add the comment to the review.')
    await add.click()
    await screen.wait(1300)
  }

  await write('inside one paragraph', SAYS_WORDS)
  await write('on the page chrome', SAYS_NOTHING)

  // What was actually stored, read back so a fixture that half-worked stops the run instead of
  // quietly making every proof below it meaningless.
  const written = await api.get('/api/records?kind=annotation&shape=full')
  if ((written.body.records ?? []).some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error('The annotation list was cut to the narrow rows, so the fixture comments could not be read back.')
  }
  const mine = (written.body.records ?? []).filter((r) => r.data?.body === SAYS_WORDS || r.data?.body === SAYS_NOTHING)
  const quoted = mine.find((r) => r.data.body === SAYS_WORDS)
  const bare = mine.find((r) => r.data.body === SAYS_NOTHING)
  if (quoted === undefined || bare === undefined) throw new Error('The fixture did not store both comments.')
  // WHAT IS STORED IS A PLACE, NOT A SPAN. Step 20 opened that door and step 19's capture fills it:
  // a comment made on chosen words records a place naming those words, and one made with nothing
  // chosen records a place saying no words were chosen rather than recording nothing at all. The
  // span is derived from the place by one function and is no longer sent beside it, because a
  // context carrying both is one fact in two fields, free to name two different sets of words.
  const placeOfQuoted = quoted.data.context.place
  const placeOfBare = bare.data.context.place
  if (placeOfQuoted === undefined) throw new Error('The fixture comment that should quote words recorded no place.')
  if (placeOfQuoted.at !== 'words') {
    throw new Error(`The fixture comment that should quote words recorded a place at "${placeOfQuoted.at}", not at its words.`)
  }
  if (placeOfBare === undefined) throw new Error('The fixture comment that should quote nothing recorded no place at all.')
  if (placeOfBare.at === 'words') throw new Error('The fixture comment that should quote nothing recorded a place at some words.')
  return {
    recordId: report.id,
    address,
    quotedId: quoted.id,
    bareId: bare.id,
    quote: placeOfQuoted.span.quote,
    saysWords: SAYS_WORDS,
    saysNothing: SAYS_NOTHING,
  }
}

// ---------------------------------------------------------------- pressing a comment in the pane

/**
 * Open the review that is still collecting, by the word the pane draws on its row.
 *
 * Not "the first row": the pane lists every review of the project, and pressing whichever one
 * happens to be newest would put the proofs in front of a finished review on a day somebody
 * finishes one. The row says which state it is in, so the row is what is read.
 */
async function openTheCollectingReview(screen) {
  // ALREADY INSIDE ONE? The pane's own head says which state the open review is in. Without this a
  // second run of a proof — which is what a mutation is — walks into a pane that is already showing
  // a review's comments, finds no row that starts with a state word, and dies saying the product
  // lists no review. The mutated run then reads as "it broke" with the assertion never tested.
  const head = await screen.raw.$('.px-pane-count')
  if (head !== null && (await head.innerText()).startsWith('Collecting')) return
  const rows = await screen.raw.$$('.px-pane .px-rev-go')
  if (rows.length === 0) throw new Error('The review pane lists no review, so no review can be opened.')
  for (const row of rows) {
    if (!(await row.innerText()).startsWith('Collecting')) continue
    await row.click()
    await screen.wait(1200)
    return
  }
  throw new Error('No review in the pane is collecting, so a comment written now would join nothing.')
}

/** Open the record page and the review pane, ready to press a saved comment. */
async function openThePane(screen, fixture) {
  await screen.goto(fixture.address)
  await screen.waitFor('article.rp')
  await screen.wait(1500)
  // THE CONTROL IS A SWITCH, so pressing it when the pane is already open shuts it. A proof run a
  // second time — which is what a mutation is — would then look for its rows in a pane it had just
  // closed.
  if ((await screen.raw.$('.px-pane')) === null) {
    await screen.click('.px-review-switch')
    await screen.wait(700)
  }
  await openTheCollectingReview(screen)
}

/**
 * Press the saved comment whose words are `body`, and say what the row said before and after.
 *
 * `waitMs` is how long to wait before reading the row again, and a caller that wants to know when a
 * mark appeared says so rather than inheriting a number. It was 1,400 ms for everybody, which is
 * inside the 2,600 ms window the mark used to live in, so every proof in this file was reading at a
 * moment nothing had chosen.
 */
async function pressTheComment(screen, body, waitMs = 1400) {
  const rows = await screen.raw.$$('.px-pane .px-rev-item')
  for (const row of rows) {
    const said = await row.innerText()
    if (!said.includes(body)) continue
    const before = said
    const go = await row.$('.px-rev-go')
    await go.click()
    await screen.wait(waitMs)
    const after = await row.innerText().catch(() => '(the row went)')
    return { before: before.replace(/\n/g, ' · '), after: after.replace(/\n/g, ' · ') }
  }
  throw new Error(`No row in the review pane holds the comment "${body.slice(0, 40)}".`)
}

/**
 * PRESS A COMMENT THIS HARNESS DID NOT WRITE: the nth row under `Not in it`.
 *
 * Every comment the owner's finding was written about is outside the open review, was written days
 * ago, and carries no place — and `buildFixture` can produce none of those three, because it writes
 * its comments seconds earlier, into the open review, through a gesture that now always records a
 * place. A proof that only ever presses its own fixture is a proof about the fixture.
 *
 * It is chosen by the group it sits under and never by an id, so this stays a proof about the
 * product and not about one corpus. A copy holding no such comment stops the branch with a
 * sentence saying exactly that, rather than passing quietly.
 */
async function pressTheRowOutsideTheReview(screen, nth) {
  const rows = await screen.raw.$$('.px-pane .px-rev-item[data-in="0"]')
  const row = rows[nth]
  if (row === undefined) return null
  const before = await row.innerText()
  const go = await row.$('button.px-rev-go')
  if (go === null) return { words: before.split('\n')[0].trim(), before, after: before, pressed: false }
  await go.click()
  await screen.wait(1400)
  const after = await row.innerText().catch(() => '(the row went)')
  return {
    words: before.split('\n')[0].trim().slice(0, 60),
    before: before.replace(/\n/g, ' · '),
    after: after.replace(/\n/g, ' · '),
    pressed: true,
  }
}

/** What the page is drawing about the comment somebody just pressed. All of it read off the screen. */
const WHAT_IS_MARKED = () => {
  const marked = [...document.querySelectorAll('[data-target]')]
    .filter((e) => {
      const style = getComputedStyle(e)
      return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) > 0
    })
    .map((e) => {
      const box = e.getBoundingClientRect()
      return { target: e.getAttribute('data-target'), height: Math.round(box.height), top: Math.round(box.top) }
    })
  const registry = CSS.highlights
  const held = registry === undefined ? undefined : registry.get('mole-office-showing')
  const lit =
    held === undefined
      ? []
      : [...held].map((range) => {
          const box = range.getBoundingClientRect()
          const all = range.toString()
          return {
            words: all.slice(0, 80),
            // THE WHOLE OF WHAT IS LIT, AND WHETHER EVEN THIS IS ALL OF IT. A proof that compares
            // the lit text with the comment's stored quote has to compare all of both; comparing a
            // cut of one with the whole of the other is a test that passes on a prefix. `cut` says
            // when the comparison cannot honestly be made at all.
            whole: all.slice(0, 4000),
            cut: all.length > 4000,
            rects: range.getClientRects().length,
            top: Math.round(box.top),
            // HOW TALL THE LIT WORDS ARE, which is the honest answer to "is the mark smaller than
            // the record". The reading it replaces was the number zero written by hand.
            height: Math.round(box.height),
          }
        })
  // WHERE THE MARK NOW LIVES. A place that names no words is drawn as a rectangle in the mark
  // layer — a rail beside one line, a dashed frame round a whole thing — and not as an outline on
  // the element carrying the key. Reading only the outline would have this harness report "nothing
  // marks it" about a page with a mark on it. The demand is unchanged: what it READS moved.
  const drawn = [...document.querySelectorAll('.px-subject > i')]
    .filter((e) => e.getAttribute('data-why') === 'shown')
    .map((e) => {
      const box = e.getBoundingClientRect()
      return {
        mark: String(e.className).replace('px-subject-', ''),
        edge: e.getAttribute('data-edge'),
        height: Math.round(box.height),
        top: Math.round(box.top),
      }
    })
  const article = document.querySelector('article.rp')
  return {
    lit,
    marked,
    drawn,
    scrollY: Math.round(window.scrollY),
    viewport: window.innerHeight,
    recordHeight: article === null ? null : Math.round(article.getBoundingClientRect().height),
    recordTarget: article === null ? null : article.getAttribute('data-target'),
  }
}

/**
 * WHAT THE REVIEW ROW SAYS BESIDE ITS CONTROL AFTER A PRESS, and whether a person would see it.
 *
 * The row's own words are the comment. What is drawn beside the `More` control is the outcome of
 * the last press on that row, and for a comment that named no place inside the record it is the
 * only honest answer the product has. Reading it needs three separate facts and not one: what it
 * said, whether the words are inside the window, and whether anything is drawn on top of them. A
 * word that is in the document and behind the pane is not a word a person read.
 */
const WHAT_THE_ROW_SAYS = (pick) => {
  // WHICH ROW, ASKED IN THE TWO WAYS A CALLER CAN KNOW ONE. A comment this harness wrote is found
  // by its own words; a comment it did not write is found by where the pane draws it. The reading
  // below is the same reading either way, because whether a person can see the word cannot depend
  // on which heading the row sits under.
  const rows = [...document.querySelectorAll(pick.outside === undefined ? '.px-pane .px-rev-item' : '.px-pane .px-rev-item[data-in="0"]')]
  const row = pick.outside === undefined ? rows.find((one) => (one.innerText ?? '').includes(pick.body)) : rows[pick.outside]
  if (row === undefined) return null
  const acts = row.querySelector('.px-rev-acts')
  const beside =
    acts === null
      ? []
      : [...acts.children].filter(
          (e) => e.tagName !== 'BUTTON' && e.querySelector('button') === null && (e.innerText ?? '').trim() !== '',
        )
  const el = beside[0]
  if (el === undefined) return { words: '', detail: '', top: null, seen: false, where: 'the row said nothing beside its control' }
  const box = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const inside =
    box.width > 0 &&
    box.height > 0 &&
    box.bottom > 0 &&
    box.top < window.innerHeight &&
    box.right > 0 &&
    box.left < window.innerWidth &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    parseFloat(style.opacity) > 0.05
  const midX = Math.min(window.innerWidth - 1, Math.max(0, box.left + box.width / 2))
  const midY = Math.min(window.innerHeight - 1, Math.max(0, box.top + box.height / 2))
  const at = inside ? document.elementFromPoint(midX, midY) : null
  const onTop = at !== null && (at === el || el.contains(at) || at.contains(el))
  return {
    words: (el.innerText ?? '').trim().slice(0, 60),
    // THE SENTENCE BEHIND THE WORD. §8's vocabulary is a word with its detail on demand, so a word
    // with nothing behind it is either a state this pane has no table for or a transient. Any of
    // the three carriers counts: the whole point is that a person can get the longer answer.
    detail: (el.getAttribute('title') ?? el.getAttribute('aria-label') ?? el.querySelector('.px-sr')?.textContent ?? '')
      .trim()
      .slice(0, 140),
    top: Math.round(box.top),
    seen: inside && onTop,
    where: !inside
      ? 'outside the window'
      : !onTop
        ? 'inside the window with something drawn over it'
        : `in the review pane, ${Math.round(box.top)} px down the window`,
  }
}

/**
 * THE MUTATIONS A PROOF CAN MAKE, ALL INSTALLED ONCE, WITH ONE OF THEM ON AT A TIME.
 *
 * Playwright's init scripts accumulate and cannot be removed, and the harness runs a proof's
 * mutations one after another on the same page. So a second mutation would run with the first still
 * installed, and a proof with two branches would record its second mutation as breaking the
 * assertion when the first one had already broken it. That is a mutation proving nothing, dressed
 * as a mutation proving something.
 *
 * One script holds every mutation and reads which one is on out of `localStorage`, which survives a
 * reload and is rewritten before each one. Absent, nothing is mutated, so an ordinary run is
 * untouched.
 */
const MUTATION_KEY = 'accept.mjs mutation'
const ARMED = new WeakSet()

const THE_MUTATIONS = () => {
  let which = null
  try {
    which = localStorage.getItem('accept.mjs mutation')
  } catch {
    which = null
  }
  if (which === 'no mark on the words') {
    // The wash over chosen words is a range in the browser's highlight registry. Deleting it needs
    // a clock: the registry is not the document, so nothing observes a change to it.
    const put = () => {
      try {
        CSS.highlights?.delete('mole-office-showing')
      } catch {
        /* the engine has no registry, and then there was nothing to light */
      }
      for (const el of document.querySelectorAll('.px-subject > i')) el.remove()
    }
    if (CSS.highlights !== undefined) CSS.highlights.set = () => CSS.highlights
    new MutationObserver(put).observe(document, { childList: true, subtree: true })
    setInterval(put, 60)
    put()
  }
  if (which === 'no word on the review row') {
    const strip = () => {
      for (const el of document.querySelectorAll('.px-rev-acts .px-rev-stands, .px-rev-acts .px-rev-stale')) el.remove()
    }
    new MutationObserver(strip).observe(document, { childList: true, subtree: true })
    strip()
  }
  if (which === 'the mark goes out on a clock') {
    // THE 2,600 ms TIMER PUT BACK, which is what the product did until 20 August 2026: whatever a
    // press draws is taken off the screen a moment later and never comes back. Nothing else is
    // changed — the right words are lit, on screen, for two and a half seconds. A proof that reads
    // once, early, cannot tell this product from the one that keeps its mark, which is why the
    // lifetime is now read three times and asserted.
    let armed = false
    const goOut = () => {
      armed = false
      const registry = CSS.highlights
      if (registry !== undefined) registry.delete('mole-office-showing')
      for (const el of document.querySelectorAll('.px-subject > i')) el.remove()
    }
    const watch = () => {
      if (armed) return
      const registry = CSS.highlights
      const lit = registry === undefined ? undefined : registry.get('mole-office-showing')
      if (lit === undefined && document.querySelectorAll('.px-subject > i').length === 0) return
      armed = true
      setTimeout(goOut, 2600)
    }
    setInterval(watch, 100)
  }
}

/** Turn one mutation on, and every other one off, then reload so the script runs from the start. */
async function mutateTo(screen, name) {
  if (!ARMED.has(screen)) {
    ARMED.add(screen)
    await screen.raw.addInitScript(THE_MUTATIONS)
  }
  await screen.raw.evaluate(([key, value]) => localStorage.setItem(key, value), [MUTATION_KEY, name])
  await screen.raw.reload()
}

/** Whitespace made ordinary, so two readings of the same words can be compared. */
function flat(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether a row answered with one of §8's words rather than with a sentence.
 *
 * One reader, because two branches of one proof ask it of two rows, and a rule written twice is the
 * defect this repository keeps finding: the branch that pressed the fixture and the branch that
 * pressed a comment nobody here wrote would drift into asking for different things.
 */
function oneWord(word) {
  return word !== '' && !word.includes('.') && word.split(/\s+/).length <= 4
}

/**
 * WHICH REVIEW IS COLLECTING ON THE THING THE FIXTURE POINTS AT, asked of the server.
 *
 * The pane draws the comments a review left out in the order this route sends them, so a branch
 * that presses the nth of those rows has to choose n from the same reply the pane drew from. Asking
 * the screen which row holds a comment with no place is not possible: not having a place is a
 * stored fact and the row is where that fact has no visible consequence, which is the defect.
 */
async function theCollectingReview(api, fixture) {
  const reviews = await api.get('/api/reviews')
  const one = (reviews.body.reviews ?? []).find(
    (r) => r.state === 'collecting' && r.entry?.target?.recordId === fixture.recordId,
  )
  if (one === undefined) {
    throw new Error('No review is collecting on the record the fixture points at, so nothing can say what it left out.')
  }
  return one.id
}

// ============================================================================ the proofs

const PROOFS = [
  {
    id: 'P-self',
    what: 'the record page draws the record title that is stored, and stops drawing it when it is hidden',
    role: 'control',
    needs: { routes: ['records'], viewport: { width: 1440, height: 1000 }, fixture: true },
    measures: [
      { name: 'titleDrawn', kind: 'text', of: 'the words the record page draws as its title' },
      { name: 'titleStored', kind: 'text', of: 'the title field of the same record' },
    ],
    /**
     * WHY A PROOF THAT IS MEANT TO PASS IS IN THE LIST. If all five campaign proofs print FAIL and
     * nothing prints PASS, a browser that never loaded the app looks exactly like a product that is
     * broken. This one is the control run: it passes today, it breaks under its own mutation, and it
     * is the line that says the harness, the instance and the browser all worked.
     */
    mutations: [
      {
        name: 'paint over the title',
        /**
         * IT PAINTS OVER THE TITLE RATHER THAN HIDING IT, and that is not a detail. `display: none`
         * does not work as a mutation here: the HTML specification says `innerText` falls back to
         * `textContent` for an element that is not being rendered, so hiding the title leaves the
         * reading unchanged and the mutation silently does nothing. Changing the drawn words is the
         * mutation that actually tests the assertion.
         */
        install: async (screen) => {
          await screen.raw.addInitScript(() => {
            const instead = 'accept.mjs painted over this title'
            const paint = () => {
              for (const el of document.querySelectorAll('[data-text-field="title"]')) {
                if (el.textContent !== instead) el.textContent = instead
              }
            }
            new MutationObserver(paint).observe(document, { childList: true, subtree: true })
            paint()
          })
        },
      },
    ],
    async run(screen, api, fixture) {
      await screen.goto(fixture.address)
      await screen.waitFor('article.rp')
      await screen.wait(1200)
      const drawn = await screen.read(() => {
        const el = document.querySelector('[data-text-field="title"]')
        return el === null ? '' : el.innerText.trim()
      })
      const reply = await api.get(`/api/records/${fixture.recordId}`)
      const stored = String(reply.body?.record?.title ?? reply.body?.title ?? '')
      const held = drawn !== '' && stored.startsWith(drawn.replace(/…$/, ''))
      return {
        state: held ? 'held' : 'broken',
        why: held ? undefined : `the page drew "${drawn}" where the record holds "${stored.slice(0, 40)}"`,
        measured: { titleDrawn: drawn.slice(0, 60), titleStored: stored.slice(0, 60) },
        evidence: { readWith: 'innerText, so a hidden element reads as no words at all' },
      }
    },
  },

  {
    id: 'P-rail',
    what: 'a comment that named words lights those exact words and keeps them lit, and a comment that named no place says so in a word on screen — in the review and outside it',
    needs: { routes: ['records'], viewport: { width: 1440, height: 1000 }, fixture: true },
    /**
     * IT PRESSES BOTH COMMENTS, BECAUSE THE FINDING HAS TWO CASES AND NOT TWO ALTERNATIVES.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT THIS PROOF USED TO ASK, AND WHY IT WAS WRONG
     * ---------------------------------------------------------------------------------------
     *
     * Owner finding, `ROUND-NINE-FAILURE-MATRIX.md` row 12: *saved Review comments are not visibly
     * anchored at their source*. The falsifier written beside it in the same row has two halves:
     *
     *   "The mark for a saved comment is on screen within one viewport of it and identifies less
     *    than the whole record — OR the pane says in a word that no place was recorded."
     *
     * This proof carried only the first half, and it pressed the fixture comment that recorded a
     * place of `{at:'surface'}` — a comment about the whole record. So it asked the product to mark
     * a part of a record that the comment does not name, which is a false statement about what the
     * comment is about, and the second rule of §1.2 refuses exactly that. It failed every day it
     * ran, and two agents in a row correctly declined to make it pass. It was the proof that was
     * wrong.
     *
     * The two halves are not a choice. They are the two kinds of comment:
     *
     *   a comment that named words        -> the words are marked, on screen, and the mark
     *                                        identifies less than the whole record
     *   a comment that named no place     -> the pane says so in a word, where a person sees it
     *     finer than the thing
     *
     * So both are asserted, each against the comment it is true of, and BOTH must hold. A
     * disjunction one branch can satisfy alone would pass on the easy half and prove nothing about
     * the other: the fixture holds one comment of each kind and this proof presses both.
     *
     * WHAT IT NO LONGER ASKS: that a comment about a whole record be marked more narrowly than the
     * record. Nothing asks for that now, and nothing should. `design/round-nine/is-p-rail-right.md`
     * holds the decision, the evidence for it, and what each of the two refusing agents got right.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT THE BASELINE ENTRY UNDER THIS ID MEANS, NOW THAT THE ASSERTION HAS CHANGED
     * ---------------------------------------------------------------------------------------
     *
     * `.logs/accept/baseline.json` holds `P-rail: FAIL` against tree `c895d66`, measured with the
     * old assertion. **This assertion also failed on that tree, and the same recorded run says so:**
     * P-jump pressed the same bare comment on the same tree and measured `rowSaidBefore` and
     * `rowSaidAfter` byte-identical — the pane said nothing about where, so the second branch had
     * nothing to hold on to. The first branch is not covered by that baseline: P-light's entry from
     * the same run shows the quoted comment's words were already lit at `c895d66`, and nothing
     * recorded says whether they were on screen. So branch one rests on its mutation, which is what
     * a mutation is for, and branch two rests on the baseline as well.
     *
     * The baseline entry was NOT rewritten to fit the new assertion, and this proof was not
     * re-measured on `c895d66`, because it cannot be: `buildFixture` stops the run unless both
     * comments come back carrying a stored `place`, and `place` did not exist in the corpus or the
     * kind declaration until step 20. A fixture that cannot be built produces no measurement.
     */
    measures: [
      { name: 'markedForTheQuote', kind: 'identity', of: 'what the page marked after pressing the comment that named words' },
      { name: 'markedHeightPx', kind: 'px', of: 'how tall that mark is' },
      { name: 'recordHeightPx', kind: 'px', of: 'how tall the whole record is' },
      { name: 'markTopFromWindowTopPx', kind: 'px', of: 'how far down the window the mark starts' },
      { name: 'viewportPx', kind: 'px', of: 'the window' },
      { name: 'theMarkedWords', kind: 'text', of: 'the whole of the lit text, against the whole of the quote the comment stored' },
      { name: 'stillTheQuoteAtMs', kind: 'ms', of: 'the last moment after the press at which the comment’s own words were still lit' },
      { name: 'wordForNoPlace', kind: 'text', of: 'what the pane said after pressing the comment that named no place' },
      { name: 'wordDrawnAt', kind: 'identity', of: 'where a person would read that word, or why they would not' },
      { name: 'commentNobodyHereWrote', kind: 'text', of: 'the first words of the comment outside the review that this proof pressed' },
      { name: 'whatItsRowSaid', kind: 'text', of: 'what that row said about where it points, after the press' },
      { name: 'whereItsRowSaidIt', kind: 'identity', of: 'where a person would read that, or why they would not' },
    ],
    /**
     * ONE MUTATION PER BRANCH, and neither can stand in for the other.
     *
     * The first takes the mark off the quoted words and leaves the pane alone; the second takes the
     * word off the review row and leaves the mark alone. Both must break the assertion, so a proof
     * that held because one half of the product works and the other was never looked at cannot
     * read PASS. `mutateTo` is why they do not accumulate.
     */
    mutations: [
      {
        name: 'no mark on the words',
        install: async (screen) => {
          await mutateTo(screen, 'no mark on the words')
        },
      },
      {
        name: 'no word on the review row',
        install: async (screen) => {
          await mutateTo(screen, 'no word on the review row')
        },
      },
      {
        name: 'the mark goes out on a clock',
        install: async (screen) => {
          await mutateTo(screen, 'the mark goes out on a clock')
        },
      },
    ],
    async run(screen, api, fixture) {
      await openThePane(screen, fixture)

      // ---- the comment that named words: those words are lit, on screen, and they stay lit ----
      //
      // THREE READINGS AT THREE MOMENTS, AND ALL THREE HAVE TO SAY THE SAME THING. This proof read
      // once, at about 1,400 ms, and what it read was on a 2,600 ms timer nobody had decided on. So
      // the pass depended on when it happened to look: a product whose mark is a two-and-a-half
      // second flash satisfied a proof whose own words are "visibly anchored at their source".
      const pressedQuote = await pressTheComment(screen, fixture.saysWords, 400)
      const atOnce = await screen.read(WHAT_IS_MARKED)
      await screen.wait(1000)
      const state = await screen.read(WHAT_IS_MARKED)
      await screen.wait(4600)
      const later = await screen.read(WHAT_IS_MARKED)

      const quoted = flat(fixture.quote)
      // WHAT IS LIT, AND WHETHER IT IS THIS COMMENT'S OWN WORDS, worked out in one place so that a
      // reading with nothing lit and a reading lighting somebody else's sentence cannot be confused
      // for one another. A lit run too long to read whole is neither: it says so and fails, because
      // comparing a cut of one string with the whole of another is a test that passes on a prefix.
      const theLitWords = (reading) => {
        const one = reading.lit.find((r) => r.rects > 0) ?? null
        if (one === null) return { words: null, why: 'nothing is lit' }
        if (one.cut) return { words: null, why: 'the lit run is longer than this harness reads, so it cannot be compared with the quote' }
        return { words: flat(one.whole), why: '' }
      }
      const isTheQuote = (reading) => quoted !== '' && theLitWords(reading).words === quoted
      const lit = state.lit.find((one) => one.rects > 0) ?? null

      // WHAT WAS DRAWN INSTEAD, WHEN THE WORDS WERE NOT LIT. It is measured and reported, and it is
      // never accepted. An auditor built a product answering a comment that named words with a
      // frame round the block containing them — the owner's second finding put back word for word —
      // and the version of this proof that took any mark "smaller than the record and near the top
      // of the window" printed PASS on it three times and survived both its own mutations. The mark
      // for words is the wash on those words. Nothing stands in for it, and no ladder of nearly-as-
      // good marks is walked, because the thing this row is about is which words a comment is on.
      const rect = state.drawn[0] ?? null
      const outline = state.marked.find((one) => one.target !== state.recordTarget) ?? state.marked[0] ?? null
      const markedThing =
        lit !== null
          ? 'the quoted words'
          : rect !== null
            ? `the ${rect.mark} on the thing, and no words lit`
            : outline === null
              ? 'nothing'
              : `an outline on ${outline.target}, and no words lit`
      const markHeight = lit !== null ? lit.height : rect !== null ? rect.height : (outline?.height ?? null)
      const markTop = lit !== null ? lit.top : rect !== null ? rect.top : (outline?.top ?? null)
      const smaller = lit !== null && state.recordHeight !== null && lit.height < state.recordHeight
      const near = lit !== null && Math.abs(lit.top) <= state.viewport
      const said = theLitWords(state)
      const itsOwnWords = said.words === null ? said.why : said.words === quoted ? 'yes' : 'no'
      // THE LAST MOMENT THE COMMENT'S OWN WORDS WERE STILL LIT. Zero means they never were.
      const stillTheQuoteAtMs = isTheQuote(later) ? 6000 : isTheQuote(state) ? 1400 : isTheQuote(atOnce) ? 400 : 0
      const marksTheWords = isTheQuote(atOnce) && isTheQuote(state) && isTheQuote(later) && smaller && near

      // ---- the comment that named no place: the pane says so, in a word, where it is read ----
      const pressedBare = await pressTheComment(screen, fixture.saysNothing)
      // The pane looks for the place before it can say what it found, so the word arrives after the
      // press settles rather than with it.
      await screen.wait(900)
      const row = await screen.read(WHAT_THE_ROW_SAYS, { body: fixture.saysNothing })
      const word = row === null ? '' : row.words
      const cameFromThePress = flat(pressedBare.before) !== flat(pressedBare.after)
      const saysNoPlace = row !== null && oneWord(word) && row.seen && row.detail !== '' && cameFromThePress

      // ---- a comment nobody here wrote: a row outside the review can say where it points ----
      //
      // WHY THIS BRANCH EXISTS. `buildFixture` writes both comments above itself, seconds earlier,
      // into the open review, through a gesture that always records a place. Every comment the
      // owner's finding was written about is outside all three of those conditions: their two are
      // days old, sit under `Not in it` because their review began after they were written, and carry
      // no place because places did not exist yet. Pressing one of them did nothing at all and said
      // nothing at all — measured on their own data on 20 August 2026 — while this proof was green.
      //
      // IT IS CHOSEN FROM THE STORED FACTS AND PRESSED ON THE SCREEN. The route that tells the pane
      // what it left out is asked which of those comments recorded no place, and the row at that
      // position is pressed. A corpus copy with no such comment stops the branch with a sentence
      // saying exactly that: a branch that quietly passed when it had nothing to press would be the
      // hole this whole proof was corrected for.
      const collecting = await theCollectingReview(api, fixture)
      const notInIt = await api.get(`/api/reviews/${encodeURIComponent(collecting)}/not-in-it`)
      const rowsOutside = notInIt.body.rows ?? []
      const nth = rowsOutside.findIndex((one) => one.context !== null && typeof one.context === 'object' && one.context.place == null)
      const outside = nth < 0 ? null : await pressTheRowOutsideTheReview(screen, nth)
      await screen.wait(900)
      const outsideRow = outside === null || !outside.pressed ? null : await screen.read(WHAT_THE_ROW_SAYS, { outside: nth })
      const outsideWord = outsideRow === null ? '' : outsideRow.words
      const outsideAnswered = outsideRow !== null && oneWord(outsideWord) && outsideRow.seen && outsideRow.detail !== ''

      return {
        state: marksTheWords && saysNoPlace && outsideAnswered ? 'held' : 'broken',
        why: !marksTheWords
          ? itsOwnWords === 'no'
            ? `the comment quoted "${quoted.slice(0, 40)}" and the page lit "${String(said.words).slice(0, 40)}"`
            : lit === null
              ? `nothing on screen lights the words the comment quoted: what was drawn is ${markedThing}`
              : itsOwnWords !== 'yes'
                ? itsOwnWords
                : !smaller
                  ? `the lit run is ${String(markHeight)} px, which is the whole record, for a comment that named words inside it`
                  : !near
                    ? `the lit words are ${String(markTop)} px from the top of a ${String(state.viewport)} px window, so they are off screen`
                    : `the words were lit and went out: the comment's own words were last lit ${String(stillTheQuoteAtMs)} ms after the press`
          : !saysNoPlace
            ? row === null
              ? 'the review pane holds no row for the comment that named no place'
              : word === ''
                ? `the row said nothing about where: ${row.where}`
                : !row.seen
                  ? `the row said "${word}" ${row.where}`
                  : !oneWord(word)
                    ? `the row answered with a sentence rather than a word: "${word}"`
                    : row.detail === ''
                      ? `the row said "${word}" with nothing behind it, so a person cannot find out what it means`
                      : 'the row said the same thing after the press as before it, so the word is not an answer to it'
            : nth < 0
              ? 'this copy of the corpus holds no comment outside the review that recorded no place, so the branch that presses a comment nobody here wrote had nothing to press'
              : outside === null || !outside.pressed
                ? 'the row for a comment outside the review draws no press, so there is no way to reach it'
                : outsideRow === null
                  ? 'the pane draws no row at that position, so what the press did cannot be read'
                  : outsideWord === ''
                    ? `the row outside the review said nothing about where it points: ${outsideRow.where}`
                    : !outsideRow.seen
                      ? `the row outside the review said "${outsideWord}" ${outsideRow.where}`
                      : !oneWord(outsideWord)
                        ? `the row outside the review answered with a sentence rather than a word: "${outsideWord}"`
                        : `the row outside the review said "${outsideWord}" with nothing behind it, so a person cannot find out what it means`,
        measured: {
          markedForTheQuote: markedThing,
          markedHeightPx: markHeight,
          recordHeightPx: state.recordHeight,
          markTopFromWindowTopPx: markTop,
          viewportPx: state.viewport,
          theMarkedWords: `${String(said.words).slice(0, 40)} · the comment's own words: ${itsOwnWords}`,
          stillTheQuoteAtMs,
          wordForNoPlace: word === '' ? 'nothing' : word,
          wordDrawnAt: row === null ? 'there is no such row' : row.where,
          commentNobodyHereWrote: outside === null ? 'there is none in this copy' : outside.words,
          whatItsRowSaid: outsideWord === '' ? 'nothing' : outsideWord,
          whereItsRowSaidIt: outsideRow === null ? 'there is no such row' : outsideRow.where,
        },
        evidence: {
          landedAtScrollY: state.scrollY,
          litAt400ms: theLitWords(atOnce).words ?? theLitWords(atOnce).why,
          litAt6000ms: theLitWords(later).words ?? theLitWords(later).why,
          quoteRowSaid: pressedQuote.after.slice(0, 110),
          bareRowSaid: pressedBare.after.slice(0, 110),
          behindTheWord: row === null ? '' : row.detail,
          rowOutsideSaid: outside === null ? '' : outside.after.slice(0, 110),
          behindThatWord: outsideRow === null ? '' : outsideRow.detail,
        },
      }
    },
  },

  {
    id: 'P-jump',
    what: 'pressing a saved comment identifies the exact place it was written about, or says in a word that no place was recorded',
    needs: { routes: ['records'], viewport: { width: 1440, height: 1000 }, fixture: true },
    measures: [
      { name: 'whatIdentifiesTheSource', kind: 'identity', of: 'what on screen says where the comment was written' },
      { name: 'litWords', kind: 'text', of: 'the words the page lit, if any' },
      { name: 'rowSaidBefore', kind: 'text', of: 'the review row before the press' },
      { name: 'rowSaidAfter', kind: 'text', of: 'the same row after it' },
    ],
    /**
     * IT TAKES AWAY THE ONE WORD, AND LEAVES EVERYTHING ELSE ALONE.
     *
     * The comment this proof presses was made on a whole record: it names no words, so nothing on
     * the page can light them and nothing about how a comment is stored will ever change that. What
     * this proof asserts is the other half of the failure matrix's falsifier — the pane says, in a
     * word, that no place finer than the thing was recorded. So the mutation removes exactly that
     * word from the row and nothing else, which is the product as it was on 20 August 2026: the
     * page scrolled, an edge was drawn down both sides of a nineteen-screen article, and the row
     * read afterwards exactly what it read before.
     *
     * It is the same technique as the control proof's own mutation — watch the document and undo
     * the drawing — because a browser cannot delete a component.
     */
    mutations: [
      {
        name: 'take the end-state word off the review row',
        install: async (screen) => {
          await screen.raw.addInitScript(() => {
            const strip = () => {
              for (const el of document.querySelectorAll('.px-rev-acts .px-rev-stands, .px-rev-acts .px-rev-stale')) {
                el.remove()
              }
            }
            new MutationObserver(strip).observe(document, { childList: true, subtree: true })
            strip()
          })
          await screen.raw.reload()
        },
      },
    ],
    async run(screen, api, fixture) {
      await openThePane(screen, fixture)
      const row = await pressTheComment(screen, fixture.saysNothing)
      const state = await screen.read(WHAT_IS_MARKED)
      const litHere = state.lit.filter((one) => one.rects > 0)
      const outlineIsTheWholeRecord = state.marked.every((one) => one.target === state.recordTarget)
      const paneSaidSomethingNew = row.before !== row.after
      const identified =
        litHere.length > 0 ? 'the words it quoted' : !outlineIsTheWholeRecord && state.marked.length > 0 ? 'an outline smaller than the record' : paneSaidSomethingNew ? 'a word in the review pane' : 'nothing'
      return {
        state: identified === 'nothing' ? 'broken' : 'held',
        why: 'the page outlined the containing record and the pane said the same thing after the press as before it',
        measured: {
          whatIdentifiesTheSource: identified,
          litWords: litHere.map((one) => one.words).join(' / ') || 'nothing is lit',
          rowSaidBefore: row.before.slice(0, 110),
          rowSaidAfter: row.after.slice(0, 110),
        },
        evidence: { outlined: state.marked, landedAtScrollY: state.scrollY },
      }
    },
  },

  {
    id: 'P-light',
    what: 'pressing one comment and then another leaves only the second one lit, 800 ms later',
    needs: { routes: ['records'], viewport: { width: 1440, height: 1000 }, fixture: true },
    measures: [
      { name: 'litAfterFirstPress', kind: 'text', of: 'the words lit after pressing the comment that quotes words' },
      { name: 'litAfterSecondPress', kind: 'text', of: 'the words still lit 800 ms after pressing the comment that quotes nothing' },
      { name: 'waitedMs', kind: 'ms', of: 'how long after the second press the reading was taken' },
    ],
    /**
     * IT PUTS OUT THE ONE MECHANISM THE ASSERTION RESTS ON, AND NOTHING ELSE.
     *
     * Every path that stops showing a comment — the press that asks for a different one, the pane
     * clearing itself, the clock — ends in the same statement: delete the range from the browser's
     * highlight registry. So the mutation makes that one deletion do nothing, for that one registry
     * name, and leaves everything else alone. The second comment quotes nothing at all, so it never
     * writes a range of its own, and whatever is lit under it belongs to the first one.
     *
     * WHY THIS PROOF NEEDED A MUTATION MORE THAN MOST. It is the one proof here whose passing state
     * is an ABSENCE: nothing is lit. A browser that never ran the second press, a registry the
     * engine does not have, a highlight that failed to paint in the first place — all three look
     * exactly like the defect being fixed. The mutation is what tells the fix from the three.
     *
     * IT IS INSTALLED IN THE PAGE THAT IS ALREADY OPEN AS WELL AS IN THE NEXT ONE, and NOT by
     * reloading. This proof navigates to the address it is already on, and a hash router answers
     * that inside the page it is already showing — so an init script alone would never run. A
     * reload is the other way and it was tried first: it raced the review pane's own fetch and the
     * mutated run died opening the pane, which the harness would have recorded as "it broke" when
     * nothing about the assertion had been tested at all.
     */
    mutations: [
      {
        name: 'stop the shown comment’s light from ever going out',
        install: async (screen) => {
          const stopTheDelete = () => {
            const registry = CSS.highlights
            if (registry === undefined) return null
            const remove = registry.delete.bind(registry)
            registry.delete = (name) => (name === 'mole-office-showing' ? true : remove(name))
            return null
          }
          await screen.raw.addInitScript(stopTheDelete)
          await screen.read(stopTheDelete)
        },
      },
    ],
    async run(screen, api, fixture) {
      await openThePane(screen, fixture)
      await pressTheComment(screen, fixture.saysWords)
      const first = await screen.read(WHAT_IS_MARKED)
      await pressTheComment(screen, fixture.saysNothing)
      await screen.wait(800)
      const second = await screen.read(WHAT_IS_MARKED)
      const stillLit = second.lit.map((one) => one.words)
      return {
        state: stillLit.length === 0 ? 'held' : 'broken',
        why: `${String(stillLit.length)} range from the first comment is still lit under the second one`,
        measured: {
          litAfterFirstPress: first.lit.map((one) => one.words).join(' / ') || 'nothing',
          litAfterSecondPress: stillLit.join(' / ') || 'nothing',
          waitedMs: 800 + 1400,
        },
        evidence: {
          note: 'the second comment quotes nothing at all, so anything lit belongs to the first one',
          outlinedAfterSecond: second.marked,
        },
      }
    },
  },

  {
    id: 'P-compose',
    what: 'a right-click inside the composer keeps the half-written instruction, and the panel says which words it is about — the phrase when one was pointed at, and `Whole instruction` when none was',
    /*
     * WHAT THIS PROOF USED TO DEMAND, AND WHY THAT WAS WRONG. Corrected 2026-08-20; the argument is
     * in design/round-nine/step33-38-governance.md §4.
     *
     * It required the panel to be about the selected phrase after a right-click ELSEWHERE in the
     * box. Nothing asked for that. `ROUND-NINE-FAILURE-MATRIX.md` §2.13 states the defect as the
     * fallback `asked.span?.quote ?? body` widening the gesture to the whole instruction "WITH NO
     * NOTICE", and the matrix's own amendment 1 records that Chromium keeps a box selection when
     * the press lands inside it. Contract §6.8 then says what the other case draws: "the subject is
     * the whole instruction and the slot draws the mark `Whole instruction`."
     *
     * So widening is the correct answer for a press aimed away from the phrase, and the failure is
     * silence about it. What was measured on 20 August 2026 was not silence but something worse: a
     * sixty-character cut of the person's own sentence, drawn in quotation marks as the words they
     * had aimed at. This proof now asks for the mark, in both cases where no phrase was pointed at.
     */
    needs: { routes: ['records'], viewport: { width: 1440, height: 1000 }, fixture: true },
    measures: [
      { name: 'instructionAfterwards', kind: 'text', of: 'the half-written instruction after each right-click' },
      { name: 'subjectWhenPointedInside', kind: 'text', of: 'what the revise panel says it is about, right-clicked inside the selected phrase' },
      { name: 'subjectWhenPointedElsewhere', kind: 'text', of: 'the same, right-clicked elsewhere in the box while that phrase is selected' },
      { name: 'subjectWhenNothingSelected', kind: 'text', of: 'the same, right-clicked with nothing selected' },
      { name: 'saysWholeInstruction', kind: 'text', of: 'which of the three gestures drew the words `Whole instruction`' },
      { name: 'selectionAfterPointingElsewhere', kind: 'text', of: 'where the box selection ended up' },
    ],
    async run(screen, api, fixture) {
      const INSTRUCTION = 'Please create a Problem for the missing width contract and link it to round nine.'
      const PHRASE = 'create a Problem'

      const openComposer = async () => {
        await screen.goto(fixture.address)
        await screen.waitFor('article.rp')
        await screen.wait(1400)
        const at = await screen.read(() => {
          const el = document.querySelector('[data-text-field][data-text-offset="0"]:not([data-text-field="title"]):not([data-text-field="summary"])')
          el.scrollIntoView({ block: 'center' })
          return null
        })
        void at
        await screen.wait(400)
        const box = await screen.read(() => {
          const el = document.querySelector('[data-text-field][data-text-offset="0"]:not([data-text-field="title"]):not([data-text-field="summary"])')
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + 40), y: Math.round(r.y + 10) }
        })
        await screen.pressAt(box.x, box.y, 'right')
        await screen.wait(900)
        const composer = await screen.raw.$('textarea[aria-label="What you want to say"]')
        if (composer === null) throw new Error('No composer opened on the report paragraph.')
        await composer.fill(INSTRUCTION)
        await screen.wait(400)
        return screen.read(() => {
          const t = document.querySelector('textarea[aria-label="What you want to say"]')
          const r = t.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        })
      }

      const whatThePanelIsAbout = async () =>
        await screen.read(() => {
          const t = document.querySelector('textarea[aria-label="What you want to say"]')
          const panel = document.querySelector('textarea[aria-label="What to change about these words"]')
          const slot = panel === null ? null : panel.closest('.px-talk')
          const quote = slot === null ? null : slot.querySelector('.px-review-quote')
          // EVERY STATE WORD THE SLOT IS DRAWING, read from the slot rather than from the page, so
          // a word somewhere else on the screen cannot answer for this panel.
          const words = slot === null ? [] : [...slot.querySelectorAll('.px-talk-state')].map((el) => el.textContent.trim())
          return {
            instruction: t === null ? null : t.value,
            boxSelection: t === null ? null : [t.selectionStart, t.selectionEnd],
            subject: quote === null ? null : quote.textContent.replace(/^[“"]|[”"]$/g, '').trim(),
            says: words,
            panelOpen: panel !== null,
          }
        })

      // 1. right-click INSIDE the selected phrase
      let where = await openComposer()
      await screen.read(({ phrase }) => {
        const t = document.querySelector('textarea[aria-label="What you want to say"]')
        const from = t.value.indexOf(phrase)
        t.focus()
        t.setSelectionRange(from, from + phrase.length)
        return null
      }, { phrase: PHRASE })
      await screen.pressAt(where.x + 120, where.y + 12, 'right')
      await screen.wait(900)
      const inside = await whatThePanelIsAbout()

      // 2. right-click ELSEWHERE in the box, with the same phrase selected
      where = await openComposer()
      await screen.read(({ phrase }) => {
        const t = document.querySelector('textarea[aria-label="What you want to say"]')
        const from = t.value.indexOf(phrase)
        t.focus()
        t.setSelectionRange(from, from + phrase.length)
        return null
      }, { phrase: PHRASE })
      await screen.pressAt(where.x + 60, where.y + where.h - 14, 'right')
      await screen.wait(900)
      const elsewhere = await whatThePanelIsAbout()

      // 3. right-click with NOTHING selected
      where = await openComposer()
      await screen.read(() => {
        const t = document.querySelector('textarea[aria-label="What you want to say"]')
        t.focus()
        t.setSelectionRange(30, 30)
        return null
      })
      await screen.pressAt(where.x + 100, where.y + 12, 'right')
      await screen.wait(900)
      const nothing = await whatThePanelIsAbout()

      const WHOLE = 'Whole instruction'
      const keptTheInstruction = [inside, elsewhere, nothing].every((one) => one.instruction === INSTRUCTION)
      // 1. The phrase the person pointed AT is the subject when they pointed at one.
      const keptThePhrase = inside.subject === PHRASE
      // 2. The other two aimed at no phrase, so the panel has to SAY it is about the whole thing.
      const saidWhole = elsewhere.says.includes(WHOLE) && nothing.says.includes(WHOLE)
      // 3. And it may not quote anything, because a quotation claims these are the characters you
      //    chose. A cut of their own sentence in quotation marks is the measured failure.
      const quotedAnyway = elsewhere.subject !== null || nothing.subject !== null
      const held = keptTheInstruction && keptThePhrase && saidWhole && !quotedAnyway
      const saysWholeInstruction = ['inside', 'elsewhere', 'nothing']
        .filter((_, i) => [inside, elsewhere, nothing][i].says.includes(WHOLE))
        .join(', ')
      return {
        state: held ? 'held' : 'broken',
        why: !keptTheInstruction
          ? 'the half-written instruction did not survive'
          : !keptThePhrase
            ? 'a right-click inside the selected phrase did not keep it as the subject'
            : !saidWhole
              ? 'a right-click aiming at no phrase widened to the whole instruction without saying so'
              : 'the panel quotes words as though the person had aimed at them when they aimed at none',
        measured: {
          instructionAfterwards: keptTheInstruction ? 'unchanged, all three gestures' : 'changed',
          subjectWhenPointedInside: String(inside.subject),
          subjectWhenPointedElsewhere: String(elsewhere.subject),
          subjectWhenNothingSelected: String(nothing.subject),
          saysWholeInstruction: saysWholeInstruction === '' ? 'none of the three' : saysWholeInstruction,
          selectionAfterPointingElsewhere: JSON.stringify(elsewhere.boxSelection),
        },
        evidence: {
          phrasePointedAt: PHRASE,
          phraseWasAt: [7, 23],
          panelOpened: { inside: inside.panelOpen, elsewhere: elsewhere.panelOpen, nothing: nothing.panelOpen },
          everyStateWordDrawn: { inside: inside.says, elsewhere: elsewhere.says, nothing: nothing.says },
        },
      }
    },
    /*
     * THE MUTATION IS THE DRAWING THAT WAS THERE BEFORE, PUT BACK.
     *
     * The panel used to quote `shortenToWords(body)` — the first sixty characters of the person's
     * own instruction, in quotation marks, under the note "Showing the first words only." — for
     * every gesture that pointed at no phrase. This puts exactly that back: every state word the
     * slot draws is removed, and a quotation of the first sixty characters is put in its place.
     *
     * It is done in the page rather than in the source because the drawing is a branch inside a
     * React component, and a mutation that edited the file would be measuring a different build
     * from the one every other proof in this run measured.
     */
    mutations: [
      {
        name: 'put back the sixty-character cut of the instruction, drawn as a quotation',
        install: async (screen) => {
          await screen.raw.addInitScript(() => {
            const put = () => {
              for (const slot of document.querySelectorAll('.px-talk')) {
                if (slot.querySelector('textarea[aria-label="What to change about these words"]') === null) continue
                const words = [...slot.querySelectorAll('.px-talk-state')]
                if (words.length === 0) continue
                const box = document.querySelector('textarea[aria-label="What you want to say"]')
                const whole = box === null ? '' : box.value.trim()
                const cut = whole.length <= 60 ? whole : whole.slice(0, whole.slice(0, 60).lastIndexOf(' '))
                const quote = document.createElement('p')
                quote.className = 'px-review-quote'
                quote.textContent = `“${cut}”`
                words[0].replaceWith(quote)
                for (const rest of words.slice(1)) rest.remove()
              }
            }
            new MutationObserver(put).observe(document, { childList: true, subtree: true })
            put()
          })
        },
      },
    ],
  },

  {
    id: 'P-width',
    what: 'at 1920 with the review pane closed, every table in a report is as wide as its own column titles need',
    needs: { routes: ['records'], viewport: { width: 1920, height: 1000 }, fixture: true },
    measures: [
      { name: 'narrowestTableNeedsPx', kind: 'px', of: 'the width the worst table needs so no column is squeezed under its own title' },
      { name: 'thatTableIsGivenPx', kind: 'px', of: 'the width it is given' },
      { name: 'shortByPx', kind: 'px', of: 'the difference' },
      { name: 'emptyPageBesideItPx', kind: 'px', of: 'the unused width to the right of the reading column' },
      { name: 'paneIsOpen', kind: 'bool', of: 'whether the review pane is taking width' },
    ],
    /**
     * THE MUTATION IS THE TWO RULES THIS STEP DELETED, PUT BACK TOGETHER.
     *
     * The defect was two rules and it takes both of them to reproduce it. A report was capped at
     * `--lane-prose + --lane-wide-extra`, and a table was allowed to break out of the prose column
     * to `min(100%, the same constant)` — identical arithmetic, so the escape did nothing and every
     * table in the product was drawn at 672px however wide the screen was. Under that cap a column
     * title that could not wrap set the table's minimum: the four tables of this report each needed
     * 756px, were given 672, and scrolled by exactly 89px with nothing on the screen saying so.
     *
     * PUTTING BACK ONLY THE CAP DOES NOT BREAK THIS PROOF, and that is worth knowing rather than
     * hiding: with the titles wrapping, a capped table squeezes its columns instead of overflowing,
     * so nothing is short of what its titles need. It is the pair that fails. Recorded here because
     * a mutation that fires for a reason nobody wrote down is how a proof comes to test the wrong
     * half of a fix.
     */
    mutations: [
      {
        name: 'put back the 672px cap and the column titles that cannot wrap',
        install: async (screen) => {
          await screen.raw.addInitScript(() => {
            const put = () => {
              if (document.getElementById('accept-mutation-width') !== null) return
              if (document.head === null) return
              const rule = document.createElement('style')
              rule.id = 'accept-mutation-width'
              rule.textContent =
                '.sb-lanes > [data-grows="measured"] { grid-column: prose-start / full-end;' +
                ' width: min(100%, calc(var(--lane-prose) + var(--lane-wide-extra)));' +
                ' min-width: 0; max-width: none; }' +
                ' .sb-table thead th { white-space: nowrap; }'
              document.head.appendChild(rule)
            }
            new MutationObserver(put).observe(document, { childList: true, subtree: true })
            put()
          })
          // The proof navigates to the same address it is already on, and a hash router answers
          // that inside the page it is already showing — so without this the mutated document is
          // never built and the second run measures the unmutated product.
          await screen.raw.reload()
        },
      },
    ],
    async run(screen, api, fixture) {
      await screen.viewport(1920, 1000)
      await screen.goto(fixture.address)
      await screen.waitFor('article.rp')
      await screen.wait(2200)
      const measured = await screen.read(() => {
        const pane = document.querySelector('.px-pane') !== null
        const tables = []
        for (const table of document.querySelectorAll('.sb-table')) {
          const off = document.createElement('div')
          off.style.cssText = 'position:absolute;left:-99999px;top:0;width:4000px;'
          document.body.appendChild(off)
          const clone = table.cloneNode(true)
          clone.style.width = 'min-content'
          off.appendChild(clone)
          const minContent = Math.round(clone.getBoundingClientRect().width)
          off.remove()
          const titles = Math.round(
            [...table.querySelectorAll('thead th')].reduce((n, th) => n + th.getBoundingClientRect().width, 0),
          )
          tables.push({ needs: Math.max(minContent, titles), given: table.clientWidth, minContent, titles })
        }
        const article = document.querySelector('article.rp')
        const column = document.querySelector('.sb-doc')
        return {
          pane,
          tables,
          columnWidth: column === null ? null : column.clientWidth,
          articleWidth: article === null ? null : Math.round(article.getBoundingClientRect().width),
        }
      })
      if (measured.pane) {
        return { error: 'the review pane was open, and this proof is about the pane being closed' }
      }
      if (measured.tables.length === 0) return { error: 'the report drew no table, so there is nothing to measure' }
      const worst = [...measured.tables].sort((a, b) => b.needs - b.given - (a.needs - a.given))[0]
      const short = worst.needs - worst.given
      return {
        state: short <= 0 ? 'held' : 'broken',
        why: `the table needs ${String(worst.needs)} px and is given ${String(worst.given)} px`,
        measured: {
          narrowestTableNeedsPx: worst.needs,
          thatTableIsGivenPx: worst.given,
          shortByPx: short,
          emptyPageBesideItPx: measured.articleWidth === null ? null : measured.articleWidth - (measured.columnWidth ?? 0),
          paneIsOpen: measured.pane,
        },
        evidence: {
          everyTable: measured.tables,
          method: 'needs = the larger of the table cloned at min-content and the sum of its rendered column titles',
        },
      }
    },
  },
]

// ============================================================================ the specimens

/**
 * FOUR PROOFS THAT MUST NOT BE ALLOWED TO COUNT, one per refusal. `--self-test` runs them and checks
 * the harness answers REFUSED, WEAK, TOO-WEAK and UNPROVEN. Without this the four refusals are a
 * paragraph in a comment: a rule nothing exercises is a rule that has never fired.
 */
const SPECIMENS = [
  {
    id: 'S-share',
    expect: 'REFUSED',
    what: 'a specimen that rests on a share of addressable points',
    needs: { routes: ['records'] },
    measures: [{ name: 'pointsAddressable', kind: 'share', of: 'the first screen' }],
    run: async () => ({ state: 'held', measured: {}, evidence: {} }),
  },
  {
    id: 'S-attribute-count',
    expect: 'REFUSED',
    what: 'a specimen that counts the elements carrying data-target',
    needs: { routes: ['records'] },
    measures: [{ name: 'addressableElements', kind: 'count', of: "document.querySelectorAll('[data-target]')" }],
    run: async () => ({ state: 'held', measured: {}, evidence: {} }),
  },
  {
    id: 'S-api-only',
    expect: 'WEAK',
    what: 'a specimen that asks the API and never looks at the screen',
    needs: { routes: ['records'] },
    measures: [{ name: 'recordsAnswered', kind: 'count', of: 'the reply from GET /api/records' }],
    run: async (screen, api) => {
      const reply = await api.get('/api/records?kind=report')
      return {
        state: 'held',
        measured: { recordsAnswered: (reply.body.records ?? []).length },
        evidence: { note: 'this is what round eight proved, and it is true of every failing case' },
      }
    },
  },
  {
    id: 'S-no-mutation',
    expect: 'UNPROVEN',
    what: 'a specimen that reads the screen, holds, and has no mutation to show it can fail',
    needs: { routes: ['records'] },
    measures: [{ name: 'bodyIsDrawn', kind: 'bool', of: 'whether the page drew anything at all' }],
    run: async (screen, api, fixture) => {
      await screen.goto(fixture.address)
      await screen.waitFor('article.rp')
      const drawn = await screen.read(() => document.body.innerText.length > 0)
      return { state: drawn ? 'held' : 'broken', measured: { bodyIsDrawn: drawn }, evidence: {} }
    },
  },
  {
    id: 'S-was-already-passing',
    expect: 'TOO-WEAK',
    what: 'a specimen that held on the pre-step tree as well, so it says nothing about the step',
    needs: { routes: ['records'] },
    measures: [{ name: 'bodyIsDrawn', kind: 'bool', of: 'whether the page drew anything at all' }],
    mutations: [{ name: 'a mutation it never reaches', install: async () => {} }],
    run: async (screen, api, fixture) => {
      await screen.goto(fixture.address)
      await screen.waitFor('article.rp')
      const drawn = await screen.read(() => document.body.innerText.length > 0)
      return { state: drawn ? 'held' : 'broken', measured: { bodyIsDrawn: drawn }, evidence: {} }
    },
  },
  {
    id: 'S-no-baseline',
    expect: 'UNPROVEN',
    what: 'a specimen nothing has ever recorded failing, so passing today says nothing',
    needs: { routes: ['records'] },
    measures: [{ name: 'bodyIsDrawn', kind: 'bool', of: 'whether the page drew anything at all' }],
    run: async (screen, api, fixture) => {
      await screen.goto(fixture.address)
      await screen.waitFor('article.rp')
      const drawn = await screen.read(() => document.body.innerText.length > 0)
      return { state: drawn ? 'held' : 'broken', measured: { bodyIsDrawn: drawn }, evidence: {} }
    },
  },
]

/**
 * The baseline the specimens are judged against, so each refusal fires for its own named reason.
 *
 * Without it `S-no-mutation` would be refused for having no baseline rather than for having no
 * mutation, and the two rules would be indistinguishable in the output — which is how a rule that
 * has never fired comes to look like a rule that works.
 */
const SPECIMEN_BASELINE = {
  tree: '(the specimens run against a made-up baseline, on purpose)',
  proofs: {
    'S-no-mutation': { verdict: 'FAIL' },
    'S-was-already-passing': { verdict: 'PASS' },
  },
}

// ============================================================================ running one

async function runOne(proof, { browser, web, api, fixture, routes, baseline }) {
  const refusal = refusalFor(proof, routes)
  if (refusal !== null) return { id: proof.id, what: proof.what, verdict: 'REFUSED', why: refusal, measured: {} }

  const size = proof.needs?.viewport ?? { width: 1440, height: 1000 }
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  const screen = screenFor(page, proof.id)
  const mutations = []
  let result
  try {
    result = await proof.run(screen, api, fixture)
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) }
  }

  // The mutation half only means something once the assertion holds: a failing measurement needs no
  // mutation to be believed. A control run has already happened — it is the run just above.
  if (result.state === 'held' && Array.isArray(proof.mutations)) {
    for (const mutation of proof.mutations) {
      try {
        await mutation.install(screen)
        const after = await proof.run(screen, api, fixture)
        mutations.push({ name: mutation.name, broke: after.state === 'broken', said: after.why ?? null })
      } catch (err) {
        mutations.push({ name: mutation.name, broke: true, said: `it threw: ${err instanceof Error ? err.message : String(err)}` })
      }
    }
  }
  await context.close()

  const honest = result.error === undefined ? measuredIsHonest(proof, result.measured) : null
  if (honest !== null) {
    return { id: proof.id, what: proof.what, verdict: 'REFUSED', why: `${proof.id} ${honest}`, measured: {} }
  }
  const { verdict, why } = verdictFor({
    proof,
    result,
    readScreen: screen.seen.readScreen,
    usedApi: api.seen.usedApi,
    baseline,
    mutations,
  })
  return {
    id: proof.id,
    what: proof.what,
    role: proof.role ?? 'campaign',
    verdict,
    why: verdict === 'FAIL' ? (result.why ?? why) : why,
    measured: result.measured ?? {},
    evidence: result.evidence ?? {},
    mutations,
    pageErrors: errors.slice(0, 3),
  }
}

// ============================================================================ the command line

function words(value) {
  if (value === null || value === undefined) return 'nothing'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? null : argv[at + 1]
  }
  const has = (name) => argv.includes(name)
  const only = flag('--only')?.split(',').map((s) => s.trim())
  const selfTest = has('--self-test')
  const routes = readRoutes()
  mkdirSync(OUT, { recursive: true })

  const given = flag('--against')
  if (given !== null && THEIR_PORTS.some((p) => given.includes(String(p)))) {
    throw new Error(`${given} is the owner's server. This harness never runs proofs against it.`)
  }
  let instance = null
  const started = Date.now()
  let results = []
  try {
    instance =
      given === null
        ? startInstance()
        : {
            web: given,
            api: flag('--api') ?? given.replace(/:\d+$/, `:${String(declaredSettings().apiPort)}`),
            name: 'given',
            mine: false,
          }
    const api = apiFor(instance.api, 'panelx')
    const browser = await chromium.launch()
    const setup = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const setupPage = await setup.newPage()
    const fixture = await buildFixture(screenFor(setupPage, 'fixture'), api, instance.web, routes)
    await setup.close()

    const baseline = selfTest ? SPECIMEN_BASELINE : existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
    const list = (selfTest ? SPECIMENS : PROOFS).filter((p) => only === undefined || only === null || only.includes(p.id))
    for (const proof of list) {
      // Each proof gets its own reading of whether it touched the API, so one proof asking cannot
      // make the next one look like it read the screen.
      const own = apiFor(instance.api, 'panelx')
      results.push(await runOne(proof, { browser, web: instance.web, api: own, fixture, routes, baseline }))
    }
    await browser.close()

    if (selfTest) {
      for (const one of results) {
        const wanted = SPECIMENS.find((s) => s.id === one.id).expect
        one.selfTest = one.verdict === wanted ? 'the refusal fired' : `EXPECTED ${wanted}, GOT ${one.verdict}`
      }
    }
    if (has('--record-baseline') && !selfTest) {
      writeFileSync(
        BASELINE,
        JSON.stringify(
          {
            tree: instance.ref ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
            at: localStamp(new Date()), // local wall-clock time, chapter 4 rule 8 (acceptance finding 63)
            proofs: Object.fromEntries(results.map((r) => [r.id, { verdict: r.verdict, measured: r.measured, why: r.why }])),
          },
          null,
          2,
        ),
      )
    }
  } finally {
    await stopInstance(instance).catch((err) => process.stderr.write(`Could not stop the instance: ${String(err)}\n`))
  }

  const stamp = fileNameStamp(new Date())
  const file = join(OUT, `run-${stamp}.json`)
  writeFileSync(file, JSON.stringify({ at: localStamp(new Date()), seconds: (Date.now() - started) / 1000, results }, null, 2))

  const wide = Math.max(11, ...results.map((one) => one.id.length + 2))
  for (const one of results) {
    process.stdout.write(`${one.id.padEnd(wide)}${one.verdict.padEnd(10)}${one.what.slice(0, 72)}\n`)
    process.stdout.write(`${''.padEnd(wide)}${one.why ?? ''}\n`)
    for (const [name, value] of Object.entries(one.measured ?? {})) {
      process.stdout.write(`${''.padEnd(wide + 2)}${name}: ${words(value)}\n`)
    }
    if (one.selfTest !== undefined) process.stdout.write(`${''.padEnd(wide + 2)}self-test: ${one.selfTest}\n`)
  }
  if (selfTest) {
    const wrong = results.filter((one) => one.selfTest !== 'the refusal fired')
    process.stdout.write(
      `\n${String(results.length - wrong.length)} of ${String(results.length)} refusals fired for their own reason` +
        `${wrong.length === 0 ? '' : `; ${wrong.map((one) => one.id).join(', ')} did not`}  ·  full result: ${file}\n`,
    )
    process.exitCode = wrong.length === 0 ? 0 : 1
    return
  }
  // DONE MEANS EVERY CAMPAIGN PROOF PASSED. The control does not count toward it: it is meant to
  // pass today, so counting it would let the harness report progress it has not made.
  const campaign = results.filter((one) => one.role !== 'control')
  const done = campaign.length > 0 && campaign.every((one) => one.verdict === 'PASS')
  process.stdout.write(`\ndone: ${String(done)}  ·  ${String(campaign.length)} campaign proofs, ${String(results.length - campaign.length)} control  ·  full result: ${file}\n`)
}

/**
 * WHETHER THIS FILE WAS RUN, AS OPPOSED TO IMPORTED. tests/a-copy-leaves-no-key-hash-in-its-bytes.test.ts
 * imports `copyTheCorpusInto` without starting a world or a browser. Both sides are real paths, so a
 * checkout reached through a link still runs.
 */
const invokedAs = process.argv[1]
if (invokedAs !== undefined && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) await main()
