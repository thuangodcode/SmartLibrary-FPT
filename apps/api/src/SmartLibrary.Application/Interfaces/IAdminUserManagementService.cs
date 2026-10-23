namespace SmartLibrary.Application.Interfaces;

public interface IAdminUserManagementService
{
    Task<object> GetUsersAsync(
        string? role,
        string? query,
        string? status,
        string? readerType,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<object?> GetUserByIdAsync(Guid userId, CancellationToken cancellationToken);

    Task<object?> UpdateUserAsync(
        Guid userId,
        UpdateManagedUserRequest request,
        CancellationToken cancellationToken);

    Task<object?> UpdateUserStatusAsync(
        Guid userId,
        UpdateManagedUserStatusRequest request,
        CancellationToken cancellationToken);

    Task<string?> GetUserIdentityDocumentUrlAsync(
        Guid userId,
        Guid registrationId,
        Guid documentId,
        CancellationToken cancellationToken);

    Task<object> CreateLibrarianAsync(
        CreateLibrarianRequest request,
        Guid createdBy,
        CancellationToken cancellationToken);

    Task<object> ImportReadersAsync(
        string fileName,
        Stream csvStream,
        Guid createdBy,
        CancellationToken cancellationToken);
}

public sealed class CreateLibrarianRequest
{
    public string? FullName { get; set; }
    public string? EmployeeId { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? Phone { get; set; }
    public string? AvatarUrl { get; set; }
}

public sealed class UpdateManagedUserRequest
{
    public string? FullName { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? StudentId { get; set; }
    public string? TeacherId { get; set; }
    public string? DateOfBirth { get; set; }
    public string? ReaderType { get; set; }
}

public sealed class UpdateManagedUserStatusRequest
{
    public string? Status { get; set; }
    public string? Reason { get; set; }
}
