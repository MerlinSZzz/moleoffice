// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN THE HOOK OR CASE THAT IS RUNNING NOW MUST END, so a wait inside it can stop, and say what it waited for, before
 * vitest ends it with "Hook timed out" and nothing more. liveApp in tests/helpers.ts asks this; the test is
 * tests/a-start-stops-waiting-by-name-before-its-hooks-limit.test.ts.
 *
 * A HOOK'S LIMIT IS NOT HANDED OUT BY VITEST. vitest 4 keeps it inside the timer it wraps each hook in, and writes it
 * beside a `beforeAll` or `beforeEach` hook under the symbol below, for the clean-up the hook may return. So
 * tests/set-how-long-a-test-may-take.ts calls `readEachHooksLimit` in a `beforeAll` of its own, the first of the file's,
 * and from then on each hook of the file says when it began and what its limit is. An `afterAll` or `afterEach` hook
 * carries no such symbol, and while one runs this says it cannot tell. A CASE'S END is counted from when the runner
 * began the case, its `beforeEach` hooks and any earlier try included, so it is never later than the end vitest counts.
 */
import { getCurrentTest, getHooks, type Suite } from '@vitest/runner'

/** When the running hook or case must end, and the limit it was given. `at` is Infinity when it has none. */
export interface TheEnd {
  at: number
  limitMs: number
  of: 'hook' | 'case'
}

/** What vitest writes beside a `beforeAll` or `beforeEach` hook: its limit in milliseconds. */
const A_HOOKS_LIMIT = Symbol.for('VITEST_CLEANUP_TIMEOUT')

type Running = { end: TheEnd } | { unreadable: string }

/** The hook running now, or null between hooks. vitest runs a file's hooks one after another (`sequence.hooks`). */
let running: Running | null = null

/** A limit vitest does not enforce, 0 or Infinity, is no limit. */
function theEnd(began: number, limitMs: number, of: 'hook' | 'case'): TheEnd {
  if (limitMs <= 0 || !Number.isFinite(limitMs)) return { at: Number.POSITIVE_INFINITY, limitMs: Number.POSITIVE_INFINITY, of }
  return { at: began + limitMs, limitMs, of }
}

type AHook = (...args: unknown[]) => unknown

/** The same hook, which says it is running while it runs. */
function sayingItRuns(hook: AHook, says: () => Running): AHook {
  const wrapped = (...args: unknown[]): unknown => {
    const mine = says()
    running = mine
    const over = (): void => {
      if (running === mine) running = null
    }
    let result: unknown
    try {
      result = hook(...args)
    } catch (error) {
      over()
      throw error
    }
    if (result instanceof Promise) return result.finally(over)
    over()
    return result
  }
  // THE SYMBOLS GO WITH IT. vitest reads the limit for a hook's clean-up from the hook in the list.
  return Object.assign(wrapped, hook)
}

/**
 * Make each hook of this file say, while it runs, when it must end. The hooks are replaced where they are in their
 * lists, because vitest reads those lists as it runs them.
 */
export function readEachHooksLimit(file: Suite): void {
  const suites: Suite[] = [file]
  for (let at = 0; at < suites.length; at += 1) {
    const suite = suites[at] as Suite
    const hooks = getHooks(suite)
    for (const name of ['beforeAll', 'beforeEach'] as const) {
      const list = hooks[name] as unknown as AHook[]
      list.forEach((hook, index) => {
        const limit = Reflect.get(hook, A_HOOKS_LIMIT) as unknown
        list[index] = sayingItRuns(hook, () => typeof limit === 'number'
          ? { end: theEnd(Date.now(), limit, 'hook') }
          : { unreadable: `vitest wrote no limit beside this ${name} hook` })
      })
    }
    for (const name of ['afterAll', 'afterEach'] as const) {
      const list = hooks[name] as unknown as AHook[]
      list.forEach((hook, index) => {
        list[index] = sayingItRuns(hook, () => ({ unreadable: `vitest writes no limit beside an ${name} hook` }))
      })
    }
    for (const task of suite.tasks) if (task.type === 'suite') suites.push(task)
  }
}

/**
 * When the hook or case running now must end, or null outside vitest. It throws rather than guess when vitest is running
 * and it cannot tell: between hooks and cases, or in a hook whose limit vitest does not write down.
 */
export function whenThisHookOrCaseMustEnd(): TheEnd | null {
  if (running !== null) {
    if ('end' in running) return running.end
    throw new Error(`The time a hook has left could not be read: ${running.unreadable}.`)
  }
  const test = getCurrentTest()
  const began = test?.result?.startTime
  if (test !== undefined && typeof began === 'number') return theEnd(began, test.timeout, 'case')
  if (process.env.VITEST === undefined) return null
  throw new Error(
    'The time a hook or case has left could not be read: vitest is running, but this could not tell which hook or case ' +
      'is running. A hook is read only once tests/set-how-long-a-test-may-take.ts has read the hooks of its file.',
  )
}
