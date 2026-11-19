// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Choose the branch against which this run is checked, after its refs have been resolved. */

/**
 * THE TRUNK OF A REPOSITORY, READ FROM THE REPOSITORY AND NEVER ASSUMED.
 *
 * The seal and the check both call this one function, so neither can pick a branch the other does
 * not. The order is fixed and the first answer stops it:
 *
 *   1. the head of the `origin` remote. `origin/master` means the local branch `master` where that
 *      branch exists, and the remote ref itself otherwise.
 *   2. whichever ONE of the local branches `main` and `master` exists.
 *   3. both of them, or neither: there is no answer, and `says` is the refusal.
 *
 * `read` supplies the raw facts and nothing else:
 *
 *   read.remoteHead()       the short name of refs/remotes/origin/HEAD, e.g. `origin/master`, or
 *                           null when the repository has no origin or no origin/HEAD.
 *   read.localExists(name)  whether the local branch `name` exists.
 *
 * @param {{ remoteHead: () => string | null, localExists: (name: string) => boolean }} read
 * @returns {{ branch: string | null, says: string }} `branch` is the branch to read against, or
 *   null when the repository's trunk cannot be told apart from another branch. `says` names what
 *   was looked for and what was found either way.
 */
export function inspectionTrunk(read) {
  const remote = read.remoteHead()
  if (remote) {
    const short = remote.includes('/') ? remote.slice(remote.indexOf('/') + 1) : remote
    if (read.localExists(short)) {
      return {
        branch: short,
        says: `The trunk is ${short}: refs/remotes/${remote} points at it and the local branch ${short} exists.`,
      }
    }
    return {
      branch: remote,
      says: `The trunk is ${remote}: refs/remotes/origin/HEAD points there and no local branch ${short} exists.`,
    }
  }
  const main = read.localExists('main')
  const master = read.localExists('master')
  if (main !== master) {
    const branch = main ? 'main' : 'master'
    return { branch, says: `The trunk is ${branch}: it is the only one of the local branches main and master that exists.` }
  }
  if (main && master) {
    return {
      branch: null,
      says:
        'The office looked for the trunk of this repository and found both a local branch main and a local branch ' +
        'master, so it cannot tell which of them is the trunk; record cutFrom on the session as the way through.',
    }
  }
  return {
    branch: null,
    says:
      'The office looked for the trunk of this repository and found neither a local branch main nor a local branch ' +
      'master, and there is no origin/HEAD to read; record cutFrom on the session as the way through.',
  }
}

/**
 * Choose the branch against which this run is checked, after its refs have been resolved.
 *
 * @param {string | null} cutFrom the branch the run's own record names, or null
 * @param {string | null} head the commit HEAD resolves to, or null
 * @param {string | null} resolved the commit `cutFrom` resolves to, or null
 * @param {{ branch: string | null, says: string } | null} trunk the repository's trunk as
 *   `inspectionTrunk` read it, or null where the caller has no repository to read. It is read
 *   whether or not `cutFrom` is named, because a cutFrom that resolves to the run's own HEAD
 *   falls back to it.
 */
export function inspectionBase(cutFrom, head, resolved, trunk = null) {
  if (cutFrom && cutFrom !== 'main' && head !== null && resolved === head) {
    // THE FALLBACK IS THE REPOSITORY'S TRUNK, not the word main: in a repository whose trunk is
    // master (measured by an agent on 15 September 2026, 17:4x) a fallback to main was a
    // refusal in git's words. Where no trunk could be read, main is what it always was.
    const fallback = trunk && trunk.branch ? trunk.branch : 'main'
    return { branch: fallback, says: `The run recorded cutFrom as ${cutFrom}, which resolves to its own HEAD (${head}). The check falls back to ${fallback}.` }
  }
  if (cutFrom) return { branch: cutFrom, says: "The run's record says so." }
  if (trunk) return { branch: trunk.branch, says: trunk.says }
  return { branch: 'main', says: 'Nobody recorded one, so it is main.' }
}

/**
 * THE TRUNK IS THE NEWER OF THE LOCAL BRANCH AND ITS `origin` COPY (decision
 * `hgWHD-oVVVRk`, 8 October 2026).
 *
 * A sandbox clone's local `main` moves only when somebody pulls, and the wave rebases onto
 * `origin/main`. Round 26 of wave 13s was sealed against a local `main` 23 paths behind, so its
 * seal held other people's work. This applies only where the chosen branch is the trunk, or `main`
 * named as a cutFrom; a run that names another branch gets that branch.
 *
 *   - no `origin/<branch>` (or no local one to compare it with): what was chosen, as before.
 *   - one contains the other: the one that contains the other, which is the newer one. In the
 *     office's own checkout the local `main` is the queue's and origin is behind or equal, so it is
 *     still `main` there.
 *   - neither contains the other: no answer, and `says` is the refusal naming both commits. The
 *     office does not choose one of two diverged branches for the run.
 *
 * `read` supplies the raw facts:
 *
 *   read.commitOf(ref)          the commit a full ref names, or null where there is no such ref.
 *   read.contains(newer, older) whether commit `older` is an ancestor of commit `newer`, or equal.
 *
 * @param {{ branch: string | null, says: string }} chosen what `inspectionBase` chose
 * @param {string | null} trunkBranch the trunk `inspectionTrunk` read, or null
 * @param {{ commitOf: (ref: string) => string | null, contains: (newer: string, older: string) => boolean }} read
 * @returns {{ branch: string | null, says: string }}
 */
export function theNewerTrunk(chosen, trunkBranch, read) {
  const name = chosen.branch
  if (name === null || name.startsWith('origin/') || (name !== 'main' && name !== trunkBranch)) return chosen
  const remote = `origin/${name}`
  const far = read.commitOf(`refs/remotes/${remote}`)
  const local = read.commitOf(`refs/heads/${name}`)
  if (far === null || local === null) return chosen
  if (read.contains(local, far)) return chosen
  if (read.contains(far, local)) {
    return {
      branch: remote,
      says: `${chosen.says} The local ${name} (${local}) is behind ${remote} (${far}), so the newer one, ${remote}, is read.`,
    }
  }
  return {
    branch: null,
    says:
      `The local branch ${name} (${local}) and ${remote} (${far}) have diverged: neither contains the other, so the ` +
      `office cannot tell which of them this run was cut from. Bring ${name} and ${remote} together, or record cutFrom on ` +
      'the session as another branch.',
  }
}
