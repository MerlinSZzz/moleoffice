// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NAME OF THE HEADER THAT ASKS A CHECK'S READING TO READ A GIT SEAL FROM ITS SEALED COMMIT.
 *
 * `GET /api/checks/<run>` reads a git seal in the run's folder: HEAD must still be the sealed commit, and every sealed
 * file on disk must hash as sealed. That is right as a check starts. It is wrong for the read the inspector makes just
 * before it posts its verdict (`theSealIsStillTheOneRead` in tools/the-inspector.mjs). A check takes minutes, and by
 * then the next round may be working in the same folder, on another branch, with a sealed file changed. The verdict is
 * about the sealed commit, so that read sends this header, and the server reads the seal from its commit in the
 * repository the seal names, never from the folder (`verifyRunSeal`'s `fromItsRepository`).
 *
 * It takes one value, `FROM_ITS_COMMIT`. A request without it is read in the folder, as before. Any other value is
 * refused rather than read as either.
 *
 * `.mjs`, beside `stand-in-header.mjs`, so the tool, which runs without TypeScript, sends the name the server reads.
 * Lower case, because a browser lower-cases every header name.
 */
export const SEAL_READ_HEADER = 'x-mole-office-read-the-seal'

/** The one value `SEAL_READ_HEADER` takes. */
export const FROM_ITS_COMMIT = 'from-its-commit'
