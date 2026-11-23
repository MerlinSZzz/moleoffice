// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEV SERVER MAY SERVE THE MATHS FONTS WHEN node_modules IS A LINK OUTSIDE THE CHECKOUT.
 *
 * WHAT WENT WRONG. A worktree's node_modules is often a link to another checkout's folder. Vite follows the link to the
 * real path of a file before it serves it, and it serves only files inside the folders its server.fs.allow names. With
 * nothing set there, that is the checkout alone. So under `npm run dev` in such a worktree, each KaTeX font answered 403
 * and formulas were drawn in another font.
 *
 * WHAT THIS FILE HOLDS. Asked of Vite's own resolveConfig and isFileLoadingAllowed, with this checkout's vite.config.ts:
 *   (a) the real path of a KaTeX font in node_modules may be served;
 *   (b) a file in the checkout may still be served, so the checkout itself stays allowed;
 *   (c) a file in a new temporary folder may not be served, so the change allows no more than node_modules.
 *
 * It fails on main's code when node_modules is a link to a folder outside the checkout, as in this file's worktrees: (a)
 * is refused there. Where node_modules is a real folder inside the checkout, the font's real path is inside the
 * checkout, and (a) holds on main's code too. The first line of the test prints which of the two it ran in.
 *
 * Nothing is served and no server is started: the answer is the one the dev server would give a request.
 */
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { expect, it } from 'vitest'
import { isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_FONT = join(REPO, 'node_modules', 'katex', 'dist', 'fonts', 'KaTeX_Main-Regular.woff2')
const A_CHECKOUT_FILE = join(REPO, 'src', 'web', 'index.html')

it('may serve the real path of a KaTeX font, still serves the checkout, and serves no other folder', async () => {
  const linked = lstatSync(join(REPO, 'node_modules')).isSymbolicLink()
  console.log(`node_modules here is ${linked ? `a link to ${realpathSync(join(REPO, 'node_modules'))}` : 'a folder of this checkout'}.`)
  const resolved = await resolveConfig({ configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' }, 'serve')

  const font = normalizePath(realpathSync(THE_FONT))
  expect(isFileLoadingAllowed(resolved, font), `the dev server refuses ${font}; it allows ${resolved.server.fs.allow.join(', ')}`).toBe(true)
  expect(isFileLoadingAllowed(resolved, normalizePath(realpathSync(A_CHECKOUT_FILE))), 'the checkout itself is no longer allowed').toBe(true)

  const elsewhere = mkdtempSync(join(tmpdir(), 'not-the-dev-servers-'))
  try {
    const other = join(elsewhere, 'a-made-up-file.txt')
    writeFileSync(other, 'made up for this test')
    expect(isFileLoadingAllowed(resolved, normalizePath(realpathSync(other))), 'a folder outside the checkout and node_modules is allowed').toBe(false)
  } finally {
    rmSync(elsewhere, { recursive: true, force: true })
  }
}, 60_000)
