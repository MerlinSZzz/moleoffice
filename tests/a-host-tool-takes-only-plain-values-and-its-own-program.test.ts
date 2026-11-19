// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST TOOL TAKES ONLY PLAIN VALUES, AND RUNS ONLY ITS OWN REGISTERED PROGRAM. src/config/host-tools.mjs is the one
 * module the office's door and the host job runner both check with, so each rule is held here once, on its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. No argument value is a path, a hidden name, an option or more than one line, whatever the tool's pattern lets
 *      through.
 *   2. A declaration whose program is a shell, an interpreter, env, sudo, ssh, a program that starts other programs
 *      or an agent runtime is refused, and so is a command line that puts an argument anywhere but in a whole element
 *      of its own, and a folder inside the sandboxes folder.
 *   2b. A recovery step, when a declaration names one, is refused unless it is {program: {path, sha256}, argv} with a
 *      plain absolute program outside the sandboxes folder, a long hex sha256, 1 to 16 one-line argv elements, and
 *      {job} exactly once and nowhere else.
 *   3. On disk, a program that resolves through a link to a shell, one inside the sandboxes folder, and one whose
 *      sha256 has changed are each refused, and so is a folder that resolves inside the sandboxes folder. The
 *      registered one passes, and the real paths of its program and folder are handed back for the start.
 *   7. On disk, a program that others may write, or that sits in a folder others may write, is refused, and so is
 *      one another user owns. Since wave 13q round 64 one that only the office user's own group may write is case 11c
 *      of tests/a-sandboxed-agent-asks-the-office-for-a-registered-host-tool.test.ts, and these sentences are read from
 *      WHY_A_PROGRAM_ON_DISK_IS_REFUSED. Since round 65 so are the changed sha256 of case 3, and the program that is
 *      never run of cases 2 and 3, from WHY_IT_IS_NEVER_THE_PROGRAM.
 *   4. The file of tools is refused whole when it is not a regular file, is open to others or is not JSON, and an
 *      entry with no registration is listed as refused.
 *   5. What a job hands back is masked for a home on a /home-like mount, a .ts.net or .local host and the login of
 *      `ssh -l`, and says that it was.
 *   6. The command line puts each value in its own element, and nothing else changes.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the "/" check taken out of whyNotAPlainValue: case 1 goes red;
 *   - the program name check taken out of whyADeclarationIsRefused: case 2 goes red;
 *   - the second line of names (docker to rsync) taken out of NEVER_THE_PROGRAM: case 2 goes red;
 *   - theProgramOnDisk reading the base name of the path given and not of the file it resolves to: case 3 goes red;
 *   - theProgramOnDisk handing back the declared program path and not the one it hashed: case 3 goes red;
 *   - the check of the resolved folder taken out of theProgramOnDisk: case 3 goes red;
 *   - the check of the program's folder taken out of theProgramOnDisk: case 7 goes red;
 *   - the mode check taken out of readTheHostTools: case 4 goes red;
 *   - the private host mask taken out of maskedForAHostJob: case 5 goes red.
 */

import { chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  DECLARATION_KEYS,
  maskedForAHostJob,
  readTheHostTools,
  theArgv,
  theProgramOnDisk,
  theSha256Of,
  WHY_A_PROGRAM_ON_DISK_IS_REFUSED as REFUSED,
  WHY_IT_IS_NEVER_THE_PROGRAM,
  whyADeclarationIsRefused,
  whyNotAPlainValue,
  whyTheArgumentsAreRefused,
} from '../src/config/host-tools.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

let scratch = ''
let program = ''
const homeBefore = process.env['HOME']

beforeAll(() => {
  scratch = aTestDatabaseFolder('host-tool-rules')
  // MODE 755 WHATEVER THE UMASK, since a program in a folder others may write is refused (case 7).
  mkdirSync(join(scratch, 'bin'), { mode: 0o755 })
  chmodSync(join(scratch, 'bin'), 0o755)
  program = join(scratch, 'bin', 'a-stand-in')
  writeFileSync(program, '#!/bin/sh\necho fine\n', { mode: 0o755 })
  chmodSync(program, 0o755)
})

afterEach(() => {
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
})

