using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class FinePayment : AuditableEntity
{
    public Guid FineId { get; set; }
    public string Method { get; set; } = "PayOS";
    public FinePaymentStatus Status { get; set; } = FinePaymentStatus.Pending;
    public decimal Amount { get; set; }
    public Guid? InitiatedById { get; set; }
    public Guid? RecordedById { get; set; }
    public long? OrderCode { get; set; }
    public string? PaymentLinkId { get; set; }
    public string? CheckoutUrl { get; set; }
    public string? QrCode { get; set; }
    public string? ProviderReference { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime? PaidAt { get; set; }

    public Fine Fine { get; set; } = null!;
}
