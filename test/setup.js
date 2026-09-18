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
