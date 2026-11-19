// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { REPO_ROOT, settings } from '../../config/settings.mjs'
import { theEnvironmentTheRestartHandsTheService } from './the-environment-the-restart-hands-the-service.ts'
import { thisOfficeRestartsWith } from './office-restart.ts'
import { theServiceManagerOfThisServer, supervisorOf, Gaps } from './runtime.ts'
import { registerResource, osProbe, readFirst } from './resources.ts'
import { PanelError } from './panel-error.ts'
import { named } from './named-timers.ts'

export async function installRestartManager(session: string | null, workspaceId: string): Promise<void> {
  // The process above this server is read first, without holding the thread (Windows).
  const supervisor = await readFirst(() => [{ pid: process.ppid, alsoItsStarterIfEnded: false }], () => supervisorOf(process.ppid, new Gaps()))
  if (process.connected && process.send !== undefined && supervisor.kind === 'the dev supervisor' && supervisor.watching === true) {
    thisOfficeRestartsWith({ mode: 'checkout', prepare: async () => {
      if (!process.connected) throw new PanelError('The checkout supervisor is no longer connected. No restart was requested.', 409, undefined, undefined, undefined, { code: 'officeRestartNoManager', values: { reason: 'The restart manager is unavailable. No restart was requested.' } })
      return () => { process.send?.({ officeControl: 'restart' }) }
    } })
  } else if (theServiceManagerOfThisServer() !== null && session !== null && osProbe().startTheRestartCommand !== undefined) {
    thisOfficeRestartsWith({ mode: 'installed', prepare: async () => {
      // Keep the boot environment separate from saved choices. The replacement reads its own database;
      // flattening choices into its environment would make a removed choice return after a restart.
      //
      // AND THE VALUES .env HAD AT THE LAST START ARE LEFT OUT, so the replacement reads the file as
      // it is now: a changed value is applied and a removed name is gone. A name the shell set is kept.
      const probe = osProbe()
      if (!probe.startTheRestartCommand) throw new Error('This operating-system probe has no service restart command door.')
      const child = probe.startTheRestartCommand({
        cwd: REPO_ROOT,
        logPath: settings().serviceLogPath,
        env: theEnvironmentTheRestartHandsTheService(),
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(named('the wait for the restart helper', (line) => console.warn(line), () => reject(new Error('The service restart command did not become ready within ten seconds.'))), 10_000)
          child.once('error', (error) => { clearTimeout(timer); reject(error) })
          child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`The service restart command exited with code ${String(code)} before it was ready.`)) })
          child.once('message', (message) => { clearTimeout(timer); if (message === 'ready') resolve(); else reject(new Error('The restart command sent an unknown answer.')) })
        })
        registerResource({ workspaceId, sessionRecordId: session, type: 'process', key: String(child.pid), detail: 'the office restart command', startedByTheProduct: true, actor: { type: 'agent', id: 'mole-office/the-api-server' } })
      } catch (error) {
        if (child.connected) child.disconnect()
        const reason = error instanceof Error ? error.message : String(error)
        throw new PanelError(reason, 503, undefined, undefined, undefined, { code: 'officeRestartNoManager', values: { reason } })
      }
      return () => { child.send('the answer was sent'); child.unref() }
    } })
  } else thisOfficeRestartsWith(null)
}
