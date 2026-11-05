-- Correct escaped regex values inserted by the initial demo-route seed.
UPDATE "route_configuration"
SET "prebill_number_format" = CASE "id"
  WHEN 'route-demo-dhl-v1' THEN '^3900\d{6}$'
  WHEN 'route-demo-fedex-v1' THEN '^5900\d{6}$'
END
WHERE "id" IN ('route-demo-dhl-v1', 'route-demo-fedex-v1');
