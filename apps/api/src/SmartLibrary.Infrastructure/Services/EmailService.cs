using SmartLibrary.Application.Interfaces;
using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace SmartLibrary.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly ILogger<EmailService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;

    public EmailService(ILogger<EmailService> logger, IConfiguration configuration, HttpClient httpClient)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClient;
    }

    public async Task<bool> SendEmailAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        // 1. Prioritize Resend API (HTTPS port 443 - works everywhere including Render/AWS)
        var resendApiKey = _configuration["Resend:ApiKey"];
        if (!string.IsNullOrWhiteSpace(resendApiKey))
        {
            resendApiKey = resendApiKey.Trim();
            if (!resendApiKey.StartsWith("re_") && resendApiKey.Length > 20)
            {
                try
                {
                    var bytes = Convert.FromBase64String(resendApiKey);
                    var decoded = System.Text.Encoding.UTF8.GetString(bytes);
                    if (decoded.StartsWith("re_"))
                    {
                        resendApiKey = decoded.Trim();
                    }
                }
                catch { }
            }

            try
            {
                var from = _configuration["Resend:From"] ?? "SmartLibrary <onboarding@resend.dev>";
                var resendHtml = body.Contains("<div", StringComparison.OrdinalIgnoreCase) || body.Contains("<html", StringComparison.OrdinalIgnoreCase)
                    ? body
                    : $"<div style='font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;'><div style='text-align: center; margin-bottom: 20px;'><h1 style='color: #4f46e5; margin: 0; font-size: 22px;'>SmartLibrary - Đại học FPT</h1></div><div style='font-size: 15px; color: #1e293b; line-height: 1.6;'>{body}</div><hr style='border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;' /><p style='font-size: 12px; color: #64748b; text-align: center; margin: 0;'>Hệ thống Quản lý Thư viện Thông minh SmartLibrary &copy; 2026</p></div>";

                var payload = new
                {
                    from = from,
                    to = new[] { to },
                    subject = subject,
                    html = resendHtml
                };

                using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", resendApiKey.Trim());
                request.Content = JsonContent.Create(payload);

                var response = await _httpClient.SendAsync(request, ct);
                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Resend email delivered successfully to {To}: {Subject}", to, subject);
                    return true;
                }

                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Resend email failed: HTTP {StatusCode} - {Error}", response.StatusCode, errorBody);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception while sending email via Resend API to {To}", to);
            }
        }

        // 2. Fallback to standard SMTP
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
            var htmlBody = body.Contains("<div", StringComparison.OrdinalIgnoreCase) || body.Contains("<html", StringComparison.OrdinalIgnoreCase)
                ? body
                : $"<div style='font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;'><div style='text-align: center; margin-bottom: 20px;'><h1 style='color: #4f46e5; margin: 0; font-size: 22px;'>SmartLibrary - Đại học FPT</h1></div><div style='font-size: 15px; color: #1e293b; line-height: 1.6;'>{body}</div><hr style='border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;' /><p style='font-size: 12px; color: #64748b; text-align: center; margin: 0;'>Hệ thống Quản lý Thư viện Thông minh SmartLibrary &copy; 2026</p></div>";

            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = htmlBody,
                SubjectEncoding = System.Text.Encoding.UTF8,
                BodyEncoding = System.Text.Encoding.UTF8,
                IsBodyHtml = true
            };
            message.To.Add(new MailAddress(to));

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                UseDefaultCredentials = false,
                Credentials = new NetworkCredential(username, password),
                Timeout = 15000
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
