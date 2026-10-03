namespace SmartLibrary.Domain.Exceptions;

public class ValidationException : DomainException
{
    public IDictionary<string, string[]> Errors { get; }

    public ValidationException(string message) : base(message)
    {
        Errors = new Dictionary<string, string[]>();
    }

    public ValidationException(IDictionary<string, string[]> errors) 
        : base("Một hoặc nhiều lỗi kiểm tra dữ liệu đã xảy ra.")
    {
        Errors = errors;
    }
}
