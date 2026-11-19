// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE AN OFFICE'S REGISTERED HOST TOOLS ARE: one file beside its keys file. The office's door reads it, the host job
 * runner reads it, and the guard's rule 3 keeps every agent on the host from writing, moving or deleting it. This module
 * imports nothing of the office's, so the guard can read it at every call.
 */
import { dirname, resolve } from 'node:path'

/** The file's name, in the office's data folder. */
export const HOST_TOOLS_FILE = 'host-tools.json'

/**
 * The registered host tools of the office whose keys file this is.
 * @param {string} keysFile
 * @returns {string}
 */
export function theHostToolsFileBeside(keysFile) {
  return resolve(dirname(keysFile), HOST_TOOLS_FILE)
}

/** The host job runner's own folder's name, in the same data folder. */
export const HOST_JOBS_FOLDER = 'host-jobs'

/**
 * WHERE THE HOST JOB RUNNER KEEPS A JOB WHILE IT RUNS IT: the job it took, the answer it has not yet sent, and the
 * folder the tool writes its outputs into. The runner sends what it finds here with the office's key, so the guard
 * keeps it as it keeps the tools file.
 * @param {string} keysFile
 * @returns {string}
 */
export function theHostJobsFolderBeside(keysFile) {
  return resolve(dirname(keysFile), HOST_JOBS_FOLDER)
}
