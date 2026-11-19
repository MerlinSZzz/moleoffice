// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ANSWERS FOR THIS OFFICE: THE SELF-CHECK, WRITTEN ONCE.
 *
 * Criterion W3 of the standalone window (design/window/ACCEPTANCE.md; wave 13t's plan hp7Z-IW9JWSX):
 * opening the window is a self-check. It reads the world header and the health of the office it
 * finds, and says which of these things is true before it draws a page. The `mole-office` command's
 * `status`, `start` and `stop` ask the same question through this function, and the window will
 * too. So "is the office I expect the one answering, and is it well" is worked out in one place.
 *
 * EXACTLY ONE OF FIVE ANSWERS:
 *
 *   - `healthy`: the office the declaration names answers, and its health check says ok.
 *   - `unhealthy`: that office answers, and its health check says what is wrong. The reasons are its
 *     own sentences, from `wrong` in GET /api/health.
 *   - `wrong-world`: something answers, and it is not the office the declaration names. Either the
 *     world header names another database, checkout or port, and each field that differs is named
 *     with both values, or the reply carries no world this can read, and `notSaid` says why.
 *   - `cannot-tell`: an office answers, nothing it says differs from what is expected, but one of
 *     the compared facts is `unknown` (or empty) on one side or both, so whether it is the office this
 *     checkout declares cannot be told. Each such fact is named, with the side that could not say it.
 *     An unknown is never read as equal, and never as different: two offices that both cannot read
 *     their database's identity are not shown to be one office (invariant 5, absence beats a guess;
 *     check FaHVVEwRbcak). A fact that is known on both sides and differs still makes the answer the
 *     wrong world, because that is proof, whatever else is unknown.
 *   - `not-answering`: nothing answered. `failure` says how the read failed (refused, timeout or
 *     unreadable), because a busy machine and a dead office look the same to a reader that only
 *     knows the read failed. `refusal` carries the code a dev stand-in named, when it named one,
 *     and it is what the window uses to tell a start that cannot help from an office that is down.
 *
 * WHAT IS COMPARED. The declaration names three facts: the database, the checkout and the port.
 * The commit is what the running code was loaded from, which GET /api/runtime/freshness compares
 * with the checkout. Comparing it here would refuse to file a session after any commit that changes
 * nothing under src/, because nothing restarts the server then, and this project once lost a whole
 * day of work to sessions that went unfiled. The standing is the server's judgement of itself, and a
 * worktree's sessions belong in its declared office even when that server calls itself scratch. Both
 * are printed in the world's words, never compared.
 *
 * THE PIECES IT JOINS, none of them copied: `whoIsAt` in world-address.mjs asks the address and
 * tells the three failed reads apart; `parseWorldHeader` in world-header.mjs reads the world, and its
 * `factByFact` sets each fact of two worlds side by side, which `worldsDiffer` reads too, and the
 * checkout on Windows is compared by `theSameCheckout`; GET /api/health says ok and what is wrong; and
 * `theWorldTheDeclarationNames` below works out the expected world from src/config/settings.mjs.
 *
 * tools/session-hook.mjs asks this same function before filing, including refusing a world whose
 * compared facts cannot be read. The expected world is worked out only here.
 *
 * IT IS PLAIN JAVASCRIPT, so Node runs it with no loader: the command, the hook and the window's main
 * process can all import it.
 */

import { databaseIdentity } from './database-identity.mjs'
import { REPO_ROOT, settings } from './settings.mjs'
import { THE_STABLE_TAG_PUT_BACK, THE_STABLE_TAG_REFUSAL } from './stable-tag.mjs'
import { THIS_PLATFORM, theSameCheckout } from './the-paths-of-a-system.mjs'
import { whoIsAt } from './world-address.mjs'
import { SELF_CHECK_WORDS, WINDOW_WORDS } from './the-self-check-words.mjs'
import { factByFact, parseWorldHeader } from './world-header.mjs'

