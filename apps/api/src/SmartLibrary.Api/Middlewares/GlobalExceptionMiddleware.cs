using System.Net;
using System.Text.Json;
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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, errorCode, message) = exception switch
        {
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

        var response = ApiResponse<object>.Fail(
            string.IsNullOrEmpty(message) ? errorCode : message
        );

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }
}
