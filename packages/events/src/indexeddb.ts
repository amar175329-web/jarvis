import type { Envelope } from './envelope.ts';
import type { OutboxStore } from './outbox.ts';

const STORE = 'events';
type OutboxRecord = { idempotency_key: string; event: Envelope };

/** Durable browser outbox. Android can implement the same OutboxStore contract with its local database. */
export function indexedDbOutbox(name = 'jarvis-event-outbox'): OutboxStore {
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction!;
      if (db.objectStoreNames.contains(STORE)) {
        // Preserve v1 queued items while changing to a monotonically increasing primary key.
        const oldStore = tx.objectStore(STORE);
        const oldRows = oldStore.indexNames.contains('queued_at') ? oldStore.index('queued_at').getAll() : oldStore.getAll();
        oldRows.onsuccess = () => {
          const rows = oldRows.result as Array<OutboxRecord | Envelope>;
          db.deleteObjectStore(STORE);
          const nextStore = db.createObjectStore(STORE, { autoIncrement: true });
          nextStore.createIndex('idempotency_key', 'idempotency_key', { unique: true });
          for (const old of rows) {
            const row = old as OutboxRecord;
            const event = row.event ?? old as Envelope;
            const key = row.idempotency_key ?? event.idempotency_key;
            if (key) nextStore.add({ idempotency_key: key, event } satisfies OutboxRecord);
          }
        };
        oldRows.onerror = () => tx.abort();
      } else {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex('idempotency_key', 'idempotency_key', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });

  // Resolve only after the transaction commits. A successful individual request is not
  // enough: the transaction may still abort, and callers must never drop an uncommitted event.
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, setResult: (value: T) => void, fail: (error: unknown) => void) => void,
  ): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let value: T | undefined;
        let hasValue = false;
        let settled = false;
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error instanceof Error ? error : new Error('IndexedDB request failed'));
          try { tx.abort(); } catch { /* transaction already finished */ }
        };
        const setResult = (next: T) => { value = next; hasValue = true; };
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          if (!hasValue) reject(new Error('IndexedDB transaction completed without a result'));
          else resolve(value as T);
        };
        tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'));
        try { work(tx.objectStore(STORE), setResult, fail); } catch (error) { fail(error); }
      });
    } finally { db.close(); }
  };

  return {
    async put(event: Envelope) {
      const key = event.idempotency_key;
      if (!key) throw new Error('idempotency_key is required');
      return run<'created' | 'duplicate'>('readwrite', (s, done, fail) => {
        const r = s.add({ idempotency_key: key, event } satisfies OutboxRecord);
        r.onsuccess = () => done('created');
        r.onerror = (e) => {
          if ((r.error as DOMException | null)?.name === 'ConstraintError') { e.preventDefault(); done('duplicate'); }
          else fail(r.error);
        };
      });
    },
    async list(limit) {
      return run<Envelope[]>('readonly', (s, done, fail) => {
        // Auto-increment primary key is enqueue order, including timestamp ties.
        const r = s.getAll();
        r.onsuccess = () => done((r.result as OutboxRecord[]).slice(0, limit).map((row) => row.event));
        r.onerror = () => fail(r.error);
      });
    },
    async remove(key) {
      await run<void>('readwrite', (s, done, fail) => {
        const lookup = s.index('idempotency_key').getKey(key);
        lookup.onsuccess = () => {
          if (lookup.result === undefined) { done(); return; }
          const deletion = s.delete(lookup.result);
          deletion.onsuccess = () => done();
          deletion.onerror = () => fail(deletion.error);
        };
        lookup.onerror = () => fail(lookup.error);
      });
    },
    async count() {
      return run<number>('readonly', (s, done, fail) => { const r = s.count(); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
    },
  };
}
