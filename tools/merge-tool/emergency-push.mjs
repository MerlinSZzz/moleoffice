// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY PUSH TO MAIN (wave 13u round 82, item 16): one commit straight to main, past the queue, while the
 * emergency switch is on, because an emergency fix does not go through the merge queue. Part of the merge tool,
 * tools/the-merger.mjs, run as
 * `--emergency-push <commit> --root <main checkout> --message <id>:<contentHash> --as <your handle>` with MOLE_AGENT_KEY
 * set. src/shared/emergency-push.ts says what the push is, and src/server/lib/emergency-push.ts keeps its record.
 *
 * The office decides whether the push may start: who asks, the switch, the chat message, and that nobody else moves main.
 * This module moves main only between the office's two doors. It waits while an entry of the checkout is landing, as a
 * landing waits for another, and never for an entry under test. Main moves by fast-forward, as a landing moves it, and
 * the commit goes on through pushLanded, as every landing's does. The commit must already be in the main checkout's
 * objects, as a commit made in a worktree of it is: the tool fetches nothing.
 *
 * AN EMERGENCY PUSH CHANGES MAIN ONLY. It takes no backup, runs no migration and restarts nothing, so it is refused
 * unless a landing in the checkout would change main only too: when the office runs from another folder on the database
 * the checkout names (the-stable-office.mjs). The emergency release takes the commit into the office (wave 13q).
 */

import './a-library-is-not-a-program.mjs'
import { DOCUMENTS_LANE, askTheMergeList } from '../../src/shared/merge-queue.ts'
import { git, tryGit } from './git.mjs'
import { fail, log } from './log-and-state.mjs'
import { pushLanded } from './push.mjs'
import { theEntriesTheQueueCouldNotRead } from './unreadable-entries.mjs'

/** What the tool says when MOLE_AGENT_KEY is not set: nothing is asked, so main does not move and nothing is written. */
export const AN_EMERGENCY_PUSH_NEEDS_YOUR_KEY =
  'MOLE_AGENT_KEY is not set. An emergency push is asked under your own handle and key, so that its record names who pushed. Nothing was asked.'

/** What the tool says when its caller gives it no ask or no sleep: nothing is asked, and no wait is made. */
export const THE_EMERGENCY_PUSH_NEEDS_ASK_AND_SLEEP =
  "runTheEmergencyPush needs ask and sleep from its caller, as the-merger.mjs passes its own ask and office-keeper.mjs's sleep, so that emergency-push.mjs reaches no office module itself."

/** What the tool says when its caller gives it no ask: the pushes that moved main cannot be read. */
export const SAYING_THE_PUSHES_NEEDS_ASK =
  "sayThePushesThatMovedMain needs ask from its caller, as land.mjs and testing.mjs pass office-keeper.mjs's, so that emergency-push.mjs reaches no office module itself."

/** How long a push waits for a landing, or another push, to end before it gives up. */
const THE_LONGEST_WAIT_FOR_MAIN_MS = 10 * 60 * 1000

/**
 * PUSH `commit` TO MAIN IN `root`. `message` is the chat message that told the owner, as `{ id, seq: 1, contentHash }`.
 * `line`, when given, is the handle of the supervisor of the line whose branch the fix came from; the office keeps it, and
 * a red follow-up in a file the push changed goes back to that line first. `ask(method, path, body)` asks the office as the caller and answers `{ status, body }`. `sleep(ms)` waits between reads, and the caller passes office-keeper.mjs's. `whatAboutTheOffice()` answers
 * as the-stable-office.mjs does for a landing. Answers the push as the office read it back at its end; fails with the
 * office's own sentence when the office refuses it.
 */
