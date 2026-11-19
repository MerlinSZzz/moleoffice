// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read-only identities for the reviewed launcher and its prepared source. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envFileValues, findEnvFile, theStableCheckoutNamedIn } from '../../src/config/settings.mjs'
import { requireReadOnlyGitConfig } from '../read-only-git-config.mjs'
import { requireStorageTheUpgradeAccepts } from '../independent-storage.mjs'
import { BOOTSTRAP_LAYOUT_WORDS as words } from './stable-bootstrap-words.mjs'
import { bootstrapFail as fail, bootstrapGit as git, bootstrapGitEnvironment } from './stable-bootstrap-support.mjs'

export function verifyBootstrapLauncher(c) {
  const controller = dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))))
  requireReadOnlyGitConfig(controller)
  if (git(controller, ['rev-parse', '--show-toplevel']) !== controller || git(controller, ['status', '--porcelain=v1', '--untracked-files=all'])) fail('The shipped launcher controller must be a clean tracked checkout, not dirty.')
  for (const root of [controller, c.developmentRepository]) {
    const path = join(root, 'tools/serve-dev.mjs')
    if (!lstatSync(path).isFile() || realpathSync(path) !== path) fail('The reviewed launcher must be one ordinary tracked file.')
  }
  git(controller, ['ls-files', '--error-unmatch', '--', 'tools/serve-dev.mjs'])
  const launcherBlob = git(controller, ['rev-parse', 'HEAD:tools/serve-dev.mjs'])
  if (git(c.developmentRepository, ['rev-parse', `${c.targetCommit}:tools/serve-dev.mjs`]) !== launcherBlob) fail('The target launcher differs from the exact reviewed shipped launcher; review is required before preparation.')
  return { controller, launcherBlob }
}

export function bootstrapOrigin(root) {
  if (!git(root, ['remote']).split('\n').includes('origin')) fail(words.originMissing)
  const origin = git(root, ['remote', 'get-url', 'origin'])
  if (!origin) fail(words.originMissing)
  return origin
}

export function verifyBootstrapStableSource(c) {
  requireReadOnlyGitConfig(c.stableCheckout)
  if (git(c.stableCheckout, ['rev-parse', '--show-toplevel']) !== c.stableCheckout || git(c.stableCheckout, ['status', '--porcelain=v1', '--untracked-files=all'])) fail('Prepared stable source must be clean, not dirty.')
  requireStorageTheUpgradeAccepts(c.developmentRepository, c.stableCheckout, git)
  if (git(c.stableCheckout, ['symbolic-ref', '--quiet', 'HEAD']) !== 'refs/heads/stable' || git(c.stableCheckout, ['rev-parse', 'HEAD']) !== c.targetCommit || git(c.stableCheckout, ['rev-parse', 'HEAD^{tree}']) !== c.targetTree || git(c.stableCheckout, ['rev-parse', `refs/tags/${c.candidateTag}^{commit}`]) !== c.targetCommit) fail(words.stableSourceChanged)
  if (git(c.developmentRepository, ['tag', '--list', c.candidateTag])) fail(words.developmentTagged)
  if (bootstrapOrigin(c.stableCheckout) !== bootstrapOrigin(c.developmentRepository)) fail(words.originChanged)
}

/** Check the real file; run the target loader only after pairing or after its rollback. */
export function verifyBootstrapSettingsSource(c, { prepared = false, paired = false, expectRefusal = false } = {}) {
  const path = join(c.developmentRepository, '.env'), info = lstatSync(path)
  if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid()) fail('The main .env settings must be one existing ordinary file owned by this user.')
  const original = findEnvFile(c.developmentRepository)
  if (!original.found || original.path !== path) fail('Development settings must resolve to its one existing main .env.')
  const values = envFileValues(path)
  const named = theStableCheckoutNamedIn(path)
  if (!paired && Object.hasOwn(values, 'MOLE_OFFICE_STABLE_CHECKOUT')) fail(words.settingsPaired)
  if (paired && named !== realpathSync(c.stableCheckout)) fail(words.settingsPairMissing)
  const fileCheck = { found: true, path }
  let resolution, moduleResolution, refusal
  if (prepared) {
    try { lstatSync(join(c.stableCheckout, '.env')); fail('A stable-local .env settings candidate is forbidden, including a link to main.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (prepared && (paired || expectRefusal)) {
    const proof = spawnSync(process.execPath, ['--input-type=module', '--eval', "try{const{ENV_FILE,DATA_ROOT,THE_DEVELOPMENT_CHECKOUT}=await import('./src/config/settings.mjs');process.stdout.write(JSON.stringify({ENV_FILE,DATA_ROOT,THE_DEVELOPMENT_CHECKOUT}))}catch(error){process.stdout.write(JSON.stringify({refusal:{code:error.code}}));process.exitCode=1}"], {
      cwd: c.stableCheckout, env: { ...bootstrapGitEnvironment(), MOLE_OFFICE_DEVELOPMENT_CHECKOUT: c.developmentRepository }, encoding: 'utf8', timeout: 15000, maxBuffer: 65536,
    })
    if (proof.error || proof.stderr) fail(words.settingsProofFailed)
    let loaded
    try { loaded = JSON.parse(proof.stdout) } catch { fail(words.settingsProofFailed) }
    if (expectRefusal) {
      if (proof.status === 0 && loaded.THE_DEVELOPMENT_CHECKOUT === c.developmentRepository) fail(words.settingsRefusalFailed)
      if (proof.status !== 1 || loaded.refusal?.code !== 'DEVELOPMENT_CHECKOUT_INVALID') fail(words.settingsProofFailed)
      refusal = { code: loaded.refusal.code }
    } else {
      if (proof.status !== 0) fail(words.settingsProofFailed)
      let dataRoot
      try { dataRoot = realpathSync(loaded.DATA_ROOT) } catch { fail(words.settingsProofFailed) }
      if (loaded.ENV_FILE !== path || dataRoot !== c.developmentRepository) fail(words.settingsProofChanged)
      // Keep both the canonical directory and the exact exports printed by the loader.
      moduleResolution = { ENV_FILE: loaded.ENV_FILE, DATA_ROOT: loaded.DATA_ROOT }
      resolution = { found: true, path: loaded.ENV_FILE, dataRoot }
    }
  }
  const after = lstatSync(path)
  const identity = stat => ({ dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs })
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (JSON.stringify(identity(info)) !== JSON.stringify(identity(after)) || JSON.stringify(identity(info)) !== JSON.stringify(identity(lstatSync(path)))) fail(words.settingsChanged)
  return { fileCheck, resolution, moduleResolution, refusal, identity: { ...identity(after), sha256 } }
}
