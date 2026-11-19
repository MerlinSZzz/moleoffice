// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Private keys stay in private files, never in chat or records.
import * as fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { theSystemFor, thisSystem } from '../systems/the-system.mjs'

export class Refusal extends Error {}
const refuse = (sentence) => { throw new Refusal(sentence) }
const name = (file) => JSON.stringify(file)
export const sentence = (en, zh, lang = process.env.KEY_SETUP_LANG) => lang === 'zh' ? zh : en
const shellName = (file) => /^[^'\x00-\x1f\x7f]*$/.test(file) ? `'${file}'` : "$'" + file.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  .replace(/[\x00-\x1f\x7f]/g, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`) + "'"
const mode = (stat) => stat.mode & 0o7777
const ours = (stat) => stat.uid === process.getuid()
export const accessRefusal = (lang) => new Refusal(sentence(
  'The private key file could not be accessed safely. Check the path and permissions as its owner, then try again.',
  '无法安全访问私有密钥文件。请以所有者身份检查路径和权限，然后重试。', lang))
/** The refusal when a key is already saved, a class of its own so the Settings page can offer to replace it. */
export class KeyExists extends Refusal {}
export const replacementRefusal = (lang) => new KeyExists(sentence('A key is already saved here. Confirm replacement before saving another.',
  '此处已保存密钥。请确认替换后再保存。', lang))

function statOrMissing(file) {
  try { return fs.lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

// An ancestor link is allowed only when its target is a safe owned folder; the key folder itself cannot be a link.
function directoryChain(directory, create, lang) {
  const absolute = path.resolve(directory)
  let current = path.parse(absolute).root
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    let stat = statOrMissing(current)
    if (!stat && create) {
      fs.mkdirSync(current, { mode: 0o700 })
      fs.chmodSync(current, 0o700)
      stat = fs.lstatSync(current)
    }
    if (!stat) refuse(sentence(`Folder ${name(current)} does not exist. Create it as its owner, then try again.`,
      `文件夹 ${name(current)} 不存在。请以所有者身份创建它，然后重试。`, lang))
    if (stat.isSymbolicLink()) {
      if (current === absolute) refuse(sentence(`Path ${name(current)} is a symbolic link. Use a real private folder at this path.`,
        `路径 ${name(current)} 是符号链接。请在此路径使用真实的私有文件夹。`, lang))
      try { stat = fs.statSync(current) } catch (error) {
        if (error.code !== 'ENOENT') throw error
        refuse(sentence(`Ancestor link ${name(current)} has no target. Repair the link to an existing safe folder, then try again.`,
          `上级链接 ${name(current)} 没有目标。请把链接修复为现有的安全文件夹，然后重试。`, lang))
      }
      if (!stat.isDirectory()) refuse(sentence(`Ancestor link ${name(current)} does not resolve to a folder. Point it to a safe folder, then try again.`,
        `上级链接 ${name(current)} 没有指向文件夹。请把它指向安全文件夹，然后重试。`, lang))
      if (!ours(stat) && stat.uid !== 0) refuse(sentence(`Ancestor link ${name(current)} resolves to a folder owned by someone else. Have its owner repair it, or use a folder owned by you or root.`,
        `上级链接 ${name(current)} 指向他人所有的文件夹。请让所有者修复它，或使用你或 root 所有的文件夹。`, lang))
      if (mode(stat) & 0o022) refuse(sentence(`Ancestor link ${name(current)} resolves to a folder other users can write. Have its owner run chmod go-w ${shellName(current)}, then try again.`,
        `上级链接 ${name(current)} 指向其他用户可写的文件夹。请让所有者运行 chmod go-w ${shellName(current)}，然后重试。`, lang))
    }
    if (!stat.isDirectory()) refuse(sentence(`Path ${name(current)} is not a folder. Use a real private folder at this path.`,
      `路径 ${name(current)} 不是文件夹。请在此路径使用真实的私有文件夹。`, lang))
  }
  return fs.lstatSync(absolute)
}

export function ensureFolder(directory, create = true, lang) {
  const stat = directoryChain(directory, create, lang)
  if (!ours(stat)) refuse(sentence(`Folder ${name(directory)} is not owned by you. Have its owner repair it, or choose your own private folder.`,
    `文件夹 ${name(directory)} 不属于你。请让所有者修复它，或选择你自己的私有文件夹。`, lang))
  if (mode(stat) !== 0o700) refuse(sentence(`Folder ${name(directory)} must have mode 700. Run chmod 700 ${shellName(directory)}, then try again.`,
    `文件夹 ${name(directory)} 的权限必须是 700。请运行 chmod 700 ${shellName(directory)}，然后重试。`, lang))
  return sentence(`Folder ${name(directory)} is owned by you and has mode 700.`,
    `文件夹 ${name(directory)} 属于你，权限是 700。`, lang)
}

function privateStat(file, lang) {
  ensureFolder(path.dirname(file), false, lang)
  const stat = statOrMissing(file)
  if (!stat) refuse(sentence(`File ${name(file)} does not exist. Return to the save step to save a key.`,
    `文件 ${name(file)} 不存在。请回到保存步骤，保存密钥。`, lang))
  if (stat.isSymbolicLink()) refuse(sentence(`Path ${name(file)} is a symbolic link. Use a real private key file at this path.`,
    `路径 ${name(file)} 是符号链接。请在此路径使用真实的私有密钥文件。`, lang))
  if (!stat.isFile()) refuse(sentence(`Path ${name(file)} is not a regular file. Use a real private key file at this path.`,
    `路径 ${name(file)} 不是普通文件。请在此路径使用真实的私有密钥文件。`, lang))
  if (!ours(stat)) refuse(sentence(`File ${name(file)} is not owned by you. Have its owner repair it, or save a key in your own private file.`,
    `文件 ${name(file)} 不属于你。请让所有者修复它，或把密钥保存到你自己的私有文件。`, lang))
  if (mode(stat) !== 0o600) refuse(sentence(`File ${name(file)} must have mode 600. Run chmod 600 ${shellName(file)}, then try again.`,
    `文件 ${name(file)} 的权限必须是 600。请运行 chmod 600 ${shellName(file)}，然后重试。`, lang))
  return stat
}

export function checkFile(file, lang) {
  const stat = privateStat(file, lang)
  return sentence(`File ${name(file)} has mode 600 and contains ${stat.size} bytes.`,
    `文件 ${name(file)} 的权限是 600，共 ${stat.size} 字节。`, lang)
}

export function validateValue(value, prefix = '', min = 1, lang) {
  if (!value.length) refuse(sentence('The key is empty. Paste the key itself at the save step.', '密钥为空。请在保存步骤粘贴密钥本身。', lang))
  if (/[\s"'“”‘’]/u.test(value)) refuse(sentence('The key contains whitespace or quotes. Paste only the key without spaces or quotes.',
    '密钥含有空白或引号。请只粘贴密钥，不带空格或引号。', lang))
  // Angle brackets are not part of a pasted key.
  if (/[<>]/u.test(value)) refuse(sentence('The key contains angle brackets. Paste only the key without < or >.',
    '密钥含有尖括号。请只粘贴密钥，不带 < 或 >。', lang))
  // Keys are printable ASCII; control or invisible characters would fail a request before it is sent.
  if (/[^\x21-\x7e]/u.test(value)) refuse(sentence('The key holds a character a key never has, such as a control or invisible one. Paste only the key itself.',
    '密钥含有密钥里不会有的字符，例如控制字符或看不见的字符。请只粘贴密钥本身。', lang))
  if (!value.startsWith(prefix)) refuse(sentence('The key does not start with the expected prefix. Copy the correct provider key and return to the save step.',
    '密钥不是以预期前缀开头。请复制正确的提供商密钥，再回到保存步骤。', lang))
  if (value.length < min) refuse(sentence('The key is too short. Copy the complete key and return to the save step.',
    '密钥太短。请复制完整密钥，再回到保存步骤。', lang))
}

export function readPrivateKey(file, prefix, min, lang) {
  const before = privateStat(file, lang)
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const now = fs.fstatSync(fd)
    if (now.ino !== before.ino || now.dev !== before.dev || !now.isFile() ||
        !ours(now) || mode(now) !== 0o600) refuse(sentence(`File ${name(file)} changed during the check. Check it as its owner, then try again.`,
          `文件 ${name(file)} 在检查期间发生了变化。请以所有者身份检查它，然后重试。`, lang))
    const value = fs.readFileSync(fd, 'utf8')
    validateValue(value, prefix, min, lang)
    return value
  } finally { fs.closeSync(fd) }
}

function writeKey(file, value, prefix, min, lang, replace = true) {
  validateValue(value, prefix, min, lang)
  ensureFolder(path.dirname(file), true, lang)
  if (statOrMissing(file)) privateStat(file, lang)
  const temporary = path.join(path.dirname(file), `.key-${randomUUID()}.part`)
  let fd, created = false
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
    created = true
    fs.fchmodSync(fd, 0o600) // Set the exact mode before writing even one byte.
    fs.writeFileSync(fd, value, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    if (replace) fs.renameSync(temporary, file)
    else { fs.linkSync(temporary, file); fs.unlinkSync(temporary) }
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    if (created && statOrMissing(temporary)) fs.unlinkSync(temporary)
  }
  return sentence(`Saved key to ${name(file)} with mode 600.`, `密钥已保存到 ${name(file)}，权限是 600。`, lang)
}

/**
 * A key file is made private by its mode, which this writer sets and checks. On a system that makes a file private by
 * an access list instead, the writer refuses, because it cannot yet check that list. The system layer says which way
 * this system uses; a platform may be named to ask about another one.
 */
export function assertPrivateKeyStorageAvailable(platform, lang) {
  const system = platform === undefined ? thisSystem() : theSystemFor(platform)
  if (system.aFileIsMadePrivate.by !== 'its-mode') refuse(sentence('Adding a key is not yet available on Windows because private file permissions cannot be verified.',
    'Windows 上暂不能添加密钥，因为无法验证私有文件权限。', lang))
}

/** @param {string} file @param {string} value @param {{prefix?: string, min?: number, replace?: boolean, lang?: string}} options */
export function writePrivateKey(file, value, { prefix = '', min = 1, replace = false, lang } = {}) {
  try {
    assertPrivateKeyStorageAvailable(undefined, lang)
    validateValue(value, prefix, min, lang)
    ensureFolder(path.dirname(file), true, lang)
    if (statOrMissing(file)) {
      privateStat(file, lang)
      if (!replace) throw replacementRefusal(lang)
    }
    writeKey(file, value, prefix, min, lang, replace)
  } catch (error) {
    // Do not disclose system diagnostics, a stack, or the key in an error.
    throw error instanceof Refusal ? error : accessRefusal(lang)
  }
}

export function cleanParts(directory, lang) {
  ensureFolder(directory, false, lang)
  let removed = 0
  for (const entry of fs.readdirSync(directory)) {
    // Remove only private UUID-named temporary regular files made by the checker.
    if (!/^\.key-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.part$/.test(entry)) continue
    const file = path.join(directory, entry), stat = fs.lstatSync(file)
    if (!stat.isFile() || !ours(stat)) continue
    fs.unlinkSync(file)
    removed++
  }
  return removed ? sentence(`Removed ${removed} stale key temporary file(s) from ${name(directory)}.`,
    `已从 ${name(directory)} 清理 ${removed} 个遗留的密钥临时文件。`, lang) : ''
}

export function main(args) {
  const [command, file, ...options] = args
  if (!file || !['folder', 'write', 'file', 'clean'].includes(command)) {
    refuse(sentence('Use folder DIR, clean DIR, file FILE, or write FILE with optional --prefix and --min; --lang en or zh selects the language.',
      '请用 folder DIR、clean DIR、file FILE，或 write FILE 加可选的 --prefix 和 --min；--lang en 或 zh 选择语言。'))
  }
  let prefix = '', min = 1, lang = process.env.KEY_SETUP_LANG
  const seen = new Set()
  for (let i = 0; i < options.length; i += 2) {
    const flag = options[i], value = options[i + 1]
    if (value === undefined || seen.has(flag) ||
        (flag !== '--lang' && (command !== 'write' || !['--prefix', '--min'].includes(flag)))) {
      refuse(sentence('The checker options are invalid. Use --lang en or zh, and --prefix and --min only with write.',
        '检查器选项无效。请用 --lang en 或 zh；--prefix 和 --min 只能用于 write。', lang))
    }
    seen.add(flag)
    if (flag === '--lang') {
      if (!['en', 'zh'].includes(value)) refuse(sentence('The language is invalid. Use --lang en or --lang zh.',
        '语言无效。请用 --lang en 或 --lang zh。', lang))
      lang = value
    } else if (flag === '--prefix') prefix = value
    else {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        refuse(sentence('The minimum length must be a positive whole number. Use --min N with N greater than zero.',
          '最小长度必须是正整数。请用 --min N，N 必须大于零。', lang))
      }
      min = Number(value)
    }
  }
  if (command === 'folder') return ensureFolder(file, true, lang)
  if (command === 'file') return checkFile(file, lang)
  if (command === 'clean') return cleanParts(file, lang)
  // Remove only the line terminator produced by the shell's builtin printf.
  const value = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '')
  return writeKey(file, value, prefix, min, lang)
}

