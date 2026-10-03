using SmartLibrary.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace SmartLibrary.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly ILogger<EmailService> _logger;

    public EmailService(ILogger<EmailService> logger)
    {
        _logger = logger;
    }

    public Task SendEmailAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        _logger.LogInformation("Sending email to {To}: {Subject}", to, subject);
        // TODO: Implement actual email sending (SMTP, SendGrid, etc.)
        return Task.CompletedTask;
    }
}
