// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// WHAT A TRIAL'S ANSWER MEANS, in the words the person reads. The Settings service, the Settings page and the guided
// command all say these, so one answer is never told two ways. Settings says the English. The guided command says the
// Chinese when it runs in Chinese; that Chinese is the guided command's own, kept until the translation round.
export const TRIAL_WORDS = {
  passed: { en: 'The read-only trial passed. It did not change provider data.', zh: '只读试跑通过；没有更改提供商数据。' },
  'too-broad': {
    en: 'The provider accepted the key, but the key can do more than these instructions ask. Make a key with only the access these instructions list, and save it in place of this one.',
    zh: '提供商接受了这个密钥，但它的权限超出了说明的要求。请新建一个只有说明所列权限的密钥，并用它替换这个密钥。',
  },
  refused: { en: 'The provider did not accept the read-only trial (HTTP {status}). Check the key and its permissions.', zh: '试跑返回 HTTP {status}。请核对密钥和权限。' },
  // AN ANSWER THE ROW DOES NOT DECLARE says nothing about the key, so the person is not told to check it.
  unexpected: {
    en: "The provider gave an answer this trial does not know (HTTP {status}). The key was not judged. Check the provider's status and the trial address.",
    zh: '试跑返回 HTTP {status}。请检查提供商状态和试跑地址。',
  },
  unreachable: { en: 'The trial could not reach the provider. Check the connection and try again.', zh: '试跑无法连接提供商。请检查网络后重试。' },
}

/** The sentence for one answer of askTrial, or for 'unreachable', in English unless lang is 'zh'. */
export function trialSays(outcome, status, lang) {
  const words = Object.hasOwn(TRIAL_WORDS, outcome) ? TRIAL_WORDS[outcome] : undefined
  if (words === undefined) throw new Error(`No words for the trial outcome ${outcome}`)
  return (lang === 'zh' ? words.zh : words.en).replace('{status}', String(status))
}
