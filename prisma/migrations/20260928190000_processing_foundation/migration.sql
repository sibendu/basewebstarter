-- Processing foundation contracts for Second sprint iteration 1.
CREATE TYPE "ImportStatus" AS ENUM ('ACCEPTED', 'PROCESSING', 'IMPORTED', 'FAILED', 'REJECTED');
CREATE TYPE "OutputType" AS ENUM ('SAP', 'DATALAKE');
CREATE TYPE "OutputStatus" AS ENUM ('PENDING', 'GENERATED', 'ERROR', 'NOT_REQUIRED');
CREATE TYPE "AuditAction" AS ENUM ('AUTHENTICATION', 'IMPORT', 'STATE_TRANSITION', 'REVIEW_DECISION', 'DELETE_INVOICE', 'OUTPUT');

CREATE TABLE "local_user" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "password_hash_metadata" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "local_user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "local_user_email_key" ON "local_user"("email");

ALTER TABLE "invoice" ADD COLUMN "correlation_id" TEXT;
ALTER TABLE "invoice" ADD COLUMN "derived_domain" TEXT;
ALTER TABLE "invoice" ADD COLUMN "derived_invoice_payer" TEXT;
ALTER TABLE "invoice" ADD COLUMN "derived_carrier" TEXT;
ALTER TABLE "invoice" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "invoice" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "invoice" ADD COLUMN "deletion_reason" TEXT;

ALTER TABLE "invoice_line" ADD COLUMN "tmid_lookup_status" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_lookup_http_status" INTEGER;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_lookup_response_ms" INTEGER;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_lookup_category" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_lookup_message" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_response_json" JSONB;
ALTER TABLE "invoice_line" ADD COLUMN "tmid_response_schema_version" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "resolved_domain" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "resolved_invoice_payer" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "resolved_carrier" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "prebill_number_format" TEXT;
ALTER TABLE "invoice_line" ADD COLUMN "cached_freight_payer" TEXT;

ALTER TABLE "rule_evaluation" ADD COLUMN "rule_version" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "rule_evaluation" ADD COLUMN "configuration_snapshot" JSONB;
ALTER TABLE "rule_evaluation" ADD COLUMN "compared_fields" JSONB;

CREATE TABLE "import_attempt" (
  "id" TEXT NOT NULL,
  "import_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "file_fingerprint" TEXT NOT NULL,
  "original_file_name" TEXT NOT NULL,
  "stored_file_name" TEXT,
  "received_path" TEXT,
  "archive_path" TEXT,
  "status" "ImportStatus" NOT NULL DEFAULT 'ACCEPTED',
  "correlation_id" TEXT NOT NULL,
  "error_category" TEXT,
  "message" TEXT,
  "invoice_id" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_attempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_attempt_import_id_key" ON "import_attempt"("import_id");
CREATE UNIQUE INDEX "import_attempt_idempotency_key_key" ON "import_attempt"("idempotency_key");
CREATE INDEX "import_attempt_status_idx" ON "import_attempt"("status");
ALTER TABLE "import_attempt" ADD CONSTRAINT "import_attempt_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "audit_event" (
  "id" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "actor_email" TEXT,
  "user_id" TEXT,
  "invoice_id" TEXT,
  "import_id" TEXT,
  "correlation_id" TEXT,
  "safe_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_event_invoice_id_action_idx" ON "audit_event"("invoice_id", "action");
CREATE INDEX "audit_event_correlation_id_idx" ON "audit_event"("correlation_id");
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "local_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "route_configuration" (
  "id" TEXT NOT NULL,
  "parcel_account_number" TEXT,
  "company_code" TEXT,
  "domain" TEXT NOT NULL,
  "invoice_payer" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "prebill_number_format" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_configuration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "route_configuration_parcel_account_number_company_code_active_idx" ON "route_configuration"("parcel_account_number", "company_code", "active");

CREATE TABLE "cost_validation_configuration" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT,
  "route_domain" TEXT,
  "cost_tolerance_percent" DECIMAL(8,3) NOT NULL,
  "cost_field_mapping" JSONB,
  "currency_field_mapping" JSONB,
  "version" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_validation_configuration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cost_validation_configuration_vendor_id_route_domain_active_idx" ON "cost_validation_configuration"("vendor_id", "route_domain", "active");

CREATE TABLE "output_record" (
  "id" TEXT NOT NULL,
  "output_type" "OutputType" NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "invoice_line_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "adapter_status" "OutputStatus" NOT NULL DEFAULT 'PENDING',
  "generated_reference" TEXT,
  "output_file_name" TEXT,
  "shipment_id" TEXT,
  "line_status" "LineStatus" NOT NULL,
  "approved_pre_tax_cost" DECIMAL(14,2),
  "currency" TEXT,
  "safe_error_category" TEXT,
  "safe_error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "generated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "output_record_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "output_record_approved_line_check" CHECK ("line_status" IN ('APPROVED', 'APPROVED_MANUAL'))
);
CREATE UNIQUE INDEX "output_record_output_type_invoice_line_id_key" ON "output_record"("output_type", "invoice_line_id");
CREATE UNIQUE INDEX "output_record_idempotency_key_key" ON "output_record"("idempotency_key");
CREATE INDEX "output_record_invoice_id_output_type_idx" ON "output_record"("invoice_id", "output_type");
ALTER TABLE "output_record" ADD CONSTRAINT "output_record_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "output_record" ADD CONSTRAINT "output_record_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE FUNCTION "reject_invoice_deletion_after_output"() RETURNS trigger AS $$
BEGIN
  IF NEW."deleted_at" IS NOT NULL AND OLD."deleted_at" IS NULL AND EXISTS (
    SELECT 1 FROM "output_record" WHERE "invoice_id" = NEW."id" AND "adapter_status" = 'GENERATED'
  ) THEN
    RAISE EXCEPTION 'Invoice with generated output cannot be deleted.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoice_output_deletion_guard"
BEFORE UPDATE OF "deleted_at" ON "invoice"
FOR EACH ROW EXECUTE FUNCTION "reject_invoice_deletion_after_output"();
INSERT INTO "cost_validation_configuration" ("id", "cost_tolerance_percent", "version") VALUES ('cost-default-v1', 5.000, 'cost-default-v1') ON CONFLICT DO NOTHING;