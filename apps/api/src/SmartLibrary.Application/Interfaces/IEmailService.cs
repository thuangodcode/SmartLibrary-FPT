namespace SmartLibrary.Application.Interfaces;

public interface IEmailService
{
    Task<bool> SendEmailAsync(string to, string subject, string body, CancellationToken ct = default);
}
