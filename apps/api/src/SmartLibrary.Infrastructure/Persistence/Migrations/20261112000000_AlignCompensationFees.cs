using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261112000000_AlignCompensationFees")]
public sealed class AlignCompensationFees : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
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
            """);

    // A rollback cannot safely reconstruct previous Admin settings or undo assessed fees.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
