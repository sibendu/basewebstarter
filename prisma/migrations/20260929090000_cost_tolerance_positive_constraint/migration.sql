-- Superseded by 20260929120000_cost_tolerance_nonnegative_constraint.
ALTER TABLE "cost_validation_configuration"
ADD CONSTRAINT "cost_validation_configuration_positive_tolerance_check"
CHECK ("cost_tolerance_percent" > 0);
