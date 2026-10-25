using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025230000_AddCs05LostBookFee")]
public sealed class AddCs05LostBookFee : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE public.policy_rule_parameters AS parameter
            SET param_value = '15000',
                display_label = 'Phí sách mất / hư hỏng nặng (VND)'
            FROM public.policy_rules AS policy
            WHERE parameter.policy_rule_id = policy.id
              AND policy.code = 'CS05'
              AND parameter.param_key = 'lost_book_fee';

            INSERT INTO public.policy_rule_parameters (id, policy_rule_id, param_key, param_value, display_label)
            SELECT gen_random_uuid(), policy.id, 'lost_book_fee', '15000', 'Phí sách mất / hư hỏng nặng (VND)'
            FROM public.policy_rules AS policy
            WHERE policy.code = 'CS05'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.policy_rule_parameters AS parameter
                  WHERE parameter.policy_rule_id = policy.id
                    AND parameter.param_key = 'lost_book_fee'
              );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
