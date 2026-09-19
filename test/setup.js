import { GlobalWindow } from 'happy-dom';
import 'fake-indexeddb/auto';

if (typeof globalThis.window === 'undefined') {
  const win = new GlobalWindow();
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.navigator = win.navigator;
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.customElements = win.customElements;
}

if (globalThis.window) {
  globalThis.window.indexedDB = globalThis.indexedDB;
  globalThis.window.IDBKeyRange = globalThis.IDBKeyRange;
  globalThis.window.IDBRequest = globalThis.IDBRequest;
  globalThis.window.IDBTransaction = globalThis.IDBTransaction;
  globalThis.window.IDBDatabase = globalThis.IDBDatabase;
}

if (typeof globalThis.__APP_VERSION__ === 'undefined') {
  globalThis.__APP_VERSION__ = '1.3.7';
}

if (typeof import.meta.env === 'undefined') {
  import.meta.env = {
    MOBILE: '',
    VITE_MOBILE: '',
    IMG_BASE: '',
    VITE_IMG_BASE: '',
    GIF_BASE: '',
    VITE_GIF_BASE: '',
    DEMO: '',
    VITE_DEMO: ''
  };
}
