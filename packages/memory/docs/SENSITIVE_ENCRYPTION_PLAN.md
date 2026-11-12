# T2 sensitive-memory encryption plan

Status: PLAN ONLY — not implemented by migration 0033. Owner: S09 for memory field requirements; S19 owns the vault/key service and deployment secrets.

## Goal

T2 data (health, medicines, weight/workouts, money figures, family/relationship details and deep feelings) must remain private at rest. The browser, Android client, app bundle, Git repository, analytics and ordinary logs must never hold the server master key or decrypted T2 values beyond the specific authorized task.

## Ownership and keys

1. S19 provides a server-only key/vault interface. Store the root key in a managed server secret/KMS, never in source, client config, Android storage, prompts or Git.
2. Use envelope encryption: generate a random data-encryption key (DEK) per owner or security domain; wrap it with a versioned master key controlled by S19.
3. Encrypt T2 title/body and sensitive metadata with authenticated encryption (AES-256-GCM or S19-approved equivalent). Use a fresh nonce per encryption. Bind ciphertext with AAD containing owner ID, memory ID, tier and schema version so ciphertext cannot be moved across owners/rows without authentication failure.
4. Store ciphertext, nonce, authentication tag (or combined AEAD payload), wrapped DEK reference and key version. Do not store the plaintext title/body in parallel columns after the encrypted cutover.
5. Rotation should re-wrap DEKs when possible; data re-encryption is a controlled background migration with audit and rollback. Destroying a DEK must render its protected records unrecoverable.

## Search and retrieval

- T2 never gets embeddings or vector-index entries.
- Plaintext T2 tokens in the general GIN index are not acceptable for the encrypted design. Replace them with keyed HMAC token hashes under a separate server-only search key, or decrypt only the owner/purpose-filtered bounded candidate set in the server before ranking. Do not use a plain unsalted hash for predictable health/medicine/money words.
- `purpose` and `subject` filters must be applied before decrypting. Default search is T1-only. The app must never fetch a broad T2 set and filter in the client.
- Decryption happens inside a trusted server process after auth, owner check, S22 purpose gate, kill-switch check and rate limit. Return only the matching fields required for the task.

## Logging and events

- Never log plaintext, ciphertext payload, nonce, key material, query, medicine label, account balance or family details.
- Audit record may contain actor, owner ID, memory row ID, purpose code, timestamp and count. Restrict access and retention of audit records.
- Generic memory events stay metadata-only; T2 content never appears in event payloads.

## Migration sequence (S19 + S09)

1. Define and review the S19 vault API and threat model before changing storage.
2. Add encrypted columns and key-version metadata in a new migration owned by the agreed squad; do not rewrite 0030-0033 after acceptance.
3. On a test project, backfill T2 rows through a server-only job; verify AEAD authentication, owner binding, no plaintext fallback and no vector.
4. Switch reads/writes to ciphertext; verify T1 remains unchanged and T2 default search remains empty.
5. Remove plaintext T2 title/body/token copies only after verified encrypted reads, export, restore, delete and rollback tests.
6. Test key rotation, missing-key failure closed, KMS outage, owner isolation, restore from backup and secret scanning.

## Current reality

Migration 0033 adds tier controls, T2 purpose filtering, no-vector checks and a normal-only keyword index. It does NOT encrypt T2 fields. Until S19 ships the server key/vault contract and the migration above, do not claim “encrypted at rest”; keep T2 owner-scoped under RLS, out of ordinary recall/events/logs, and out of embeddings.
