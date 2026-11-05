-- Effective-dated demo route mappings used by the bundled DHL and FedEx TMID fixtures.
INSERT INTO "route_configuration" (
  "id", "parcel_account_number", "company_code", "domain", "invoice_payer",
  "carrier", "prebill_number_format", "version", "active", "effective_from", "created_by"
) VALUES
  (
    'route-demo-dhl-v1', 'DHL-0100160051', 'ID11', 'APAC', 'PT. Philips Industries Batam',
    'DHL Direct FCL - DHCCN', '^3900\d{6}$', 'demo-route-v1', true, CURRENT_TIMESTAMP, 'demo-fixture'
  ),
  (
    'route-demo-fedex-v1', 'FEDEX-9078710', 'CR01', 'AMERICAS', 'Philips de Costa Rica S.R.L.',
    'Fedex Trade TN SMF - FTNSB', '^5900\d{6}$', 'demo-route-v1', true, CURRENT_TIMESTAMP, 'demo-fixture'
  )
ON CONFLICT ("id") DO NOTHING;
