// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { walkFrom, whereItPoints } from '../src/config/import-graph.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'


function checkout(): string {
  const root = aTestDatabaseFolder('walk-outside')
  const files: Record<string, string> = {
    'src/app/entry.ts': [
      "import '../../tools/static.mjs'",
      "import './route.ts'",
      "import 'some-package'",
      "import type { Shape } from '../../tools/types.ts'",
    ].join('\n'),
    'src/app/route.ts': [
      "export const load = () => import('../../tools/dynamic.mjs')",
      "export const later = () => import('./later.ts')",
    ].join('\n'),
    'src/app/later.ts': 'export const later = true',
    'tools/static.mjs': 'export const value = 1',
    'tools/dynamic.mjs': 'export const value = 2',
    'tools/types.ts': 'export type Shape = string',
  }
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

it('names static and deferred imports outside src without following them', () => {
  const root = checkout()
  const walked = walkFrom('src/app/entry.ts', root)
  expect(walked.leaves).toEqual([
    { from: 'src/app/entry.ts', specifier: '../../tools/static.mjs', outside: 'tools/static.mjs', kind: 'static' },
    { from: 'src/app/route.ts', specifier: '../../tools/dynamic.mjs', outside: 'tools/dynamic.mjs', kind: 'dynamic' },
  ])
  expect(walked.files).toEqual(['src/app/entry.ts', 'src/app/route.ts'])
  expect(walked.unresolved).toEqual([])
  expect(walked.couldNotRead).toEqual([])
})

it('distinguishes a package from an outside path', () => {
  const root = checkout()
  const from = join(root, 'src/app/entry.ts')
  expect(whereItPoints('some-package', from, root)).toBeNull()
  expect(whereItPoints('../../tools/static.mjs', from, root)).toEqual({ outside: 'tools/static.mjs' })
})

