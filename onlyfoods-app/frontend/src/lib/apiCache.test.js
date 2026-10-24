import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache, fetchCached, hasCache, prefetch, readCache, subscribe, writeCache } from './apiCache';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('apiCache', () => {
  beforeEach(() => clearApiCache());

  it('keeps the last result after the page that loaded it is gone', async () => {
    await fetchCached('stores', async () => [{ id: 1 }]);
    expect(readCache('stores')).toEqual([{ id: 1 }]);
  });

  it('shares one request between callers of the same key', async () => {
    const fetcher = vi.fn(async () => 'x');
    await Promise.all([fetchCached('k', fetcher), fetchCached('k', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await fetchCached('k', fetcher); // คำขอแรกจบแล้ว : รอบใหม่ยิงได้
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers only when the data really changed', () => {
    const fn = vi.fn();
    const off = subscribe('k', fn);
    writeCache('k', { a: 1 });
    writeCache('k', { a: 1 }); // polling ได้ข้อมูลเดิม : ไม่ต้อง render ใหม่
    writeCache('k', { a: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    writeCache('k', { a: 3 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears everything on logout / expired session events', async () => {
    // เทสต์รันบน node (ไม่มี window) : โหลดโมดูลใหม่พร้อม window จำลอง
    vi.resetModules();
    globalThis.window = new EventTarget();
    try {
      const m = await import('./apiCache');
      m.writeCache('k', 1);
      window.dispatchEvent(new Event('auth:logout'));
      expect(m.hasCache('k')).toBe(false);
      m.writeCache('k', 2);
      window.dispatchEvent(new Event('auth:expired'));
      expect(m.hasCache('k')).toBe(false);
    } finally {
      delete globalThis.window;
    }
  });

  it('drops a late response that started before the cache was cleared', async () => {
    const d = deferred();
    const p = fetchCached('k', () => d.promise);
    clearApiCache(); // ผู้ใช้ออกจากระบบระหว่างรอ
    d.resolve('ข้อมูลของคนก่อน');
    await p;
    expect(hasCache('k')).toBe(false);
  });

  it('prefetch skips fresh data and data already loading', async () => {
    const fetcher = vi.fn(async () => 'x');
    prefetch('k', fetcher);
    prefetch('k', fetcher); // กำลังโหลดอยู่
    await fetchCached('k', fetcher);
    prefetch('k', fetcher, 60000); // ยังใหม่อยู่
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a failed request keeps the previous data', async () => {
    writeCache('k', 'เดิม');
    await expect(fetchCached('k', async () => { throw new Error('เน็ตหลุด'); })).rejects.toThrow('เน็ตหลุด');
    expect(readCache('k')).toBe('เดิม');
  });
});
