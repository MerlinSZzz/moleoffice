// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MIRROR OF A CHECKOUT'S MAIN, AND WHOSE A CLONE OF IT IS (item 2f of briefs/REQUIREMENTS.md). A sandbox's clone
 * used to be a `git clone --shared` of the checkout it was made from: its origin was the checkout, and its alternates
 * file named the checkout's objects. Now its origin is a bare mirror of the checkout's main, one for each checkout,
 * beside the instance folders (theMainMirrorOf in tools/sandbox-common.mjs), which only the launcher on the host makes
 * and brings forward (bringTheMainMirrorForward in tools/sandbox-git.mjs). The inspector still has to know that a run
 * from such a clone is a run of the checkout's repository (theRepositoryOf in tools/inspector-sandbox.mjs), and a
 * sandbox can write its clone's config, so the clone's origin is only a claim. What this pins:
 *
 *   1. the mirror's place is under the sandboxes folder and in no instance folder, one for each checkout, and the same
 *      for a link to the checkout;
 *   2. an agent's start (make: false) makes no mirror; up (make: true) makes a bare one that names the checkout it
 *      mirrors, with main at the checkout's main, and later brings that main forward and back with the checkout's;
 *   3. a mirror that names another checkout is never written;
 *   4. nothing is fetched when the mirror's config would send the checkout's path somewhere else;
 *   5. theRepositoryOf answers the checkout for a clone of its mirror, and for a worktree of that clone;
 *   6. it answers the clone's own root when the origin is not exactly the mirror of the checkout the mirror names:
 *      asked with another sandboxes folder, a forged mirror in the clone's own folder that names the checkout, a mirror
 *      that names a checkout which is not there;
 *   7. a clone made before item 2f, which borrows the checkout's objects, is still the checkout's;
 *   8. so is such a clone after an agent's start copied the objects in and removed its alternates file, in a container
 *      with no mirror, where its origin is still the checkout: the clone is <sandboxes>/<instance>/repo, and its origin
 *      is exactly the `from` in the host's copy of that instance's facts (theCheckoutAnOlderCloneCameFrom in
 *      tools/sandbox-common.mjs; wave 13n round S, after the inspector refused a second check on 25 October 2026);
 *   9. anything else is the clone's own: an origin naming another sandbox's checkout, the checkout through a link or
 *      with a slash after it, only the copy of the facts in the instance folder, a clone not at <instance>/repo, a
 *      sandboxes folder other than the one asked about, no origin.
 *
 * MUTATION PROOF, 24 October 2026, each alone after a green control (run I1N0szl5K8z6; its logs are
 * out/<the supervisor's folder>/rP/small-1.log and mutation-small-M1 to M5 there):
 *   - theRepositoryOf does not ask theCheckoutAMirrorCloneCameFrom: cases 5 and 6 go red;
 *   - theCheckoutAMirrorCloneCameFrom answers the mirror's recorded checkout without working its place out again:
 *     case 6 goes red;
 *   - bringTheMainMirrorForward makes a missing mirror whatever `make` says: case 2 goes red;
 *   - it skips the check of the recorded checkout: case 3 goes red;
 *   - it skips theAddressGitWouldFetch: case 4 goes red.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INSTANCE_FILE, theHostOnlyFolder, theMainMirrorOf } from '../tools/sandbox-common.mjs'
import { bringTheMainMirrorForward } from '../tools/sandbox-git.mjs'
import { theRepositoryOf } from '../tools/inspector-sandbox.mjs'

let scratch = ''
let sandboxes = ''
let checkout = ''
let gitHome = ''

/** Git with no config of the person's, as the made-up sandbox repositories of the other tests run it. */
function git(at: string, ...args: string[]): string {
  return execFileSync('git', ['-C', at, ...args], {
    encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, HOME: gitHome, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(gitHome, 'no-config'),
      GIT_AUTHOR_NAME: 'A made-up checkout', GIT_AUTHOR_EMAIL: 'checkout@example.invalid',
      GIT_COMMITTER_NAME: 'A made-up checkout', GIT_COMMITTER_EMAIL: 'checkout@example.invalid',
    },
  }).trim()
}

