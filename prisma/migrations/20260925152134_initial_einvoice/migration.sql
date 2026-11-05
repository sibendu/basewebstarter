-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('APPROVED', 'MANUAL_REVIEW', 'REVIEW_COMPLETED', 'SAP_POSTING_ERROR');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('APPROVED', 'MANUAL_REVIEW', 'APPROVED_MANUAL', 'REJECTED_MANUAL');

-- CreateEnum
CREATE TYPE "PostingTriggerMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('PENDING', 'GENERATED', 'ERROR', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "vendor_number" TEXT NOT NULL,
    "invoice_issuer" TEXT,
    "name" TEXT,
    "default_weight_unit" TEXT NOT NULL DEFAULT 'KG',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "prebill_number" TEXT NOT NULL,
    "invoice_payer" TEXT,
    "invoice_issuer" TEXT,
    "invoice_period" TEXT,
    "po_number" TEXT,
    "source_creation_date" TIMESTAMP(3),
    "invoice_address" TEXT,
    "source_invoice_status" TEXT,
    "source_file_name" TEXT NOT NULL,
    "processing_status" "InvoiceStatus" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "reference_number" TEXT NOT NULL,
    "hawb" TEXT,
    "invoiced_weight" DECIMAL(14,4),
    "weight_unit" TEXT,
    "transport_mode" TEXT,
    "charge_description" TEXT,
    "to_be_invoiced_amount" DECIMAL(14,2),
    "invoice_currency" TEXT,
    "source_row" JSONB NOT NULL,
    "matched_shipment_id" TEXT,
    "line_status" "LineStatus" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_evaluation" (
    "id" TEXT NOT NULL,
    "invoice_line_id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "exception_message" TEXT,
    "expected_value" TEXT,
    "actual_value" TEXT,
    "configuration_version" TEXT,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_review_decision" (
    "id" TEXT NOT NULL,
    "invoice_line_id" TEXT NOT NULL,
    "decision" "LineStatus" NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "remark" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_review_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sap_posting" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "output_file_name" TEXT,
    "posting_status" "PostingStatus" NOT NULL DEFAULT 'PENDING',
    "error_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sap_posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_validation_configuration" (
    "id" TEXT NOT NULL,
    "weight_tolerance_percent" DECIMAL(8,3) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_validation_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_validation_configuration" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "weight_tolerance_percent" DECIMAL(8,3),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vendor_validation_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sap_posting_configuration" (
    "id" TEXT NOT NULL,
    "trigger_mode" "PostingTriggerMode" NOT NULL DEFAULT 'AUTOMATIC',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sap_posting_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_vendor_number_key" ON "vendor"("vendor_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_vendor_id_prebill_number_key" ON "invoice"("vendor_id", "prebill_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_invoice_id_line_number_key" ON "invoice_line"("invoice_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "manual_review_decision_invoice_line_id_key" ON "manual_review_decision"("invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "sap_posting_invoice_id_key" ON "sap_posting"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_evaluation" ADD CONSTRAINT "rule_evaluation_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_review_decision" ADD CONSTRAINT "manual_review_decision_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sap_posting" ADD CONSTRAINT "sap_posting_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_validation_configuration" ADD CONSTRAINT "vendor_validation_configuration_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
