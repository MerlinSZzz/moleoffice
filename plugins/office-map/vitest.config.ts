// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], maxWorkers: 1, fileParallelism: false },
})