export async function runTheEmergencyPush({ root, commit, message, line = null, ask, sleep, whatAboutTheOffice, waitMs = THE_LONGEST_WAIT_FOR_MAIN_MS, everyMs = 5000 }) {
  if (typeof ask !== 'function' || typeof sleep !== 'function') throw new Error(THE_EMERGENCY_PUSH_NEEDS_ASK_AND_SLEEP)
  const office = await whatAboutTheOffice()
  if (office.cannotTell !== undefined) fail(`${office.cannotTell}. Main was not moved, and no emergency push was filed.`)
  if (!office.mainOnly) {
    fail(`An emergency push changes main only: it takes no backup, runs no migration and restarts nothing. A landing in ${root} would do more, because ${office.says}. Main was not moved, and no emergency push was filed; send the fix through the queue.`)
  }
  log(office.says)
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'])
  if (dirty !== '') fail(`The main checkout ${root} has uncommitted changes, so nothing is pushed to it. No emergency push was filed:\n${dirty}`)

  const deadline = Date.now() + waitMs
  let push = null
  while (push === null) {
    const writer = await whoMovesMain(root, ask)
    if (writer === null) {
      const taken = await ask('POST', '/api/merge-queue/emergency-pushes', { root, commit, message, ...(line === null ? {} : { line }) })
      if (taken.status === 201) {
        push = taken.body.push
        break
      }
      // The office refused it. When somebody started moving main between the read and the ask, it is waited for.
      if (taken.status !== 409 || (await whoMovesMain(root, ask)) === null) fail(`The office refused the emergency push (${String(taken.status)}): ${taken.body?.error ?? 'it gave no reason'}`)
      continue
    }
    if (Date.now() >= deadline) fail(`${writer} for ${String(Math.round(waitMs / 60_000))} minutes. Main was not moved, and no emergency push was filed.`)
    log(`${writer}; main moves one writer at a time, so this push waits`)
    await sleep(everyMs)
  }
  log(`the office filed emergency push ${push.id} of ${commit}; it holds main in ${root} until it ends`)

  // THE COMPARE-AND-SWAP, as a landing makes it: main must be where the office read it when it took the push.
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  if (head !== push.mainBefore) {
    fail(`Main in ${root} is at ${head}, not at ${push.mainBefore} as when the office took emergency push ${push.id}. Nothing was moved. The push holds main until somebody finds out who moved it and ends it.`)
  }
  const ff = tryGit(root, ['merge', '--ff-only', commit])
  if (!ff.ok) {
    const says = `git merge --ff-only ${commit} failed in ${root}: ${ff.stderr || ff.stdout}`
    await theEnd(ask, push.id, { says, onward: null })
    fail(`${says} Main was not moved, and emergency push ${push.id} was ended as stopped.`)
  }
  log(`main moved from ${push.mainBefore} to ${commit} by fast-forward`)
  const onward = await pushLanded(root, commit)
  const ended = await theEnd(ask, push.id, { says: `Moved main from ${push.mainBefore} to ${commit} by fast-forward.`, onward: { ok: onward.ok, says: onward.says } })
  if (!onward.ok) fail(`Main moved to ${commit}, and emergency push ${push.id} was ended as pushed, but the commit did not go on: ${onward.says}`)
  return ended
}

/** Who moves main in `root` now, as a sentence that names it, or null. A landing entry, of either lane, or a push. */
async function whoMovesMain(root, ask) {
  const lanes = await Promise.all([root, `${root} ${DOCUMENTS_LANE}`].map(async (lane) => {
    const reply = await askTheMergeList({ lane, states: ['landing'] }, 'narrow', (path) => ask('GET', path), log)
    if (reply.status !== 200) fail(`The office did not read the merge queue's lane ${lane} (${String(reply.status)}): ${reply.body?.error ?? 'it gave no reason'}`)
    const unread = theEntriesTheQueueCouldNotRead(reply.body)
    if (unread !== null) fail(`The office did not read every entry of the merge queue's lane ${lane}, so who moves main cannot be told: ${unread}`)
    return reply.body
  }))
  const landing = lanes.flatMap((reply) => reply.lanes ?? []).flatMap((lane) => lane.entries).find((one) => one.state === 'landing')
  if (landing !== undefined) return `merge entry ${landing.id} is landing in ${root}`
  const pushing = (lanes[0].emergencyPushes ?? []).find((one) => one.state === 'pushing' && one.root === root)
  return pushing === undefined ? null : `emergency push ${pushing.id} is moving main in ${root}`
}

async function theEnd(ask, id, body) {
  const ended = await ask('POST', `/api/merge-queue/emergency-pushes/${id}/end`, body)
  if (ended.status !== 200) fail(`The office did not end emergency push ${id} (${String(ended.status)}): ${ended.body?.error ?? 'it gave no reason'} The push holds main until it is ended.`)
  return ended.body.push
}

/**
 * AN ENTRY TESTED ON THE OLD MAIN NAMES THE PUSH THAT MOVED IT (item 16, part b). When a landing finds main moved from
 * `from` to `to`, this writes to the entry's log each emergency push whose commit came in between. The entry is sent back
 * to be integrated and tested again either way, so a list it cannot read is said in the log and does not stop it. The
 * caller passes office-keeper.mjs's ask.
 */
export async function sayThePushesThatMovedMain(root, from, to, { ask } = {}) {
  if (typeof ask !== 'function') throw new Error(SAYING_THE_PUSHES_NEEDS_ASK)
  // ONLY THE PUSHES ARE READ, and they are the lane's whatever states are asked, so it asks for the fewest entries.
  const reply = await askTheMergeList({ lane: root, states: ['landing'] }, 'narrow', (path) => ask('GET', path), log)
  if (reply.status !== 200 || !Array.isArray(reply.body?.emergencyPushes)) {
    log(`the office did not list the emergency pushes of ${root} (${String(reply.status)}: ${reply.body?.error ?? 'no list in its answer'}), so this log cannot say whether one moved main`)
    return
  }
  for (const push of reply.body.emergencyPushes.filter((one) => one.state === 'pushed')) {
    const reached = tryGit(root, ['merge-base', '--is-ancestor', push.commit, to])
    const before = tryGit(root, ['merge-base', '--is-ancestor', push.commit, from])
    if (reached.ok && !before.ok) log(`emergency push ${push.id} moved main to ${push.commit}; this entry is integrated and tested again on the new main`)
  }
}
