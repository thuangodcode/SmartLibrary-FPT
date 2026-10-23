ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS ix_profiles_employee_id_lower
    ON profiles (LOWER(employee_id))
    WHERE employee_id IS NOT NULL;
