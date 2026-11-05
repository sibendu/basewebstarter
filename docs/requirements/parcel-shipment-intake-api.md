# Parcel shipment intake API — draft specification

**Status:** Draft; implementation is blocked by the decisions in the final section.
**Scope:** Receive a normalized parcel shipment status payload derived from an X12 214 message. The first message creates a shipment and related records; subsequent messages update it and add new events. SAP integration, delivery lines and shipment lines are out of scope. This API receives JSON; parsing X12 is outside its scope.

The target is the draft [Descartes PostgreSQL schema](../designs/descartes-v2-postgresql.sql); its [notes](../designs/descartes-v2-postgresql-notes.md) identify unconfirmed types, keys and constraints. This specification does not establish that the draft schema matches the deployed database.

## API and payload

Proposed endpoint: `POST /api/parcel-shipments` with `Content-Type: application/json`.

```json
{
  "tracking_number": "533906486120",
  "carrier_scac": "FDEG",
  "current_status_code": "AF",
  "estimated_delivery_at": "2026-09-23T00:00:00",
  "delivered_at": null,
  "events": [
    {
      "sequence": 1,
      "code": "AG",
      "kind": "ESTIMATE",
      "event_at": "2026-09-23T00:00:00"
    },
    {
      "sequence": 2,
      "code": "AF",
      "kind": "ACTUAL",
      "event_at": "2026-09-22T08:04:00",
      "location": { "city": "Grove City", "state": "OH", "country": "US" }
    }
  ]
}
```

## Field mapping

These are **proposed mappings**, not verified source-system rules. Do not implement ambiguous mappings until the decisions below are resolved. Column names are case-sensitive in the draft PostgreSQL schema.

| JSON field | Candidate target | Notes |
| --- | --- | --- |
| `tracking_number` | `shipment."MAWB"`, `leg."CarrierReference"`, and/or `package."TrackingNumber"` | All are candidates; select authoritative target(s) and identity scope. Keep as text, including leading zeros. |
| `carrier_scac` | `leg."CarrierCode"` | Confirm this column accepts SCAC. |
| `current_status_code` | `shipment."ShipmentStatusCode"` | Confirm whether carrier code is stored directly or translated. |
| `estimated_delivery_at` | `shipment."DeliveryEstimated"` and/or `leg."DeliveryEstimated"` | Confirm which level(s) to update. |
| `delivered_at` | `shipment."DeliveryActual"` and/or `leg."DeliveryActual"` | Confirm target(s) and null/update semantics. |
| `events[].code` | `legevent."EventCode"` | Confirm source codes are stored unchanged. |
| `events[].kind`, `events[].event_at` | `legevent."Estimated"` for `ESTIMATE`; `legevent."Actual"` for `ACTUAL` | Proposed interpretation; confirm. No separate kind column is shown. |
| `events[].sequence` | No matching column shown | Requires an agreed storage and identity strategy. |
| `events[].location.city`, `.state`, `.country` | No matching event columns shown | Requires an agreed storage strategy; do not substitute leg origin or destination. |

Relationships: `leg."ShipmentID"` references `shipment."ID"`; `legevent."LegID"` references `leg."ID"`. If a package is created, `package."ShipmentID"` and `package."LegID"` reference the same shipment and its leg. The diagram suggests `legevent."EventSourceCode" = 'C'` for carrier 214 events; confirm before setting it. No source field supplies primary keys in the sample.

## Processing and integrity

1. Validate the complete request before writing. Identify the shipment and applicable leg using approved business keys. On the first message, create the shipment and required related records; on subsequent messages, update the approved summary fields and insert new events.
2. Process the shipment, leg, any required package and events in a single database transaction. Reject and roll back the whole request on validation or persistence failure.
3. Make retries and concurrent requests idempotent: replaying the same message must not create duplicate shipments, legs, packages or events. Use database-enforced uniqueness and an agreed message/event identity; the draft schema currently provides neither. Do not assume event sequence is globally unique or that a tracking number is unique across carriers.
4. Preserve event sequence and location once their storage is agreed. Do not silently discard supplied values. Define how corrections, out-of-order messages, absent fields and explicit nulls affect existing records before implementation.
5. Do not create delivery or shipment-line records for this parcel-only POC. Do not invoke SAP. Create other related records only when their requirements are confirmed.

## Validation and responses

At minimum, reject malformed JSON, invalid field types and invalid timestamps, and reject duplicate event identifiers within a request once their identity is defined. Treat tracking numbers as strings. Allowed values, required/optional fields, unknown fields, length limits, timestamp timezone and precision, and maximum request/event counts require agreement.

Proposed response contract: `201 Created` for a newly created shipment; `200 OK` for an update or successful replay; `400 Bad Request` for invalid input; `409 Conflict` for a confirmed identity or update conflict; and `500`/`503` for server or database failure. Success returns the shipment ID and outcome (`created`, `updated`, or `replayed`); errors return a stable code, actionable message and correlation ID, without database internals or sensitive payload data. Confirm authentication and authorization before deployment. Logs must not contain credentials, tokens, full payloads or personal data.

## Acceptance checks

- A valid first message creates the approved shipment, leg, package if required, and event records with correct links and field values.
- A subsequent message updates the agreed summary values and adds only new events; an identical retry, including concurrent retries, creates no duplicates.
- Invalid input or a database failure leaves no partial writes; errors are actionable and do not expose sensitive data.
- Tests cover multiple events, estimate versus actual timestamps, missing versus null values, event location and sequence preservation, conflicting or out-of-order updates, and duplicate event identifiers.
- The API does not create delivery or shipment lines or call SAP in this POC.

## Decisions required before coding

1. Confirm the deployed schema, permissions, ID generation, required columns, and whether schema changes or additional storage are permitted for event sequence and location.
2. Confirm shipment, leg, package, message and event identity keys, their uniqueness scopes, and how to select a leg when more than one exists. Supply a stable message identifier or another reliable retry strategy if needed.
3. Resolve each candidate mapping above, including tracking-number destinations, SCAC, status translation, timestamp targets and `EventSourceCode`; specify which related records the first message creates.
4. Define validation, timestamp timezone, request limits, authentication, and update rules for absent/null fields, corrections and out-of-order messages. Specify how long retry identity is retained.

Until these decisions are approved, this document is a design input, not an executable implementation contract.
