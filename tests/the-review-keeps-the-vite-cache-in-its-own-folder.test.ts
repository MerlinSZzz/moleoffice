// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW KEEPS ITS VITE CACHE IN ITS OWN FOLDER, NOT IN THE CHECKOUT.
 *
 * WHAT WENT WRONG. tools/review.mjs starts Vite from the checkout and passes it no MOLE_OFFICE_VITE_CACHE, and it takes
 * a caller's out with the office's other variables. With none set, Vite keeps its dependency cache at .cache/vite in
 * the checkout (cacheDirFrom in vite.config.ts). So a review run from a worktree left .cache/vite/deps in that worktree.
 * The folder is ignored by git, so nothing failed and nobody saw it.
 *
 * WHAT THIS FILE HOLDS.
 *   (a) The review's environment names a Vite cache beside its database, in the folder the database is in.
 *   (b) It does so when the caller named another cache, because the review takes the caller's out.
 *   (c) Read by vite.config.ts's own cacheDirFrom, that cache is not in the checkout.
 *
 * It fails on main's code, where the review's environment names no Vite cache, so Vite uses the checkout's.
 *
 * WHAT THIS FILE DOES NOT HOLD. The message worker of the review's API writes its log under .logs/ in the checkout. No
 * setting moves that folder, so the review cannot move it, and nothing here checks it.
 *
 * MADE UP. The folder names here are made up. Nothing is written, and no review or server is started.
 */
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { expect, it } from 'vitest'
import { theReviewEnvironment } from '../tools/review.mjs'
import { cacheDirFrom } from '../vite.config.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_REVIEWS_FOLDER = '/a/made-up/review-folder'
const THE_REVIEWS_DATABASE = join(THE_REVIEWS_FOLDER, 'review.db')

it('(a) names a Vite cache in the folder of the review\'s database', () => {
  const env = theReviewEnvironment({}, 32101, 32102, THE_REVIEWS_DATABASE, () => {})
  expect(env.MOLE_OFFICE_VITE_CACHE).toBe(join(THE_REVIEWS_FOLDER, 'vite-cache'))
})

it('(b) names its own cache when the caller named another', () => {
  const env = theReviewEnvironment({ MOLE_OFFICE_VITE_CACHE: join(REPO, '.cache', 'vite') }, 32101, 32102, THE_REVIEWS_DATABASE, () => {})
  expect(env.MOLE_OFFICE_VITE_CACHE).toBe(join(THE_REVIEWS_FOLDER, 'vite-cache'))
})

it('(c) is a cache outside the checkout, as vite.config.ts reads it', () => {
  const env = theReviewEnvironment({}, 32101, 32102, THE_REVIEWS_DATABASE, () => {})
  const cache = cacheDirFrom(env)
  expect(relative(REPO, cache).startsWith('..'), `Vite would keep its cache at ${cache}, inside the checkout`).toBe(true)
})
