// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GATE AGAINST A COMMIT AT THE PLACEHOLDER ADDRESS (wave 13q, 21 October 2026). Part of the merge tool,
 * tools/the-merger.mjs. Integrate runs it as its fifth guard, after the regeneration commit and before the build and the
 * suite.
 *
 * MOLE_OFFICE_COMMIT_EMAIL is the one address the office commits under, and its declared default is a placeholder at a
 * domain that names nobody. A commit made while that setting was left at its default carries the placeholder as its
 * author or its committer, and once it is on main the history cannot be changed. So this gate reads the author and the
 * committer address of every commit the landing would add to main, `git log <main>..<Cfinal>`, merge commits included,
 * and finds each that carries the placeholder domain. That range is the one land.mjs moves main over with
 * `git merge --ff-only`, so the queue's own regeneration commit is read as well. A commit already on main is never read.
 *
 * WHAT THE GATE DOES WITH WHAT IT FOUND is its position, MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES, its row in the one gate
 * list (src/config/gates.mjs). Integrate reads it through src/config/integration-guards.mjs only when the screen found a
 * commit, as the guards of wave 13r round L read theirs, and hands it to whatTheGateDoes, which reads none of its own.
 * At block, the default, the gate refuses the entry. At remind the entry goes on, the log says so, and the integrated
 * step carries each commit, so the entry's record and its receipt name them. At off the entry goes on, nothing is
 * carried, and the log says the gate is off and stopped nothing. The screen runs and integrate keeps its file at every
 * position.
 *
 * AN OFFICE OLDER THAN THE FIELD placeholderCommits refuses the integrated step that carries it, as a key its step door
 * does not know. The merge tool's step function (tools/merge-tool/office-keeper.mjs) knows that one refusal by the door's
 * own words and status (theStepDoorDoesNotKnowTheKey), sends the step again without the field, and writes in its log
 * the sentence theOfficeDidNotTakeThem makes, which names each commit and the position. Any other refusal still stops it.
 *
 * WHAT IS THE PLACEHOLDER: the domain the screen's caller gives it, which integrate reads from the declared default of
 * MOLE_OFFICE_COMMIT_EMAIL in src/config/settings.mjs and never writes out a second time. It is never the value in
 * force, which may be anything. An address is at the placeholder when the part after its last @ is that domain,
 * compared without regard to case. A subdomain of it is a different domain and does not count.
 *
 * WHAT THE REFUSAL SAYS: each commit by its sha, and the author or committer address that is at the placeholder. An
 * address at any other domain may be a person's own, so it is never written, here or in the screen integrate keeps as
 * the guard's log; such a side is said only to be at another domain. No name is read at all.
 *
 * The rebase writes the queue's own address as the committer of every rebased commit. So if the queue's own
 * MOLE_OFFICE_COMMIT_EMAIL were left at its default, this gate would refuse every entry, and its refusal would say so.
 *
 * This module imports only the owner-content gate's git reader and a-library-is-not-a-program.mjs, which does nothing
 * when it is imported, so a test and a dry run use it without starting a run. It reads nothing of the office.
 */

import './a-library-is-not-a-program.mjs'
import { gitText } from './owner-content.mjs'

/** @typedef {{ commit: string, author: string | null, committer: string | null }} ACommitRefused */
/** @typedef {{ base: string, head: string, domain: string, read: { commits: number }, refused: ACommitRefused[] }} TheScreen */
/** @typedef {{ position: 'remind', domain: string, commits: ACommitRefused[] }} WhatIsCarried */

/** The part of an address after its last @, in lower case, or null when it has no @ with something on both sides. @param {string} address */
function theDomainOf(address) {
  const at = address.lastIndexOf('@')
  return at < 1 || at === address.length - 1 ? null : address.slice(at + 1).toLowerCase()
}

/** THE PLACEHOLDER DOMAIN: the domain of the declared default address. A declared default with no domain is a broken assumption, and throws. @param {string} declared */
export function thePlaceholderDomainOf(declared) {
  const domain = typeof declared === 'string' ? theDomainOf(declared) : null
  if (domain === null) throw new Error(`MOLE_OFFICE_COMMIT_EMAIL's declared default in src/config/settings.mjs is not an address with a domain, so the commit-address gate cannot tell which domain is the placeholder.`)
  return domain
}

/**
 * SCREEN EVERY COMMIT IN base..head: its author and its committer address, as written in the commit. A mailmap changes
 * only %aE and %cE, so %ae and %ce are the addresses as written (git 2.43, 21 October 2026).
 * @param {{ repo: string, base: string, head: string, domain: string }} what
 * @returns {TheScreen}
 */
export function screenTheCommits({ repo, base, head, domain }) {
  if (typeof domain !== 'string' || domain === '') throw new Error('The commit-address gate needs the placeholder domain: the caller must pass the placeholder domain as domain.')
  const lines = gitText(repo, ['log', '--format=%H%x00%ae%x00%ce', `${base}..${head}`]).split('\n').filter((line) => line !== '')
  const wanted = domain.toLowerCase()
  /** @type {TheScreen} */
  const screen = { base, head, domain: wanted, read: { commits: 0 }, refused: [] }
  const atThePlaceholder = (/** @type {string} */ address) => theDomainOf(address) === wanted
  for (const line of lines) {
    const [commit = '', author = '', committer = ''] = line.split('\0')
    screen.read.commits += 1
    if (!atThePlaceholder(author) && !atThePlaceholder(committer)) continue
    screen.refused.push({ commit, author: atThePlaceholder(author) ? author : null, committer: atThePlaceholder(committer) ? committer : null })
  }
  return screen
}