/** Whether `path` is `folder` or inside it. */
function inside(folder: string, path: string): boolean {
  const r = relative(folder, path)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/** A checkout with a main of one commit, at `at`. */
function aCheckout(at: string): string {
  mkdirSync(at, { recursive: true })
  git(at, 'init', '-q', '-b', 'main')
  writeFileSync(join(at, 'README.md'), `a made-up checkout at ${at}\n`)
  git(at, 'add', '-A')
  git(at, 'commit', '-q', '-m', 'the first commit')
  return at
}

/** One more commit on the checkout's main; answers its hash. */
function aCommit(at: string, words: string): string {
  writeFileSync(join(at, 'README.md'), `${words}\n`)
  git(at, 'commit', '-q', '-am', words)
  return git(at, 'rev-parse', 'HEAD')
}

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-main-mirror-')))
  gitHome = join(scratch, 'git-home')
  mkdirSync(gitHome)
  sandboxes = join(scratch, 'sandboxes')
  mkdirSync(sandboxes)
  checkout = aCheckout(join(scratch, 'checkout'))
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the mirror of a checkout\'s main', () => {
  it('1: is under the sandboxes folder and in no instance folder, one for each checkout, the same through a link', () => {
    const mirror = theMainMirrorOf(sandboxes, checkout)
    expect(inside(sandboxes, mirror)).toBe(true)
    expect(inside(checkout, mirror)).toBe(false)
    // AN INSTANCE FOLDER IS ONE NAME UNDER THE SANDBOXES FOLDER that starts with a letter or a digit; the mirror's
    // first folder there starts with neither, so no instance folder can hold it.
    expect(relative(sandboxes, mirror).split('/')[0]).toMatch(/^[^a-z0-9]/)
    const other = aCheckout(join(scratch, 'another', 'checkout'))
    expect(theMainMirrorOf(sandboxes, other)).not.toBe(mirror)
    symlinkSync(checkout, join(scratch, 'a-link-to-the-checkout'))
    expect(theMainMirrorOf(sandboxes, join(scratch, 'a-link-to-the-checkout'))).toBe(mirror)
  })

  it('2: is made only when asked, names its checkout, and follows its main forward and back', () => {
    const mirror = theMainMirrorOf(sandboxes, checkout)
    const notAsked = bringTheMainMirrorForward(mirror, checkout)
    expect(notAsked.made).toBe(false)
    expect(notAsked.why).toMatch(/up makes it/)
    expect(existsSync(mirror), 'an agent\'s start made the mirror').toBe(false)

    const made = bringTheMainMirrorForward(mirror, checkout, { make: true })
    expect(made, JSON.stringify(made)).toEqual({ made: true, moved: true, why: null })
    expect(git(mirror, 'rev-parse', '--is-bare-repository')).toBe('true')
    expect(git(mirror, 'config', '--get', 'mole-office.source')).toBe(checkout)
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(git(checkout, 'rev-parse', 'refs/heads/main'))
    expect(git(mirror, 'for-each-ref', '--format=%(refname)')).toBe('refs/heads/main')

    expect(bringTheMainMirrorForward(mirror, checkout)).toEqual({ made: false, moved: false, why: null })
    const first = git(checkout, 'rev-parse', 'HEAD')
    const next = aCommit(checkout, 'the second commit')
    expect(bringTheMainMirrorForward(mirror, checkout)).toEqual({ made: false, moved: true, why: null })
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(next)
    git(checkout, 'update-ref', 'refs/heads/main', first)
    expect(bringTheMainMirrorForward(mirror, checkout)).toEqual({ made: false, moved: true, why: null })
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(first)
    git(checkout, 'update-ref', 'refs/heads/main', next)
  })

  it('3: never writes a mirror that names another checkout', () => {
    const other = aCheckout(join(scratch, 'a-third-checkout'))
    const mirror = theMainMirrorOf(sandboxes, other)
    expect(bringTheMainMirrorForward(mirror, other, { make: true }).why).toBeNull()
    git(mirror, 'config', 'mole-office.source', checkout)
    const before = git(mirror, 'rev-parse', 'refs/heads/main')
    aCommit(other, 'a commit the mirror must not take')
    const asked = bringTheMainMirrorForward(mirror, other)
    expect(asked.moved).toBe(false)
    expect(asked.why).toContain(`names ${checkout} as the one it mirrors`)
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(before)
  })

  it("4: fetches nothing when the mirror's config would send the checkout's path elsewhere", () => {
    const other = aCheckout(join(scratch, 'a-fourth-checkout'))
    const mirror = theMainMirrorOf(sandboxes, other)
    expect(bringTheMainMirrorForward(mirror, other, { make: true }).why).toBeNull()
    const before = git(mirror, 'rev-parse', 'refs/heads/main')
    aCommit(other, 'a commit fetched only from the checkout itself')
    // THE PLACE IT IS SENT TO HOLDS THAT COMMIT TOO, so a fetch from there would move the mirror's main.
    const elsewhere = join(scratch, 'somewhere-else')
    git(scratch, 'clone', '-q', '--no-hardlinks', other, elsewhere)
    git(mirror, 'config', `url.${elsewhere}.insteadOf`, other)
    const asked = bringTheMainMirrorForward(mirror, other)
    expect(asked.moved).toBe(false)
    expect(asked.why).toContain(`rewrites the address ${other} to ${elsewhere}`)
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(before)
  })
})

