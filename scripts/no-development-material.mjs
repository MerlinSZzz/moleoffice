// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE INSTALLER NEVER CARRIES THE OFFICE'S OWN DEVELOPMENT MATERIAL, the owner's decision in wave 13t,
 * round 14c. Mole Office is closed source, and its tests, its tools
 * (the merge tool, the check tool and the rest) and its design folder never ship in a bundle or an installer.
 *
 * Two ways could carry them there, and this reads both:
 *   - the bundler compiles a file from one of those folders into a bundle, because something the
 *     office runs imports it. esbuild's metafile names every source file it read;
 *   - a copied folder holds one. Every file under the output folder is read by its path.
 *
 * The checkout's CLAUDE.md, and the AGENTS.md written from it, are development material too: they are
 * written for the agents that develop the office, and a decision keeps them out of an
 * installer. A file in the folder is one of them when it starts with the developer file's own
 * heading, or with a comment and then that heading, which is how src/worker/rules.ts writes AGENTS.md.
 * Neither is compared with a file in the checkout, because git ignores AGENTS.md and a fresh checkout
 * has none. A part written for users, under another heading, is not one of them. That test is in
 * src/config/the-developer-file.mjs, because the rules writer asks it too, and that file says why it
 * is there.
 *
 * scripts/bundle.mjs and scripts/package-linux.mjs each ask this and refuse, with a plain sentence,
 * when it names anything. Today nothing is named: this keeps it so.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { THE_DEVELOPER_HEADING, isTheDeveloperFile } from '../src/config/the-developer-file.mjs'

export { THE_DEVELOPER_HEADING }

/** The checkout's folders of development material, by their names at its root. */
export const DEVELOPMENT_FOLDERS = Object.freeze(['tests', 'tools', 'design'])

/** @param {string} path a path relative to the checkout or to an output folder */
const isDevelopmentMaterial = (path) => DEVELOPMENT_FOLDERS.includes(path.split(/[\\/]/)[0] ?? '')

/** Every file under a folder, by its path inside it. @param {string} folder */
function everyFileIn(folder) {
  /** @type {string[]} */
  const files = []
  const walk = (/** @type {string} */ at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(relative(folder, path))
    }
  }
  walk(folder)
  return files
}

/**
 * WHAT DEVELOPMENT MATERIAL A BUNDLE OR A PACKED APP WOULD CARRY: the source files from tests/, tools/
 * or design/ that were compiled into it, the files under those names in its folder, and any file in
 * it that is the developer CLAUDE.md or AGENTS.md. An empty list means none.
 *
 * @param {{ root: string, sources?: string[], sourcesFrom?: string, folder?: string }} what `root` is the
 *   checkout; `sources` are the paths esbuild's metafile names, relative to `sourcesFrom` (esbuild's
 *   working folder); `folder` is the output folder to read
 * @returns {string[]} one line for each, saying where it was found
 */
export function developmentMaterialIn({ root, sources = [], sourcesFrom = process.cwd(), folder }) {
  /** @type {string[]} */
  const found = []
  for (const source of sources) {
    const inTheCheckout = relative(root, resolve(sourcesFrom, source))
    if (!inTheCheckout.startsWith(`..${sep}`) && isDevelopmentMaterial(inTheCheckout)) found.push(`${inTheCheckout} (compiled into a bundle)`)
  }
  if (folder !== undefined) {
    for (const file of everyFileIn(folder)) {
      if (isDevelopmentMaterial(file)) found.push(`${file} (a file in ${folder})`)
      else if (isTheDeveloperFile(join(folder, file))) found.push(`${file} (the developer CLAUDE.md or AGENTS.md, in ${folder})`)
    }
  }
  return found
}

/** The sentence that refuses, naming what was found. @param {string} what @param {string[]} found */
export function theRefusal(what, found) {
  return (
    `${what} would carry the office's own development material, which never ships (the owner's decision): ` +
    `${found.join('; ')}. Nothing from ${DEVELOPMENT_FOLDERS.map((one) => `${one}/`).join(', ')} may be imported by what the office runs, or copied beside it, ` +
    `and the developer CLAUDE.md and AGENTS.md are never copied beside it.`
  )
}
