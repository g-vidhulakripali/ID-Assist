import { describe, expect, it } from 'vitest';
import { memoryRegistryStorage, SessionRegistry } from '../../src/session/registry';
import type { TabEntry } from '../../src/types/session';

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  state: 'active',
  origin: 'https://example.com',
  formSignature: 'abc',
  updatedAt: 1,
  ...over,
});

describe('SessionRegistry', () => {
  it('stores entries per tab', async () => {
    const reg = new SessionRegistry(memoryRegistryStorage());
    expect(await reg.get(1)).toBeNull();
    await reg.set(1, entry());
    await reg.set(2, entry({ state: 'inactive', reason: 'declined' }));
    expect((await reg.get(1))?.state).toBe('active');
    expect((await reg.get(2))?.reason).toBe('declined');
  });

  it('clears a tab without touching others', async () => {
    const reg = new SessionRegistry(memoryRegistryStorage());
    await reg.set(1, entry());
    await reg.set(2, entry());
    await reg.clear(1);
    await reg.clear(99); // no-op
    expect(await reg.get(1)).toBeNull();
    expect(await reg.get(2)).not.toBeNull();
  });
});
