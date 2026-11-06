# PayNote

**Simple Receipts. Organized Payments.**

PayNote is a browser-based receipt and payment manager for small businesses. It runs entirely in your browser — no server, no account, no cloud. Records are stored locally in SQLite (WASM), encrypted with AES-256-GCM and kept in IndexedDB, and the app works offline as an installable PWA.

## Features

- **Receipts** — create, edit, duplicate, print, and track receipts with line items, discounts, tax, and amounts in words (Indian numbering). Categories include rent, deposit, maintenance, utilities, purchase, sale, service, salary, commission, loan, donation, and other, each with its own fields.
- **Customers & properties** — manage records, link them to receipts, and view totals and history.
- **Dashboard & reports** — totals, recent activity, payment-method and category breakdowns, date-range filters, daily/monthly/yearly views, and CSV export.
- **Printing** — A4 print layout with print-only styles, business details, logo, signature, and grayscale-safe styling.
- **Backup & restore** — passphrase-encrypted JSON export/import with merge or replace modes, validation, rollback, and receipt CSV export. Legacy plaintext backups remain importable.
- **Security** — the SQLite database is encrypted at rest with AES-256-GCM. A 4-digit PIN unlocks the encryption key through PBKDF2-SHA256, and changing the PIN rewraps the existing key without re-encrypting the database. Local-only storage and no application data logging.
- **Personalization** — business or individual profiles, logo/profile photo, drawn signature, receipt prefix/currency/tax settings, date and number formats, and light/dark/system themes.
- **Sharing** — shareable receipt links with QR codes.
- **PWA** — installable, offline app shell with a service worker and precached assets.
- **Resilience** — single-tab database locking, draft autosave/recovery, low-storage warnings, and global error recovery UI.

## Tech Stack

- TypeScript (no framework — plain DOM components)
- [SQLite WASM](https://sqlite.org/wasm) running in memory, with the database persisted as AES-GCM ciphertext in IndexedDB
- Web Crypto API for PBKDF2 key derivation and AES-256-GCM
- [qrcode](https://www.npmjs.com/package/qrcode) for receipt QR codes
- [Guchho](https://www.npmjs.com/package/guchho) for dev server, bundling, linting, and serving
- [@guchho/test](https://www.npmjs.com/package/@guchho/test) for the test runner

## Requirements

- Node.js 22+
- A modern browser with Web Crypto, Web Workers, IndexedDB, and Web Locks support (recent Chromium, Firefox, or Safari). OPFS is only used once to migrate databases created by older PayNote versions.

## Getting Started

```bash
npm install
npm run dev
```

The dev server runs at `http://127.0.0.1:5173`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server with live rebuilds |
| `npm run build` | Typecheck, clean, and build to `dist` |
| `npm run preview` | Serve the production build at `http://127.0.0.1:4173` |
| `npm test` | Run the test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint application and Node scripts |
| `npm run typecheck` | Run TypeScript project checks |
| `npm run clean` | Remove build artifacts |

## Project Structure

```
src/
  app/        UI controllers and pages (receipts, customers, reports, backup, settings…)
  db/         SQLite client, worker, migrations, repositories, and validation
  domain/     Pure domain logic (money, receipts, reports, backup, words, print)
  services/   Data access and browser services (database, storage, PIN, QR, sharing)
  utils/      Formatting and CSV helpers
  test/       Test setup and fake DOM
scripts/      Dev, build, and clean scripts
docs/         Completion report and release notes
index.html    Single-page application shell
sw.js         Service worker for offline support
```

## Data & Privacy

- All data stays on your device in an encrypted SQLite database inside IndexedDB. Nothing is sent to a server.
- The database is encrypted with a random 256-bit data key. Your PIN derives a separate key-encryption key that wraps the data key; the data key exists in memory only while the app is unlocked.
- A forgotten PIN means the encrypted database cannot be recovered.
- Two separate workspaces are available: **Business** and **Individual**. They keep independent records in the same encrypted database.
- Clearing browser data or site storage will delete your records. **Export a backup regularly** from the Backup & Restore page.
- Backups are encrypted with a passphrase you choose. Keep both the backup file and its passphrase safe; a lost passphrase cannot be recovered.
- Receipt drafts are kept in local storage for crash recovery and are cleared whenever you lock the app. They are not stored inside the encrypted database.
- A 4-digit PIN has only 10,000 possible values, so it is a convenience lock, not strong protection against a determined offline attacker who copies the encrypted database.

## Deployment

The app is a static site and can be hosted anywhere that serves static files.

```bash
npm run build
```

Upload the contents of `dist/` to your host. The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that lints, tests, builds, and deploys to GitHub Pages on pushes to `main`.

Notes:

- `.webmanifest`, `sw.js`, and `robots.txt` are copied into the build.
- The build injects hashed JS/CSS, the SQLite worker, and the WASM binary into the service-worker precache list.
- Serve over HTTPS (or `localhost`) for Web Crypto and service worker support.

## Testing

```bash
npm test
```

The suite covers domain logic, SQLite repositories and migrations, PIN key wrapping, encrypted backups, UI controllers, backup/restore, formatting, and CSV handling.

## License

See [LICENSE](./LICENSE).