/** The facts the declaration names, and so the only ones compared. */
export const THE_FACTS_THE_DECLARATION_NAMES = /** @type {const} */ (['database', 'repository', 'port'])

/**
 * THE WORLD THIS CHECKOUT'S DECLARATION NAMES: the identity of the database it opens, the checkout
 * itself, and the port it serves on. The commit and the standing are left empty, because the
 * declaration does not name them and they are not compared.
 *
 * @param {{ databasePath: string, apiPort: number }} [declared] what src/config/settings.mjs says
 * @returns {import('./world-header.mjs').WorldOnTheWire}
 */
export function theWorldTheDeclarationNames(declared = settings()) {
  return {
    database: databaseIdentity(declared.databasePath).id,
    repository: REPO_ROOT.replace(/\/$/, ''),
    port: String(declared.apiPort),
    head: '',
    standing: '',
  }
}

/**
 * @typedef {{ key: 'database' | 'repository' | 'port', what: string, expected: string, answered: string }} ADifference
 * @typedef {{ running: boolean, says: string } | null} WhatTheHolderSaid what the health check said of the terminal holder; null when it said nothing of one
 * @typedef {{ stableCheckout: string, developmentCheckout: string }} ServesFor two folders, when a checkout difference was excused: the folder the office answering runs from, and the development checkout it names
 * @typedef {{ answer: 'healthy', address: string, world: import('./world-header.mjs').WorldOnTheWire, holder: WhatTheHolderSaid, version?: unknown, servesFor?: ServesFor }} Healthy the version its health check said it runs, or null when its bundle recorded none, absent when the health check has no version field, and any other value is carried as it came and the window does not compare it
 * @typedef {{ answer: 'unhealthy', address: string, world: import('./world-header.mjs').WorldOnTheWire, reasons: string[], holder: WhatTheHolderSaid, updateWaiting?: true, version?: unknown, servesFor?: ServesFor }} Unhealthy an office whose health says a database update waits (THE_UPDATE_WAITS) carries updateWaiting; version as for Healthy
 * @typedef {{ answer: 'wrong-world', address: string, world: import('./world-header.mjs').WorldOnTheWire | null, differences: ADifference[], notSaid: string | null }} WrongWorld
 * @typedef {{ key: 'database' | 'repository' | 'port', what: string, expected: string, answered: string, unknownTo: 'this checkout' | 'the office answering' | 'both' }} AnUnknown
 * @typedef {{ answer: 'cannot-tell', address: string, world: import('./world-header.mjs').WorldOnTheWire, unknowns: AnUnknown[], servesFor?: ServesFor }} CannotTell
 * @typedef {{ answer: 'not-answering', address: string, failure: 'refused' | 'timeout' | 'unreadable', why: string, refusal?: string }} NotAnswering
 * @typedef {Healthy | Unhealthy | WrongWorld | CannotTell | NotAnswering} WhatAnswers
 */

/**
 * ASK WHAT ANSWERS FOR THIS OFFICE, and get exactly one of the five answers.
 *
 * `address` defaults to this machine at the declared port, and `expected` to the world the
 * declaration names. A caller that knows better passes them: the `mole-office` command asks at the
 * port its service lock recorded and expects that port. A caller that names its office by a database
 * and a port passes `declared`, and the world expected is worked out here from those: an installed
 * office's session hook passes the office its install runs (round W22). `expected` wins over it.
 * `headers` go with the request, for a caller that sends who it is. `asks`, `waitMs` and `gapMs`
 * are whoIsAt's: by default a silent address is asked twice, a second apart, and each ask waits two
 * seconds.
 *
 * @param {{ address?: string, expected?: import('./world-header.mjs').WorldOnTheWire, declared?: { databasePath: string, apiPort: number }, headers?: Record<string, string>, asks?: number, waitMs?: number, gapMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<WhatAnswers>}
 */
