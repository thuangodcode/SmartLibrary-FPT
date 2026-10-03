namespace SmartLibrary.Application.Common;

/// <summary>
/// Standardised API response envelope: { success, data, error, meta }.
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Error { get; set; }
    public object? Meta { get; set; }

    public static ApiResponse<T> Ok(T data, object? meta = null) => new()
    {
        Success = true,
        Data = data,
        Meta = meta
    };

    public static ApiResponse<T> Fail(string error) => new()
    {
        Success = false,
        Error = error
    };
}