describe('theRepositoryOf, for a clone of the mirror', () => {
  let clone = ''
  let mirror = ''

  beforeAll(() => {
    mirror = theMainMirrorOf(sandboxes, checkout)
    expect(bringTheMainMirrorForward(mirror, checkout, { make: true }).why).toBeNull()
    clone = join(sandboxes, 'an-instance', 'repo')
    mkdirSync(join(sandboxes, 'an-instance'))
    git(join(sandboxes, 'an-instance'), 'clone', '-q', '--no-hardlinks', '--branch', 'main', mirror, clone)
  })

  it('5: is the checkout, from the clone and from a worktree of it', () => {
    expect(existsSync(join(clone, '.git', 'objects', 'info', 'alternates'))).toBe(false)
    expect(theRepositoryOf(clone, sandboxes)).toBe(checkout)
    const worktree = join(sandboxes, 'an-instance', 'worktrees', 'a-worker')
    git(clone, 'worktree', 'add', '-q', '-b', 'a-worker', worktree, 'main')
    expect(theRepositoryOf(worktree, sandboxes)).toBe(checkout)
  })

  it('6: is the clone itself when its origin is not exactly the mirror of the checkout that mirror names', () => {
    // ASKED WITH ANOTHER SANDBOXES FOLDER: the mirror is not where that folder's mirror of the checkout would be.
    const another = join(scratch, 'other-sandboxes')
    mkdirSync(another)
    expect(theRepositoryOf(clone, another)).toBe(clone)
    // A FORGED MIRROR in the clone's own folder, which the sandbox can write, naming the checkout.
    const forged = join(sandboxes, 'an-instance', 'forged.git')
    git(sandboxes, 'init', '-q', '--bare', forged)
    git(forged, 'config', 'mole-office.source', checkout)
    git(clone, 'remote', 'set-url', 'origin', forged)
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    // A MIRROR THAT NAMES A CHECKOUT WHICH IS NOT THERE.
    git(clone, 'remote', 'set-url', 'origin', mirror)
    expect(theRepositoryOf(clone, sandboxes)).toBe(checkout)
    git(mirror, 'config', 'mole-office.source', join(scratch, 'no-checkout-here'))
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    git(mirror, 'config', 'mole-office.source', checkout)
    // NO ORIGIN AT ALL.
    git(clone, 'remote', 'remove', 'origin')
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    git(clone, 'remote', 'add', 'origin', mirror)
  })

  it('7: a clone made before item 2f, which borrows the checkout\'s objects, is still the checkout\'s', () => {
    const shared = join(scratch, 'an-older-instance', 'repo')
    mkdirSync(join(scratch, 'an-older-instance'))
    git(join(scratch, 'an-older-instance'), 'clone', '-q', '--shared', '--branch', 'main', checkout, shared)
    expect(existsSync(join(shared, '.git', 'objects', 'info', 'alternates'))).toBe(true)
    expect(theRepositoryOf(shared, sandboxes)).toBe(checkout)
  })
})

