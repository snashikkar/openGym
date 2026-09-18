import { describe, it, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import Dexie from 'dexie';

describe('Bun Toolchain & Headless IDB Environment', () => {
  it('resolves dependencies into bun.lock', () => {
    expect(existsSync('bun.lock')).toBe(true);
  });

  it('preloads happy-dom with window, document, and localStorage', () => {
    expect(globalThis.window).toBeDefined();
    expect(globalThis.document).toBeDefined();
    expect(globalThis.localStorage).toBeDefined();

    localStorage.setItem('bun_toolchain_probe', 'active');
    expect(localStorage.getItem('bun_toolchain_probe')).toBe('active');
    localStorage.removeItem('bun_toolchain_probe');
  });

  it('preloads fake-indexeddb with working IDB factory and keys', async () => {
    expect(globalThis.indexedDB).toBeDefined();
    expect(globalThis.IDBKeyRange).toBeDefined();

    const db = new Dexie('test_probe_db');
    db.version(1).stores({ items: '++id, name' });
    await db.open();

    const id = await db.table('items').add({ name: 'bun-probe' });
    const item = await db.table('items').get(id);
    expect(item.name).toBe('bun-probe');

    await db.delete();
  });
});
