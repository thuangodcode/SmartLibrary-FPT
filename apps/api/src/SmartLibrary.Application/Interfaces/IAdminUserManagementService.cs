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
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? Phone { get; set; }
}
