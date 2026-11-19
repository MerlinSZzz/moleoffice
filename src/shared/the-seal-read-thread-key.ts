// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `workerData` KEY OF THE SEAL-READ THREAD.
 * `THE_SEAL_READ_THREAD` was moved byte for byte out of src/server/lib/the-seal-read-apart-thread.ts, with no
 * change of behaviour. That file imports it back and re-exports it. `theSealARunNames` stayed there: its
 * signature names two server files with `typeof import(...)`.
 */

/** The `workerData` key that tells this file it is the seal-read thread, and holds the database file. */
export const THE_SEAL_READ_THREAD = 'theSealReadThread'
