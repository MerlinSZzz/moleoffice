// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { THE_API_KEY_NAMES, THE_ROUTED_PROVIDERS, theRoutedProviderOf, theRouterMustCarry, theRoutesOfTheRouter, whyTheRouterDoesNotCarry } from '../src/config/provider-router.mjs'

describe('the provider table describes the routed harnesses', () => {
  it('routes OpenCode on each API provider and Go, and maps each casting selection to its slot provider', () => {
    for (const provider of ['deepseek', 'openai', 'openrouter', 'anthropic', 'opencode-go']) {
      expect(theRouterMustCarry('opencode', `${provider}/model`, provider), provider).toBe(true)
      expect(theRoutedProviderOf({ runtime: 'opencode', native: { provider } }), provider).toBe(provider)
    }
    expect(theRouterMustCarry('dsh', 'model', 'deepseek-official')).toBe(true)
    expect(theRouterMustCarry('claude', 'model', 'anthropic')).toBe(false)
  })

  it('lists every accepted runtime and provider pair in the unsupported-route explanation', () => {
    const routes = theRoutesOfTheRouter()
    const explanation = whyTheRouterDoesNotCarry({ runtime: 'unsupported', native: { provider: 'unsupported' }, casting: null })!
    const described = Array.from(explanation.matchAll(/([a-z0-9-]+) through ([a-z0-9-]+)/g), (match) => `${match[1]} through ${match[2]}`).filter((route) => !route.startsWith('unsupported '))
    expect(described.sort()).toEqual(routes.map((route) => `${route.runtime} through ${route.nativeProvider}`).sort())
    for (const route of routes) {
      expect(theRoutedProviderOf({ runtime: route.runtime, native: { provider: route.nativeProvider } })).toBe(route.provider)
    }
  })

  it('derives sandbox API key names from every provider and includes the Codex alias', () => {
    expect(THE_API_KEY_NAMES).toEqual(expect.arrayContaining([...Object.values(THE_ROUTED_PROVIDERS).map((one) => one.keyName), 'CODEX_API_KEY']))
    expect(THE_API_KEY_NAMES).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
  })
})
