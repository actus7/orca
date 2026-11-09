import type {
  EnvironmentHandle,
  EnvironmentProviderDriver,
  EnvironmentReady,
  EnvironmentStatus
} from './environment-provider-driver'
import { EnvironmentProviderError } from './environment-provider-driver'
import { runEnvironmentProviderDriverContract } from './environment-provider-driver-contract.test-support'

// Smallest driver that honours the contract, so the kit itself stays runnable without a real provider.
function makeInMemoryDriver(): {
  driver: EnvironmentProviderDriver
  live: Map<string, EnvironmentStatus>
} {
  const live = new Map<string, EnvironmentStatus>()
  let nextId = 1
  const ready = (handle: EnvironmentHandle): EnvironmentReady => ({
    handle,
    result: {
      schemaVersion: 1,
      connection: { type: 'orca-server', pairingCode: 'pairing', projectRoot: '/workspace/repo' }
    },
    session: { startedAt: 0, deadlineAt: null }
  })
  const requireLive = (handle: EnvironmentHandle): void => {
    if (!live.has(handle.environmentId)) {
      throw new EnvironmentProviderError('not_found', 'Environment is gone.')
    }
  }
  const driver: EnvironmentProviderDriver = {
    id: 'in-memory',
    capabilities: {
      memoryPause: false,
      maxSessionMs: null,
      fsPersistOnStop: true,
      idleStopMs: null
    },
    async create(_spec, ctx) {
      if (ctx?.signal?.aborted) {
        throw new EnvironmentProviderError('aborted', 'Cancelled.')
      }
      ctx?.onProgress?.({ phase: 'provisioning' })
      const environmentId = `env-${nextId++}`
      live.set(environmentId, 'running')
      return ready({ driverId: 'in-memory', environmentId, driverState: {} })
    },
    async resume(handle) {
      requireLive(handle)
      live.set(handle.environmentId, 'running')
      return ready(handle)
    },
    async suspend(handle) {
      requireLive(handle)
      live.set(handle.environmentId, 'suspended')
      return { status: 'suspended', session: null }
    },
    async destroy(handle) {
      live.delete(handle.environmentId)
    },
    async status(handle) {
      return { status: live.get(handle.environmentId) ?? 'destroyed', session: null }
    }
  }
  return { driver, live }
}

runEnvironmentProviderDriverContract('in-memory reference driver', async () => {
  const { driver, live } = makeInMemoryDriver()
  return { driver, liveEnvironmentIds: async () => [...live.keys()] }
})
