// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MAIN-WORLD GUARD'S POLICY: WHICH PENDING TOOL CALLS IT STOPS, AND WHY. One policy, one place.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * A decision of 22 September 2026 says that in the main world (the host, outside any sandbox), secretaries, supervisors
 * and small worker jobs run with full permissions, and one office guard, the same policy for every runtime, stops the
 * dangerous acts. This file is that policy.
 * `main-world-guard.mjs` beside it is the hook every runtime calls; it reads the pending call,
 * asks the office for what only the office knows, and asks this file for the verdict.
 *
 * IT IS A RAILING, NOT A WALL. The threat model is accidents, not malice. It reads the command text
 * the way a shell would expand it, as far as that can be done without running anything, and it
 * stops the shapes that have hurt this owner. A program that deletes files itself (a test, a
 * script, `node -e`) is invisible to it, and a determined agent can always get round it. Inside a
 * sandbox the container is the wall, so this policy lets everything
 * through there.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE RULES
 * ---------------------------------------------------------------------------------------
 *
 * 1. Nothing deletes, moves or overwrites the home directory, an ancestor of it, or `/`. That
 *    includes a glob directly inside one of them (`rm -rf ~/*`) and a target that is, or may be, an
 *    empty or unset variable (`rm -rf "$SH"` with SH empty, or SH=$(cat missing-file)). It applies
 *    to everybody, secretaries included.
 * 2. A command that reassigns HOME and deletes in the same command is stopped, and so is HOME set
 *    to a value that is or may be empty, or to `/` or an ancestor of the home. This is the shape
 *    of 16 September 2026 (HOME=$SH …; rm -rf "$SH"). Everybody.
 * 3. Nothing writes to, deletes or moves the office's keys file or backups (`data/keys.json`,
 *    `data/backups`), `~/.ssh`, `~/.claude/.credentials.json` or `~/.config/mole-office`, and
 *    nothing deletes, moves or overwrites the office's live database file. Everybody.
 * 4. Deleting, moving or overwriting a path outside the agent's registered work area is stopped,
 *    unless the agent holds a card whose work-area grain is `nothing` (the secretary card: it
 *    "names nothing and is limited by none"). The temporary directory is outside every rule 4
 *    check. Creating a new file, appending, and editing part of a file are not rule 4's business.
 * 5. Nothing kills by pattern: pkill, killall, fuser -k, or a kill (or xargs kill) fed by a process
 *    list read by name, command line, file or port (pgrep, pidof, ps, lsof, fuser, pstree), through
 *    a subshell too, or a kill inside a loop over such a list (problem DsxidFiPDaaw). On
 *    4 September 2026 such a kill stopped the owner's own API, whose command line matched (problem
 *    LD9Yor6qIVVC). A kill of a group or a process number the caller recorded stays allowed
 *    (decision gP_TJ0FWdg2U, point 3). Everybody. Chapter 2's rule, stop only what you recorded, is
 *    the real fix; this railing catches the shape when it is typed.
 *
 * Everything else is let through.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS SPLIT
 * ---------------------------------------------------------------------------------------
 *
 * `what-a-call-does.mjs` turns a call into effects (this path deleted, that one overwritten, HOME
 * set to this) and knows nothing about which are allowed; this file is the rules and nothing else.
 * `lookAt` answers rules 1 to 3 from the call and the machine alone, and returns the effects rule 4
 * still has to judge. `areaReasons` judges those against what the office said about the agent.
 * The split exists so that the common case — a command that deletes nothing — never waits on the
 * office, and so that a test can hand this file a world and an answer without an office at all.
 */

import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { effectsOf } from './what-a-call-does.mjs'
import { theHostJobsFolderBeside, theHostToolsFileBeside } from '../src/config/host-tools-file.mjs'

export { toplevelOf } from './what-a-call-does.mjs'

/** @typedef {import('./what-a-call-does.mjs').ToolCall} ToolCall */
/** @typedef {import('./what-a-call-does.mjs').Effect} Effect */

// ---------------------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------------------

/**
 * One path this policy protects. `kind` is `file` or `dir`; `deleteOnly` means writing to it is
 * allowed and only deleting, moving or overwriting it is stopped (the live database, which the
 * office itself writes). `suffix`, when set, protects that path's last segments in any checkout.
 * @typedef {object} Protected
 * @property {string} path An absolute path, or for a suffix entry the segments (`data/keys.json`).
 * @property {'file' | 'dir'} kind
 * @property {string} what What it is, in words.
 * @property {boolean} [deleteOnly]
 * @property {boolean} [suffix]
 */

