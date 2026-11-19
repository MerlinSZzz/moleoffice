// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE TWO WAYS A HOST JOB IS HELD, as the runner (tools/run-the-host-jobs.mjs) answers them and the office's answer door
 * takes them (src/server/api/host-jobs.ts). The first is a systemd scope of the job's own, which ends every process in
 * it, also one that left the tool's process group. The second is the tool's process group alone, where no scope could
 * be started or a scope could not be stopped; a process that left that group is not ended.
 */
export const HOST_JOB_HOLDINGS = /** @type {const} */ (['its own scope', 'its process group only'])
