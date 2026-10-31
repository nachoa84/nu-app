BEGIN;
-- Add Optimum Omega without replacing user progress or widening unrelated routine limits.
DO $$
DECLARE
  target_table TEXT;
  check_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['routine_notification_jobs', 'qstash_product_routine_pilot_jobs'] LOOP
    check_name := target_table || '_routine_id_check';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = target_table::regclass AND conname = check_name
        AND pg_get_constraintdef(oid) LIKE '%omega-10%'
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', target_table, check_name);
      IF target_table = 'routine_notification_jobs' THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (routine_id IN (''collagen-30'', ''lumispa-10'', ''wellspa-10'', ''galvanicspa-10'', ''colageno-10'', ''lifepak-5'', ''lifepak-elements-5'', ''nubi-10'', ''omega-10''))', target_table, check_name);
      ELSE
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (routine_id IN (''lumispa-10'', ''wellspa-10'', ''galvanicspa-10'', ''colageno-10'', ''lifepak-5'', ''lifepak-elements-5'', ''nubi-10'', ''omega-10''))', target_table, check_name);
      END IF;
    END IF;
    check_name := target_table || '_omega_duration';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target_table::regclass AND conname = check_name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (routine_id <> ''omega-10'' OR day <= 10)', target_table, check_name);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'product_routine_states'::regclass AND conname = 'supplement_omega_state_duration') THEN
    ALTER TABLE product_routine_states ADD CONSTRAINT supplement_omega_state_duration CHECK (routine_id <> 'omega-10' OR current_day <= 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'product_routine_day_progress'::regclass AND conname = 'supplement_omega_progress_duration') THEN
    ALTER TABLE product_routine_day_progress ADD CONSTRAINT supplement_omega_progress_duration CHECK (routine_id <> 'omega-10' OR day <= 10);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION suppress_legacy_product_routine_job_for_qstash_pilot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'day_available'
     AND NEW.routine_id IN ('lumispa-10', 'wellspa-10', 'galvanicspa-10', 'colageno-10', 'lifepak-5', 'lifepak-elements-5', 'nubi-10', 'omega-10')
     AND EXISTS (
       SELECT 1 FROM qstash_product_routine_pilot_jobs AS pilot
       WHERE pilot.user_id = NEW.user_id
         AND pilot.routine_id = NEW.routine_id
         AND pilot.cycle = NEW.cycle
         AND pilot.day = NEW.day
         AND pilot.status = 'scheduled'
         AND ABS(EXTRACT(EPOCH FROM (pilot.scheduled_for - NEW.scheduled_for))) <= 60
     )
  THEN
    UPDATE qstash_product_routine_pilot_jobs
    SET status = 'claimed', updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND routine_id = NEW.routine_id
      AND cycle = NEW.cycle
      AND day = NEW.day
      AND status = 'scheduled';
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMIT;
