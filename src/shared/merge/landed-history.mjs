// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The original histories retained by a single-commit landing. No office or tool arguments are loaded here. */
import { AN_ATTRIBUTION_LINE } from '../../config/attribution-lines.mjs'

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const ID = /^[A-Za-z0-9_-]+$/
export const LANDED_KEEP_PREFIX = 'refs/keep/landed/'
export const REPLAY_KEEP_PREFIX = 'refs/keep/landed-replay/'

export function isLandingCommitHash(value) { return typeof value === 'string' && HASH.test(value) }

/** Strict provenance shared by the writer and its readers. A partial landing footer is never guessed. */
export function landingProvenance(value) {
  for (const key of ['entry', 'run', 'seal']) {
    if (typeof value?.[key] !== 'string' || !ID.test(value[key])) throw Error(`The landing ${key} is unreadable; nothing can land.`)
  }
  if (typeof value.hash !== 'string' || !/^[0-9a-f]{64}$/.test(value.hash)) throw Error(`The landing seal hash for ${value.seal} is unreadable; nothing can land.`)
  if (!isLandingCommitHash(value.tip)) throw Error(`The landing branch tip for ${value.entry} is unreadable; nothing can land.`)
  return value
}

export function landingTitle(title, run) {
  if (typeof title !== 'string' || title.trim() === '' || /[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(title)) throw Error(`The run title for ${run} is unreadable; nothing can land.`)
  title = title.trim()
  if (AN_ATTRIBUTION_LINE.test(title)) throw Error(`The run title for ${run} contains a forbidden attribution line; nothing can land.`)
  return title
}

export function landingMessage(title, provenance) {
  const p = landingProvenance(provenance)
  if (!isLandingCommitHash(p.replayed)) throw Error(`The replayed tip for ${p.entry} is unreadable; nothing can land.`)
  title = landingTitle(title, p.run)
  return `${title.trim()}\n\nMole-landing: 1\nEntry: ${p.entry}\nRun: ${p.run}\nSeal: ${p.seal}\nSeal-hash: ${p.hash}\nBranch-tip: ${p.tip}\nReplayed-tip: ${p.replayed}\n`
}

/**
 * Read landing footers from Git's body, excluding its supplied subject. Both retained tips must still be readable.
 * Git is asked only for the commits with a footer line, so the read does not grow with every message body in history.
 */
export function retainedLandings(read, at) {
  const rows = read(['log', '--basic-regexp', '--grep=^Mole-landing:', '--format=%H%x00%b%x00', at]).split('\0')
  const found = []
  for (let index = 0; index + 1 < rows.length; index += 2) {
    const landed = rows[index].trim(), body = rows[index + 1]
    if (!/^Mole-landing:/m.test(body)) continue
    const field = (name) => {
      const matches = [...body.matchAll(new RegExp(`^${name}: (.*)$`, 'gm'))]
      if (matches.length !== 1) throw Error(`Landing ${landed} has an unreadable ${name}; its retained history was not inferred.`)
      return matches[0][1]
    }
    if (field('Mole-landing') !== '1') throw Error(`Landing ${landed} has an unreadable Mole-landing version.`)
    const p = landingProvenance({ entry: field('Entry'), run: field('Run'), seal: field('Seal'), hash: field('Seal-hash'), tip: field('Branch-tip'), replayed: field('Replayed-tip') })
    if (!isLandingCommitHash(p.replayed)) throw Error(`Landing ${landed} has an unreadable Replayed-tip.`)
    const parents = read(['rev-list', '--parents', '-n', '1', landed]).trim().split(/\s+/)
    if (parents.length !== 2) throw Error(`Landing ${landed} is not a single-parent commit.`)
    for (const tip of [p.tip, p.replayed]) {
      try { read(['cat-file', '-e', `${tip}^{commit}`]) }
      catch (error) { throw Error(`Landing ${landed} cannot read its retained tip ${tip}: ${String(error)}`) }
    }
    found.push({ ...p, landed, parent: parents[1] })
  }
  return found
}

/**
 * An unreferenced upstream whose tree is main's and whose ancestry also holds the retained originals. Git then skips
 * both original predecessor commits and copies with the same patches. This changes no real branch or working tree.
 *
 * EACH UPSTREAM COMMIT CARRIES ITS TIP'S OWN COMMIT DATE (wave 13u round 178). commit-tree reads its dates only from
 * GIT_AUTHOR_DATE and GIT_COMMITTER_DATE, so `read(args, variables)` runs git with `variables` added to its environment.
 * The same main and the same tips then make the same commit, which git already holds and does not write again. At the
 * current time, every replay in a later second wrote new commits that nothing refers to.
 */
export function replayMain(read, main) {
  let upstream = main
  const tree = read(['rev-parse', `${main}^{tree}`]).trim()
  for (const tip of new Set(retainedLandings(read, main).map(one => one.tip))) {
    if (read(['rev-list', '--count', `${upstream}..${tip}`]).trim() === '0') continue
    const at = read(['log', '-1', '--format=%cd', '--date=raw', tip]).trim()
    upstream = read(['-c', 'user.name=Retained landing history', '-c', 'user.email=history@invalid', '-c', 'commit.gpgSign=false', 'commit-tree', tree, '-p', upstream, '-p', tip, '-m', 'Unreferenced retained landing history'], { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }).trim()
  }
  return upstream
}

/** The same replay selection for integration, early trials, clean copies, resolution checks and bus riders. */
export function replayArguments(read, main, base = main) {
  const upstream = replayMain(read, main)
  return upstream === main && base === main ? ['rebase', '--quiet', main] : ['rebase', '--quiet', '--onto', main, upstream === main ? base : upstream]
}
