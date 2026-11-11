using Microsoft.Extensions.Configuration;
using PayOS;
using PayOS.Models;
using PayOS.Models.V2.PaymentRequests;
using PayOS.Models.Webhooks;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Infrastructure.Services;

public sealed class PayOSPaymentGateway(IConfiguration configuration) : IPayOSPaymentGateway
{
    private string? ClientId => configuration["PayOS:ClientId"];
    private string? ApiKey => configuration["PayOS:ApiKey"];
    private string? ChecksumKey => configuration["PayOS:ChecksumKey"];
    private string? ReturnUrl => configuration["PayOS:ReturnUrl"];
    private string? CancelUrl => configuration["PayOS:CancelUrl"];

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ApiKey) &&
        !string.IsNullOrWhiteSpace(ChecksumKey) &&
        Uri.TryCreate(ReturnUrl, UriKind.Absolute, out var returnUri) &&
        returnUri.Scheme == Uri.UriSchemeHttps &&
        Uri.TryCreate(CancelUrl, UriKind.Absolute, out var cancelUri) &&
        cancelUri.Scheme == Uri.UriSchemeHttps;

    public async Task<PayOSCheckoutResult> CreateCheckoutAsync(
        Guid fineId, long orderCode, long amount, string description, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var response = await CreateClient().PaymentRequests.CreateAsync(new CreatePaymentLinkRequest
        {
            OrderCode = orderCode,
            Amount = amount,
            Description = description,
            ReturnUrl = AddReturnParameters(ReturnUrl!, fineId, "return"),
            CancelUrl = AddReturnParameters(CancelUrl!, fineId, "cancel"),
            ExpiredAt = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeSeconds()
        });
        ct.ThrowIfCancellationRequested();
        return new PayOSCheckoutResult(
            response.PaymentLinkId,
            response.CheckoutUrl,
            response.QrCode,
            response.ExpiredAt.HasValue
                ? DateTimeOffset.FromUnixTimeSeconds(response.ExpiredAt.Value).UtcDateTime
                : null);
    }

    public async Task CancelCheckoutAsync(long orderCode, string reason, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var result = await CreateClient().PaymentRequests.CancelAsync(orderCode, reason);
        if (result.Status is not (PaymentLinkStatus.Cancelled or PaymentLinkStatus.Expired))
            throw new InvalidOperationException(
                "PayOS chưa xác nhận hủy liên kết; không thể ghi nhận thanh toán tiền mặt lúc này.");
        ct.ThrowIfCancellationRequested();
    }

    public async Task<string> GetCheckoutStatusAsync(long orderCode, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var payment = await CreateClient().PaymentRequests.GetAsync(orderCode);
        ct.ThrowIfCancellationRequested();
        return payment.Status.ToString();
    }

    public async Task<PayOSWebhookPayload> VerifyWebhookAsync(PayOSWebhookEnvelope webhook, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var verified = await CreateClient().Webhooks.VerifyAsync(new Webhook
        {
            Code = webhook.Code,
            Description = webhook.Description,
            Success = webhook.Success,
            Signature = webhook.Signature,
            Data = new WebhookData
            {
                OrderCode = webhook.Data.OrderCode,
                Amount = webhook.Data.Amount,
                Description = webhook.Data.Description,
                AccountNumber = webhook.Data.AccountNumber,
                Reference = webhook.Data.Reference,
                TransactionDateTime = webhook.Data.TransactionDateTime,
                Currency = webhook.Data.Currency,
                PaymentLinkId = webhook.Data.PaymentLinkId,
                Code = webhook.Data.Code,
                Description2 = webhook.Data.ProviderDescription,
                CounterAccountBankId = webhook.Data.CounterAccountBankId,
                CounterAccountBankName = webhook.Data.CounterAccountBankName,
                CounterAccountName = webhook.Data.CounterAccountName,
                CounterAccountNumber = webhook.Data.CounterAccountNumber,
                VirtualAccountName = webhook.Data.VirtualAccountName,
                VirtualAccountNumber = webhook.Data.VirtualAccountNumber
            }
        });
        return new PayOSWebhookPayload(
            verified.OrderCode,
            verified.Amount,
            verified.Description,
            verified.AccountNumber,
            verified.Reference,
            verified.TransactionDateTime,
            verified.Currency,
            verified.PaymentLinkId,
            verified.Code,
            verified.Description2,
            verified.CounterAccountBankId,
            verified.CounterAccountBankName,
            verified.CounterAccountName,
            verified.CounterAccountNumber,
            verified.VirtualAccountName,
            verified.VirtualAccountNumber);
    }

    private PayOSClient CreateClient()
    {
        if (!IsConfigured)
            throw new InvalidOperationException(
                "PayOS chưa được cấu hình đầy đủ. Hãy cấu hình PayOS:ClientId, PayOS:ApiKey, PayOS:ChecksumKey, PayOS:ReturnUrl và PayOS:CancelUrl.");
        return new PayOSClient(ClientId!, ApiKey!, ChecksumKey!);
    }

    private static string AddReturnParameters(string url, Guid fineId, string paymentStatus)
    {
        var separator = url.Contains('?') ? '&' : '?';
        return $"{url}{separator}tab=fines&fineId={fineId:D}&payment={paymentStatus}";
    }
}