/** `count` and the noun, in the plural unless it is one. @param {number} count @param {string} noun */
const counted = (count, noun) => `${String(count)} ${noun}${count === 1 ? '' : 's'}`

/** Each commit found, by its sha and the side at the placeholder, writing no other address. @param {ACommitRefused[]} commits */
function eachCommitFound(commits) {
  const side = (/** @type {string} */ word, /** @type {string | null} */ address) => (address === null ? `its ${word} is at another domain` : `its ${word} is ${address}`)
  return commits.map((one) => `${one.commit}: ${side('author', one.author)}, ${side('committer', one.committer)}`).join('; ')
}

/**
 * WHY THE GATE REFUSES, for the guard's detail, or null when it does not. It writes no address but the placeholder's.
 * @param {TheScreen} screen
 */
export function theRefusalSaid(screen) {
  if (screen.refused.length === 0) return null
  return (
    `The entry would publish or retain ${counted(screen.refused.length, 'commit')} at the placeholder domain ${screen.domain}, the domain of ` +
    `MOLE_OFFICE_COMMIT_EMAIL's declared default, and the published history must remain readable afterwards: ${eachCommitFound(screen.refused)}. ` +
    'Set MOLE_OFFICE_COMMIT_EMAIL, or the git address of the checkout the commits were made in, to a real address, make ' +
    'the commits again under it, and submit again. If the queue\'s own address is the one at the placeholder, every ' +
    'entry is refused until the queue\'s MOLE_OFFICE_COMMIT_EMAIL is set.'
  )
}

/**
 * ONE SENTENCE FOR THE LOG: how many commits the gate read and how many it refused.
 * @param {TheScreen} screen
 */
export function theScreenSaid(screen) {
  const refused = screen.refused.length === 0 ? 'none' : String(screen.refused.length)
  return `The commit-address gate read ${counted(screen.read.commits, 'commit')} in ${screen.base}..${screen.head}: ${refused} at the placeholder domain ${screen.domain}.`
}

/**
 * WHAT THE GATE DOES AT ITS POSITION with what the screen found. `refusal` is the guard's detail when the entry is
 * refused, and null when it goes on. `said` is one more sentence for the log, or null. `carried` is what the integrated
 * step carries, at remind and only when something was found. The position is the caller's to read: integrate reads it
 * with placeholderAddressesPosition (src/config/integration-guards.mjs). One the gate does not know, or none, throws
 * here, so nothing is let through on a guess.
 * @param {TheScreen} screen
 * @param {string} position
 * @returns {{ position: string, refusal: string | null, said: string | null, carried: WhatIsCarried | null }}
 */
export function whatTheGateDoes(screen, position) {
  const found = screen.refused.length
  if (position === 'block') return { position, refusal: theRefusalSaid(screen), said: null, carried: null }
  if (position === 'remind') {
    if (found === 0) return { position, refusal: null, said: null, carried: null }
    return {
      position,
      refusal: null,
      said:
        `MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is at remind, so the entry goes on with ${counted(found, 'commit')} at the placeholder ` +
        `domain ${screen.domain}, and its integrated step names each: ${eachCommitFound(screen.refused)}.`,
      carried: { position: 'remind', domain: screen.domain, commits: screen.refused.map((one) => ({ ...one })) },
    }
  }
  if (position === 'off') {
    const what = found === 0
      ? `It found no commit at the placeholder domain ${screen.domain}.`
      : `The entry goes on with ${counted(found, 'commit')} at the placeholder domain ${screen.domain}, and only this log names them: ${eachCommitFound(screen.refused)}.`
    return { position, refusal: null, said: `MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is off, so the commit-address gate stopped nothing. ${what}`, carried: null }
  }
  throw new Error(`MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is ${JSON.stringify(position)}, and the commit-address gate knows only block, remind and off. Nothing was let through.`)
}

/**
 * WHETHER THE OFFICE'S STEP DOOR REFUSED A STEP ONLY BECAUSE ITS FACTS HOLD ONE KEY THE DOOR DOES NOT DECLARE: the door's
 * own status and words for that one refusal, as src/server/lib/merge-state-machine.ts gives them (parseTheFacts), and
 * nothing looser. A refusal that names a second fault beside the key is not this one.
 * @param {{ status: number | null, words: string }} refusal
 * @param {string} step
 * @param {string} key
 */
export function theStepDoorDoesNotKnowTheKey(refusal, step, key) {
  return refusal.status === 422 && refusal.words === `The facts of the step "${step}" cannot be read: facts: Unrecognized key: "${key}". Nothing was written.`
}

/**
 * ONE SENTENCE FOR THE LOG WHEN AN OFFICE OLDER THAN THE FIELD REFUSED THE COMMITS THE INTEGRATED STEP CARRIED, and the
 * step is sent again without them. The entry's record and its receipt will not name the commits, so this sentence names
 * each, with the position and the screen's file.
 * @param {WhatIsCarried & { log: string }} carried
 * @param {string} office the office's address
 * @param {string} words what the office answered
 */
export function theOfficeDidNotTakeThem(carried, office, words) {
  return (
    `The office at ${office} does not take placeholderCommits on the integrated step, so the step is sent again without them. ` +
    `It answered: ${words} MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is at ${carried.position}, and the entry goes on with ` +
    `${counted(carried.commits.length, 'commit')} at the placeholder domain ${carried.domain} that neither its record nor its ` +
    `receipt will name. This log and ${carried.log} name them: ${eachCommitFound(carried.commits)}.`
  )
}
