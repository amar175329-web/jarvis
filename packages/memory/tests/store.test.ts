import { createInMemoryDb, InMemoryStore } from '../src/memory-store.ts';
import { runStoreContract } from '../src/testing/contract.ts';
runStoreContract('in-memory', async () => { const db = createInMemoryDb(); return { a: new InMemoryStore(db, 'aaaaaaaa-0000-4000-8000-000000000001'), b: new InMemoryStore(db, 'bbbbbbbb-0000-4000-8000-000000000002') }; });
