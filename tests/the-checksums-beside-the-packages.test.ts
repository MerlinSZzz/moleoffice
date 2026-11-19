// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKSUM FILE BESIDE THE RELEASE'S PACKAGES (scripts/write-the-checksums.mjs).
 *
 * The Linux packages and the Windows installer are made on one machine, and the Mac disk images on a
 * Mac, so one folder may gain the other machine's packages later.
 *
 *   1. writes exactly the lines `sha256sum` writes for the packages in the folder, in name order, and
 *      leaves every file that is not a package out;
 *   2. run again over a folder that gained the other machine's packages, covers them all and says which
 *      lines were not in the SHA256SUMS that was there;
 *   3. refuses a folder that is not there, in its words;
 *   4. refuses a folder that holds no package, in its words;
 *   5. `--check` on a good folder says every file matches and exits 0;
 *   6. `--check` on a folder where one file changed names that file, still names the others OK, and exits 1;
 *   7. the guide's Linux check, `sha256sum -c --ignore-missing SHA256SUMS`, over a folder that lost
 *      every package but one, exits 0 and says that file's name with OK;
 *   8. a second run over a folder that lost one package and changed another writes the file, then
 *      prints "No longer in SHA256SUMS:" and one line for each, with its reason;
 *   9. a second run that drops nothing prints no such line;
 *  10. `--check` says "2 of 5 files do not match." when two files changed.
 *
 * Every folder here is made under the scratch folder when the run names one, and removed when this file
 * ends. `sha256sum` is run in the cases, so the file is compared with the program it is written for.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - isAPackage leaves out '.dmg': red, case 1;
 *   - theChecksumLines hashes the first package for every line: red, case 1;
 *   - checkTheChecksums compares nothing and says every line OK: red, case 6;
 *   - the dropped lines are not printed: red, case 8;
 *   - the reason "its hash changed" is given for a package not in the folder: red, case 8;
 *   - the header is printed when nothing was dropped: red, case 9;
 *   - the count of wrong files always says "do": red, case 6.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_SCRIPT = join(REPO, 'scripts', 'write-the-checksums.mjs')

/** A scratch folder under the out folder when the run names one, or the swept test folder otherwise. */
const under = process.env['MOLE_TEST_SCRATCH']
const temporary = under === undefined ? aTestDatabaseFolder('the-checksums') : aTestDatabaseFolder('the-checksums', under)
afterAll(() => removeThisTestFolder(temporary))

/** The release's packages, one of each kind this folder can hold. */
const THE_PACKAGES = [
  'mole-office-9.9.9-test-x86_64.AppImage',
  'mole-office-9.9.9-test-amd64.deb',
  'mole-office-9.9.9-test-arm64.dmg',
  'mole-office-9.9.9-test-x64-setup.exe',
  'mole-office-9.9.9-test-arm64.zip',
]

/** A folder of this case, with invented contents in the files named. */
let serial = 0
function aFolder(files: Record<string, string>): string {
  const folder = join(temporary, `case-${String(++serial)}`)
  mkdirSync(folder)
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text)
  return folder
}

/** A folder holding one stand-in file for every package the release makes. */
function aFolderOfEveryPackage(): string {
  return aFolder(Object.fromEntries(THE_PACKAGES.map((name, at) => [name, `An invented package ${String(at)}.\n`])))
}

/** The script, run with these arguments. */
function theScript(...args: string[]): { out: string; err: string; code: number | null } {
  const ran = spawnSync(process.execPath, [THE_SCRIPT, ...args], { encoding: 'utf8', timeout: 60_000 })
  return { out: ran.stdout, err: ran.stderr, code: ran.status }
}

