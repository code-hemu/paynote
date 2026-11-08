# Changelog

All notable changes to PayNote are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- Dead code and unused exports across the app, domain, database, and service layers.

## [0.1.0] - 2026-11-03

### Added

- Browser-only receipt and payment manager for small businesses, with separate Business and Individual workspaces.
- SQLite (WASM) data layer persisted as AES-256-GCM ciphertext in IndexedDB, with PBKDF2 PIN key derivation and an in-memory data key.
- Customer management with search, sorting, pagination, detail views, and delete protection for linked receipts.
- Property management with property types, search, sorting, pagination, and linked receipt summaries.
- Receipt engine with categories, category-specific fields, line items, discounts, paise-accurate totals, and amount in words.
- Receipt lifecycle statuses (draft, issued, paid, cancelled) with guarded transitions and collision-safe numbering.
- Receipt history with filters, search, pagination, CSV export, edit, duplicate, delete, and status changes.
- Draft autosave and crash recovery for the receipt form.
- Printable receipt and report layouts with print-only styling and browser print support.
- Dashboard and reports with date-range presets, category/customer/property/payment breakdowns, charts, and CSV export.
- Backup and restore with versioned JSON manifests, merge and replace modes, validation, and rollback.
- Receipt sharing through compact QR links and encrypted share links.
- Settings for business profiles, branding, signatures, receipt defaults, date/number formats, and themes.
- PIN setup, unlock, reset, and lock flows.
- Installable PWA with offline precaching, storage quota warnings, and global error recovery.
- Continuous verification through linting, typechecking, automated tests, and production build checks.
