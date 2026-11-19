// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL READS A CLONE'S CONFIG BEFORE IT RUNS GIT ON THE CLONE'S FILES.
 *
 * The merge tool's clones sit in the entry's sandbox folder, which the sandbox can write, and the tool runs checkout,
 * rebase, add, commit and status in them on the host. A filter, a merge driver or a diff command the clone's config
 * names would run there as the owner's user. tools/merge-tool/what-a-clone-names.mjs reads the config and
 * info/attributes first, without git running anything, and then the index. git.mjs runs nothing on the files of a
 * clone that names anything but the tool's own two merge drivers, or that holds a submodule.
 *
 * WHAT THIS FILE PROVES:
 * 1. A clone whose config names a clean filter, with the attributes line that uses it: add and status are refused
 *    before git starts, the sentence names the key and the file, and the filter's marker file is not there.
 * 2. A config that includes another file, which names a filter: refused, and no marker.
 * 3. The tool's own two merge drivers, as it writes them, pass.
 * 4. The list-join driver with a changed command is refused, and so is any other merge driver.
 * 5. An attributes line that sets anything but one of the two drivers is refused.
 * 6. A fetch by folder into a clone that rewrites that folder to a transport which runs a command is refused, and the
 *    command never runs.
 * 7. The other settings that name a program or a place are refused, and so are a .git that is a file and a commondir.
 * 8. The lane's own checkout, outside the sandboxes folder, is not read: its config is the owner's.
 * 9. A clone whose index holds a submodule, whose own config names a clean filter: status is refused, the sentence
 *    names the index and the path, and the filter's marker file is not there. A submodule setting is refused too.
 *
 * MUTATION PROOF, 15 October 2026, each alone, after a control run of 35 green:
 * - git.mjs without the check: 33 red. In cases 1 and 2 the filter ran. Case 6 was not refused, and its command did not
 *   run, because git.mjs lets git reach only a folder.
 * - git.mjs without the check and with every transport allowed: case 6 red, and its command ran.
 * - the check allowing every merge setting: case 4 alone red.
 *
 * MUTATION PROOF of case 9, 16 October 2026, each alone, after a control run of 38 green:
 * - the check not reading the index: case 9 alone red, and the submodule's filter ran.
 * - the check letting a submodule setting through: the two submodule settings red.
 * - both, which is the check before case 9: those three red.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ folder: '' }))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  get WORKDIR() { return join(boundary.folder, 'logs') },
  get LOG() { return join(boundary.folder, 'logs', 'the-merger.log') },
  get STATE_FILE() { return join(boundary.folder, 'logs', 'state.json') },
  ABSENT: 'absent',
  GIT_IDENTITY: { GIT_AUTHOR_NAME: 'Synthetic queue', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic queue', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
boundary.folder = mkdtempSync(join(tmpdir(), 'a-clones-config-'))
mkdirSync(join(boundary.folder, 'logs'), { recursive: true })
afterAll(() => rmSync(boundary.folder, { recursive: true, force: true }))

import { git, tryGit } from '../tools/merge-tool/git.mjs'
import { JOURNAL_JOIN_DRIVER, joinTheJournalInThisClone } from '../tools/merge-tool/journal-join.mjs'
import { LIST_JOIN_DRIVER, joinTheListsInThisClone, theListJoinCommand } from '../tools/merge-tool/list-join.mjs'
import { ACloneNamesAProgram } from '../tools/merge-tool/log-and-state.mjs'
import { whatTheCloneNames } from '../tools/merge-tool/what-a-clone-names.mjs'

const here = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'a test', GIT_AUTHOR_EMAIL: 'a-test@example.invalid', GIT_COMMITTER_NAME: 'a test', GIT_COMMITTER_EMAIL: 'a-test@example.invalid' },
  }).trim()

let made = 0
/** A lane's checkout outside the sandboxes folder, and a clone of it inside, checked out as the tool checks one out. */
function aCloneInASandbox(): { root: string; clone: string; marker: string } {
  made += 1
  const root = join(boundary.folder, `root-${String(made)}`)
  execFileSync('git', ['init', '-q', '-b', 'main', root])
  writeFileSync(join(root, 'a.txt'), 'one\n')
  here(root, 'add', '-A')
  here(root, 'commit', '-qm', 'one')
  const clone = join(boundary.folder, 'sandboxes', 'synthetic-sandbox', 'work', `clone-${String(made)}`)
  mkdirSync(join(clone, '..'), { recursive: true })
  here(root, 'clone', '--quiet', '--shared', '--no-checkout', root, clone)
  here(clone, 'checkout', '--quiet', '--detach', 'main')
  return { root, clone, marker: join(boundary.folder, `ran-${String(made)}`) }
}

