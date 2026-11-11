using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

// Called only by the demo utility, whose target is the guarded loopback database.
internal static class DemoDefaults
{
    public static async Task AlignPoliciesAsync(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        var policies = await db.PolicyRules.Include(item => item.Parameters)
            .Where(item => item.Status == PolicyRuleStatus.Active
                && (item.EffectiveFrom == null || item.EffectiveFrom <= now)
                && (item.EffectiveTo == null || item.EffectiveTo >= now)
                && (item.PolicyType == PolicyRuleType.FineFee || item.PolicyType == PolicyRuleType.Renewal)).ToListAsync();
        if (!policies.Any(item => item.PolicyType == PolicyRuleType.FineFee)
            || !policies.Any(item => item.PolicyType == PolicyRuleType.Renewal))
            throw new InvalidOperationException("Demo cần chính sách phí và gia hạn đang hoạt động; không tự tạo chính sách thay thế.");
        foreach (var policy in policies)
        {
            void Set(string key, string value, string label)
            {
                var parameter = policy.Parameters.FirstOrDefault(item => item.ParamKey.Equals(key, StringComparison.OrdinalIgnoreCase));
                if (parameter is null) policy.Parameters.Add(new PolicyRuleParameter { ParamKey = key, ParamValue = value, DisplayLabel = label });
                else { parameter.ParamValue = value; parameter.DisplayLabel = label; }
            }
            if (policy.PolicyType == PolicyRuleType.FineFee)
            {
                Set("damage_fee", "20000", "Phí hư hỏng nhẹ (đồng)");
                Set("lost_book_fee", "100000", "Phí hư nặng / mất sách (đồng)");
                Set("overdue_fee_per_day", "5000", "Phạt quá hạn mỗi ngày (đồng)");
            }
            else Set("block_if_overdue", "true", "Không gia hạn khi quá hạn");
        }
        // Never change existing Fine amounts, payments, loans or incident assessments.
    }

    public static async Task RenameBooksAsync(AppDbContext db)
    {
        var books = await db.Books.Where(item => item.Code.StartsWith("DEMO")).ToListAsync();
        foreach (var book in books.Where(item => System.Text.RegularExpressions.Regex.IsMatch(item.Code, "^DEMO[0-9]{3}$")))
        {
            var title = $"[Demo] Sách thực hành {int.Parse(book.Code[4..]):D2}";
            if (book.Title == title) continue;
            book.Description = $"{book.Description}\nCa thực hành ban đầu: {book.Title}. Trạng thái hiện tại xem trên phiếu và bản sao.".Trim();
            book.Title = title;
        }
    }
}