/**
 * What the policy knows about the machine. Built by the hook from the real machine; a test builds
 * its own.
 * @typedef {object} World
 * @property {string} home The real home directory (from the password database, not from $HOME).
 * @property {Record<string, string | undefined>} env The environment the command's shell starts from.
 * @property {string[]} tempRoots Directories rule 4 never judges (the temporary directory).
 * @property {Protected[]} protectedPaths Rule 3's list.
 * @property {boolean} inContainer True inside a sandbox's container, where the policy stands down.
 */

/**
 * The verdict of rules 1 to 3, and what rule 4 still has to judge.
 * @typedef {object} Look
 * @property {string[]} reasons Why the call is stopped; empty when rules 1 to 3 let it through.
 * @property {Effect[]} needsTheArea Effects rule 4 judges once the office has said who is asking.
 * @property {boolean} deleteShaped Whether the call deletes, moves or overwrites anything.
 */

/**
 * What the office said about the agent, for rule 4.
 * @typedef {{ exempt: true, role: string } | { exempt: false, role: string | null, area: string[] | null, root: string } | { cannot: string }} Asker
 */

/**
 * RULE 3'S LIST, IN ONE PLACE. The office's own paths are worked out by src/config/settings.mjs and
 * handed in, so the key file's name is spelled only there; the last two segments of each are also
 * protected in any checkout (`data/keys.json`, `data/backups`), which is how the task named them.
 * @param {{ home: string, keys: string, backups: string, database: string }} at
 * @returns {Protected[]}
 */
export function theProtectedPaths(at) {
  const lastTwo = (/** @type {string} */ p) => `${basename(dirname(p))}/${basename(p)}`
  return [
    { path: at.keys, kind: 'file', what: "the office's keys file" },
    { path: at.backups, kind: 'dir', what: "the office's backups" },
    { path: lastTwo(at.keys), kind: 'file', what: "an office's keys file", suffix: true },
    { path: lastTwo(at.backups), kind: 'dir', what: "an office's backups", suffix: true },
    // WHAT AN OFFICE MAY RUN ON THE HOST, and what its runner will send with the office's key. They sit beside the keys
    // file, so they are worked out from it and the guard's arguments stay the three paths.
    { path: theHostToolsFileBeside(at.keys), kind: 'file', what: "the office's host tools file" },
    { path: theHostJobsFolderBeside(at.keys), kind: 'dir', what: "the office's host job runner's folder" },
    { path: lastTwo(theHostToolsFileBeside(at.keys)), kind: 'file', what: "an office's host tools file", suffix: true },
    { path: lastTwo(theHostJobsFolderBeside(at.keys)), kind: 'dir', what: "an office's host job runner's folder", suffix: true },
    { path: at.database, kind: 'file', what: "the office's live database", deleteOnly: true },
    { path: join(at.home, '.ssh'), kind: 'dir', what: 'the SSH keys' },
    { path: join(at.home, '.claude', '.credentials.json'), kind: 'file', what: "Claude Code's credentials" },
    { path: join(at.home, '.config', 'mole-office'), kind: 'dir', what: "Mole Office's own configuration and secrets" },
  ]
}

/** How the guard signs every refusal: what it is, and who can do the act when it is meant. */
export const RAILING =
  'This guard is a railing against accidents, not a wall. If the act is really meant, a secretary can do it.'

// ---------------------------------------------------------------------------------------
// RULES 1 TO 3
// ---------------------------------------------------------------------------------------

/**
 * A path made absolute and followed through every symbolic link that exists along it, so `~/..`
 * and a link to the home are both seen for what they are.
 * @param {string} path @returns {string}
 */
export function realish(path) {
  let at = resolve(path)
  /** @type {string[]} */
  const tail = []
  for (;;) {
    try {
      const real = realpathSync.native(at)
      return tail.length === 0 ? real : join(real, ...tail.reverse())
    } catch {
      const up = dirname(at)
      if (up === at) return resolve(path)
      tail.push(basename(at))
      at = up
    }
  }
}

