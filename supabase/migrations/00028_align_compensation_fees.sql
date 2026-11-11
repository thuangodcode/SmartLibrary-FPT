-- Alternative to API startup/EF migration; run against the intended database once.
-- Both paths share EF's marker, so using the other path later preserves Admin edits.
-- Requires the earlier EF migrations/baseline. For a fresh database, start the API instead.
BEGIN;
CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    migration_id varchar(150) PRIMARY KEY,
    product_version varchar(32) NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "__EFMigrationsHistory"
        WHERE migration_id = '20261111020000_BackfillVerifiedLightDamage') THEN
        RAISE EXCEPTION 'Apply earlier EF migrations (or the verified EF baseline) before running 00028; prefer API startup.';
    END IF;
END $$;

-- Share the one-time marker with the standalone Supabase script.
-- Keep the lock until the migration transaction records its history row.
LOCK TABLE "__EFMigrationsHistory" IN EXCLUSIVE MODE;
DO $$
DECLARE
    fee_policy_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM "__EFMigrationsHistory"
        WHERE migration_id = '20261112000000_AlignCompensationFees') THEN
        RETURN;
    END IF;

    FOR fee_policy_id IN
        SELECT id FROM policy_rules
        WHERE is_deleted = FALSE AND policy_type = 'FineFee' AND status = 'Active'
          AND (effective_from IS NULL OR effective_from <= now())
          AND (effective_to IS NULL OR effective_to >= now())
    LOOP
        -- Normalize existing legacy aliases as well as the canonical keys.
        UPDATE policy_rule_parameters AS parameter
        SET param_value = fee.param_value, display_label = fee.display_label
        FROM (VALUES
            ('damage_fee', '20000', 'Phí hư hỏng nhẹ (đồng)'),
            ('damaged_book_fee', '20000', 'Phí hư hỏng nhẹ (đồng)'),
            ('lost_book_fee', '100000', 'Phí hư nặng / mất sách (đồng)'),
            ('lost_fee', '100000', 'Phí hư nặng / mất sách (đồng)')
        ) AS fee(param_key, param_value, display_label)
        WHERE parameter.policy_rule_id = fee_policy_id
          AND lower(parameter.param_key) = fee.param_key;

        INSERT INTO policy_rule_parameters (id, policy_rule_id, param_key, param_value, display_label)
        SELECT gen_random_uuid(), fee_policy_id, fee.param_key, fee.param_value, fee.display_label
        FROM (VALUES
            ('damage_fee', '20000', 'Phí hư hỏng nhẹ (đồng)'),
            ('lost_book_fee', '100000', 'Phí hư nặng / mất sách (đồng)')
        ) AS fee(param_key, param_value, display_label)
        WHERE NOT EXISTS (
            SELECT 1 FROM policy_rule_parameters AS parameter
            WHERE parameter.policy_rule_id = fee_policy_id
              AND lower(parameter.param_key) = fee.param_key
        );

        UPDATE policy_rules SET updated_at = now() WHERE id = fee_policy_id;
    END LOOP;
    -- Existing fines, payments, loans and incident assessments are never rewritten.
END $$;

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20261112000000_AlignCompensationFees', '9.0.2') ON CONFLICT DO NOTHING;
COMMIT;
