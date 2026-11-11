namespace SmartLibrary.Application.Interfaces;

public sealed record PayOSCheckoutResult(
    string PaymentLinkId,
    string CheckoutUrl,
    string QrCode,
    DateTime? ExpiresAt);

public sealed record PayOSWebhookPayload(
    long OrderCode,
    long Amount,
    string Description,
    string AccountNumber,
    string Reference,
    string TransactionDateTime,
    string Currency,
    string PaymentLinkId,
    string Code,
    string ProviderDescription,
    string? CounterAccountBankId,
    string? CounterAccountBankName,
    string? CounterAccountName,
    string? CounterAccountNumber,
    string? VirtualAccountName,
    string? VirtualAccountNumber);

public sealed record PayOSWebhookEnvelope(
    string Code,
    string Description,
    bool Success,
    PayOSWebhookPayload Data,
    string Signature);

public interface IPayOSPaymentGateway
{
    bool IsConfigured { get; }
    Task<PayOSCheckoutResult> CreateCheckoutAsync(
        Guid fineId, long orderCode, long amount, string description, CancellationToken ct);
    Task<string> GetCheckoutStatusAsync(long orderCode, CancellationToken ct);
    Task CancelCheckoutAsync(long orderCode, string reason, CancellationToken ct);
    Task<PayOSWebhookPayload> VerifyWebhookAsync(PayOSWebhookEnvelope webhook, CancellationToken ct);
}
