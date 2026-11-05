-- Correct the earlier positive-only constraint: 0% is a valid exact-match tolerance.
ALTER TABLE "cost_validation_configuration"
DROP CONSTRAINT "cost_validation_configuration_positive_tolerance_check";

ALTER TABLE "cost_validation_configuration"
ADD CONSTRAINT "cost_validation_configuration_nonnegative_tolerance_check"
CHECK ("cost_tolerance_percent" >= 0);
