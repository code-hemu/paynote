# PayNote Encryption TODO

## Completed

- [x] Add AES-256-GCM and PBKDF2 crypto helpers.
- [x] Add encrypted IndexedDB storage for the SQLite database blob.
- [x] Rework PIN storage to wrap a random database key and preserve it on PIN changes.
- [x] Support upgrading existing v1 PIN records.
- [x] Run SQLite in memory and persist encrypted exports after mutations.
- [x] Migrate legacy OPFS database after the encrypted save succeeds.
- [x] Add forgotten-PIN erase flow for PIN, encrypted database, and legacy storage.
- [x] Clear receipt drafts on lock and erase.
- [x] Download decrypted backups after PIN verification; legacy plaintext imports remain supported.
- [x] Close the encrypted database when the app locks.
- [x] Update README and storage labels.
- [x] Add PIN, backup crypto, client, and markup tests.

## Remaining

- [x] Re-run lint after final edits.
- [x] Re-run the full test suite after final edits.
- [x] Run the production build after final edits.
- [x] Manually test in a browser:
  - [x] First-run PIN setup and encrypted database creation.
  - [x] Reload, unlock, and verify existing records remain accessible.
  - [x] Lock and unlock without losing data.
  - [x] Forgot-PIN erase removes PIN and IndexedDB data.
  - [x] PIN-protected backup export and restore.
  - [x] Confirm `sqlite3_deserialize` works in the bundled browser worker.
  - [ ] PIN reset preserves existing data.
  - [ ] Wrong backup PIN and damaged backup handling in the browser.
  - [ ] Legacy OPFS database migration.
- [x] Review orphaned encrypted-data setup guard and error messages.
- [x] Review backup PIN confirmation and restore preview behavior.
- [x] Fix database key propagation when an existing client is reused after erase.

## Verification

- `npm run lint`: passed.
- `npm test -- --reporter=dot`: 204 passed, 0 failed.
- `npm run build`: passed.
- Headless Chrome smoke test: PIN setup, encrypted IndexedDB persistence, reload + decrypt/deserialize, lock/unlock, erase, PIN-protected backup export/restore.
- Direct SQLite WASM check: `sqlite3_deserialize` returned `SQLITE_OK`.

## Notes

- A 4-digit PIN is a convenience lock, not strong offline protection.
- The encrypted database uses IndexedDB `paynote-secure`, store `database`, key `main`.
- The database key exists in memory only while PayNote is unlocked.
- Receipt drafts are not encrypted; they are cleared on lock/erase.