export async function whatAnswersForThisOffice(options = {}) {
  const address = options.address ?? `http://127.0.0.1:${String(settings().apiPort)}`
  const expected = options.expected ?? theWorldTheDeclarationNames(options.declared)
  const asked = await whoIsAt(address, {
    headers: options.headers,
    asks: options.asks,
    waitMs: options.waitMs,
    gapMs: options.gapMs,
    fetchImpl: options.fetchImpl,
    withHealth: true,
  })
  if (!asked.answering) {
    if (asked.answeredWithoutAWorld === true) {
      return { answer: 'wrong-world', address, world: null, differences: [], notSaid: asked.why }
    }
    // A REFUSAL THE STAND-IN NAMED TRAVELS WITH THE ANSWER, so the window can tell a start that
    // cannot help (a stand-in holding the port after a refusal) from an office that is merely down.
    return { answer: 'not-answering', address, failure: asked.failure, why: asked.why, ...(asked.refusal === undefined ? {} : { refusal: asked.refusal }) }
  }
  const { differences, unknowns, servesFor } = whatTheFactsShow(expected, asked.world)
  // THE EXCUSED CHECKOUT TRAVELS WITH THE ANSWER when one was excused. A wrong world is answered
  // before this is read, so a database or a port difference never carries it.
  const excused = servesFor === undefined ? {} : { servesFor }
  if (differences.length > 0) return { answer: 'wrong-world', address, world: asked.world, differences, notSaid: null }
  if (unknowns.length > 0) return { answer: 'cannot-tell', address, world: asked.world, unknowns, ...excused }
  const health = asked.health ?? { ok: false, wrong: ['its health check was not read'], holder: null }
  // THE VERSION THE OFFICE SAID IT RUNS travels with the answer when its health check had one, so the window can
  // tell a service older than itself.
  const version = health.version === undefined ? {} : { version: health.version }
  if (health.ok) return { answer: 'healthy', address, world: asked.world, holder: health.holder, ...version, ...excused }
  if (health.updateWaiting === true) return { answer: 'unhealthy', address, world: asked.world, reasons: health.wrong, holder: health.holder, updateWaiting: true, ...version, ...excused }
  return { answer: 'unhealthy', address, world: asked.world, reasons: health.wrong, holder: health.holder, ...version, ...excused }
}

/**
 * WHAT A WORLD HEADER ALREADY RECEIVED SHOWS, judged by the same comparison `whatAnswersForThisOffice` makes. Wave 13k
 * round 46: after a compaction the session hook's first request is its own read, and it reads the world off that
 * reply's header, so no health read is sent.
 *
 * NO HEALTH WAS ASKED, so a world that matches is answered `same-world`, never `healthy`: this says the database, the
 * checkout and the port are the declared ones, and says nothing about the office's health. A header that is missing
 * or cannot be read is a wrong world with no world, as `whatAnswersForThisOffice` answers a reply without one.
 *
 * @param {string | null | undefined} headerText the header's value as the reply carried it
 * @param {string} address where the reply came from
 * @param {import('./world-header.mjs').WorldOnTheWire} [expected] by default the world `declared` names
 * @param {{ databasePath: string, apiPort: number }} [declared] as `whatAnswersForThisOffice` takes it
 * @returns {WrongWorld | CannotTell | { answer: 'same-world', address: string, world: import('./world-header.mjs').WorldOnTheWire, servesFor?: ServesFor }}
 */
export function whatAWorldHeaderShows(headerText, address, expected = undefined, declared = undefined) {
  const parsed = parseWorldHeader(headerText)
  if (!parsed.ok) return { answer: 'wrong-world', address, world: null, differences: [], notSaid: parsed.why }
  const { differences, unknowns, servesFor } = whatTheFactsShow(expected ?? theWorldTheDeclarationNames(declared), parsed.world)
  const excused = servesFor === undefined ? {} : { servesFor }
  if (differences.length > 0) return { answer: 'wrong-world', address, world: parsed.world, differences, notSaid: null }
  if (unknowns.length > 0) return { answer: 'cannot-tell', address, world: parsed.world, unknowns, ...excused }
  return { answer: 'same-world', address, world: parsed.world, ...excused }
}