/** @param {string} path @param {string} dir @returns {boolean} */
function inside(path, dir) {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/**
 * Where an effect's target lands: a path, a directory whose entries a glob picks, or unknown.
 * @typedef {{ path: string, glob: false } | { path: string, glob: true, pattern: string } | { unknown: string, prefix: string | null }} Place
 */

/**
 * @param {Effect} e @returns {Place}
 */
function placeOf(e) {
  const t = e.target
  if (t.text === null) {
    const prefix = t.prefix === null ? null : isAbsolute(t.prefix) ? realish(t.prefix) : e.cwd === null ? null : realish(resolve(e.cwd, t.prefix))
    return { unknown: t.doubts[0] ?? `${t.said} is not something the guard can work out`, prefix }
  }
  if (!isAbsolute(t.text) && e.cwd === null) return { unknown: e.cwdDoubt ?? 'the directory it runs in is not known', prefix: null }
  const full = isAbsolute(t.text) ? t.text : resolve(/** @type {string} */ (e.cwd), t.text)
  if (t.glob) {
    const first = full.search(/[*?[{]/)
    const dir = full.slice(0, full.lastIndexOf('/', first) + 1) || '/'
    return { path: realish(dir), glob: true, pattern: full.slice(dir.length) }
  }
  return { path: realish(full), glob: false }
}

/**
 * How a message names what was asked for: the command as it was written, shortened.
 * @param {Effect} e @returns {string}
 */
function named(e) {
  const text = (e.command ?? `${e.verb} ${e.target.said}`).replace(/\s+/g, ' ').trim()
  return `\`${text.length > 120 ? `${text.slice(0, 117)}…` : text}\``
}

/** Effects that destroy what is there: rule 1's and rule 4's business. */
const DESTROYS = new Set(['delete', 'move', 'overwrite'])

/**
 * Rules 1 to 3 on a call, and the effects rule 4 still has to judge.
 * @param {ToolCall} call @param {World} world @returns {Look}
 */
export function lookAt(call, world) {
  if (world.inContainer) return { reasons: [], needsTheArea: [], deleteShaped: false }
  const got = effectsOf(call, world)
  /** @type {string[]} */
  const reasons = []
  const home = realish(world.home)
  const deletes = got.effects.filter((e) => e.kind === 'delete' || e.kind === 'move')

  // RULE 2: HOME.
  for (const swap of got.homeSwaps) {
    const v = swap.value
    // HOME="${SH:?}" WITH SH EMPTY never runs: the shell stops first, which is the point of writing it.
    if (v !== null && v.aborts) continue
    if (v === null) { reasons.push(`\`${swap.said}\` leaves HOME unset, and programs then fall back to the real home ${world.home}. Set HOME to a directory that exists.`); continue }
    if (v.text === '' || (v.text === null && v.maybeEmpty)) {
      const why = v.emptyVars.length > 0 ? `${v.emptyVars.map((n) => `$${n}`).join(', ')} is empty or unset here` : v.text === '' ? 'it is set to nothing' : v.doubts[0] ?? 'it may be empty'
      reasons.push(`\`${swap.said}\` sets HOME to something that ${v.text === '' ? 'is' : 'may be'} empty (${why}). Programs then use the real home ${world.home}, which is how the home was deleted on 16 September. Write HOME="\${SH:?}" so the shell stops when it is empty.`)
      continue
    }
    if (v.text !== null) {
      const at = realish(v.text)
      if (at === sep || (inside(home, at) && at !== home)) reasons.push(`\`${swap.said}\` sets HOME to ${at}, which holds the real home ${world.home}.`)
    }
  }
  if (got.homeSwaps.length > 0 && deletes.length > 0) {
    reasons.push(`This command reassigns HOME and deletes in the same command (${deletes.map((d) => d.verb).filter((v, i, a) => a.indexOf(v) === i).join(', ')}). That is the shape that deleted the home on 16 September. Run the command that needs the other HOME on its own, then delete in a second command, naming the path in full.`)
  }

  for (const e of got.effects) {
    const destroys = DESTROYS.has(e.kind)
    // RULE 1: EMPTY OR UNSET VARIABLES IN A DELETE.
    if (e.kind === 'delete' || e.kind === 'move') {
      if (e.target.emptyVars.length > 0) {
        reasons.push(`${named(e)} deletes from a path built on ${e.target.emptyVars.map((n) => `$${n}`).join(', ')}, which is empty or unset here, so it would come out as "${e.target.text ?? ''}". Name the path in full, or write "\${${e.target.emptyVars[0]}:?}" so the shell stops when it is empty.`)
        continue
      }
      if (e.target.text === null && e.target.maybeEmpty) {
        reasons.push(`${named(e)} deletes something that may be empty: ${e.target.doubts[0] ?? 'its value is only known when it runs'}. Write the variable as "\${NAME:?}" so the shell stops when it is empty, or name the path in full.`)
        continue
      }
      if (e.target.text === null && e.target.doubts.length > 0) {
        reasons.push(`${named(e)} deletes from a path with a part that may be empty: ${e.target.doubts[0]}. Write it as "\${NAME:?}" so the shell stops when it is empty.`)
        continue
      }
      if (e.target.text !== null && !isAbsolute(e.target.text) && e.cwd === null && e.cwdDoubt !== null) {
        reasons.push(`${named(e)} deletes relative to a directory the guard cannot be sure of: ${e.cwdDoubt}. Use a full path.`)
        continue
      }
    }
    const place = placeOf(e)
    // RULE 1: THE HOME, ITS ANCESTORS AND THE ROOT.
    if (destroys && !('unknown' in place)) {
      const at = place.path
      if (at === sep || inside(home, at)) {
        const what = at === home ? `the home directory ${home}` : at === sep ? 'the root of the filesystem' : `${at}, which holds the home directory`
        reasons.push(place.glob
          ? `${named(e)} would ${e.kind} everything matching ${place.pattern} directly inside ${what}.`
          : e.within === true
            ? `${named(e)} would delete files anywhere under ${what}.`
            : `${named(e)} would ${e.kind} ${what}.`)
        continue
      }
    }
    // RULE 3: KEYS, BACKUPS, CREDENTIALS AND THE LIVE DATABASE.
    const hit = protectedHit(e, place, world)
    if (hit !== null) { reasons.push(hit); continue }
  }
  // RULE 5: A KILL BY PATTERN.
  for (const k of got.patternKills) {
    reasons.push(`\`${k.said.trim()}\` is a kill by pattern: ${k.why}. On 4 September 2026 such a kill stopped the owner's own API, whose command line matched. Stop what you started by the process group or the process number you recorded when you started it: kill -- -<group>, or kill <pid>.`)
  }
  const destroying = got.effects.filter((e) => DESTROYS.has(e.kind))
  const temp = world.tempRoots.map(realish)
  // RULE 4 IS ONLY ASKED ABOUT WHAT IT JUDGES, so a command that writes to /dev/null or the temporary
  // directory, or creates a file, never waits on the office.
  const needsTheArea = destroying.filter((e) => {
    if (e.kind === 'overwrite' && e.target.text !== null && !e.target.glob && e.trackedOnly !== true) {
      // OVERWRITING A FILE THAT DOES NOT EXIST YET is creating it, and creating is not rule 4's business.
      if (e.cwd === null && !isAbsolute(e.target.text)) return true
      if (!existsSync(isAbsolute(e.target.text) ? e.target.text : resolve(/** @type {string} */ (e.cwd), e.target.text))) return false
    }
    const place = placeOf(e)
    const where = 'unknown' in place ? place.prefix : place.path
    return !(where !== null && (temp.some((t) => inside(where, t)) || inside(where, '/dev')))
  })
  return { reasons: [...new Set(reasons)], needsTheArea, deleteShaped: destroying.length > 0 || got.homeSwaps.length > 0 }
}

/**
 * Rule 3 on one effect: the sentence that stops it, or null.
 * @param {Effect} e @param {Place} place @param {World} world @returns {string | null}
 */
function protectedHit(e, place, world) {
  if ('unknown' in place) return null
  const destroys = DESTROYS.has(e.kind)
  const removes = e.kind === 'delete' || e.kind === 'move'
  for (const p of world.protectedPaths) {
    if (p.deleteOnly === true && !destroys) continue
    const act = e.kind === 'write' ? 'write to' : e.kind === 'overwrite' ? 'overwrite' : e.kind
    if (p.suffix === true) {
      const tail = sep + p.path
      if (!place.glob && (place.path.endsWith(tail) || place.path.includes(tail + sep))) return `${named(e)} would ${act} ${p.what} (${place.path}).`
      if (removes && e.untrackedOnly !== true && e.trackedOnly !== true && couldTake(e, join(place.path, p.path))) {
        const under = place.path
        const first = p.path.split('/')[0] ?? ''
        const candidates = [join(under, p.path), basename(under) === first ? join(under, p.path.slice(first.length + 1)) : null]
        for (const c of candidates) if (c !== null && existsSync(c)) return `${named(e)} would ${e.kind} ${c}, which is ${p.what}.`
      }
      continue
    }
    const target = realish(p.path)
    const exact = p.deleteOnly === true ? (place.path === target || place.path.startsWith(`${target}-`)) : inside(place.path, target)
    if (exact && !place.glob) return `${named(e)} would ${act} ${p.what} (${target}).`
    if (place.glob && dirname(target) === place.path.replace(/\/$/, '') && globMatches(place.pattern, basename(target))) {
      if (destroys || p.deleteOnly !== true) return `${named(e)} would ${act} ${p.what} (${target}), which the pattern matches.`
    }
    if (place.glob && inside(target, place.path) && target !== place.path && destroys) {
      const first = target.slice(place.path.length).split(sep).filter((s) => s !== '')[0] ?? ''
      if (globMatches(place.pattern.split('/')[0] ?? '', first)) return `${named(e)} would ${e.kind} ${target}, which is ${p.what}.`
    }
    if (removes && e.untrackedOnly !== true && e.trackedOnly !== true && couldTake(e, target) && !place.glob && inside(target, place.path) && target !== place.path) {
      return `${named(e)} would ${e.kind} ${place.path}, and ${p.what} (${target}) is inside it.`
    }
  }
  return null
}

/**
 * Whether a `find -name` delete could take this protected path: its own name matches, or, for a
 * directory, the name of something directly inside it does. Any other delete could take it.
 * @param {Effect} e @param {string} path @returns {boolean}
 */
function couldTake(e, path) {
  if (e.names === undefined) return true
  /** @type {string[]} */
  let inner = []
  try { inner = readdirSync(path) } catch { inner = [] }
  return e.names.some((n) => [basename(path), ...inner].some((name) => (n.caseless ? globMatches(n.pattern.toLowerCase(), name.toLowerCase()) : globMatches(n.pattern, name))))
}

/**
 * Whether a shell glob matches a name. Only *, ? and [..] matter here.
 * @param {string} pattern @param {string} name @returns {boolean}
 */
function globMatches(pattern, name) {
  const re = pattern.replace(/[.+^$(){}|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  try { return new RegExp(`^${re}$`).test(name) && (pattern.startsWith('.') || !name.startsWith('.') || pattern.startsWith('.*')) } catch { return true }
}

// ---------------------------------------------------------------------------------------
// RULE 4: THE WORK AREA
// ---------------------------------------------------------------------------------------

/**
 * Rule 4: the sentences that stop the effects outside the agent's work area. `effects` are the ones
 * `lookAt` said rule 4 must judge; the temporary directory is already out of them.
 * @param {Effect[]} effects @param {Asker} asker @returns {string[]}
 */
export function areaReasons(effects, asker) {
  /** @type {string[]} */
  const reasons = []
  if ('exempt' in asker && asker.exempt) return reasons
  for (const e of effects) {
    const place = placeOf(e)
    const where = 'unknown' in place ? place.prefix : place.path
    const said = `${named(e)}`
    if ('cannot' in asker) {
      reasons.push(`${said} ${verbFor(e)} outside the temporary directory, and the guard cannot check that against your work area: ${asker.cannot} So it stops the command rather than guess.`)
      continue
    }
    if (asker.area === null || asker.area.length === 0) {
      reasons.push(`${said} ${verbFor(e)} outside the temporary directory, and you have no registered work area, so that is outside it. Register a work area through the office, or ask a secretary.`)
      continue
    }
    if (where === null) {
      reasons.push(`${said} ${verbFor(e)} somewhere the guard cannot work out (${'unknown' in place ? place.unknown : ''}), so it cannot tell whether that is inside your work area. Name the path in full.`)
      continue
    }
    const areas = asker.area.map((a) => realish(isAbsolute(a) ? a : resolve(asker.root, a)))
    if (areas.some((a) => inside(where, a))) continue
    const what = 'unknown' in place ? `something in ${where}` : where
    reasons.push(`${said} ${verbFor(e)} ${what}, which is outside your work area (${asker.area.join(', ')}, in ${asker.root}). Only a secretary may do that. Change your work area through the office, or ask a secretary.`)
  }
  return [...new Set(reasons)]
}

/** @param {Effect} e @returns {string} */
function verbFor(e) {
  return e.kind === 'delete' ? 'would delete' : e.kind === 'move' ? 'would move' : 'would overwrite'
}
