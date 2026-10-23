namespace SmartLibrary.Domain.Enums;

public enum BookIncidentKind
{
    Lost = 0,
    Damage = 1
}

public enum BookIncidentSeverity
{
    Unknown = 0,
    Light = 1,
    Severe = 2,
    Lost = 3
}

public enum BookIncidentStatus
{
    PendingReview = 0,
    CompensationPending = 1,
    Resolved = 2,
    Rejected = 3
}
