using System.Text.Json.Serialization;

namespace SmartLibrary.Api.Models;

public sealed class PayOSWebhookRequest
{
    [JsonPropertyName("code")]
    public string Code { get; init; } = string.Empty;

    [JsonPropertyName("desc")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("success")]
    public bool Success { get; init; }

    [JsonPropertyName("data")]
    public PayOSWebhookBody? Data { get; init; }

    [JsonPropertyName("signature")]
    public string Signature { get; init; } = string.Empty;
}

public sealed class PayOSWebhookBody
{
    [JsonPropertyName("orderCode")]
    public long OrderCode { get; init; }

    [JsonPropertyName("amount")]
    public long Amount { get; init; }

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("accountNumber")]
    public string? AccountNumber { get; init; }

    [JsonPropertyName("reference")]
    public string? Reference { get; init; }

    [JsonPropertyName("transactionDateTime")]
    public string? TransactionDateTime { get; init; }

    [JsonPropertyName("currency")]
    public string? Currency { get; init; }

    [JsonPropertyName("paymentLinkId")]
    public string? PaymentLinkId { get; init; }

    [JsonPropertyName("code")]
    public string? Code { get; init; }

    [JsonPropertyName("desc")]
    public string? ProviderDescription { get; init; }

    [JsonPropertyName("counterAccountBankId")]
    public string? CounterAccountBankId { get; init; }

    [JsonPropertyName("counterAccountBankName")]
    public string? CounterAccountBankName { get; init; }

    [JsonPropertyName("counterAccountName")]
    public string? CounterAccountName { get; init; }

    [JsonPropertyName("counterAccountNumber")]
    public string? CounterAccountNumber { get; init; }

    [JsonPropertyName("virtualAccountName")]
    public string? VirtualAccountName { get; init; }

    [JsonPropertyName("virtualAccountNumber")]
    public string? VirtualAccountNumber { get; init; }
}