/**
 * WHAT THE THREE COMPARED FACTS SHOW, read from `factByFact` in world-header.mjs, where two worlds
 * are compared.
 *
 * A fact either side could not say is an unknown, never equal and never different. A fact known on
 * both sides whose words differ is a difference. Everything else is the same.
 *
 * ON WINDOWS A CHECKOUT IS COMPARED WITHOUT ONE TRAILING SEPARATOR, by `theSameCheckout` in
 * the-paths-of-a-system.mjs, because the session hook and the office of one installation end the
 * same folder differently there. A difference still shows each folder as its side wrote it.
 *
 * ONE DIFFERENCE IS EXCUSED: THE CHECKOUT OF A STABLE OFFICE (decision fPbGHEXq5OfR). The
 * office runs from the stable checkout while the owner works in the development checkout, so a
 * checkout difference is expected there and is not a wrong world. The excuse holds when, and only
 * when, the office answering names this checkout as the development checkout it serves: its
 * `developmentCheckout` is compared with `expected.repository` exactly, both absolute paths with no
 * trailing slash, and a value that is absent or names any other folder excuses nothing. The excuse
 * covers the checkout fact alone: a database or a port difference is still a difference, an unknown
 * is never read as equal or as different, and when the checkout was excused the result carries
 * `servesFor` with the two folders, so a reader can say which office serves which checkout.
 *
 * @param {import('./world-header.mjs').WorldOnTheWire} expected
 * @param {import('./world-header.mjs').WorldOnTheWire} answered
 * @param {string} [platform] a value of `process.platform`: the system both folders are on, this one unless a test names another
 * @returns {{ differences: ADifference[], unknowns: AnUnknown[], servesFor?: ServesFor }}
 */
export function whatTheFactsShow(expected, answered, platform = THIS_PLATFORM) {
  /** @type {ADifference[]} */
  const differences = []
  /** @type {AnUnknown[]} */
  const unknowns = []
  /** @type {ServesFor | undefined} */
  let servesFor
  for (const read of factByFact(expected, answered)) {
    const fact =
      read.key === 'repository'
        ? { ...read, same: theSameCheckout(read.expected, read.answered, platform) }
        : read
    const key = THE_FACTS_THE_DECLARATION_NAMES.find((one) => one === fact.key)
    if (key === undefined) continue
    const sides = { expected: fact.expected, answered: fact.answered }
    if (fact.unknownTo !== null) {
      const unknownTo = fact.unknownTo === 'both' ? 'both' : fact.unknownTo === 'expected' ? 'this checkout' : 'the office answering'
      unknowns.push({ key, what: fact.what, ...sides, unknownTo })
    } else if (!fact.same && key === 'repository' && answered.developmentCheckout !== undefined && answered.developmentCheckout === expected.repository) {
      servesFor = { stableCheckout: answered.repository, developmentCheckout: expected.repository }
    } else if (!fact.same) {
      differences.push({ key, what: fact.what, ...sides })
    }
  }
  return servesFor === undefined ? { differences, unknowns } : { differences, unknowns, servesFor }
}

/**
 * THE ANSWER IN PLAIN WORDS, one sentence a line, for a terminal, a log or the window.
 *
 * Every line is true on the one path that reaches it: each answer has its own lines, and none
 * predicts what a person should find when they look.
 *
 * A CHECKOUT DIFFERENCE THAT WAS EXCUSED IS SAID (decision fPbGHEXq5OfR). The office answering
 * runs from another folder, so one more line says which folder it runs from and which development
 * checkout it serves. The line is added only when the answer carries `servesFor`; nothing was
 * excused on every other answer, and no line is added there.
 *
 * The sentences are in src/config/the-self-check-words.mjs, in English and Chinese. The command
 * says them in English; the window says them in its own language.
 *
 * @param {WhatAnswers} found
 * @param {'en' | 'zh'} [language]
 * @returns {string[]}
 */
