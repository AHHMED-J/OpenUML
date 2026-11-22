/**
 * Small key-value store for the web build: IndexedDB in the browser (kept across visits, survives
 * a crash or a closed tab), or memory in tests. Values must be structured-cloneable (strings,
 * plain objects, file handles).
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
    keys: async () => [...data.keys()]
  }
}

/** A store in the IndexedDB database `name` (one object store, `kv`). */
export function indexedDbStore(name: string, factory: IDBFactory = indexedDB): KeyValueStore {
  let db: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise((resolve, reject) => {
      const request = factory.open(name, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('kv')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        db = null
        reject(request.error ?? new Error('IndexedDB is not available'))
      }
    }))
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction('kv', mode)
      const request = action(tx.objectStore('kv'))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error ?? request.error ?? new Error('IndexedDB request failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB request aborted'))
    })
  }
  return {
    get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
    set: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String)
  }
}
