// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A failed push is reported after the landing. It never rolls main back. */
import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { AN_ATTRIBUTION_LINE } from '../../src/config/attribution-lines.mjs'
import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX } from '../../src/shared/merge/landed-history.mjs'
import { chosen, theMainMirrorOf, thePrivateOrigin } from './arguments.mjs'
import { cleanEnvironment, git, gitBytes, run, tryGit } from './git.mjs'
import { log } from './log-and-state.mjs'

const LIMIT = 300_000
/** What the push to the private copy says, in every sentence and log it leaves, in place of that copy's address. */
const MASK = '<MOLE_OFFICE_PRIVATE_ORIGIN>'
/** The one form of address the push takes: GitHub's ssh form, with an owner, and a name that is not only dots. */
const A_GITHUB_ADDRESS = /^git@github\.com:([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]*[A-Za-z0-9_-][A-Za-z0-9._-]*)\.git$/

/** Keep report hashes and effective replay proofs with every copy of main, without rewriting any remote ref. */
function retainedRefspecs(root) {
  return git(root, ['for-each-ref', '--format=%(refname)', LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX]).split('\n').filter(Boolean).map(ref => `${ref}:${ref}`)
}

/**
 * Both pushes after a landing, in one step: the private GitHub copy, then the mirror. Neither waits on the other. An
 * emergency push to main (emergency-push.mjs) calls it too, after it moves main.
 */
export async function pushLanded(root, commit) {
  const origin = await pushToOrigin(root, commit)
  const mirror = await pushToTheMirror(root, commit)
  log(mirror.says)
  return {ok: origin.ok && mirror.ok, commit, says: `${origin.says} ${mirror.says}`, ...(origin.log === undefined ? {} : {log: origin.log}), mirror}
}

/** Screen every history being sent, excluding objects already advertised by that copy. */
function refuseAttributionInNewHistory(root, target, commit) {
  const kept = git(root, ['for-each-ref', '--format=%(objectname)', LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX]).split('\n').filter(Boolean)
  const advertised = git(root, ['ls-remote', target, 'refs/heads/main', `${LANDED_KEEP_PREFIX}*`, `${REPLAY_KEEP_PREFIX}*`], {timeout: LIMIT}).split('\n').filter(Boolean).map(line => line.split(/\s+/)[0])
  const known = [...new Set(advertised)].filter(tip => tryGit(root, ['cat-file', '-e', `${tip}^{commit}`]).ok)
  const messages = git(root, ['log', '--format=%B', commit, ...new Set(kept), ...(known.length === 0 ? [] : ['--not', ...known])], {timeout: 30_000})
  if (AN_ATTRIBUTION_LINE.test(messages)) throw Error('New commits contain a forbidden attribution line; nothing was pushed.')
}

/**
 * THE PRIVATE COPY, read from MOLE_OFFICE_PRIVATE_ORIGIN through arguments.mjs each time the push runs and never at
 * import: the setting belongs to the host run that lands, and it has no default. Its value is never printed. With
 * none, or with one that is not a GitHub ssh address, the push stops and names only the setting.
 */
function thePrivateCopy() {
  const address = thePrivateOrigin()
  if (address === null) throw Error('MOLE_OFFICE_PRIVATE_ORIGIN is not set, so there is no private copy to push to.')
  const parts = A_GITHUB_ADDRESS.exec(address)
  if (parts === null) throw Error('MOLE_OFFICE_PRIVATE_ORIGIN is not an address of the form git@github.com:<owner>/<name>.git, so nothing was pushed to a private copy. Its value is not printed.')
  return {address, owner: parts[1], name: parts[2]}
}

/**
 * Text with the private copy's address, its owner and name, and its owner alone as <MOLE_OFFICE_PRIVATE_ORIGIN>, in
 * any case, since GitHub reads them in any case. It is one pass, so a mask is never masked again. The name alone is
 * kept: a repository's name is often a plain word that the text needs.
 */
function hidden(text, copy) {
  if (copy === null) return text
  const escaped = (words) => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const whole = [copy.address, `${copy.owner}/${copy.name}`].map(escaped).join('|')
  return text.replace(new RegExp(`${whole}|(?<![A-Za-z0-9-])${escaped(copy.owner)}(?![A-Za-z0-9-])`, 'gi'), MASK)
}

/** A step's log file, written again with the private copy's address masked. */
function hideIn(file, copy) {
  writeFileSync(file, hidden(readFileSync(file, 'utf8'), copy))
}

