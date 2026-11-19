// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALLER NEVER CARRIES THE OFFICE'S OWN DEVELOPMENT MATERIAL (wave 13t, round 14c;
 * scripts/no-development-material.mjs). A decision requires this.
 *
 * Nothing from tests/, tools/ or design/ may be compiled into a bundle or copied beside it.
 * scripts/bundle.mjs and scripts/package-linux.mjs ask `developmentMaterialIn` and refuse with a
 * plain sentence when it names anything.
 *
 *   1. The check names a source file from each of the three folders that a bundle compiled in, and
 *      nothing from src/ or from outside the checkout.
 *   2. It names every file under those names in an output folder, the merge tool and the kit among
 *      them, and nothing else.
 *   3. A real bundle carries none: `node scripts/bundle.mjs` says so, and it holds no CLAUDE.md. When a
 *      file from tools/ is left in the folder it writes into, it refuses, names that file, and leaves no
 *      stamp.
 *   4. The developer CLAUDE.md and AGENTS.md are named wherever they are in the folder and whatever
 *      they are called, by their heading, after AGENTS.md's comment line, in wave 13t round
 *      15. A part written for users, under another heading, is not.
 *      Git ignores AGENTS.md, so this case writes its own with src/worker/rules.ts, into a folder of
 *      its own, and never reads one at the checkout's root (round 15b).
 *   5. No file under src/ imports from tools/, except the one import listed below with its reason
 *      (wave 13t, round W2). scripts/bundle.mjs leaves every import of ../../../tools/* as an import, so
 *      case 3 cannot see one. Until round W2 the message worker imported the start values from
 *      tools/sandbox-common.mjs, and an installed office's worker failed as it loaded. At the commit that
 *      added case 5, it was red, naming the four files in src/worker/runtimes/ that imported it.
 *
 * Every bundle here is in a folder of this test's own. The built page must exist (`npm run build`).
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-installer-carries-no-development-material.test.ts
 * MUTATIONS:
 *   - DEVELOPMENT_FOLDERS leaves out tools: red, cases 1, 2 and 3;
 *   - scripts/bundle.mjs does not read its output folder (no `folder`): red, case 3;
 *   - scripts/bundle.mjs leaves an earlier bundle's stamp in place: red, case 3;
 *   - scripts/bundle.mjs does not keep ../../../tools/* external: red, case 3, because the server's
 *     sweep of check worktrees then compiles tools/check-worktrees.mjs into server.mjs;
 *   - scripts/bundle.mjs copies CLAUDE.md into the bundle again: red, case 3 (refused, so no stamp);
 *   - isTheDeveloperFile answers false: red, case 4;
 *   - isTheDeveloperFile no longer allows a comment before the heading: red, case 4 (the AGENTS.md copy);
 *   - (round 15b) case 4 reads AGENTS.md at the checkout's root again: red on a fresh checkout, ENOENT.
 *   - (round W2) src/worker/runtimes/common.ts imports aCommandsStartValues from tools/sandbox-common.mjs
 *     again: red, case 5, naming that file;
 *   - (round W2) the listed import is taken off the list: red, case 5, naming src/server/lib/resources.ts.
 * scripts/package-linux.mjs asks the same function of the packed app. Making installers needs a network
 * and minutes, so no test runs it; a real build prints the line saying what it read.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { THE_DEVELOPER_HEADING, developmentMaterialIn, theRefusal } from '../scripts/no-development-material.mjs'
import { writeRulesInto } from '../src/worker/rules.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const folders: string[] = []
const aFolder = (name: string): string => {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

/**
 * THE ONE IMPORT FROM tools/ THAT src/ MAY MAKE, with why an installed office never makes it. Each entry
 * is `<file under src/> -> <file under tools/>`.
 */
const AN_IMPORT_AN_INSTALLATION_NEVER_MAKES = new Map([
  [
    'src/server/lib/resources.ts -> tools/check-worktrees.mjs',
    'the sweep of check worktrees, which src/server/lib/check-worktrees.ts skips in an installed office',
  ],
])

/** Every file under a folder whose name ends in .ts, .tsx, .mjs or .js, relative to the checkout. */
function everySourceIn(folder: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(REPO, folder), { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) out.push(...everySourceIn(path))
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(path)
  }
  return out
}

