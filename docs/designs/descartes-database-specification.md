# Descartes Database Specification

**Status:** Draft | **Database:** PostgreSQL | **Schema:** `descartes`

## Purpose and references

Store Descartes shipment data, transport legs, tracking events, shipment contents,
documents, and invoice charges.

- [Original ER diagram — er_descartes_v2.png](../../er_descartes_v2.png)
- [PostgreSQL DDL](descartes-v2-postgresql.sql) — complete column definitions.
- [DDL assumptions](descartes-v2-postgresql-notes.md) — details requiring confirmation.

The original ER image was supplied in the chat but is currently missing from the
repository. Restore it as `er_descartes_v2.png` in the repository root to activate
the image link above.

## Tables

Every table has a source-supplied `ID` primary key of type `bigint`.

| Table | Purpose | Foreign keys |
| --- | --- | --- |
| `shipment` | Shipment references, route, status, dates, totals and costs | None |
| `leg` | Transport segment, carrier, milestones and costs | `ShipmentID` → `shipment.ID` |
| `legevent` | Planned and actual tracking events and exceptions | `LegID` → `leg.ID` |
| `container` | Container number, type, seal and verified gross weight | `ShipmentID` → `shipment.ID` |
| `deliveryline` | Delivery and sales-order line references and quantities | `ShipmentID` → `shipment.ID` |
| `purchaseinvoiceamount` | Invoice reference, date, currency, charge amount and cost type | `ShipmentID` → `shipment.ID` |
| `package` | Package tracking number, dimensions and weight | `ShipmentID` → `shipment.ID`; `LegID` → `leg.ID` |
| `document` | Document type, filename and attachment dates | `ShipmentID` → `shipment.ID` |
| `shipmentline` | Item code, description, quantity, weight, volume and value | `ShipmentID` → `shipment.ID` |

Each relationship permits multiple child rows per parent. Foreign keys are
nullable in the draft; a supplied parent ID must exist. Each FK has an index.

## Data and integrity rules

- Preserve source column names using quoted, case-sensitive identifiers.
- Use `text` for codes and references, and exact `numeric` for financial and
  measurement values. Precision, scale and text limits remain unspecified.
- Use `timestamp without time zone` for event/audit times; `InvoiceDate` and
  `ADLS_LOADED_DATE` use `date`. Time-zone semantics require confirmation.
- Only primary keys are mandatory. IDs and timestamps have no generated defaults.
- `leg.Deleted` and `legevent.Deleted` accept `0`, `1`, or null.
- Parent updates/deletes use PostgreSQL's default `NO ACTION`; no cascades apply.
- Business-key uniqueness and duplicate-ingestion rules are not defined.
- Package FKs do not enforce that the referenced leg belongs to the same shipment.

## Deployment and open decisions

The DDL creates nine tables and nine FK indexes in one transaction. Use a fresh
target; existing tables cause failure. It has passed structural checks but has
not been executed against PostgreSQL.

Before finalizing, confirm source data types, required fields, decimal precision,
timestamp semantics, ID/domain uniqueness, business keys, and package/leg
consistency. Invoice review, rule evaluation, and SAP posting remain outside
this schema's scope.
