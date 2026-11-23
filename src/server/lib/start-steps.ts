// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH STEP OF A SERVER'S START TOOK, said in one line once it listens.
 *
 * While a new server starts after a landing, the office does not answer: the dev supervisor holds the
 * socket and requests wait in its queue until the server listens, except that the stand-in answers
 * those waiting while the server checks its migrations, with a 503 (tools/serve-dev-stand-in.mjs).
 * On 9 October 2026 the office's two restarts, at 10:10:38 and 10:24:34, each took about 11.5 s
 * from the old server's end to the new one listening, and its log could not say where that time
 * went, because only the server's JSON lines carry a time. This line says it on every start, so the
 * next slow start can be split without a second measurement.
 *
 * The times are counted from the process's own start (`performance.now()`), so the first step holds
 * node's start, the TypeScript loader and this file's imports.
 */

/** The words the line begins with. tests/a-restart-is-answered-within-its-measured-time.test.ts reads it. */
export const THE_START_LINE = 'start: listening'

/**
 * THE STEPS OF A START, in the order src/server/index.ts says them. tests/a-start-says-each-of-its-steps-apart.test.ts
 * reads them.
 *
 * The settings, the group, the service lock, opening the database, the service claim and the check that no test started
 * the server were one step until 31 October 2026, "the settings, the service lock and opening the database". On the
 * owner's Windows 11 that step took 53.9 s of a first start of 75.7 s, and 111 ms on Linux, and the line could not say
 * which part was slow. The database is opened by the first import that reaches it, so that
 * step's time also holds loading the modules the import brings in.
 */
export const THE_START_STEPS = {
  theCode: 'loading the code',
  theSettings: 'the settings',
  theGroup: 'the group this server was started in, asked on Windows',
  theServiceLock: 'the service lock',
  openingTheDatabase: 'opening the database and loading the modules that reach it',
  theServiceClaim: 'the service claim',
  theTestCheck: 'the check that no test started this server',
  theUsersPath: "reading the user's PATH",
  theMigrationsCheck: 'the migrations check',
  theFirstWrites: 'the owner, the GPU watcher, the usage prune, the check worktree sweep, the keys and the regulations',
  theRoutes: 'building the routes',
  theCardWords: 'the role card words',
  theFormerRows: 'the rows a former place of this database left on this port',
  theSocket: 'binding the socket',
} as const

export interface StartSteps {
  /** Say that a step has just ended. */
  ended(step: string): void
  /** The line, from the steps said so far. */
  line(): string
}

export function theStartSteps(now: () => number = () => performance.now()): StartSteps {
  const ends: { step: string; at: number }[] = []
  return {
    ended(step) {
      ends.push({ step, at: now() })
    },
    line() {
      let before = 0
      const parts = ends.map(({ step, at }) => {
        const took = Math.round(at - before)
        before = at
        return `${step} ${String(took)} ms`
      })
      return `${THE_START_LINE} ${String(Math.round(before))} ms after this process began: ${parts.join(', ')}.`
    },
  }
}

/**
 * THE WORDS THE MIGRATIONS CHECK'S OWN LINE BEGINS WITH.
 *
 * It is a second line, and never the first, because tests/a-start-says-each-of-its-steps-apart.test.ts and
 * tests/a-restart-is-answered-within-its-measured-time.test.ts hold the first line's exact form, and a start that
 * refuses never prints the first line at all. The migrations check is where a slow start has actually gone, and a
 * refused check is when the split is most needed.
 */
export const THE_MIGRATIONS_CHECK_LINE = 'migrations check:'

/** Said instead, when the clock or the recorder fails. No error message or path is put in this line. */
export const THE_MIGRATIONS_CHECK_NOT_SAID = 'migrations check: the split could not be said'

/**
 * WHAT EACH PART OF THE MIGRATIONS CHECK TOOK, from the same `performance.now()` clock as the start line.
 *
 * Every call catches its own failure. Timing is an observation of the check, never an input to it: a recorder or a
 * clock that throws must leave the check's decision, its report, its refusal and its throw exactly as they were.
 * `line()` is where that is made whole — a recorder that broke says so in one short line instead of throwing.
 */
export interface MigrationsCheckTiming {
  /** Say that `part` has just begun. */
  began(part: string): void
  /** Say that `part` has just ended. A part still open when the line is made did not end. */
  ended(part: string): void
  /** Say a fact about the whole check, such as whether the second measure ran. */
  note(said: string): void
  /** The line, from the parts and notes said so far, or the short line when the recorder broke. */
  line(): string
}

/** Read the monotonic clock without allowing a clock failure to affect a start. */
export function readMonotonicClock(now: () => number = () => performance.now()): number | null {
  try {
    const at = now()
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

/**
 * A recorder for one migrations check. The clock is injected only so a test can make it throw; production uses
 * `performance.now()`.
 *
 * A PART LEFT OPEN IS A PART THAT DID NOT END, so a throw needs no call of its own: the code that would have said
 * the part ended never runs. `ended` closes the latest open part with that name, so cleanup that still runs after a
 * throw is timed without closing the part that threw.
 */
export function theMigrationsCheckTiming(now: () => number = () => performance.now()): MigrationsCheckTiming {
  const parts: { part: string; at: number; took: number | null }[] = []
  const notes: string[] = []
  let broken: string | null = null
  const broke = (why: string): void => {
    broken ??= why
  }
  return {
    began(part) {
      try {
        const at = readMonotonicClock(now)
        if (at === null) { broke('the clock failed'); return }
        parts.push({ part, at, took: null })
      } catch {
        broke('the clock failed')
      }
    },
    ended(part) {
      try {
        let found = -1
        for (let at = parts.length - 1; at >= 0; at--) {
          if (parts[at]!.part === part && parts[at]!.took === null) {
            found = at
            break
          }
        }
        if (found === -1) throw new Error('no part of that name had begun')
        const at = readMonotonicClock(now)
        if (at === null) { broke('the clock failed'); return }
        parts[found]!.took = Math.round(at - parts[found]!.at)
      } catch {
        broke('the recorder failed')
      }
    },
    note(said) {
      try {
        notes.push(said)
      } catch {
        broke('the recorder failed')
      }
    },
    line() {
      try {
        if (broken !== null) return `${THE_MIGRATIONS_CHECK_NOT_SAID} (${broken}).`
        const named = parts.map(({ part, took }) =>
          took === null ? `${part} did not end` : `${part} ${String(took)} ms`,
        )
        return `${THE_MIGRATIONS_CHECK_LINE} ${named.join(', ')}${notes.length === 0 ? '' : `. ${notes.join('. ')}`}.`
      } catch {
        return `${THE_MIGRATIONS_CHECK_NOT_SAID} (the recorder failed).`
      }
    },
  }
}

/**
 * The line a start prints for a migrations check, from a recorder it was given.
 *
 * THIS NEVER THROWS and never lets a recorder's failure become the start's. A recorder that is missing, that throws,
 * or that answers with something that is not its own line is replaced by the short line, which says the split could
 * not be said and why in plain words. Nothing here holds a path, a file name, a row or a setting.
 */
export function theMigrationsCheckLine(timing: MigrationsCheckTiming | null | undefined): string {
  if (timing === null || timing === undefined) return `${THE_MIGRATIONS_CHECK_NOT_SAID} (no timing was recorded).`
  try {
    const line = timing.line()
    if (typeof line !== 'string' || !line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `)) {
      return `${THE_MIGRATIONS_CHECK_NOT_SAID} (the recorder gave no line).`
    }
    return line
  } catch {
    return `${THE_MIGRATIONS_CHECK_NOT_SAID} (the recorder failed).`
  }
}