/** Every relative import in a source file, static or not, that names a file under tools/. */
function itsImportsFromTools(file: string): string[] {
  const text = readFileSync(join(REPO, file), 'utf8')
  const out: string[] = []
  for (const found of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.[^'"]*)\1/g)) {
    const named = relative(REPO, resolve(REPO, dirname(file), found[2] ?? ''))
    if (named.startsWith(`tools${sep}`)) out.push(`${file} -> ${named.split(sep).join('/')}`)
  }
  return out
}

describe('the installer carries no development material', () => {
  it('names a source file from tests/, tools/ or design/ that a bundle compiled in, and nothing from src/', () => {
    const sources = [
      'src/server/index.ts',
      'tools/merge-tool/merge.mjs',
      'tests/helpers.ts',
      'design/agents/kit/kit.mjs',
      join(REPO, 'tools', 'check.mjs'),
      '../elsewhere/tools/not-ours.mjs',
    ]
    expect(developmentMaterialIn({ root: REPO, sources, sourcesFrom: REPO })).toEqual([
      'tools/merge-tool/merge.mjs (compiled into a bundle)',
      'tests/helpers.ts (compiled into a bundle)',
      'design/agents/kit/kit.mjs (compiled into a bundle)',
      'tools/check.mjs (compiled into a bundle)',
    ])
    expect(developmentMaterialIn({ root: REPO, sources: ['src/config/settings.mjs', 'node_modules/esbuild/lib/main.js'], sourcesFrom: REPO })).toEqual([])
  })

  it('names every file under tests/, tools/ or design/ in an output folder, and nothing else', () => {
    const out = aFolder('no-dev-folder')
    for (const file of ['tests/a.test.ts', 'tools/merge-tool/merge.mjs', 'design/agents/kit/kit.css', 'src/desktop/check.css', 'server.mjs', 'dist/web/tools.js']) {
      mkdirSync(join(out, file, '..'), { recursive: true })
      writeFileSync(join(out, file), '')
    }
    const found = developmentMaterialIn({ root: REPO, folder: out }).sort()
    expect(found).toEqual(
      [`design/agents/kit/kit.css (a file in ${out})`, `tests/a.test.ts (a file in ${out})`, `tools/merge-tool/merge.mjs (a file in ${out})`].sort(),
    )
  })

  it('finds none in a real bundle, and refuses a bundle with a file from tools/ beside it, leaving no stamp', () => {
    const out = join(aFolder('no-dev-bundle'), 'bundle')
    const first = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', out], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    expect(first.stdout).toContain('The bundle carries nothing from tests/, tools/ or design/')
    expect(existsSync(join(out, 'build-stamp.json'))).toBe(true)
    expect(existsSync(join(out, 'CLAUDE.md'))).toBe(false)

    // A file of the merge tool left in the folder the bundle is written into.
    mkdirSync(join(out, 'tools', 'merge-tool'), { recursive: true })
    writeFileSync(join(out, 'tools', 'merge-tool', 'leftover.mjs'), '')
    const second = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', out], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(1)
    expect(second.stderr).toContain(theRefusal('The bundle', [`${join('tools', 'merge-tool', 'leftover.mjs')} (a file in ${out})`]))
    expect(second.stderr).toContain('No bundle was made')
    expect(existsSync(join(out, 'build-stamp.json'))).toBe(false)
  }, 600_000)

  it('names the developer CLAUDE.md and AGENTS.md by their text, whatever they are called, and not a part for users', () => {
    const out = aFolder('no-dev-claude')
    const theirs = (name: string): string => readFileSync(join(REPO, name), 'utf8')
    const written = writeRulesInto(aFolder('no-dev-agents'), REPO, 'AGENTS.md')
    const files: Record<string, string> = {
      'CLAUDE.md': theirs('CLAUDE.md'),
      'docs/instructions.md': readFileSync(written.path, 'utf8'),
      'renamed.md': `\n${THE_DEVELOPER_HEADING}\n\nAn older copy.\n`,
      'user/CLAUDE.md': '# Mole Office for the people who use it\n\nHow to ask the office for something.\n',
      'notes.txt': theirs('CLAUDE.md'),
    }
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(out, file, '..'), { recursive: true })
      writeFileSync(join(out, file), text)
    }
    expect(developmentMaterialIn({ root: REPO, folder: out }).sort()).toEqual(
      ['CLAUDE.md', join('docs', 'instructions.md'), 'renamed.md', 'notes.txt'].map((file) => `${file} (the developer CLAUDE.md or AGENTS.md, in ${out})`).sort(),
    )
  })

  it('finds no import from tools/ under src/, except the one an installed office never makes', () => {
    const imports = everySourceIn('src').flatMap(itsImportsFromTools)
    expect(imports.filter((one) => !AN_IMPORT_AN_INSTALLATION_NEVER_MAKES.has(one))).toEqual([])
    // THE LIST IS NOT LEFT STANDING AFTER ITS IMPORT HAS GONE.
    expect(imports.filter((one) => AN_IMPORT_AN_INSTALLATION_NEVER_MAKES.has(one)).sort()).toEqual([...AN_IMPORT_AN_INSTALLATION_NEVER_MAKES.keys()].sort())
  })
})
