# Descartes v2 PostgreSQL DDL draft

Restored on 2026-11-05 from the draft created in this conversation.
Source: `er_descartes_v2.png`. Script:
[descartes-v2-postgresql.sql](descartes-v2-postgresql.sql).

The diagram supplies nine tables, column names, primary keys and nine
foreign-key relationships. It does not supply a complete physical database
definition. Verify the transcription against source metadata before production
use. This is a Descartes shipment/export schema, separate from the InvoiceFlow
application's review, rule-evaluation and posting model.

## Draft assumptions

| Area | Draft choice | Confirmation needed |
| --- | --- | --- |
| Namespace | `descartes` schema in the selected database | Target database/schema and mapping of source catalog `prod_l1` |
| Naming | Lowercase table names; quoted case-sensitive source column names | Source naming versus snake_case |
| Primary/foreign IDs | Loader-supplied `bigint`; no generated IDs | Source types, ranges and global versus domain-scoped uniqueness |
| Other identifiers | `text`, including line/package numbers and references | Actual types and maximum lengths; preserve leading zeros |
| Text | Unbounded `text` | Length and allowed-value restrictions |
| Amounts and measurements | Exact `numeric` without precision/scale restrictions | Precision, scale, units, signs and bounds |
| Counts | `bigint`; `LegNumber` is `integer` | Types, integral guarantees and ranges |
| Dates | `InvoiceDate` and `ADLS_LOADED_DATE` are `date` | Whether a time component exists |
| Other times | `timestamp without time zone`; no automatic defaults | Source formats, precision and time zones; use `timestamptz` for confirmed instants |
| Nullability | Only primary keys are mandatory | Required fields and mandatory parent relationships |
| Deleted | Nullable `smallint` with a 0/1 check | Null policy, source type and default |
| Relationships | Diagram FKs; default NO ACTION; no cascades | Orphans, load order, domain scoping and update/delete policies |
| Uniqueness | Primary keys only | Business keys and retry/upsert identities |
| Indexes | One index per FK | Query patterns and data volumes |

Example codes in the diagram are not treated as exhaustive enums.
`ExceptionCodesMappedList` retains the source pipe-delimited text format.

The independent `package.ShipmentID` and `package.LegID` FKs do not enforce that
the leg belongs to the same shipment. Confirm this invariant before adding a
composite FK and corresponding unique constraint on `leg`.

To finalize, supply source DDL or metadata for the nine tables, including types,
nullability, defaults and key definitions. Also confirm timestamp semantics,
business duplicate rules, and whether the target is a raw staging replica or a
curated relational model. Raw exports may contain duplicates/orphans that these
constraints reject.

## Execution

After reviewing assumptions, run using normal PostgreSQL connection configuration:

```powershell
psql --dbname=YOUR_DATABASE --set=ON_ERROR_STOP=1 --file=docs/designs/descartes-v2-postgresql.sql
```

This fresh-install script creates nine tables within one transaction. Existing
same-named tables cause an error and rollback. It contains no table drops or
replacement operations. Keep credentials outside the script.

## Validation

Static checks verify nine table declarations, nine primary keys, nine foreign
keys with matching types, nine supporting indexes, unique column names, and
parent-first creation order. The column counts match the previous draft.
No live PostgreSQL execution has been performed. Static checks do not establish
PostgreSQL execution or source-data compatibility.
