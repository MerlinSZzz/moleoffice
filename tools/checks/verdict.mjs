// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EVERY CHECKER UNDER tools/checks/ PRINTS, AND HOW IT EXITS, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TOOLS EXIST
 * ---------------------------------------------------------------------------------------
 *
 * The sandbox v1 spec, R4 (21 September 2026): everything a program can decide with
 * certainty becomes a tool. The tool decides the deterministic part and hands the part that needs
 * judgment to the responsible agent, which is the inspector. The same tools are called by an agent
 * before it submits and by the merge queue as its gate, so the gate and the agent's own check are
 * one check and cannot disagree.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTRACT
 * ---------------------------------------------------------------------------------------
 *
 * Every checker prints one JSON object on stdout:
 *
 *   {
 *     "tool": "tools/checks/<name>.mjs",
 *     "checked": { ...what was checked: the repository and commits, or the manifest and root... },
 *     "decided": [ { "path", "check", "ok", "detail" } ],
 *     "needsJudgment": [ { "path", "why" } ]
 *   }
 *
 * `decided` holds what the program settled. `ok: false` is a decided failure. `needsJudgment` holds
 * what it could not settle, each with the reason a reader has to look, one item per path, each
 * with exactly `path` and `why`; the queue hands that list to the inspector (tools/the-inspector.mjs
 * --needs-judgment reads this whole object, or the bare list). The list is what the program could
 * not settle, not the whole of what the inspector reads.
 *
 * The exit code:
 *
 *   0  no decided failure. `needsJudgment` may still hold items, and they are not a failure.
 *   1  at least one decided failure.
 *   2  the checker could not do its job at all (a bad argument, a repository or manifest it could
 *      not find, a configuration it could not read). It prints `{"tool", "error"}` on stdout and
 *      the same sentence on stderr. This is never a verdict on the changeset: a caller treats it as
 *      its own failure, never as a pass and never as a bounce.
 *
 * An empty `decided` list means nothing was decidable, not that everything passed. The `checked`
 * block says what was looked at, so a reader can tell the two apart.
 */

/** @typedef {{ path: string, check: string, ok: boolean, detail: string }} Decided */
/** @typedef {{ path: string, why: string }} Judgment */

/** A fresh, empty verdict for one run of one checker. */
export function newVerdict() {
  return { /** @type {Decided[]} */ decided: [], /** @type {Judgment[]} */ needsJudgment: [] }
}

/** Record one check the program settled. */
export function decide(verdict, path, check, ok, detail) {
  verdict.decided.push({ path, check, ok: ok === true, detail })
}

/**
 * Record one thing the program could not settle, and why somebody has to look.
 *
 * ONE ITEM PER PATH. A second reason for a path already on the list is added to its `why`. The
 * inspector reads the list through src/config/needs-judgment.mjs, which refuses a path named twice,
 * and a person reads a path once anyway.
 */
export function needsJudgment(verdict, path, why) {
  const known = verdict.needsJudgment.find((one) => one.path === path)
  if (known !== undefined) known.why = `${known.why} ${why}`
  else verdict.needsJudgment.push({ path, why })
}

/** Whether any check in this verdict failed. */
export function anyFailed(verdict) {
  return verdict.decided.some((one) => !one.ok)
}

