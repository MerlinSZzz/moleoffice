#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Problem __4iR4FkFAGS; a decision says no secret in argv, URLs or
// diagnostics.
import { checkFile, Refusal, sentence, accessRefusal } from './keycheck.mjs'
import { readKey } from './readkey.mjs'
import { provider as providerRow } from './provider-data.mjs'

async function main() {
  const [provider, file, prefix, minimum, ...extra] = process.argv.slice(2)
  if (!file || prefix === undefined || !/^[1-9][0-9]*$/.test(minimum ?? '') ||
      !Number.isSafeInteger(Number(minimum)) || extra.length || !['digitalocean', 'example', 'openai'].includes(provider)) {
    throw new Refusal(sentence('Use a supported provider, a private key file, a prefix and a positive minimum length for the trial.',
      '试跑时请指定支持的提供商、私有密钥文件、前缀和正整数的最小长度。'))
  }
  const value = readKey(file, { prefix, min: Number(minimum) })
  if (provider === 'example') {
    console.log(checkFile(file))
    console.log(sentence('Example trial passed; no provider was contacted.', '示例试跑通过；没有连接任何提供商。'))
    return
  }
  if (provider === 'openai') {
    const official = new URL(providerRow('openai').trial.url)
    const base = process.env.KEY_SETUP_OPENAI_BASE_URL ?? official.origin
    if (base !== official.origin && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base)) {
      throw new Refusal(sentence('The OpenAI trial address must be the official API or a local test server. Remove the address override or use a loopback test server.',
        'OpenAI 试跑地址必须是官方 API 或本地测试服务器。请移除地址覆盖设置，或使用回环测试服务器。'))
    }
    let response
    try {
      response = await fetch(`${base}${official.pathname}${official.search}`, {
        method: 'GET', headers: { Authorization: `Bearer ${value}` },
        redirect: 'manual', signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new Refusal(sentence('The network could not reach OpenAI. Check the connection and try again.',
        '网络无法连接 OpenAI。请检查网络连接后重试。'))
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Refusal(sentence(`OpenAI returned HTTP ${response.status}. Check the key and its permission to list models, then try again.`,
        `OpenAI 返回 HTTP ${response.status}。请核对密钥和列出模型的权限，然后重试。`))
    }
    let data
    try { data = await response.json() } catch {
      throw new Refusal(sentence('OpenAI returned HTTP 200, but the model list could not be read. Try again.',
        'OpenAI 返回 HTTP 200，但无法读取模型列表。请重试。'))
    }
    if (!Array.isArray(data?.data)) throw new Refusal(sentence('OpenAI returned HTTP 200, but the model list was invalid. Try again.',
      'OpenAI 返回 HTTP 200，但模型列表无效。请重试。'))
    console.log(sentence(`OpenAI returned HTTP 200; ${data.data.length} models returned. The key was accepted.`,
      `OpenAI 返回 HTTP 200；返回 ${data.data.length} 个模型。密钥已被接受。`))
    return
  }
  // The only override is an IPv4 loopback HTTP server for isolated tests.
  const official = new URL(providerRow('digitalocean').trial.url)
  const base = process.env.KEY_SETUP_DO_BASE_URL ?? official.origin
  if (base !== official.origin && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base)) {
    throw new Refusal(sentence('The DigitalOcean trial address must be the official API or a local test server. Remove the address override or use a loopback test server.',
      'DigitalOcean 试跑地址必须是官方 API 或本地测试服务器。请移除地址覆盖设置，或使用回环测试服务器。'))
  }
  // 3glux5orTv2k; PFXqjfLKEsqi: connection failures and HTTP refusals need different repairs.
  let response
  try {
    response = await fetch(`${base}${official.pathname}${official.search}`, {
      method: 'GET', headers: { Authorization: `Bearer ${value}` },
      redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Refusal(sentence('The network could not reach DigitalOcean. Check the connection and try again.',
      '网络无法连接 DigitalOcean。请检查网络连接后重试。'))
  }
  // Do not print any provider response, even an error that reflects the header; never follow redirects.
  await response.body?.cancel()
  if (response.status === 401 || response.status === 403) throw new Refusal(sentence(
    `DigitalOcean returned HTTP ${response.status}. Check the token, its expiry and its scopes, then try again.`,
    `DigitalOcean 返回 HTTP ${response.status}。请核对令牌、到期日和权限，然后重试。`))
  if (response.status !== 200) throw new Refusal(sentence(
    `DigitalOcean returned HTTP ${response.status}. Check the provider's status and the trial address, then try again.`,
    `DigitalOcean 返回 HTTP ${response.status}。请检查提供商状态和试跑地址，然后重试。`))
  console.log(sentence('GET /v2/account passed; the token was only in the header and no provider data changed.',
    'GET /v2/account 通过；令牌只在请求头里，没有更改提供商的数据。'))
}

try { await main() } catch (error) {
  console.error(error instanceof Refusal ? error.message : accessRefusal().message)
  process.exitCode = 1
}
