// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BACKUP HAND-OVER TO THE LAB SERVER: the names the door, the host tool and its recovery share.
 *
 * The names are written in src/shared/backup-hand-over.mjs, because the host tool is a program the
 * runner starts directly with the person's Node and cannot read TypeScript. This file hands them
 * to the server's own readers under the same names.
 */

export * from './backup-hand-over.mjs'