/** A declaration that passes, changed by `over`. */
function aDeclaration(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'a-stand-in',
    what: 'a stand-in for this test only',
    program: { path: program, sha256: theSha256Of(program) },
    argv: ['--pack', '{pack}', '{count}'],
    arguments: { pack: { text: { pattern: '^.*$', maxLength: 100 } }, count: { wholeNumber: { min: 0, max: 9 } } },
    folder: scratch,
    timeLimitSeconds: 60,
    outputs: [{ name: 'RESULT.json', maxBytes: 1000 }],
    logLines: 20,
    mayAsk: { agents: ['an-agent-id'] },
    ...over,
  }
}

describe('the values an agent gives', () => {
  it('1: no value is a path, a hidden name, an option or more than one line, whatever the pattern lets through', () => {
    const refused: [string, string][] = [
      ['../../.ssh', 'it holds a "/", and no argument is a path'],
      ['a/b', 'it holds a "/", and no argument is a path'],
      ['.', 'it is ".", and no argument is a path'],
      ['..', 'it is "..", and no argument is a path'],
      ['.hidden', 'it starts with ".", and no argument is a path or a hidden name'],
      ['-rf', 'it starts with "-", which the tool would read as an option'],
      ['one\ntwo', 'it holds a line break or a NUL'],
      ['nul\0here', 'it holds a line break or a NUL'],
      ['', 'it is empty'],
    ]
    for (const [value, why] of refused) {
      expect(whyNotAPlainValue(value), JSON.stringify(value)).toBe(why)
      expect(whyTheArgumentsAreRefused(aDeclaration() as never, { pack: value, count: 1 }), JSON.stringify(value)).toBe(`"pack" is refused because ${why}`)
    }
    for (const value of ['blue', 'pack-7', 'two words', 'a.b', 'x_y']) expect(whyNotAPlainValue(value), value).toBeNull()
    expect(whyTheArgumentsAreRefused(aDeclaration() as never, { pack: 'blue', count: 1 })).toBeNull()
    expect(whyTheArgumentsAreRefused(aDeclaration() as never, { pack: 'blue', count: -1 })).toBe('"count" must be a whole number from 0 to 9')
    expect(whyTheArgumentsAreRefused(aDeclaration() as never, { pack: 'blue', count: 1.5 })).toBe('"count" must be a whole number from 0 to 9')
    expect(whyTheArgumentsAreRefused(aDeclaration() as never, { pack: 'x'.repeat(101), count: 1 })).toBe('"pack" is 101 characters, more than 100')
  })
})

