using SmartLibrary.Application.Interfaces;
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace SmartLibrary.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly ILogger<EmailService> _logger;
    private readonly IConfiguration _configuration;

    public EmailService(ILogger<EmailService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }

    public async Task<bool> SendEmailAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        var host = _configuration["Smtp:Host"];
        var username = _configuration["Smtp:Username"];
        var password = _configuration["Smtp:Password"];
        var fromAddress = _configuration["Smtp:FromAddress"];
        var fromName = _configuration["Smtp:FromName"] ?? "SmartLibrary";
        var port = _configuration.GetValue("Smtp:Port", 587);
        var enableSsl = _configuration.GetValue("Smtp:EnableSsl", true);

        if (string.IsNullOrWhiteSpace(host) ||
            string.IsNullOrWhiteSpace(username) ||
            string.IsNullOrWhiteSpace(password) ||
            string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("SMTP email delivery is not configured. Email to {To} was skipped.", to);
            return false;
        }

        try
        {
            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                SubjectEncoding = System.Text.Encoding.UTF8,
                BodyEncoding = System.Text.Encoding.UTF8,
                IsBodyHtml = false
            };
            message.To.Add(new MailAddress(to));

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                UseDefaultCredentials = false,
                Credentials = new NetworkCredential(username, password),
                Timeout = 10000
            };

            await client.SendMailAsync(message, ct);
            _logger.LogInformation("Email delivered to {To}: {Subject}", to, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deliver email to {To}: {Subject}", to, subject);
            return false;
        }
    }
}
