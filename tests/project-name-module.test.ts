// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROJECT IS CALLED CAN BE IMPORTED BY ANYTHING, AND THERE IS ONLY ONE OF IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY IT IS WORTH A TEST FILE
 * ---------------------------------------------------------------------------------------------
 *
 * `projectName` lived in src/web/components/projects.tsx, beside the panel that moves a record
 * between projects. That file imports src/web/api.ts, which imports src/web/lib/workspace.ts, which
 * reads `window.localStorage` while it is still loading. So a plain Node test that wrote
 * `import { projectName } from '.../components/projects.tsx'` threw "ReferenceError: window is not
 * defined" before a single assertion ran.
 *
 * The cost was not the test. src/web/lib/words.ts is the one layer every stored word passes through
 * on its way to a screen, and it wanted to serve this word too. It could not, and it wrote down why
 * — and the danger in that position is obvious: the next agent who needs a project's name from a
 * module with no browser under it writes a second function, and Mole Office has two answers to "what is
 * this project called" with nothing making them agree. That is this repository's recurring defect.
 *
 * So the function moved to src/web/lib/projects.ts, which imports one constant and nothing else.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TWO THINGS CHECKED HERE
 * ---------------------------------------------------------------------------------------------
 *
 * 1. IT LOADS WITH NO BROWSER. The first test asserts there is no `window` and then imports the
 *    module. Order matters and it is why this is its own file: once any test installs a window
 *    stand-in, every later import in the same process has one, and the check would pass on a module
 *    that still needed it.
 *
 * 2. THERE IS EXACTLY ONE OF IT. components/projects.tsx re-exports both names, and the second test
 *    compares the function it exports with the one the library exports BY IDENTITY. A copy pasted
 *    back into the component would be a second function that behaves the same today, which is
 *    exactly the state that drifts, and `toBe` is what tells a re-export from a copy.
 *
 * tests/project-move.test.ts still imports these names from components/projects.tsx and that file
 * passing is the proof that the re-export carries every caller.
 */

import { describe, expect, it, vi } from 'vitest'
import { UNASSIGNED_WORKSPACE } from '../src/shared/workspaces.ts'

describe('the project name can be worked out with no browser', () => {
  it('imports and answers in a plain Node process, with no window at all', async () => {
    // THE CONTROL FOR THIS WHOLE FILE. If something has already installed a window stand-in, the
    // import below proves nothing, and this says so rather than passing quietly.
    expect(
      (globalThis as { window?: unknown }).window,
      'a window stand-in already exists in this process, so this test cannot prove anything',
    ).toBeUndefined()

    const lib = await import('../src/web/lib/projects.ts')
    // THE STORED TITLE, UNCHANGED, INCLUDING THE CATCH-ALL'S. This read "Not in a project" until
    // the owner settled decision `AtiSHfG00BVV`.
    expect(lib.projectName(UNASSIGNED_WORKSPACE, 'Unassigned')).toBe('Unassigned')
    expect(lib.projectName('general', 'General')).toBe('General')
    expect(lib.projectName('robotics', 'Robotics')).toBe('Robotics')
    expect(lib.projectName('robotics')).toBe('robotics')
    expect(lib.unassignedMeans()).toContain('Mole Office did not guess one')
  })
})

describe('the browser renames no project', () => {
  it('prints the title the server stores for every project, including the catch-all pair', async () => {
    const lib = await import('../src/web/lib/projects.ts')
    // A caller may hand over any title at all, and the answer is that title. If a renaming table
    // came back for ANY id, one of these would come back with the table's word instead.
    for (const [id, title] of [
      [UNASSIGNED_WORKSPACE, 'Unassigned'],
      ['general', 'General'],
      ['default', 'Default'],
      ['panelx', 'Mole Office'],
      ['personal', 'Personal'],
    ] as const) {
      expect(lib.projectName(id, title), `${id} is being renamed on its way to the screen`).toBe(title)
    }
  })
})

describe('there is exactly one project-naming function', () => {
  it('re-exports the library’s function from the component rather than keeping a copy', async () => {
    // The component needs a browser to load at all, which is the whole reason the function moved
    // out of it. Both modules are imported after the same reset so that "the same function" is a
    // question about the source and not about how many times the runner loaded it.
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    vi.resetModules()
    const lib = await import('../src/web/lib/projects.ts')
    const component = await import('../src/web/components/projects.tsx')

    expect(
      component.projectName,
      'components/projects.tsx has its own copy of projectName again — two answers to "what is ' +
        'this project called", with nothing making them agree',
    ).toBe(lib.projectName)
    expect(component.unassignedMeans).toBe(lib.unassignedMeans)
  })
})