/** What a sandbox writes into the clone: a clean filter that leaves a marker, and the attributes line that uses it. */
function armACleanFilter(clone: string, marker: string, configFile = join(clone, '.git', 'config')): void {
  execFileSync('git', ['config', '--file', configFile, 'filter.x.clean', `touch '${marker}'; cat`])
  mkdirSync(join(clone, '.git', 'info'), { recursive: true })
  writeFileSync(join(clone, '.git', 'info', 'attributes'), '* filter=x\n')
  writeFileSync(join(clone, 'a.txt'), 'one, changed\n')
  writeFileSync(join(clone, 'b.txt'), 'two\n')
}

/** The refusal `run` meets. When nothing is refused, the failure says whether the program the clone named ran. */
function refusal(run: () => unknown, marker?: string): ACloneNamesAProgram {
  try {
    run()
  } catch (error) {
    if (error instanceof ACloneNamesAProgram) return error
    if (marker === undefined) throw error
    throw new Error(`git was not refused, and the program the clone named ${existsSync(marker) ? 'ran' : 'did not run'}: ${String(error)}`)
  }
  throw new Error(`git ran, and nothing was refused${marker !== undefined && existsSync(marker) ? ', and the program the clone named ran' : ''}`)
}

describe("a clone's config is read before git runs on its files", () => {
  it('refuses add and status in a clone that names a clean filter, and the filter never runs', () => {
    const { clone, marker } = aCloneInASandbox()
    armACleanFilter(clone, marker)
    const added = refusal(() => git(clone, ['add', '--', 'b.txt']), marker)
    expect(added.message).toContain(`${join(clone, '.git', 'config')} sets filter.x.clean`)
    expect(added.key).toBe('filter.x.clean')
    expect(refusal(() => tryGit(clone, ['status', '--porcelain'])).key).toBe('filter.x.clean')
    expect(existsSync(marker)).toBe(false)
  })

  it('refuses a config that includes another file, which names the filter', () => {
    const { clone, marker } = aCloneInASandbox()
    const other = join(boundary.folder, `included-${String(made)}`)
    armACleanFilter(clone, marker, other)
    here(clone, 'config', 'include.path', other)
    const refused = refusal(() => git(clone, ['add', '--', 'b.txt']), marker)
    expect(refused.key).toBe('include.path')
    expect(refused.message).toContain('names another file of config for git to read')
    expect(existsSync(marker)).toBe(false)
  })

  it("lets the tool's own merge drivers through, as the tool writes them", () => {
    const { clone } = aCloneInASandbox()
    joinTheJournalInThisClone(clone, (pair: string[]) => git(clone, ['config', ...pair]))
    joinTheListsInThisClone(clone, (pair: string[]) => git(clone, ['config', ...pair]))
    expect(whatTheCloneNames(clone)).toBeNull()
    writeFileSync(join(clone, 'b.txt'), 'two\n')
    git(clone, ['add', '--', 'b.txt'])
    expect(git(clone, ['status', '--porcelain'])).toBe('A  b.txt')
  })

  it('refuses the list driver with a changed command, and any other merge driver', () => {
    const { clone, marker } = aCloneInASandbox()
    joinTheListsInThisClone(clone, (pair: string[]) => git(clone, ['config', ...pair]))
    here(clone, 'config', `merge.${LIST_JOIN_DRIVER}.driver`, `${theListJoinCommand(clone)}; touch '${marker}'`)
    expect(refusal(() => git(clone, ['status'])).key).toBe(`merge.${LIST_JOIN_DRIVER}.driver`)

    const other = aCloneInASandbox()
    joinTheJournalInThisClone(other.clone, (pair: string[]) => git(other.clone, ['config', ...pair]))
    here(other.clone, 'config', 'merge.another.driver', `touch '${other.marker}'`)
    const refused = refusal(() => git(other.clone, ['status']))
    expect(refused.key).toBe('merge.another.driver')
    expect(refused.message).toContain("is not one of the merge tool's own merge drivers")
    expect(existsSync(marker) || existsSync(other.marker)).toBe(false)
  })

  it('refuses an attributes line that sets anything but one of the two drivers', () => {
    const { clone } = aCloneInASandbox()
    joinTheJournalInThisClone(clone, (pair: string[]) => git(clone, ['config', ...pair]))
    writeFileSync(join(clone, '.git', 'info', 'attributes'), `/a.txt merge=${JOURNAL_JOIN_DRIVER}\n* diff=x\n`, { flag: 'a' })
    const refused = refusal(() => git(clone, ['status']))
    expect(refused.message).toContain('line 3 reads "* diff=x"')
  })

  it('refuses a fetch by folder into a clone that rewrites the folder to a command, and the command never runs', () => {
    const { root, clone, marker } = aCloneInASandbox()
    here(clone, 'config', `url.ext::sh -c touch% ${marker}% >&2 #.insteadOf`, root)
    here(clone, 'config', 'protocol.ext.allow', 'always')
    expect(refusal(() => git(clone, ['fetch', '--quiet', '--no-tags', root, 'main']), marker).key).toBe(`url.ext::sh -c touch% ${marker}% >&2 #.insteadof`)
    expect(existsSync(marker)).toBe(false)
  })

  it.each([
    ['core.fsmonitor'], ['core.hooksPath'], ['core.pager'], ['core.editor'], ['core.sshCommand'], ['core.askPass'],
    ['core.alternateRefsCommand'], ['core.worktree'], ['core.attributesFile'], ['diff.external'], ['diff.x.textconv'],
    ['diff.x.command'], ['gpg.program'], ['gpg.ssh.program'], ['remote.origin.uploadpack'], ['remote.origin.vcs'],
    ['extensions.partialClone'], ['includeIf.gitdir:/.path'], ['filter.x.process'], ['core.gitProxy'],
    ['sequence.editor'], ['credential.helper'], ['credential.https://example.invalid.helper'], ['url.x.insteadOf'],
    ['url.x.pushInsteadOf'], ['protocol.ext.allow'], ['protocol.allow'], ['submodule.recurse'], ['submodule.s.update'],
  ])('refuses %s', (key) => {
    const { clone } = aCloneInASandbox()
    execFileSync('git', ['config', '--file', join(clone, '.git', 'config'), key, 'something'])
    expect(refusal(() => git(clone, ['status'])).key.toLowerCase()).toBe(key.toLowerCase())
  })

  it('refuses a clone whose .git is a file, or names another folder through commondir', () => {
    const { clone } = aCloneInASandbox()
    writeFileSync(join(clone, '.git', 'commondir'), '../elsewhere\n')
    expect(refusal(() => git(clone, ['status'])).key).toBe('commondir')
    const other = aCloneInASandbox()
    rmSync(join(other.clone, '.git'), { recursive: true, force: true })
    writeFileSync(join(other.clone, '.git'), `gitdir: ${join(clone, '.git')}\n`)
    expect(refusal(() => git(other.clone, ['status'])).key).toBe('.git')
  })

  it('refuses a clone whose index holds a submodule that names a filter, and the filter never runs', () => {
    const { clone, marker } = aCloneInASandbox()
    const inside = join(clone, 's')
    execFileSync('git', ['init', '-q', '-b', 'main', inside])
    writeFileSync(join(inside, 'f.txt'), 'one\n')
    writeFileSync(join(inside, '.gitattributes'), '* filter=x\n')
    here(inside, 'add', '-A')
    here(inside, 'commit', '-qm', 'one')
    // The filter is named after the commit, so only a later reading of the submodule's files runs it. An old time on the
    // file makes git read its bytes again.
    here(inside, 'config', 'filter.x.clean', `touch '${marker}'; cat`)
    utimesSync(join(inside, 'f.txt'), new Date('2001-01-01'), new Date('2001-01-01'))
    here(clone, 'update-index', '--add', '--cacheinfo', `160000,${here(inside, 'rev-parse', 'HEAD')},s`)
    const refused = refusal(() => tryGit(clone, ['status', '--porcelain']), marker)
    expect(refused.key).toBe('s')
    expect(refused.message).toContain(`${join(clone, '.git', 'index')} holds a submodule at s`)
    expect(existsSync(marker)).toBe(false)
  })

  it("does not read the lane's own checkout, whose config is the owner's", () => {
    const { root } = aCloneInASandbox()
    here(root, 'config', 'core.hooksPath', join(boundary.folder, 'the-owners-hooks'))
    expect(git(root, ['status', '--porcelain'])).toBe('')
  })
})