describe('a declaration, in words', () => {
  it('2: a shell, an interpreter, env, sudo, ssh, a program that starts others or an agent runtime is never the program, and an argument is only ever a whole element', () => {
    expect(whyADeclarationIsRefused(aDeclaration())).toBeNull()
    const theOnesThatStartOthers = ['docker', 'podman', 'systemd-run', 'nsenter', 'unshare', 'chroot', 'tmux', 'screen', 'script', 'expect', 'at', 'crontab', 'find', 'awk', 'gawk', 'mawk', 'make', 'git', 'rsync']
    for (const path of [
      '/usr/bin/python3', '/usr/bin/python3.12', '/usr/bin/node', '/bin/sh', '/bin/bash', '/usr/bin/env', '/usr/bin/sudo', '/usr/bin/ssh', '/usr/bin/perl5.36', '/usr/local/bin/claude', '/usr/bin/Rscript',
      ...theOnesThatStartOthers.map((name) => `/usr/bin/${name}`),
    ]) {
      const why = whyADeclarationIsRefused(aDeclaration({ program: { path, sha256: 'a'.repeat(64) } }))
      expect(why, path).toBe(WHY_IT_IS_NEVER_THE_PROGRAM.itIs(basename(path)))
    }
    for (const path of ['/usr/bin/a-lab-tool', '/opt/lab/bin/gitlike', '/usr/bin/finder']) expect(whyADeclarationIsRefused(aDeclaration({ program: { path, sha256: 'a'.repeat(64) } })), path).toBeNull()
    const refusals: [Record<string, unknown>, string][] = [
      [{ argv: ['--pack={pack}', '{count}'] }, 'its argv element "--pack={pack}" holds a brace and is not a whole placeholder'],
      [{ argv: ['{pack}', '{count}', '{nope}'] }, 'its argv names {nope}, which is not one of its arguments'],
      [{ argv: ['{pack}'] }, 'its argv never places {count}'],
      [{ mayAsk: { agents: [] } }, 'its mayAsk.agents must name at least one agent'],
      [{ mayAsk: { agents: ['an-agent-id'], sandboxes: ['a/b'] } }, 'its mayAsk.sandboxes, when given, must name at least one sandbox by its plain name'],
      [{ arguments: { pack: { text: { pattern: 'blue', maxLength: 10 } }, count: { wholeNumber: { min: 0, max: 9 } } } }, 'the pattern of "pack" must be anchored'],
      [{ arguments: { pack: { oneOf: ['-x'] }, count: { wholeNumber: { min: 0, max: 9 } } } }, 'the oneOf of "pack" lists "-x"'],
      [{ arguments: { pack: { oneOf: ['x'] }, count: { wholeNumber: { min: -1, max: 9 } } } }, 'the whole number argument "count" needs a min and a max, from 0 up'],
      [{ outputs: [{ name: '../RESULT.json', maxBytes: 10 }] }, 'each output must be {name, maxBytes}, its name a plain file name'],
      [{ program: { path: 'bin/a-stand-in', sha256: 'a'.repeat(64) } }, 'its program must be {path, sha256}'],
      [{ shell: true }, `a declaration has only ${DECLARATION_KEYS.join(', ')}; it also has shell`],
    ]
    for (const [over, why] of refusals) expect(whyADeclarationIsRefused(aDeclaration(over)), JSON.stringify(over)).toContain(why)
  })

  it('2b: a recovery step, when declared, names its own checked program and places {job} exactly once', () => {
    const recovery = (over: Record<string, unknown> = {}) => ({
      program: { path: program, sha256: theSha256Of(program) },
      argv: ['--recover', '{job}'],
      ...over,
    })
    expect(whyADeclarationIsRefused(aDeclaration({ recovery: recovery() }))).toBeNull()
    const refusals: [Record<string, unknown>, string][] = [
      [{ recovery: 'a program' }, 'its recovery, when given, must be {program, argv}'],
      [{ recovery: recovery({ shell: true }) }, 'its recovery, when given, must be {program, argv}'],
      [{ recovery: recovery({ program: { path: 'bin/a-recoverer', sha256: 'a'.repeat(64) } }) }, 'its recovery program must be {path, sha256}'],
      [{ recovery: recovery({ program: { path: program, sha256: 'not-a-digest' } }) }, 'its recovery program must be {path, sha256}'],
      [{ recovery: recovery({ program: { path: '/bin/sh', sha256: 'a'.repeat(64) } }) }, WHY_IT_IS_NEVER_THE_PROGRAM.itIs('sh')],
      [{ recovery: recovery({ argv: [] }) }, 'its recovery argv must be a list of from 1 to 16 strings'],
      [{ recovery: recovery({ argv: ['{job}\n'] }) }, 'its recovery argv must hold only strings of one line'],
      [{ recovery: recovery({ argv: ['--recover={job}'] }) }, 'its recovery argv element "--recover={job}" is not a whole placeholder'],
      [{ recovery: recovery({ argv: ['--recover'] }) }, 'its recovery argv must place {job} exactly once, and nothing else'],
      [{ recovery: recovery({ argv: ['{job}', '{job}'] }) }, 'its recovery argv must place {job} exactly once, and nothing else'],
    ]
    for (const [over, why] of refusals) expect(whyADeclarationIsRefused(aDeclaration(over)), JSON.stringify(over)).toContain(why)

    process.env['HOME'] = scratch
    const inside = join(scratch, '.cache', 'mole-office', 'sandboxes', 'a-box', 'a-recoverer')
    mkdirSync(dirname(inside), { recursive: true })
    writeFileSync(inside, '#!/bin/sh\necho inside\n', { mode: 0o755 })
    expect(whyADeclarationIsRefused(aDeclaration({ recovery: recovery({ program: { path: inside, sha256: theSha256Of(inside) } }) }))).toBe(
      'its recovery program is inside the sandboxes folder, where a sandboxed agent could change it',
    )
  })
})

