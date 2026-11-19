// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KINDS EXAMPLES NAME NO HOME.
 *
 * Plan eIeEzSGXdTpu, step 3: a published copy of the repository must name nobody's home.
 * Every quoted string in src/shared/kinds.ts and in every .ts file directly under src/shared/kinds/
 * is read with piecesOf, as the moved-file gates read theirs, because a kind's shapes move into its
 * file and an example moves with its shape. Examples use made-up paths under the fixture root
 * instead of a home folder. Comments and regular expressions are not quoted strings on lines of code.
 *
 * MUTATION, after a control run: put a home-folder path back into one example. The case turns red,
 * naming its line. Restore the made-up path and the same case passes again.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { piecesOf } from './sentences.ts'

const KINDS = fileURLToPath(new URL('../src/shared/kinds.ts', import.meta.url))
const KINDS_FOLDER = fileURLToPath(new URL('../src/shared/kinds/', import.meta.url))
const A_HOME_PATH = /(?<![A-Za-z0-9_.~-])(?:\/home|\/Users)\/[A-Za-z0-9._-]+/

const FILES = [
  { path: KINDS, name: 'src/shared/kinds.ts' },
  ...readdirSync(KINDS_FOLDER)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => ({ path: join(KINDS_FOLDER, file), name: `src/shared/kinds/${file}` })),
]

describe('the kinds examples name no home', () => {
  it('no quoted string names a home path', () => {
    const found = FILES.flatMap(({ path, name }) => {
      const text = readFileSync(path, 'utf8')
      return piecesOf(text)
        .filter((piece) => piece.what === 'string' && A_HOME_PATH.test(piece.body))
        .map((piece) => {
          const line = text.slice(0, piece.at).split('\n').length
          return `${name}:${String(line)} names a home path: ${piece.body.slice(0, 120)}`
        })
    })
    expect(found, 'use a made-up path in each kinds example').toEqual([])
  })
})
