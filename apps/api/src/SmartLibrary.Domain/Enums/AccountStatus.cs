namespace SmartLibrary.Domain.Enums;

public enum AccountStatus
{
    PendingVerification = 0,
    Active = 1,
    Suspended = 2,
    PendingActivation = 3,
    PendingDocuments = 4,
    PendingApproval = 5,
    Rejected = 6
}