describe('a declaration, on disk', () => {
  it('3: a link to a shell, a program or folder inside the sandboxes folder and a changed program are refused; the registered one passes, by its real paths', () => {
    expect(theProgramOnDisk(aDeclaration() as never)).toEqual({ program: realpathSync(program), folder: realpathSync(scratch) })
    const aName = join(scratch, 'bin', 'another-name')
    symlinkSync(program, aName)
    expect(theProgramOnDisk(aDeclaration({ program: { path: aName, sha256: theSha256Of(program) } }) as never), 'a link is started by the file it resolves to').toEqual({
      program: realpathSync(program),
      folder: realpathSync(scratch),
    })

    const link = join(scratch, 'bin', 'a-helper')
    symlinkSync('/bin/sh', link)
    expect(theProgramOnDisk(aDeclaration({ program: { path: link, sha256: theSha256Of(link) } }) as never)).toEqual({
      refused: WHY_IT_IS_NEVER_THE_PROGRAM.itResolvesTo(basename(realpathSync(link))),
    })

    // THE SANDBOXES FOLDER IS WORKED OUT FROM THE HOME AT THE CALL, so a home moved to the scratch folder puts it there.
    process.env['HOME'] = scratch
    const inside = join(scratch, '.cache', 'mole-office', 'sandboxes', 'a-box', 'a-stand-in')
    mkdirSync(join(inside, '..'), { recursive: true })
    writeFileSync(inside, '#!/bin/sh\necho inside\n', { mode: 0o755 })
    const fromInside = aDeclaration({ program: { path: inside, sha256: theSha256Of(inside) } })
    expect(whyADeclarationIsRefused(fromInside)).toBe('its program is inside the sandboxes folder, where a sandboxed agent could change it')
    const throughALink = join(scratch, 'bin', 'into-a-box')
    symlinkSync(inside, throughALink)
    expect(theProgramOnDisk(aDeclaration({ program: { path: throughALink, sha256: theSha256Of(inside) } }) as never)).toEqual({
      refused: 'its program resolves to a file inside the sandboxes folder, where a sandboxed agent could change it',
    })
    const aBox = join(inside, '..')
    expect(whyADeclarationIsRefused(aDeclaration({ folder: aBox }))).toBe('its folder is inside the sandboxes folder, where a sandboxed agent could write what the tool reads')
    const aFolderThroughALink = join(scratch, 'a-folder-into-a-box')
    symlinkSync(aBox, aFolderThroughALink)
    const underIt = join(aFolderThroughALink, 'under')
    mkdirSync(underIt)
    expect(theProgramOnDisk(aDeclaration({ folder: underIt }) as never)).toEqual({
      refused: 'its folder resolves to a folder inside the sandboxes folder, where a sandboxed agent could write what the tool reads',
    })

    const changing = join(scratch, 'bin', 'a-changing-one')
    writeFileSync(changing, '#!/bin/sh\necho first\n', { mode: 0o755 })
    const registered = theSha256Of(changing)
    appendFileSync(changing, 'echo changed\n')
    expect(theProgramOnDisk(aDeclaration({ program: { path: changing, sha256: registered } }) as never)).toEqual({
      refused: REFUSED.itsSha256Changed(theSha256Of(changing), registered),
    })
    expect(theProgramOnDisk(aDeclaration({ program: { path: join(scratch, 'bin', 'nothing-here'), sha256: registered } }) as never)).toEqual({ refused: expect.stringContaining('is not there') })
    expect(theProgramOnDisk(aDeclaration({ folder: join(scratch, 'no-folder') }) as never)).toEqual({ refused: expect.stringContaining('is not there') })
  })

  it('7a: a program others may write, or in a folder others may write, is refused', () => {
    const open = join(scratch, 'bin', 'open-to-others')
    writeFileSync(open, '#!/bin/sh\necho open\n', { mode: 0o777 })
    chmodSync(open, 0o777)
    expect(theProgramOnDisk(aDeclaration({ program: { path: open, sha256: theSha256Of(open) } }) as never)).toEqual({
      refused: REFUSED.itsFile(realpathSync(open), REFUSED.othersMayWrite('777')),
    })
    const shared = join(scratch, 'shared-bin')
    mkdirSync(shared)
    chmodSync(shared, 0o777)
    const inShared = join(shared, 'a-stand-in')
    writeFileSync(inShared, '#!/bin/sh\necho shared\n', { mode: 0o755 })
    chmodSync(inShared, 0o755)
    expect(theProgramOnDisk(aDeclaration({ program: { path: inShared, sha256: theSha256Of(inShared) } }) as never)).toEqual({
      refused: REFUSED.itsFolder(realpathSync(shared), REFUSED.othersMayWrite('777')),
    })
  })

  it.skipIf(process.getuid?.() === 0)('7b: a program another user owns is refused (skipped as root, who owns it)', () => {
    const theirs = realpathSync('/usr/bin/true')
    expect(theProgramOnDisk(aDeclaration({ program: { path: theirs, sha256: theSha256Of(theirs) } }) as never)).toEqual({
      refused: REFUSED.itsFile(theirs, REFUSED.anotherOwner),
    })
  })
})

