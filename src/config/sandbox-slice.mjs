// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ALL SANDBOXES TOGETHER, IN ONE SLICE, under a memory limit for the sandbox given in a
 * message.
 * Each container is held to its own 16 GB, but seventeen of them allowed about 272 GB together on a machine of 93 GB,
 * and nothing held the sum. Every container this launcher makes goes under this one systemd slice, through docker's
 * --cgroup-parent, so a limit set on the slice holds all of them together. Docker asks systemd to make the slice when
 * it is missing, with no limit, which needs no administrator. The limit itself (MemoryMax on the slice) is set by an
 * administrator, through the press on the Settings page (src/config/sandbox-memory-cap.mjs). A container made before
 * this keeps its old place until it is made again.
 *
 * UNDER system.slice, WHERE EVERY CONTAINER ALREADY WAS: a dash in a slice's name nests it, so this one is
 * /system.slice/system-molesandboxes.slice. A slice at the top would sit beside user.slice and take a third of the
 * processors from the desktop when all are busy, instead of sharing system.slice's half with the system's services.
 *
 * It is here, in src/config, rather than in tools/sandbox-common.mjs, because the office's own server reads it for the
 * press and tools/ never ships. tools/sandbox-common.mjs exports it from here as before.
 */
export const SANDBOX_SLICE = 'system-molesandboxes.slice'
