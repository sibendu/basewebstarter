-- DRAFT: transcribed from er_descartes_v2.png, 2026-10-27.
-- Restored 2026-11-05. Read descartes-v2-postgresql-notes.md before use.
-- Types and optionality are inferred, not supplied by the diagram.
-- Run in the intended PostgreSQL database; no database is created here.
-- Source catalog prod_l1 is not mapped to an additional PostgreSQL schema.
-- Source IDs are retained: no identity/sequence/default ID generation.
-- All non-PK columns are nullable pending confirmation, including FKs.
-- Text has no inferred length limit; numeric has no inferred precision/scale.
-- Timestamps preserve source wall-clock values without assuming a time zone.
-- No cascading deletes, business UNIQUE rules, or automatic timestamps.
-- Fresh installation only: existing tables cause an error and rollback.

BEGIN;

CREATE SCHEMA IF NOT EXISTS descartes;

CREATE TABLE descartes.shipment (
    "ID" bigint PRIMARY KEY,
    "DomainCode" text,
    "BookerCode" text,
    "BookerName1" text,
    "FlowType" text,
    "ConfirmationStatus" text,
    "ShipmentStatusCode" text,
    "ShipmentStatusDescription" text,
    "MAWB" text,
    "HAWB" text,
    "BillOfLading" text,
    "ContainerNumber" text,
    "BookerReference" text,
    "ExternalReference" text,
    "SalesOrderNumber" text,
    "DeliveryNumber" text,
    "PurchaseOrderNumber" text,
    "InternalReference" text,
    "ShipFromName1" text,
    "ShipFromCity" text,
    "ShipFromCountryCode" text,
    "ShipToName1" text,
    "ShipToCity" text,
    "ShipToCountryCode" text,
    "TransportModeCode" text,
    "TransportModeDescription" text,
    "ModalityDescription" text,
    "PickupPlanned" timestamp without time zone,
    "PickupActual" timestamp without time zone,
    "DeliveryPlanned" timestamp without time zone,
    "DeliveryEstimated" timestamp without time zone,
    "DeliveryActual" timestamp without time zone,
    "ConfirmedDeliveryDate" timestamp without time zone,
    "LatestExceptionCode" text,
    "LatestExceptionDescription" text,
    "LatestExceptionBlame" text,
    "TotalWeight" numeric,
    "ColliCount" bigint,
    "GoodsValue" numeric,
    "DeliveryTermsCode" text,
    "FreightCosts" numeric,
    "AdditionalCosts" numeric,
    "ReportingCurrency" text,
    "LegCount" bigint,
    "CreatorLoginName" text,
    "System" text,
    "ServiceLevel" text,
    "Business" text,
    "VesselName" text,
    "PortOfLoading" text,
    "PortOfDischarge" text,
    "FlightNumber" text,
    "CreateDate" timestamp without time zone,
    "ModifyDate" timestamp without time zone,
    "SyncDate" timestamp without time zone,
    "src_commit_time" timestamp without time zone,
    "ADLS_LOADED_DATE" date,
    "ShipmentSyncDate" timestamp without time zone
);