export function theAnswerInWords(found, language = 'en') {
  const words = SELF_CHECK_WORDS[language]
  /** @param {{ key: 'database' | 'repository' | 'port', what: string }} fact */
  const what = (fact) => (words.facts === null ? fact.what : words.facts[fact.key])
  // A TERMINAL HOLDER THAT IS NOT RUNNING IS NAMED, with the office's own sentence about it. It does not
  // make the office unhealthy: everything else still works (wave 13u, the decision for round 2).
  /** @param {WhatTheHolderSaid} holder */
  const theHolder = (holder) => ((holder ?? null) !== null && holder !== null && !holder.running ? [words.noHolder(holder.says)] : [])
  /** @param {ServesFor | undefined} servesFor */
  const theExcusedCheckout = (servesFor) => (servesFor === undefined ? [] : [words.servesFor(servesFor.stableCheckout, servesFor.developmentCheckout)])
  if (found.answer === 'healthy') {
    return [words.healthy(found.address), ...theHolder(found.holder), words.itIs(words.world(found.world)), ...theExcusedCheckout(found.servesFor)]
  }
  if (found.answer === 'unhealthy') {
    return [
      words.unhealthy(found.address),
      ...found.reasons.map((reason) => words.wrong(reason)),
      ...theHolder(found.holder),
      words.itIs(words.world(found.world)),
      ...theExcusedCheckout(found.servesFor),
    ]
  }
  if (found.answer === 'wrong-world') {
    if (found.world === null) return [words.noWorld(found.address, found.notSaid ?? words.noReasonGiven)]
    return [
      words.wrongWorld(found.address),
      ...found.differences.map((one) => words.differs(what(one), one.expected, one.answered)),
      words.answeringIs(words.world(found.world)),
    ]
  }
  if (found.answer === 'cannot-tell') {
    return [
      words.cannotTell(found.address),
      ...found.unknowns.map((one) =>
        one.unknownTo === 'both' ? words.unknownToBoth(what(one)) : words.unknownToOneSide(what(one), one.unknownTo, one.expected, one.answered),
      ),
      words.answeringIs(words.world(found.world)),
      ...theExcusedCheckout(found.servesFor),
    ]
  }
  return [words.notAnswering(found.why)]
}

/**
 * One line of what the window says: a sentence, a heading, one labelled value, or what the person can
 * do. A value that is a folder path says so, so the page can break it only at its slashes.
 *
 * @typedef {{ say: string } | { heading: string } | { label: string, value: string, path?: true } | { todo: string }} AWindowLine
 */

/**
 * THE ANSWER AS THE WINDOW SAYS IT TO A PERSON: what is wrong, what each value means, and what they
 * can do (the review of round 9 of wave 13t). `theAnswerInWords` above is the same answer for a
 * terminal. Both read the one comparison in `whatAnswersForThisOffice`; only the words differ, and
 * they are in src/config/the-self-check-words.mjs.
 *
 * NOTHING ANSWERING IS SAID PLAINLY (wave 13t, round 14). On a first start it is the normal path, so
 * the window says what is true in the person's language, by how the read failed, and nothing more.
 * The system's own sentence, with its address and its English, is shown only to somebody who has
 * turned on the office's Developer mode, under a label that says what it is.
 *
 * A REFUSAL THE STAND-IN NAMED IS SAID IN THE WORDS THE STAND-IN GIVES (an addition to round 12;
 * on a request). When the answer is not-answering and its refusal is THE_STABLE_TAG_REFUSAL, the copy
 * the office runs from is not at the version its last upgrade left, and no start can help it. The
 * window then gives that sentence instead of "did not answer", names what the person presses next
 * (Check again, the only press findTheOffice offers for this answer), and never names a command. The
 * two steps that put the copy back are for the agent who fixes it, so in Developer mode the detail
 * keeps them with a label saying who they are for; the person's own view never shows them.
 *
 * @param {WhatAnswers} found
 * @param {'en' | 'zh'} language
 * @param {{ developer?: boolean }} [reader] whether the person has turned on the office's Developer mode
 * @returns {AWindowLine[]}
 */
