#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { provider, providers, trial } from './provider-data.mjs'
import { Refusal, sentence } from './keycheck.mjs'

try {
  const [action, id, argument] = process.argv.slice(2)
  if (action === 'providers') {
    for (const row of providers()) console.log(`${row.id}\t${row.name}`)
  } else {
    const row = provider(id)
    if (!row) throw new Refusal(sentence('Choose a provider from the list.', '请从列表中选择提供商。'))
    if (action === 'field' && ['name', 'page', 'documentation', 'instructions', 'scopes', 'folder', 'file', 'prefix', 'min', 'trialDescription', 'otherPermissionsOff', 'expiry', 'confirm', 'confirmationFailure'].includes(argument)) {
      const zh = process.env.KEY_SETUP_LANG === 'zh'
      const value = argument === 'scopes' && row.permissions
        ? Object.entries(row.permissions).map(([resource, actions]) => `${resource}${zh ? ' 的 ' : ': '}${actions.join(zh ? '、' : ', ')}`).join(zh ? '；' : '; ')
        : (zh ? row[`${argument}Zh`] : undefined) ?? row[argument] ?? ''
      console.log(value)
    }
    else if (action === 'trial' && argument) console.log(await trial(row, argument))
    else throw new Refusal(sentence('Choose a valid provider action.', '请选择有效的提供商操作。'))
  }
} catch (error) {
  console.error(error instanceof Refusal ? error.message : sentence('The provider setup could not be completed. Check the provider data and private file.', '无法完成提供商设置。请检查提供商数据和私有文件。'))
  process.exitCode = 1
}
