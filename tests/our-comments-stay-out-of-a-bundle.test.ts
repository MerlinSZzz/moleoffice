// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OUR COMMENTS STAY OUT OF A BUNDLE (wave 13v round 35; scripts/the-comments-stay-out.mjs, the esbuild plugin that
 * scripts/bundle.mjs and scripts/the-terminal-in-a-bundle.mjs build with).
 *
 *   1. Every comment is written over with spaces, line breaks kept, so every line and column stays where it was. A
 *      string, a template, a regular expression and JSX text that hold comment marks are not comments and stay.
 *   2. A file the parser cannot read is refused, by its name, and nothing is guessed.
 *   3. esbuild keeps a comment inside an expression (the control); built with the plugin our file's comment is gone and
 *      the code does the same, and a package's comment under node_modules/ stays as its authors wrote it.
 *   4. scripts/bundle.mjs builds its programs in one build with splitting on, which puts a module two entries import
 *      into a chunk of its own. Built with the plugin, our comment is not in that chunk either, and the owner-content
 *      check (ownerContentIn in scripts/no-owner-content.mjs) reads the chunk and names it.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/our-comments-stay-out-of-a-bundle.test.ts --list whole-tree
 * MUTATIONS (each restored after):
 *   - withoutTheComments answers the text as it was: red, cases 1 and 3;
 *   - the parser's errors are not read: red, case 2;
 *   - the plugin reads a package under node_modules/ too: red, case 3;
 *   - a line break inside a comment is written over too: red, case 1.
 *   - withoutTheComments answers the text as it was: red, case 4, the chunk carries our comment.
 *   - ownerContentIn in scripts/no-owner-content.mjs leaves out the files whose names start with chunk-: red, case 4,
 *     it finds nothing.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, describe, expect, it } from 'vitest'

import { ownerContentIn } from '../scripts/no-owner-content.mjs'
import { theCommentsStayOut, withoutTheComments } from '../scripts/the-comments-stay-out.mjs'
import { thePatterns } from '../tools/merge-tool/owner-content.mjs'
import { TEST_DATABASE_PREFIX } from './a-test-folder.ts'

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

/** A folder of this test's own holding `files`. */
function aFolderWith(files: Record<string, string>): string {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}comments-stay-out-`)
  folders.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

/** The one built file of an entry, as text. */
async function built(entry: string, withThePlugin: boolean): Promise<string> {
  const made = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins: withThePlugin ? [theCommentsStayOut] : [], logLevel: 'silent' })
  return made.outputFiles.map((one) => one.text).join('')
}

describe('our comments stay out of a bundle', () => {
  it('writes spaces over every comment and keeps every line break, string, template, regular expression and JSX text', () => {
    const text = [
      "const a = '// a string' // a line comment",
      'const b = `/* a template */` /* a block',
      '   that spans two lines */',
      'const c = /\\/\\/[a-z]+/g /** a doc comment */',
      'const d = <p>// JSX text {/* a JSX comment */}</p>',
      '',
    ].join('\n')
    const out = withoutTheComments('a.tsx', text)
    expect(out).toHaveLength(text.length)
    expect(out.split('\n').map((line) => line.trimEnd())).toEqual([
      "const a = '// a string'",
      'const b = `/* a template */`',
      '',
      'const c = /\\/\\/[a-z]+/g',
      `const d = <p>// JSX text {${' '.repeat('/* a JSX comment */'.length)}}</p>`,
      '',
    ])
  })

  it('refuses a file the parser cannot read, naming it', () => {
    expect(() => withoutTheComments('src/broken.ts', 'const a = (1, // never closed\n')).toThrow(/^src\/broken\.ts could not be read to take its comments out: /)
  })

  it("leaves out our comment that esbuild keeps inside an expression, and keeps a package's", async () => {
    const dir = aFolderWith({
      'entry.ts': "import { theirs } from 'a-package'\nexport const ours = [\n  1, // our comment inside an array\n  2,\n]\nexport { theirs }\n",
      'node_modules/a-package/package.json': '{ "name": "a-package", "main": "index.js" }\n',
      'node_modules/a-package/index.js': 'export const theirs = [\n  3, // their comment inside an array\n]\n',
    })
    const control = await built(join(dir, 'entry.ts'), false)
    expect(control).toContain('// our comment inside an array')
    expect(control).toContain('// their comment inside an array')

    const out = await built(join(dir, 'entry.ts'), true)
    expect(out).not.toContain('our comment')
    expect(out).toContain('// their comment inside an array')
    const run = await import(`data:text/javascript,${encodeURIComponent(out)}`)
    expect([run.ours, run.theirs]).toEqual([[1, 2], [3]])
  })

  it('leaves our comment out of a chunk of a split build too, and the owner-content check reads that chunk', async () => {
    const dir = aFolderWith({
      'a.ts': "import { shared } from './shared.ts'\nconsole.log(shared.length)\n",
      'b.ts': "import { shared } from './shared.ts'\nconsole.log(shared[0])\n",
      'shared.ts': "export const shared = [\n  1, // our comment inside an array\n  '/home/fixture-user/notes',\n]\n",
    })
    /** The files a split build of a.ts and b.ts writes into `out`, by name, as text. */
    const split = async (out: string, withThePlugin: boolean): Promise<Record<string, string>> => {
      await build({
        entryPoints: [join(dir, 'a.ts'), join(dir, 'b.ts')],
        absWorkingDir: dir,
        outdir: join(dir, out),
        bundle: true,
        splitting: true,
        format: 'esm',
        platform: 'node',
        outExtension: { '.js': '.mjs' },
        chunkNames: 'chunk-[hash]',
        plugins: withThePlugin ? [theCommentsStayOut] : [],
        logLevel: 'silent',
      })
      return Object.fromEntries(readdirSync(join(dir, out)).map((name) => [name, readFileSync(join(dir, out, name), 'utf8')]))
    }
    const theChunkIn = (files: Record<string, string>): [string, string] => {
      const chunks = Object.entries(files).filter(([name]) => name.startsWith('chunk-'))
      expect(chunks.map(([name]) => name), 'the split build did not put shared.ts into one chunk').toHaveLength(1)
      return chunks[0] as [string, string]
    }

    // THE CONTROL: without the plugin the chunk holds shared.ts, with our comment, and neither entry holds it.
    const control = await split('control', false)
    expect(Object.keys(control).filter((name) => !name.startsWith('chunk-')).sort()).toEqual(['a.mjs', 'b.mjs'])
    expect(theChunkIn(control)[1]).toContain('// our comment inside an array')
    for (const entry of ['a.mjs', 'b.mjs']) expect(control[entry], `${entry} holds shared.ts itself`).not.toContain('fixture-user')

    const out = await split('out', true)
    const [chunk, text] = theChunkIn(out)
    expect(text, `${chunk} carries our comment`).not.toContain('our comment')
    expect(text).toContain('/home/fixture-user/notes')
    const none = thePatterns({ names: [], realName: null, handles: [], notReadBecause: 'No invented list was given.' })
    const seen = ownerContentIn({ folder: join(dir, 'out'), root: dir, cited: new Set(), patterns: none, modulesFrom: dir })
    expect(
      seen.found.map(({ file, from, pattern, words }) => ({ file, from, pattern, words })),
      'the owner-content check did not find the home folder planted in the chunk',
    ).toEqual([{ file: chunk, from: 'shared.ts', pattern: 'P2', words: '/home/fixture-user' }])
  })
})