export function whatTheWindowSays(found, language, reader = {}) {
  const says = WINDOW_WORDS[language].says
  /** @param {import('./world-header.mjs').WorldOnTheWire} world @returns {AWindowLine[]} */
  const theOneAnswering = (world) => [
    { heading: says.answeringHeading },
    { label: says.labels.database, value: world.database },
    { label: says.labels.repository, value: world.repository, path: true },
    { label: says.labels.port, value: world.port },
    { label: says.labels.head, value: world.head },
    { label: says.labels.standing, value: says.standingMeans[world.standing] ?? says.unknownStanding(world.standing) },
  ]
  /**
   * THE SYSTEM'S OWN DETAIL, shown only to somebody in Developer mode. When it holds the two
   * put-back steps (src/config/stable-tag.mjs), a label in the reader's language stands immediately
   * before them and says they are for the agent who fixes the copy, not for the person.
   *
   * @param {string} why
   * @returns {AWindowLine[]}
   */
  const theSystemDetail = (why) => {
    if (reader.developer !== true) return []
    const label = says.stableTagPutBackLabel
    const value = why.includes(THE_STABLE_TAG_PUT_BACK) ? why.replace(THE_STABLE_TAG_PUT_BACK, `${label}\n${THE_STABLE_TAG_PUT_BACK}`) : why
    return [{ label: says.detail, value }]
  }
  if (found.answer === 'healthy') return [{ say: says.healthy(found.address) }]
  if (found.answer === 'unhealthy') {
    return [
      { say: says.unhealthy(found.address) },
      ...found.reasons.map((reason) => ({ say: says.reason(reason) })),
      { todo: says.unhealthyTodo },
    ]
  }
  if (found.answer === 'wrong-world') {
    if (found.world === null) {
      return [{ say: says.noWorld(found.address, found.notSaid ?? SELF_CHECK_WORDS[language].noReasonGiven) }, { say: says.notOpened }, { todo: says.wrongTodo }]
    }
    return [
      { say: says.wrongWorld(found.address) },
      { say: says.notOpened },
      { heading: says.differsHeading },
      ...found.differences.map((one) => ({
        label: says.labels[one.key],
        value: says.differs(one.answered, one.expected),
        ...(one.key === 'repository' ? { path: /** @type {const} */ (true) } : {}),
      })),
      ...theOneAnswering(found.world),
      { todo: says.wrongTodo },
    ]
  }
  if (found.answer === 'cannot-tell') {
    return [
      { say: says.cannotTell(found.address) },
      { say: says.notOpened },
      { heading: says.unknownHeading },
      ...found.unknowns.map((one) => ({
        label: says.labels[one.key],
        value: says.unknown(one.unknownTo, one.expected, one.answered),
        ...(one.key === 'repository' ? { path: /** @type {const} */ (true) } : {}),
      })),
      ...theOneAnswering(found.world),
      { todo: says.cannotTellTodo },
    ]
  }
  if (found.answer === 'not-answering' && found.refusal === THE_STABLE_TAG_REFUSAL) {
    return [{ say: says.stableTagRefusal }, ...theSystemDetail(found.why)]
  }
  return [{ say: says.notAnswering(found.failure) }, ...theSystemDetail(found.why)]
}

/**
 * WHAT THE WINDOW SAYS WHEN IT RUNS WITHOUT CHROMIUM'S SANDBOX: a heading, why, what the sandbox is
 * for, and the two ways to turn it on. The window shows these lines once, at the end of its check
 * page, for as long as it runs that way (src/desktop/main.mjs).
 *
 * @param {'en' | 'zh'} language
 * @returns {AWindowLine[]}
 */
export function theSandboxWarning(language) {
  const off = WINDOW_WORDS[language].sandboxOff
  return [{ heading: off.heading }, { say: off.why }, { say: off.risk }, { todo: off.todo }]
}
