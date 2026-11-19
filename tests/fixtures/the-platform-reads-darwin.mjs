// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * MAKES THIS NODE PROCESS SAY IT RUNS ON macOS, for a test on Linux. Loaded with `node --import`.
 *
 * After this file, `process.platform` reads 'darwin', so the server chooses the macOS process reader and the
 * macOS probe (src/config/process-reader.mjs, src/server/lib/resources.ts), and the macOS home folders.
 *
 * ONE THING IS LOADED AS LINUX FIRST, ON PURPOSE: better-sqlite3's native file. better-sqlite3 picks its
 * prebuilt file by `process.platform`, and a macOS file cannot load on Linux. The native file is the database
 * engine, not the reading of processes this test is about, so it is loaded for the machine it runs on, and
 * the module keeps it. Everything read after this line reads 'darwin'.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Opening and closing a database in memory loads the native file, which the module then keeps.
const Database = require('better-sqlite3')
new Database(':memory:').close()
Object.defineProperty(process, 'platform', { value: 'darwin' })
