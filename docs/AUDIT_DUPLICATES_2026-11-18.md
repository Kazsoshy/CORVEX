# CORVEX read-only duplicate / orphan audit

**Generated:** 2026-11-18T07:58:19.288Z
**Mode:** read-only (no merges performed)
**Matching criteria:** exact phone digits; exact lowercased portal_email; exact id_number; fuzzy normalized full name (token overlap ≥ max(2, min token count)).
**Master rule (suggestion only):** Active status preferred, then highest outstanding_balance, then lowest customer_id.

## Summary
- Customers scanned: **28**

## Exact phone duplicates
- Duplicate groups: **1** (exact)

| Group key | Count | Suggested master | Other IDs | Why master |
|---|---:|---|---|---|
| `639170000000` | 10 | 153 (C-153-2026) | 144, 145, 146, 147, 148, 149, 150, 151, 152 | status=Active; balance=52100.00; lowest-id tie-break |

## Exact portal_email duplicates
- Duplicate groups: **0** (exact)

_None found._

## Exact id_number duplicates
- Duplicate groups: **0** (exact)

_None found._

## Normalized name duplicates (fuzzy)
- Duplicate groups: **1** (normalized)

| Group key | Count | Suggested master | Other IDs | Why master |
|---|---:|---|---|---|
| `e2e owner` | 4 | 159 (C-159-2026) | 155, 156, 157 | status=Active; balance=2499.00; lowest-id tie-break |

## Orphan / integrity spot-checks

| Check | Count |
|---|---:|
| Customers with missing branch FK | 0 |
| Sales invoices with missing customer | 0 |
| Collection payments with missing customer | 0 |
| Customers with missing territory FK | 0 |

## Decision required

No merges were performed. Review suggested masters above and approve which groups to merge before any write operations.

**Totals:** phone=1, email=0, id_number=0, name=1
