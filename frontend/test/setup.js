import { GlobalWindow } from 'happy-dom';
import 'fake-indexeddb/auto';
import { vi, setSystemTime } from 'bun:test';

const stubbedGlobals = new Map();

if (vi) {
  if (!vi.setSystemTime) vi.setSystemTime = setSystemTime;
  if (!vi.resetModules) vi.resetModules = () => {};
  if (!vi.hoisted) vi.hoisted = fn => fn();
  if (!vi.waitFor) {
    vi.waitFor = async (callback, { timeout = 1000, interval = 10 } = {}) => {
      const start = Date.now();
      let lastError;
      while (Date.now() - start < timeout) {
        try {
          return await callback();
        } catch (err) {
          lastError = err;
          await new Promise(r => setTimeout(r, interval));
        }
      }
      throw lastError || new Error('vi.waitFor timed out');
    };
  }
  if (!vi.advanceTimersByTimeAsync) {
    vi.advanceTimersByTimeAsync = async ms => {
      vi.advanceTimersByTime(ms);
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
  }
  if (!vi.stubGlobal) {
    vi.stubGlobal = (name, val) => {
      if (!stubbedGlobals.has(name)) {
        stubbedGlobals.set(name, globalThis[name]);
      }
      globalThis[name] = val;
    };
  }
  if (!vi.unstubAllGlobals) {
    vi.unstubAllGlobals = () => {
      for (const [name, val] of stubbedGlobals.entries()) {
        if (val === undefined) {
          delete globalThis[name];
        } else {
          globalThis[name] = val;
        }
      }
      stubbedGlobals.clear();
    };
  }
}

if (typeof globalThis.window === 'undefined') {
  const win = new GlobalWindow({ url: 'https://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.navigator = win.navigator;
  globalThis.location = win.location;
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.Storage = win.Storage || win.localStorage.constructor;
  for (const m of ['setItem', 'getItem', 'removeItem', 'clear', 'key']) {
    Object.defineProperty(win.localStorage, m, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function(...args) { return globalThis.Storage.prototype[m].apply(this, args); }
    });
    Object.defineProperty(win.sessionStorage, m, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function(...args) { return globalThis.Storage.prototype[m].apply(this, args); }
    });
  }
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.customElements = win.customElements;
  globalThis.Event = win.Event;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.PointerEvent = win.PointerEvent || win.MouseEvent;
  globalThis.UIEvent = win.UIEvent;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.FocusEvent = win.FocusEvent;
  globalThis.WheelEvent = win.WheelEvent;
  globalThis.InputEvent = win.InputEvent;
  globalThis.StorageEvent = win.StorageEvent;
  globalThis.requestAnimationFrame = win.requestAnimationFrame?.bind(win) || (cb => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame?.bind(win) || (id => clearTimeout(id));

  for (const key of Object.getOwnPropertyNames(win)) {
    if (key.startsWith('HTML') || key.startsWith('SVG') || key.endsWith('Element')) {
      if (typeof globalThis[key] === 'undefined') {
        globalThis[key] = win[key];
      }
    }
  }

  Object.defineProperty(win, 'PushManager', {
    get() { return globalThis.PushManager; },
    set(v) { globalThis.PushManager = v; },
    configurable: true
  });
  Object.defineProperty(win, 'Notification', {
    get() { return globalThis.Notification; },
    set(v) { globalThis.Notification = v; },
    configurable: true
  });
}

if (globalThis.window) {
  globalThis.window.indexedDB = globalThis.indexedDB;
  globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
  globalThis.window.IDBRequest = globalThis.IDBRequest;
  globalThis.window.IDBTransaction = globalThis.IDBTransaction;
  globalThis.window.IDBDatabase = globalThis.IDBDatabase;
}

if (typeof globalThis.__APP_VERSION__ === 'undefined') {
  globalThis.__APP_VERSION__ = '1.4.0';
}

if (typeof globalThis.Notification === 'undefined') {
  globalThis.Notification = {
    permission: 'default',
    requestPermission: async () => 'default'
  };
}
