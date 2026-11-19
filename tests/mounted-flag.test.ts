// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE "still mounted" FLAG, AND THE DEFECT THAT MADE THE SESSIONS PANEL LOAD FOR EVER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * The sessions hook once kept a flag saying "this component is still on screen", so that a reply
 * arriving after the reader has navigated away can be discarded instead of written into a dead
 * component. The Home attention hook removed after round 19 kept a second one. Both wrote it
 * separately and both wrote it the same wrong way:
 *
 *     const live = useRef(true)
 *     useEffect(() => () => { live.current = false }, [])     // a cleanup and nothing else
 *
 * React StrictMode — which src/web/main.tsx turns on — mounts, unmounts and remounts every
 * component in development, and it REUSES the component's refs across that cycle. A ref is not
 * state; nothing reinitialises `useRef(true)` on the second mount. So the first cleanup set the
 * flag false permanently, and from then on EVERY reply was discarded as one that had arrived after
 * the reader left. Nobody had left.
 *
 * On screen: the sessions panel sat in its loading skeleton for ever, on Home and on /sessions,
 * while `GET /api/sessions`, `/api/resources/orphans`, `/api/records` and `/api/attention` all
 * answered 200 in under 70 ms, with no page error, no failed request and nothing in the console.
 * A guard against a stale write had silently become a guard against every write.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST IS SHAPED LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * vitest runs with `environment: 'node'` here — there is no DOM — and the browser components are
 * tested with `renderToStaticMarkup`, which renders once and NEVER RUNS AN EFFECT. So no existing
 * test could have seen this, and none could see it now either: the defect lives entirely in the
 * order React calls effects in.
 *
 * `armMounted` exists so that order can be tested without React. It takes the ref rather than
 * creating it, so it is an ordinary function, and the tests below call it in exactly the sequences
 * React uses — including StrictMode's mount, unmount, mount — and assert what the flag says
 * afterwards. That is the whole mechanism, and it is the only part that was wrong.
 *
 * It is NOT the whole proof. `tools/review.mjs` drives a real browser and asserts that the sessions
 * panel actually leaves its skeleton; that is what would catch a future break in the surrounding
 * hook rather than in this function. Both are needed and each says what it cannot see.
 *
 * MUTATION: put `const live = useRef(true)` back into the sessions hook in SessionPanel.tsx; the
 * source assertion below must fail, because the sessions reader keeps a flag of its own again.
 */

import { beforeAll, describe, expect, it } from 'vitest'

/**
 * `src/web/api.ts` reads window.localStorage at module scope to restore who you are acting as, and
 * the component library reaches it. Same stand-in as tests/graph-scale.test.ts, so the import below
 * is dynamic and happens after it.
 */
let armMounted: (flag: { current: boolean }) => () => void

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;({ armMounted } = await import('../src/web/components/ui.tsx'))
})

/** A ref, as React hands one out. */
const ref = (initial: boolean) => ({ current: initial })

describe('the flag that says a component is still on screen', () => {
  it('is true after an ordinary mount', () => {
    const live = ref(true)
    armMounted(live)
    expect(live.current).toBe(true)
  })

  it('is false after the component goes away', () => {
    const live = ref(true)
    const cleanup = armMounted(live)
    cleanup()
    // The guard doing its job: a reply arriving now belongs to a page nobody is reading.
    expect(live.current).toBe(false)
  })

  it('IS TRUE AGAIN AFTER StrictMode mounts, unmounts and mounts, reusing the ref', () => {
    // THE TEST THIS FILE EXISTS FOR. React does this to every component in development. The ref is
    // the SAME object across the cycle, which is the part that made the old code wrong: it had
    // nothing to set the flag back, so the second mount ran with a flag left false by the first
    // unmount, and every fetch that resolved afterwards threw its answer away.
    const live = ref(true)
    const firstCleanup = armMounted(live)
    firstCleanup()
    expect(live.current, 'the simulated unmount did not disarm the flag').toBe(false)

    armMounted(live)

    expect(
      live.current,
      'after StrictMode remounted the component the flag is still false, so every reply will be discarded',
    ).toBe(true)
  })

  it('survives a real navigation away and back, which reuses nothing', () => {
    // A genuine unmount destroys the component and its refs, so the next mount starts from a fresh
    // `useRef(true)`. Asserted so the two cases are visibly different: this one was always fine,
    // and reasoning from it is how the StrictMode case was missed.
    const first = ref(true)
    armMounted(first)()
    const second = ref(true)
    armMounted(second)
    expect(second.current).toBe(true)
  })

  it('is idempotent, so a re-run of the effect cannot disarm it', () => {
    const live = ref(true)
    armMounted(live)
    armMounted(live)
    expect(live.current).toBe(true)
  })
})

describe('the sessions reader keeps no flag of its own', () => {
  it('the sessions hook reads through useProjectAsync and keeps no live ref', async () => {
    // The defect was written twice, identically, by two people solving one problem separately. The
    // sessions reader now reads through `useProjectAsync`, and `useAsync` under it holds a `live`
    // for each run of its effect, which StrictMode cannot carry from one run to the next. So the
    // reader has no flag to arm, and this keeps it so: a `live` ref written here again is the shape
    // that broke, and it would have to go through `armMounted`.
    const { readFileSync } = await import('node:fs')
    const file = 'src/web/components/SessionPanel.tsx'
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const hook = /export function useMachineReading\(\)[^]*?\n}\n/.exec(source)?.[0] ?? ''
    expect(hook, `${file} has no sessions hook`).not.toBe('')
    expect(hook, `${file}'s sessions hook does not read through useProjectAsync`).toContain('useProjectAsync(')
    expect(source, `${file} keeps a "live" ref of its own`).not.toContain('const live = useRef(')
    // The old shape, which is what must not come back: a cleanup that only disarms.
    expect(source, `${file} still has a disarm-only cleanup`).not.toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\s*live\.current\s*=\s*false/,
    )
  })
})
