// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODEL THE LAUNCHER IS GIVEN CARRIES THE PROVIDER THE DATA FILE NAMES.
 *
 * The provider a runtime's own program runs is one fact, in src/config/runtime-native-providers.json, read through
 * src/config/runtime-native-providers.mjs. src/shared/worker-runs.ts used to write openai/ in code for a Codex model,
 * so a data file naming another provider for Codex was ignored. This file mocks that module with a provider made up for
 * the run and shows the function follows it. The file is read nowhere else here, so the real data never decides this.
 *
 * WHAT GOES RED WHEN THE LITERAL COMES BACK: the first Codex case, which expects the made-up provider and gets openai/.
 */
import { describe, expect, it, vi } from 'vitest'

const made = vi.hoisted(() => {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return { codex: `codex-provider-${key}`, claude: `claude-provider-${key}`, key }
})
vi.mock('../src/config/runtime-native-providers.json', async (importOriginal) => {
  const real = (await importOriginal<{ default: Record<string, { program: string; provider: string | null; fastMode: boolean }> }>()).default
  return {
    default: Object.freeze({
      ...real,
      codex: { ...real['codex']!, provider: made.codex },
      'claude-code': { ...real['claude-code']!, provider: made.claude },
    }),
  }
})

import { theModelTheLauncherIsGiven } from '../src/shared/worker-runs.ts'

describe('the model the launcher is given carries the provider the data file names', () => {
  // MUTATION: the openai/ literal comes back; red on the made-up provider or the model as first written.
  it('prefixes a Codex model with the provider made up for this run', () => {
    const model = `model-${made.key}`
    expect(theModelTheLauncherIsGiven({ runtime: 'codex', model })).toBe(`${made.codex}/${model}`)
  })

  it('leaves a Codex model already under that provider as it is', () => {
    const model = `${made.codex}/model-${made.key}`
    expect(theModelTheLauncherIsGiven({ runtime: 'codex', model })).toBe(model)
  })

  it('leaves the runtimes the launcher names without a provider as they are', () => {
    const model = `model-${made.key}`
    for (const runtime of ['claude-code', 'opencode', 'dsh']) {
      expect(theModelTheLauncherIsGiven({ runtime, model }), runtime).toBe(model)
    }
  })
})
