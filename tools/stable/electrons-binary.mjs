// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ELECTRON'S BINARY IN A CHECKOUT, read in one place for the stable upgrade and the stable bootstrap. npm ci installs
 * the electron package but does not run its install.js, and install.js is what fetches the binary. So each tool runs
 * that install.js after npm ci, and then reads here that the binary is there.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** The electron package's folder in a checkout. */
export const THE_ELECTRON_PACKAGE = 'node_modules/electron'

/**
 * Reads the binary from the electron package's own layout, as its index.js reads it: the file
 * node_modules/electron/path.txt names the binary inside node_modules/electron/dist. `fail` is the caller's own, so
 * each tool keeps its own form of failure. Returns the binary's path relative to the checkout and its size in bytes.
 */
export function electronsBinaryIn(root, fail) {
  const pathFile = join(root, THE_ELECTRON_PACKAGE, 'path.txt'), dist = join(root, THE_ELECTRON_PACKAGE, 'dist')
  if (!existsSync(pathFile)) fail(`Electron's binary was not fetched: there is no ${pathFile}.`)
  const at = join(dist, readFileSync(pathFile, 'utf8'))
  if (!at.startsWith(dist + sep) || !existsSync(at) || !statSync(at).isFile()) fail(`The file ${at} that path.txt names is not in ${dist}.`)
  return { binary: relative(root, at), bytes: statSync(at).size }
}
