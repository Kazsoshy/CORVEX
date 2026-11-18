# CORVEX quarantine manifest

**Date:** 2026-11-18  
**Branch:** `cleanup/2026-11-18`  
**Policy:** Nothing here was permanently deleted. Restore by moving paths back to their Original location.

## Rollback

1. `git checkout Bacaron` (or prior SHA) to abandon cleanup commits.
2. Or restore individual items from this folder to the paths listed below.
3. WIP from before cleanup is in git stash: `wip-before-cleanup-2026-11-18` (`git stash list`).

## Quarantined items

### `_archive/scripts/` (from `scripts/`)

One-off AST/refactor/pagination helpers no longer needed for day-to-day development.  
**Kept in `scripts/`:** `check_schema.mjs`, `check_suppliers.js`, `check_territories.js`.

| File | Why removed |
|---|---|
| `addPagination.js` | One-off pagination helper |
| `analyze_buttons.cjs` | One-off UI analysis |
| `analyze_duplicates.cjs` | One-off analysis |
| `append_styles.cjs` | One-off style patch |
| `astPaginate.cjs` | One-off AST pagination |
| `astPaginateSafe.cjs` | One-off AST pagination |
| `autoPaginate.js` | One-off pagination |
| `clean_filters.cjs` | One-off filter cleanup |
| `find2.cjs` | One-off find script |
| `find_missing.cjs` | One-off find script |
| `find_missing_onclick.cjs` | One-off find script |
| `fixFragment.cjs` | One-off JSX fix |
| `fixPaginationSyntax.cjs` | One-off syntax fix |
| `fixTDZ.cjs` | One-off TDZ fix |
| `fix_logout.cjs` | One-off logout fix |
| `refactor.cjs` | One-off refactor |
| `refactor_components.cjs` | One-off refactor |
| `refactor_filters.cjs` | One-off refactor |
| `refactor_inputs.cjs` | One-off refactor |
| `regexPaginate.cjs` | One-off pagination |
| `replace_export.cjs` | One-off export rewrite |
| `runBranchManager.cjs` | One-off runner |
| `safeFragment.cjs` | One-off JSX fix |
| `undoAll.cjs` | One-off undo |
| `undoFragment.cjs` | One-off undo |

### `_archive/backups/` (from `backups/`)

Older SA reset JSON dumps (different SHA256; superseded by newest keepers).

| File | Why removed |
|---|---|
| `sa-reset-backup-2026-11-02T15-17-55-870Z.json` | Older than kept newest |
| `sa-reset-backup-2026-11-02T15-19-04-467Z.json` | Older than kept newest |
| `sa-reset-backup-2026-11-02T15-19-39-925Z.json` | Older than kept newest |
| `sa-reset-backup-2026-11-02T15-20-09-999Z.json` | Older than kept newest |

**Kept in `backups/`:**  
`sa-reset-backup-2026-11-02T15-21-15-294Z.json`, `sa-reset-report-1793632875567.json`, `renato-cruz-santos-cleanup-2026-11-14T16-02-19-843Z.json`.

### `_archive/notes/`

| File | Original | Why removed |
|---|---|---|
| `note..txt` | `/note..txt` | Scratch OM merge notes; not project docs |

### `_archive/backend-python-stub/`

| Path | Original | Why removed |
|---|---|---|
| `python_stub/` | `backend/archive/python_stub/` | Unused Python stub leftover |
