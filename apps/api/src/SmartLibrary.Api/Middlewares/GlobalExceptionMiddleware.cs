using System.Net;
using System.Text.Json;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Exceptions;

namespace SmartLibrary.Api.Middlewares;

/// <summary>
/// Global exception handler middleware – catches all unhandled exceptions
/// and returns a standardised ApiResponse JSON.
/// </summary>
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // A browser route change or disconnect can cancel database reads. The request is already gone.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var postgresException = FindPostgresException(exception);
        var missingReportsSchema = postgresException?.SqlState is PostgresErrorCodes.UndefinedTable or PostgresErrorCodes.UndefinedColumn;

        var (statusCode, errorCode, message) = exception switch
        {
            _ when missingReportsSchema => (
                HttpStatusCode.ServiceUnavailable, 
                "Cơ sở dữ liệu báo cáo chưa được khởi tạo. API đang áp dụng migration; hãy tải lại sau khi API khởi động xong.",
                exception.Message),
            NotFoundException => (HttpStatusCode.NotFound, Errors.NotFound, exception.Message),
            DomainException => (HttpStatusCode.BadRequest, Errors.ValidationFailed, exception.Message),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized, Errors.Unauthorized, exception.Message),
            DbUpdateConcurrencyException => (
                HttpStatusCode.Conflict,
                Errors.InternalError,
                "Không lưu được quy định vì dữ liệu đã thay đổi. Tải lại trang rồi thử lại."),
            _ => (HttpStatusCode.InternalServerError, Errors.InternalError, exception.Message)
        };

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = ApiResponse<object>.Fail(missingReportsSchema
            ? errorCode
            : string.IsNullOrEmpty(message) ? errorCode : message);

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }

    private static PostgresException? FindPostgresException(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException!)
            if (current is PostgresException postgresException) return postgresException;
        return null;
    }
}