/**
 * WRITE FIRST, EXIT SECOND, AND ONLY ONCE THE WRITE HAS LEFT THIS PROCESS.
 *
 * When stdout is a pipe Node writes asynchronously, and `process.exit()` throws away whatever is
 * still queued behind the pipe buffer. A files-changeset verdict of about 1 MB (378 avatars)
 * reached tools/the-merger.mjs cut off at 146,176 bytes with exit 0, and the merger bounced the
 * entry because it could not parse it (measured 22 September 2026). So no exit path calls
 * `process.exit` directly: each hands its writes here and the exit runs in the last write's
 * callback. The exit code is unchanged: 0 no decided failure, 1 a decided failure, 2 the checker
 * itself failed.
 *
 * ONCE AN EXIT IS SCHEDULED NO OTHER ONE IS. A second write would race the first for which
 * `process.exit` runs, so `writeThenExit` keeps only the first.
 *
 * AND THE CHECKER STOPS. Waiting for the callback means the process does not stop inside
 * `cannotRun` or the `--help` branch, so those throw `STOPPED` to unwind the checker's own code
 * (its `finally` blocks still run) instead of letting it carry on after it has said it cannot
 * judge anything. `exitTwoOnACrash` lets `STOPPED` through: it is a stop the checker chose, not a
 * crash. `finish` needs no throw because it is the last thing a checker does.
 */
let leaving = false
function writeThenExit(parts, code) {
  if (leaving) return
  leaving = true
  let waiting = parts.length
  const oneDone = () => {
    waiting -= 1
    if (waiting === 0) process.exit(code)
  }
  for (const [stream, text] of parts) stream.write(text, oneDone)
}

/** A stop the checker chose, so `cannotRun` and `--help` unwind the rest of it without a crash. */
const STOPPED = Symbol('the checker has stopped')

/** The two sentences a refusal prints: the JSON on stdout, and the same words on stderr. */
function refusal(tool, sentence) {
  return [
    [process.stdout, `${JSON.stringify({ tool, error: sentence })}\n`],
    [process.stderr, `${tool}: ${sentence}\n`],
  ]
}

/** Print the verdict and exit 1 on a decided failure, 0 otherwise. */
export function finish(tool, checked, verdict) {
  const text = `${JSON.stringify({ tool, checked, decided: verdict.decided, needsJudgment: verdict.needsJudgment }, null, 1)}\n`
  writeThenExit([[process.stdout, text]], anyFailed(verdict) ? 1 : 0)
}

/** The checker could not do its job. Says so on both streams and exits 2, never 0 or 1. */
export function cannotRun(tool, sentence) {
  writeThenExit(refusal(tool, sentence), 2)
  throw STOPPED
}

/**
 * A CHECKER THAT CRASHES EXITS 2, NEVER 1.
 *
 * Node exits 1 on an uncaught error, and 1 is this contract's word for "the changeset failed a
 * check". A checker that fell over has not judged anything, so the first thing each checker does
 * is send any crash through `cannotRun`. A `finally` block still runs before this does (measured
 * on Node 22.23.2 for a throw at the top level of a module, before and after an `await`), so a
 * checker's scratch directory is still removed.
 *
 * THE CRASH PATH SCHEDULES THE WRITE ITSELF and does not call `cannotRun`, because `cannotRun`
 * now throws, and a throw from inside an `uncaughtException` handler is fatal. `STOPPED` is the
 * one error this handler lets past: the checker already said why it was stopping.
 */
export function exitTwoOnACrash(tool) {
  const crashed = (err) => {
    if (err === STOPPED) return
    writeThenExit(refusal(tool, `the checker itself failed, so nothing was judged: ${err?.stack ?? String(err)}`), 2)
  }
  process.on('uncaughtException', crashed)
  process.on('unhandledRejection', crashed)
}

/**
 * The value after a flag, from an argument list, or undefined when the flag is not there.
 * A flag given twice, or given with nothing after it, is refused through `cannotRun`.
 */
export function readFlags(tool, argv, known, usage) {
  /** @type {Record<string, string>} */
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      writeThenExit([[process.stdout, `${usage}\n`]], 0)
      throw STOPPED
    }
    if (!known.includes(arg)) cannotRun(tool, `I do not know the argument "${arg}". ${usage}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) cannotRun(tool, `${arg} needs a value after it. ${usage}`)
    if (Object.hasOwn(values, arg)) cannotRun(tool, `${arg} was given twice. ${usage}`)
    values[arg] = value
    index += 1
  }
  return values
}