describe('theRepositoryOf, for a clone made before item 2f whose objects a start has since copied in', () => {
  /**
   * An instance as `up` made one before item 2f, in `folder`: its repo a `git clone --shared` of `from`, so its origin is
   * `from` as written, and the host's copy of its facts naming `from`. Then what an agent's start has done since 2f in
   * a container with no mirror (OWN_PACKAGES_AND_ORIGIN in tools/sandbox.mjs): the objects copied in, the alternates
   * file removed, the origin left. The folder's own copy of the facts is not written: the host never reads it here.
   */
  function anOlderInstance(name: string, from: string, folder = sandboxes): string {
    const dir = join(folder, name)
    mkdirSync(dir, { recursive: true })
    const clone = join(dir, 'repo')
    git(dir, 'clone', '-q', '--shared', '--branch', 'main', from, clone)
    git(clone, 'repack', '-a', '-d', '-q')
    rmSync(join(clone, '.git', 'objects', 'info', 'alternates'))
    git(clone, 'fsck', '--connectivity-only', '--no-progress')
    mkdirSync(theHostOnlyFolder(dir), { recursive: true })
    writeFileSync(join(theHostOnlyFolder(dir), INSTANCE_FILE), JSON.stringify({ instance: name, dir, from }))
    return clone
  }

  // MUTATION: theRepositoryOf does not ask theCheckoutAnOlderCloneCameFrom.
  it('8: is the checkout the host\'s facts name when the origin is exactly that name, from the clone and from a worktree', () => {
    // UP WROTE THE SAME STRING IN BOTH PLACES, and git writes the origin as it was given, a link included; the answer is
    // the checkout's real path, as every other answer of theRepositoryOf is.
    const link = join(scratch, 'a-link-up-was-given')
    symlinkSync(checkout, link)
    const clone = anOlderInstance('an-instance-made-before-2f', link)
    expect(existsSync(join(clone, '.git', 'objects', 'info', 'alternates'))).toBe(false)
    expect(git(clone, 'config', '--get', 'remote.origin.url')).toBe(link)
    expect(theRepositoryOf(clone, sandboxes)).toBe(checkout)
    const worktree = join(dirname(clone), 'worktrees', 'a-worker')
    git(clone, 'worktree', 'add', '-q', '-b', 'a-worker', worktree, 'main')
    expect(theRepositoryOf(worktree, sandboxes)).toBe(checkout)
  })

  // MUTATIONS, each alone: compare real paths, or trim a slash; take the `from` of any instance in the sandboxes folder;
  // read the copy of the facts in the instance folder; answer a clone of any name in the instance folder; take the
  // instance folder from the clone's own path wherever it is.
  it('9: is the clone itself when its origin is not exactly the checkout the host\'s facts for its instance name', () => {
    // ANOTHER SANDBOX'S CHECKOUT, which the host's facts of that sandbox name.
    const other = aCheckout(join(scratch, 'the-checkout-of-another-sandbox'))
    anOlderInstance('another-sandbox', other)
    const clone = anOlderInstance('a-sandbox', checkout)
    expect(theRepositoryOf(clone, sandboxes)).toBe(checkout)
    git(clone, 'remote', 'set-url', 'origin', other)
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    // THE CHECKOUT THROUGH A LINK, AND WITH A SLASH AFTER IT: git would fetch from the same place, but the name is not
    // the one up wrote.
    const link = join(scratch, 'another-link-to-the-checkout')
    symlinkSync(checkout, link)
    git(clone, 'remote', 'set-url', 'origin', link)
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    git(clone, 'remote', 'set-url', 'origin', `${checkout}/`)
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    // NO ORIGIN AT ALL.
    git(clone, 'remote', 'remove', 'origin')
    expect(theRepositoryOf(clone, sandboxes)).toBe(clone)
    git(clone, 'remote', 'add', 'origin', checkout)
    expect(theRepositoryOf(clone, sandboxes)).toBe(checkout)

    // ONLY THE COPY OF THE FACTS IN THE INSTANCE FOLDER, which a run in the sandbox can write.
    const unhosted = anOlderInstance('a-sandbox-the-host-holds-no-facts-for', checkout)
    const dir = dirname(unhosted)
    writeFileSync(join(dir, INSTANCE_FILE), JSON.stringify({ instance: 'a-sandbox-the-host-holds-no-facts-for', dir, from: checkout }))
    rmSync(theHostOnlyFolder(dir), { recursive: true })
    expect(theRepositoryOf(unhosted, sandboxes)).toBe(unhosted)

    // A CLONE IN THE INSTANCE FOLDER THAT IS NOT ITS REPO, made by a run in the sandbox.
    const beside = join(dirname(clone), 'a-clone-of-its-own')
    git(dirname(clone), 'clone', '-q', '--no-hardlinks', '--branch', 'main', checkout, beside)
    expect(git(beside, 'config', '--get', 'remote.origin.url')).toBe(checkout)
    expect(theRepositoryOf(beside, sandboxes)).toBe(beside)

    // AN INSTANCE IN ANOTHER SANDBOXES FOLDER, with the host's facts beside it there, when this folder is the one asked.
    const elsewhere = anOlderInstance('a-sandbox-elsewhere', checkout, join(scratch, 'other-sandboxes-with-facts'))
    expect(theRepositoryOf(elsewhere, join(scratch, 'other-sandboxes-with-facts'))).toBe(checkout)
    expect(theRepositoryOf(elsewhere, sandboxes)).toBe(elsewhere)
  })
})
