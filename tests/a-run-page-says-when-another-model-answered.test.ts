// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S PAGE SAYS WHEN THE MODEL THAT ANSWERED IS NOT THE ONE IT WAS REGISTERED FOR. Problem VBtbw0hSO1E2.
 *
 * `theModelThatAnsweredSentence` in src/shared/session-page.ts is the one place the sentence under a run's
 * Model row is worked out, from `data.model` and `data.served`. These cases pin each of its branches: the
 * same model written with and without a provider prefix says nothing; one other model, several models and
 * "not reported" each say their own sentence; and a run with no `served`, or no registered model, says
 * nothing, because nobody recorded the fact to compare.
 *
 * Since wave 13q's round 40 the sentence names each model by its name (`theModelsName`), says a model this office
 * has no name for is one, and shows the stored ids only in developer mode; the last cases pin that in both
 * languages. The expectations above them changed with it: they read names where they read ids.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { theModelThatAnsweredSentence } from '../src/shared/session-page.ts'

const served = (model: string) => ({ model, temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } })

describe('theModelThatAnsweredSentence', () => {
  it('says nothing when the same model answered, with or without a provider prefix on either side', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-opus-5-5'), false)).toBeNull()
    expect(theModelThatAnsweredSentence('claude-opus-5-5', served('anthropic/claude-opus-5-5'), false)).toBeNull()
    expect(theModelThatAnsweredSentence('opencode-go/glm-5.3-flash', served('opencode-go/glm-5.3-flash'), false)).toBeNull()
  })

  it('names both models when another one answered', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-opus-5'), false)).toEqual({
      differs: true,
      text: 'This run was registered for Claude Opus 5.5, and the model that answered was a model this office has no name for.',
    })
  })

  it('names every model when several answered, even when one of them is the registered one', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-opus-5-5, claude-haiku-4-5'), false)).toEqual({
      differs: true,
      text: 'This run was registered for Claude Opus 5.5, and the models that answered were Claude Opus 5.5, Claude Haiku 4.5.',
    })
  })

  it('says that which model answered was not reported, when the runner looked and found none', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('not reported'), false)).toEqual({
      differs: false,
      text: 'This run was registered for Claude Opus 5.5, and which model answered was not reported.',
    })
  })

  it('says nothing when nobody recorded what served the run, or what it was registered for', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', undefined, false)).toBeNull()
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', null, false)).toBeNull()
    expect(theModelThatAnsweredSentence(undefined, served('claude-opus-5'), false)).toBeNull()
  })
})

describe('the model sentence names the models by name, in the page language, with the ids only in developer mode', () => {
  afterEach(() => setWordLanguage('en'))

  it('names both models in English, and adds their ids only when asked', () => {
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-sonnet-5'), false)?.text).toBe(
      'This run was registered for Claude Opus 5.5, and the model that answered was Claude Sonnet 5.',
    )
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-sonnet-5'), true)?.text).toBe(
      'This run was registered for Claude Opus 5.5 (anthropic/claude-opus-5-5), and the model that answered was Claude Sonnet 5 (claude-sonnet-5).',
    )
  })

  it('names both models in Chinese, and adds their ids only when asked', () => {
    setWordLanguage('zh')
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-sonnet-5'), false)?.text).toBe(
      '这次运行登记的模型是 Claude Opus 5.5，实际回答的模型是 Claude Sonnet 5。',
    )
    expect(theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-sonnet-5'), true)?.text).toBe(
      '这次运行登记的模型是 Claude Opus 5.5（anthropic/claude-opus-5-5），实际回答的模型是 Claude Sonnet 5（claude-sonnet-5）。',
    )
    expect(theModelThatAnsweredSentence('claude-opus-5-5', served('claude-opus-5-5, kiln-model-9'), false)?.text).toBe(
      '这次运行登记的模型是 Claude Opus 5.5，实际回答的模型有 Claude Opus 5.5、一个办公室没有名称的模型。',
    )
  })

  it('never puts an id in the plain sentence, in either language', () => {
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      const text = theModelThatAnsweredSentence('anthropic/claude-opus-5-5', served('claude-sonnet-5, kiln-model-9'), false)?.text ?? ''
      for (const id of ['claude-opus-5-5', 'claude-sonnet-5', 'kiln-model-9']) expect(text, `${language}: ${id}`).not.toContain(id)
    }
  })
})