describe('the checksums beside the packages', () => {
  it('1. writes exactly the lines sha256sum writes, in name order, and leaves every other file out', () => {
    const folder = aFolderOfEveryPackage()
    writeFileSync(join(folder, 'how-to-install.txt'), 'Invented notes.\n')
    const ran = theScript(folder)
    expect(ran.code, ran.err).toBe(0)

    const names = [...THE_PACKAGES].sort()
    const bySHA256SUM = spawnSync('sha256sum', names, { cwd: folder, encoding: 'utf8', timeout: 60_000 })
    expect(bySHA256SUM.status, bySHA256SUM.stderr).toBe(0)
    const written = readFileSync(join(folder, 'SHA256SUMS'), 'utf8')
    expect(written, 'SHA256SUMS is not exactly what sha256sum writes for these packages, in name order').toBe(bySHA256SUM.stdout)
    expect(written.trimEnd().split('\n').map((line) => line.slice(66)), 'the file is not in name order').toEqual(names)
    expect(written, 'a file that is not a package was counted').not.toContain('how-to-install.txt')
    expect(ran.out, 'the script does not print what it wrote').toContain(written)
  })

  it("2. a second run covers the other machine's packages and says which lines are new", () => {
    const folder = aFolder(Object.fromEntries(THE_PACKAGES.slice(0, 2).map((name, at) => [name, `An invented package ${String(at)}.\n`])))
    expect(theScript(folder).code).toBe(0)
    const first = readFileSync(join(folder, 'SHA256SUMS'), 'utf8').trimEnd().split('\n')

    for (const [at, name] of THE_PACKAGES.slice(2).entries()) writeFileSync(join(folder, name), `A later package ${String(at)}.\n`)
    const ran = theScript(folder)
    expect(ran.code, ran.err).toBe(0)
    const written = readFileSync(join(folder, 'SHA256SUMS'), 'utf8').trimEnd().split('\n')
    expect(written.map((line) => line.slice(66)), 'the second run does not cover every package in the folder').toEqual([...THE_PACKAGES].sort())

    const said = ran.out.split('New since the SHA256SUMS that was there:\n')[1]
    expect(said, 'the second run does not say which lines are new').toBeDefined()
    expect(said!.trimEnd().split('\n'), 'the lines said to be new are not exactly the packages added').toEqual(
      written.filter((line) => !first.includes(line)),
    )
    expect(said!.trimEnd().split('\n')).toHaveLength(THE_PACKAGES.length - 2)
  })

  it('3. refuses a folder that is not there, in its words', () => {
    const folder = join(temporary, 'not-there')
    const ran = theScript(folder)
    expect(ran.code).toBe(1)
    expect(ran.out).toBe('')
    expect(ran.err).toBe(`The folder ${folder} is not there. Name the folder that holds the packages.\n`)
  })

  it('4. refuses a folder that holds no package, in its words', () => {
    const folder = aFolder({ 'how-to-install.txt': 'Invented notes.\n' })
    const ran = theScript(folder)
    expect(ran.code).toBe(1)
    expect(ran.out).toBe('')
    expect(ran.err).toBe(
      `The folder ${folder} holds no package. A package is a file whose name ends with .deb, .AppImage, -setup.exe, .dmg or .zip.\n`,
    )
  })

  it('5. --check on a good folder says every file matches and exits 0', () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    const ran = theScript('--check', folder)
    expect(ran.code, ran.err).toBe(0)
    for (const name of [...THE_PACKAGES].sort()) expect(ran.out).toContain(`${name}: OK\n`)
    expect(ran.out).toContain(`All ${String(THE_PACKAGES.length)} files match.\n`)
    expect(ran.err).toBe('')
  })

  it('6. --check on a folder where one file changed names it, keeps the others OK, and exits 1', () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    const changed = THE_PACKAGES[2] as string
    writeFileSync(join(folder, changed), 'The file was changed after SHA256SUMS was written.\n')
    const ran = theScript('--check', folder)
    expect(ran.code).toBe(1)
    expect(ran.out).toContain(`${changed}: FAILED\n`)
    for (const name of [...THE_PACKAGES].filter((one) => one !== changed).sort()) expect(ran.out).toContain(`${name}: OK\n`)
    expect(ran.err).toBe(`1 of ${String(THE_PACKAGES.length)} files does not match.\n`)
  })

  it("7. the guide's Linux check passes over the packages that are not in the folder", () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    const kept = THE_PACKAGES[0] as string
    for (const name of THE_PACKAGES.slice(1)) rmSync(join(folder, name))
    const checked = spawnSync('sha256sum', ['-c', '--ignore-missing', 'SHA256SUMS'], {
      cwd: folder,
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(checked.error, 'sha256sum did not run, so this case cannot show what the guide tells a person').toBeUndefined()
    expect(checked.status, checked.stderr).toBe(0)
    expect(checked.stdout).toBe(`${kept}: OK\n`)
  })

  it('8. a second run names the lines it dropped, with the reason, and still writes the file', () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    const dropped = THE_PACKAGES[1] as string
    const changed = THE_PACKAGES[2] as string
    rmSync(join(folder, dropped))
    writeFileSync(join(folder, changed), 'This package changed after the first run.\n')
    const ran = theScript(folder)
    expect(ran.code, ran.err).toBe(0)

    const kept = [...THE_PACKAGES].filter((one) => one !== dropped).sort()
    const written = readFileSync(join(folder, 'SHA256SUMS'), 'utf8').trimEnd().split('\n')
    expect(written.map((line) => line.slice(66)), 'the second run did not write every package in the folder').toEqual(kept)
    const bySHA256SUM = spawnSync('sha256sum', kept, { cwd: folder, encoding: 'utf8', timeout: 60_000 })
    expect(bySHA256SUM.status, bySHA256SUM.stderr).toBe(0)
    expect(written.join('\n'), 'a changed package did not get its new hash').toBe(bySHA256SUM.stdout.trimEnd())

    const said = ran.out.split('No longer in SHA256SUMS:\n')[1]
    expect(said, 'the second run does not say which lines are no longer there').toBeDefined()
    expect(said!.trimEnd().split('\n'), 'the dropped lines are not exactly the removed package and the changed one, each with its reason').toEqual([
      `${dropped}: the package is not in the folder`,
      `${changed}: its hash changed`,
    ])
  })

  it('9. a second run that drops nothing says nothing about dropped lines', () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    const ran = theScript(folder)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).not.toContain('No longer in SHA256SUMS:')
  })

  it('10. --check says two of five files do not match when two files changed', () => {
    const folder = aFolderOfEveryPackage()
    expect(theScript(folder).code).toBe(0)
    for (const name of THE_PACKAGES.slice(0, 2)) writeFileSync(join(folder, name), 'Changed after SHA256SUMS was written.\n')
    const ran = theScript('--check', folder)
    expect(ran.code).toBe(1)
    for (const name of THE_PACKAGES.slice(0, 2)) expect(ran.out).toContain(`${name}: FAILED\n`)
    expect(ran.err).toBe(`2 of ${String(THE_PACKAGES.length)} files do not match.\n`)
  })
})
