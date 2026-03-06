# actib-manager

Internal Firebase Infrastructure Manager (Admin SDK) with a secondary WhatsApp template manager section.

## What this project is

This repository now provides an **internal Firebase Admin Studio** with two layers:

1. **Main focus:** Infrastructure control panel for RTDB + Firestore
   - Large-node preview and pagination
   - Operation queue for destructive operations
   - Dry-run + preview + backup + rollback workflow
2. **Secondary section:** WhatsApp template manager
   - List/create/default template generation
   - Template preview/send test flows

## Architecture

- **Frontend:** React app in `app/`
  - `/admin` route for infrastructure operations
  - Existing WhatsApp template pages remain available
- **Backend:** Firebase Functions in `functions/`
  - Existing WhatsApp endpoints in `functions/index.js`
  - Infra/admin endpoints in `functions/admin_api.js`
- **Storage model for operations**
  - `admin_ops` collection: queued/running/completed/failed operations
  - `admin_ops_backups` collection: rollback snapshots for destructive actions

## Security model

This tool is server-side only and uses Firebase Admin SDK.

- Every admin endpoint validates Firebase ID token (`Authorization: Bearer ...`)
- Every admin endpoint requires one of:
  - `x-actib-admin: 1` header (dev-compatible), or
  - admin/super-admin custom claims
- Admin endpoints bypass client rules because they run with Admin SDK permissions

## Implemented admin capabilities

### RTDB

- `admin_rtdb_preview` (GET)
  - Partial node preview (first N children)
  - `hasMore` warning flag for large branches
- `admin_rtdb_paginate` (GET)
  - Lazy pagination by key (`startAt` + `limit`)
- `admin_rtdb_search` (GET)
  - Regex pattern matching on keys
  - Returns matching nodes with previews
- `admin_rtdb_analyze_empty` (GET)
  - Find empty/null nodes
- `admin_rtdb_analyze_size` (GET)
  - Rank nodes by estimated size
  - Detect oversized branches
- `admin_rtdb_bulk_delete` (POST)
  - Dry-run support with preview
  - Optional key pattern filtering (regex)
  - Automatic backup before delete
  - Queue-based execution

### Firestore

- `admin_firestore_preview` (GET)
  - Collection preview (first N docs)
- `admin_firestore_paginate` (GET)
  - Pagination with `startAfter` cursor support
- `admin_firestore_search` (GET)
  - Regex pattern matching on document IDs
- `admin_firestore_analyze_empty` (GET)
  - Find documents with no fields
- `admin_firestore_bulk_delete` (POST)
  - Dry-run support with preview
  - Affected count + preview IDs
  - Optional `where` clause filtering
  - Automatic backup before delete
  - Queue-based execution

### Operations queue

- `admin_ops_create` (POST)
- `admin_ops_list` (GET)
- `admin_ops_status` (GET)
- `admin_ops_run` (POST)
- `admin_ops_run_next` (POST)
- `admin_ops_rollback` (POST)
  - Supports both RTDB and Firestore backups

## Safe destructive workflow (recommended)

1. Run dry-run preview (`admin_firestore_bulk_delete` with `dryRun: true`)
2. Queue operation (`admin_ops_create` with type `firestore_bulk_delete`)
3. Execute via queue (`admin_ops_run` or `admin_ops_run_next`)
4. If needed, rollback with `admin_ops_rollback` and `backupId`

## Frontend sections

- `/admin`
  - **Tree viewer** for RTDB/Firestore preview
    - Virtualized list rendering for large previews
    - Pagination support (load more) for both RTDB and Firestore
  - **Search panel**
    - Regex pattern search across keys (RTDB) or doc IDs (Firestore)
    - Results preview
  - **Cleanup analyzer**
    - Find empty nodes/docs
    - Analyze node sizes (RTDB)
    - Detect oversized branches
  - **Operations queue panel**
    - Dry-run bulk delete previews (RTDB + Firestore)
    - Queue operations with confirmation
    - Run/monitor queued operations
    - View operation logs
    - Rollback with backup IDs
  - **Embedded WhatsApp template manager section**

## Local setup

### Install dependencies

```bash
npm install
npm --prefix app install
npm --prefix functions install
```

### Run frontend

```bash
npm --prefix app start
```

### Run emulators (optional)

```bash
firebase emulators:start
```

## Validation commands

```bash
npm --prefix app run build
node --check functions/admin_api.js
node --check functions/index.js
```

## Deploy

```bash
firebase deploy --only functions,hosting
```

## Current limitations / next hardening steps

- Queue execution currently supports `firestore_bulk_delete` and `rtdb_bulk_delete` types only
- Search is key/ID-based only (no deep value search yet)
- Orphan detection and duplicate pattern analysis not yet implemented
- Growth analytics/time-series statistics are planned
- RTDB migration/restructure endpoints are planned (move nodes, rename keys)
- Background worker for long-running operations (currently synchronous in HTTP handlers)

---

This project is intended for restricted internal environments only.
# actib-manager
