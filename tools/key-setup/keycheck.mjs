#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { main, Refusal, accessRefusal } from '../../src/config/provider-setup/private-key.mjs'
export * from '../../src/config/provider-setup/private-key.mjs'

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(main(process.argv.slice(2))) } catch (error) {
    const requested = process.argv.indexOf('--lang')
    console.error(error instanceof Refusal ? error.message : accessRefusal(requested < 0 ? undefined : process.argv[requested + 1]).message)
    process.exitCode = 1
  }
}