async function pushToOrigin(root, commit) {
  let copy = null
  try {
    copy = thePrivateCopy()
    // Git resolves insteadOf and pushInsteadOf here. Check the transport URLs, including every push URL.
    // Remove only the command's final newline; spaces in a configured URL are not silently trimmed.
    const urls = [...gitBytes(root, ['remote', 'get-url', '--all', 'origin']).toString('utf8').replace(/\n$/, '').split('\n'),
      ...gitBytes(root, ['remote', 'get-url', '--push', '--all', 'origin']).toString('utf8').replace(/\n$/, '').split('\n')]
    const differ = urls.filter((url) => url !== copy.address).length
    if (differ > 0) throw Error(`Origin has ${urls.length} fetch and push URLs, and ${differ} of them ${differ === 1 ? 'is' : 'are'} not exactly the address MOLE_OFFICE_PRIVATE_ORIGIN names. No URL is printed.`)
    // THE OWNER AND NAME REACH gh IN ITS ENVIRONMENT, not in its arguments, because run() prints a step's arguments.
    const visibility = await run('push-visibility', 'sh', ['-c', 'exec gh api "$THE_PRIVATE_COPY" --jq .visibility'], {cwd: root, env: cleanEnvironment({THE_PRIVATE_COPY: `repos/${copy.owner}/${copy.name}`}), timeoutMs: LIMIT})
    const answer = readFileSync(visibility.outFile, 'utf8').trim()
    hideIn(visibility.outFile, copy)
    if (visibility.code !== 0 || visibility.timedOut || visibility.error) throw Error(`The repository visibility check failed: ${visibility.tail}`)
    if (answer !== 'private') throw Error(`The repository visibility is ${JSON.stringify(answer)}, not private.`)
    const remote = git(root, ['ls-remote', 'origin', 'refs/heads/main'], {timeout: LIMIT}).split(/\s/)[0]
    if (remote !== '') git(root, ['merge-base', '--is-ancestor', remote, commit], {timeout: 30_000})
    refuseAttributionInNewHistory(root, 'origin', commit)
    const pushed = await run('push-landed', 'git', ['push', '--atomic', 'origin', `${commit}:refs/heads/main`, ...retainedRefspecs(root)], {cwd: root, env: cleanEnvironment(), timeoutMs: LIMIT})
    hideIn(pushed.outFile, copy)
    if (pushed.code !== 0 || pushed.timedOut || pushed.error) throw Error(`git push failed: ${pushed.tail}`)
    return {ok: true, says: `Pushed landed commit ${commit} to private origin.`, log: pushed.outFile}
  } catch (error) {
    return {ok: false, says: hidden(`Push stopped after landing ${commit}: ${error instanceof Error ? error.message : String(error)} Main was not rolled back.`, copy)}
  }
}

/**
 * THE MIRROR OF MAIN (items 17 and 18 of the 13u requirements): the sandboxes clone main from it,
 * so no fetch reaches a live checkout. Its place is theMainMirrorOf(sandboxes, the lane's root), the call the sandbox
 * launcher makes (tools/sandbox-common.mjs), with the sandboxes folder the merge tool is given. THE LAUNCHER IS ITS ONE
 * MAKER, at `up`, and it brings the mirror forward at each start. A landing that finds no mirror there makes none and
 * pushes nothing, and says so. The push never forces: a mirror whose main is not behind the landed commit is told as a
 * failed push. A failed push leaves main landed, and the next landing pushes again. AN EMERGENCY PUSH TO MAIN IS ITS
 * SECOND WRITER (wave 13u round 82, emergency-push.mjs): it calls pushLanded after it moves main, so the mirror follows
 * main whichever of the two moved it. Its sentences say "landed" for the pushed commit too.
 */
async function pushToTheMirror(root, commit) {
  let path = null
  try {
    path = theMainMirrorOf(chosen.sandboxes, root)
    if (!existsSync(path)) {
      return {ok: false, path, says: `Landed commit ${commit} was pushed to no mirror: there is no mirror of main at ${path}. Only the sandbox launcher makes it, when it brings up a sandbox from ${root}. Main was not rolled back.`}
    }
    const bare = tryGit(root, [`--git-dir=${path}`, 'rev-parse', '--is-bare-repository'])
    if (!bare.ok || bare.stdout !== 'true') throw Error(`${path} is not a bare repository, so nothing was written there.`)
    refuseAttributionInNewHistory(root, path, commit)
    const pushed = await run('push-mirror', 'git', ['push', '--atomic', path, `${commit}:refs/heads/main`, ...retainedRefspecs(root)], {cwd: root, env: cleanEnvironment(), timeoutMs: LIMIT})
    if (pushed.code !== 0 || pushed.timedOut || pushed.error) throw Error(`git push failed: ${pushed.tail}`)
    return {ok: true, path, says: `Pushed landed commit ${commit} to the mirror at ${path}.`, log: pushed.outFile}
  } catch (error) {
    return {ok: false, path, says: `The push to the mirror${path === null ? '' : ` at ${path}`} stopped after landing ${commit}: ${error instanceof Error ? error.message : String(error)} Main was not rolled back; the next landing pushes again.`}
  }
}
