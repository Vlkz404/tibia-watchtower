import lockfile from 'proper-lockfile';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export class InstanceError extends Error {}
export const LOCK_STALE_MS = 30000;
export async function acquireInstance({ dataDir, clientId, onCompromised = () => {}, hostLockDir }) {
  // Same user and host: prevent duplicate Application IDs across directories.
  // Shared volume: prevent a second writer from using the same data.
  const hostDir = hostLockDir || join(tmpdir(), `tibia-discord-${process.getuid?.() ?? 'user'}`);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(hostDir, { recursive: true, mode: 0o700 });
  const clientDir = join(hostDir, clientId);
  mkdirSync(clientDir, { recursive: true, mode: 0o700 });
  const releases = []; let valid = true; let released = false;
  const compromised = () => { if (valid) { valid = false; onCompromised(); } };
  const options = { stale: LOCK_STALE_MS, update: 10000, retries: 0, onCompromised: compromised };
  try {
    releases.push(await lockfile.lock(realpathSync(clientDir), { ...options, lockfilePath: join(realpathSync(clientDir), '.instance.lock') }));
    releases.push(await lockfile.lock(realpathSync(dataDir), { ...options, lockfilePath: join(realpathSync(dataDir), '.instance.lock') }));
  } catch (error) {
    valid = false;
    for (const release of releases.reverse()) await release().catch(() => {});
    throw new InstanceError(error.code === 'ELOCKED'
      ? 'An instance is already active for this bot or directory. After an abrupt shutdown, wait up to 30 seconds before starting again.'
      : 'Could not acquire the instance lock. Check write access to the volume and temporary directory.');
  }
  return {
    get valid() { return valid && !released; },
    async release() {
      if (released) return;
      released = true; valid = false;
      for (const release of releases.reverse()) await release().catch(() => {});
    },
  };
}