describe('the file of tools', () => {
  it('4: is refused whole when it is not a regular file, is open to others or is not JSON; an entry with no registration is refused', () => {
    const folder = join(scratch, 'files')
    mkdirSync(folder)
    const file = join(folder, 'host-tools.json')
    expect(readTheHostTools(file), 'no file is an office with no tools').toEqual({ tools: [], refusedTools: [] })

    const registered = { declaration: aDeclaration(), registered: { by: 'a-secretary-id', decision: 'a-decision-id', at: '2026-11-07 09:00:00' } }
    writeFileSync(file, JSON.stringify({ tools: [registered, { declaration: aDeclaration({ name: 'unsigned' }) }] }), { mode: 0o600 })
    chmodSync(file, 0o600)
    const read = readTheHostTools(file) as { tools: unknown[]; refusedTools: { name: string; why: string }[] }
    expect(read.tools).toEqual([registered])
    expect(read.refusedTools).toEqual([{ name: 'unsigned', why: 'it carries no "registered" part saying who registered it' }])

    chmodSync(file, 0o644)
    expect(readTheHostTools(file)).toEqual({ refused: "The office's host tools file may be read or written by others (mode 644), so no host tool is used. It must be mode 600." })
    chmodSync(file, 0o600)

    const link = join(folder, 'linked.json')
    symlinkSync(file, link)
    expect(readTheHostTools(link)).toEqual({ refused: "The office's host tools file is not a regular file, so no host tool is used." })

    const broken = join(folder, 'broken.json')
    writeFileSync(broken, '{"tools": [', { mode: 0o600 })
    expect(readTheHostTools(broken)).toEqual({ refused: "The office's host tools file is not JSON, so no host tool is used." })
    const notAList = join(folder, 'not-a-list.json')
    writeFileSync(notAList, '{"tool": {}}', { mode: 0o600 })
    expect(readTheHostTools(notAList)).toEqual({ refused: "The office's host tools file is not {tools: [...]}, so no host tool is used." })
  })
})

describe('what a job hands back', () => {
  it('5: a home on a /home-like mount, a private host and the login of ssh -l are masked, and it says so', () => {
    const printed = 'wrote /home_nfs/someone/x on a.b.ts.net, then ran ssh -l someone host and ssh -lsomeone lab.local'
    const done = maskedForAHostJob(printed)
    expect(done.masked).toBe(true)
    for (const shown of ['/home_nfs', 'someone', 'a.b.ts.net', 'lab.local']) expect(done.text, shown).not.toContain(shown)
    expect(done.text).toContain('wrote ~/x on <a host, not shown>')
    expect(done.text).toContain('ssh -l <a login, not shown> host')
    expect(maskedForAHostJob('pack blue: 12 parts, all in place\n')).toEqual({ text: 'pack blue: 12 parts, all in place\n', masked: false })
  })

  it('6: the command line puts each value in its own whole element', () => {
    expect(theArgv(aDeclaration() as never, { pack: 'two words; $(x)', count: 3 })).toEqual(['--pack', 'two words; $(x)', '3'])
  })
})