CREATE TABLE descartes.leg (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "LegNumber" integer,
    "DomainCode" text,
    "CarrierCode" text,
    "CarrierName1" text,
    "CarrierGroupName" text,
    "CarrierReference" text,
    "TransportModeCode" text,
    "TransportModeDescription" text,
    "ModalityDescription" text,
    "ShipFromCity" text,
    "ShipFromCountryCode" text,
    "ShipToCity" text,
    "ShipToCountryCode" text,
    "PickupActual" timestamp without time zone,
    "PickupGateArrivalActual" timestamp without time zone,
    "PickupGateDepartureActual" timestamp without time zone,
    "TakeOverActual" timestamp without time zone,
    "ReleaseActual" timestamp without time zone,
    "DeliveryPlanned" timestamp without time zone,
    "DeliveryEstimated" timestamp without time zone,
    "DeliveryActual" timestamp without time zone,
    "DeliveryGateArrivalActual" timestamp without time zone,
    "LatestExceptionCode" text,
    "ExceptionCodesMappedList" text,
    "FreightCosts" numeric,
    "AdditionalCosts" numeric,
    "ChargeableWeight" numeric,
    "ReportingCurrency" text,
    "MacroPointURL" text,
    "TransportOrientation" text,
    "BidBookingStatus" text,
    "Deleted" smallint CHECK ("Deleted" IN (0, 1)),
    "CreateDate" timestamp without time zone,
    "ModifyDate" timestamp without time zone,
    "src_commit_time" timestamp without time zone,
    CONSTRAINT leg_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

CREATE TABLE descartes.legevent (
    "ID" bigint PRIMARY KEY,
    "LegID" bigint,
    "DomainCode" text,
    "EventCode" text,
    "EventTypeDescription" text,
    "EventTypeAltDescription" text,
    "EventSourceCode" text,
    "EventSourceDescription" text,
    "ModalityDescription" text,
    "Planned" timestamp without time zone,
    "Estimated" timestamp without time zone,
    "Actual" timestamp without time zone,
    "Reported" timestamp without time zone,
    "ReportedByLoginName" text,
    "Remarks" text,
    "ExceptionCode" text,
    "ExceptionDescription" text,
    "ExceptionCodeMapped" text,
    "ExceptionBlame" text,
    "Deleted" smallint CHECK ("Deleted" IN (0, 1)),
    "CreateDate" timestamp without time zone,
    "ModifyDate" timestamp without time zone,
    "src_commit_time" timestamp without time zone,
    CONSTRAINT legevent_leg_fk FOREIGN KEY ("LegID")
        REFERENCES descartes.leg ("ID")
);

CREATE TABLE descartes.container (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "ContainerNumber" text,
    "ContainerType" text,
    "SealNumber" text,
    "VGMWeight" numeric,
    "CreateDate" timestamp without time zone,
    CONSTRAINT container_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

CREATE TABLE descartes.deliveryline (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "DeliveryLineNumber" text,
    "SalesOrderNumber" text,
    "SalesOrderLineNumber" text,
    "DeliveryNumber" text,
    "ArticleCode" text,
    "Quantity" numeric,
    "QuantityUnit" text,
    "CreateDate" timestamp without time zone,
    CONSTRAINT deliveryline_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

CREATE TABLE descartes.purchaseinvoiceamount (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "Amount" numeric,
    "CurrencyCode" text,
    "InvoiceNumber" text,
    "InvoiceDate" date,
    "CostType" text,
    "CreateDate" timestamp without time zone,
    "ModifyDate" timestamp without time zone,
    CONSTRAINT purchaseinvoiceamount_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

CREATE TABLE descartes.package (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "LegID" bigint,
    "PackageNumber" text,
    "TrackingNumber" text,
    "Weight" numeric,
    "Length" numeric,
    "Width" numeric,
    "Height" numeric,
    "CreateDate" timestamp without time zone,
    CONSTRAINT package_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID"),
    CONSTRAINT package_leg_fk FOREIGN KEY ("LegID")
        REFERENCES descartes.leg ("ID")
);

CREATE TABLE descartes.document (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "DocumentType" text,
    "FileName" text,
    "AttachDate" timestamp without time zone,
    "CreateDate" timestamp without time zone,
    CONSTRAINT document_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

CREATE TABLE descartes.shipmentline (
    "ID" bigint PRIMARY KEY,
    "ShipmentID" bigint,
    "LineNumber" text,
    "ArticleCode" text,
    "Description" text,
    "Quantity" numeric,
    "QuantityUnit" text,
    "Weight" numeric,
    "Volume" numeric,
    "GoodsValue" numeric,
    "HarmonisedCode" text,
    "CreateDate" timestamp without time zone,
    CONSTRAINT shipmentline_shipment_fk FOREIGN KEY ("ShipmentID")
        REFERENCES descartes.shipment ("ID")
);

-- Supporting indexes are inferred additions, not specified in the ER diagram.
CREATE INDEX leg_shipment_idx ON descartes.leg ("ShipmentID");
CREATE INDEX legevent_leg_idx ON descartes.legevent ("LegID");
CREATE INDEX container_shipment_idx ON descartes.container ("ShipmentID");
CREATE INDEX deliveryline_shipment_idx ON descartes.deliveryline ("ShipmentID");
CREATE INDEX purchaseinvoiceamount_shipment_idx
    ON descartes.purchaseinvoiceamount ("ShipmentID");
CREATE INDEX package_shipment_idx ON descartes.package ("ShipmentID");
CREATE INDEX package_leg_idx ON descartes.package ("LegID");
CREATE INDEX document_shipment_idx ON descartes.document ("ShipmentID");
CREATE INDEX shipmentline_shipment_idx ON descartes.shipmentline ("ShipmentID");

COMMENT ON SCHEMA descartes IS
    'Draft Descartes source model from er_descartes_v2.png; inferred types and optionality require confirmation.';

COMMIT;
