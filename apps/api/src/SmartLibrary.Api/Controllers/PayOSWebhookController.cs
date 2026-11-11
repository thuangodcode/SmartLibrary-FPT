using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PayOS.Exceptions;
using SmartLibrary.Api.Models;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/payments/payos")]
public sealed class PayOSWebhookController(
    CirculationService circulation,
    ILogger<PayOSWebhookController> logger) : ControllerBase
{
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook([FromBody] PayOSWebhookRequest request, CancellationToken ct)
    {
        if (request.Data is null || string.IsNullOrWhiteSpace(request.Signature))
            return BadRequest(ApiResponse<object>.Fail("Webhook PayOS không hợp lệ."));

        try
        {
            var result = await circulation.ProcessPayOSWebhookAsync(
                new PayOSWebhookEnvelope(
                    request.Code,
                    request.Description,
                    request.Success,
                    new PayOSWebhookPayload(
                        request.Data.OrderCode,
                        request.Data.Amount,
                        request.Data.Description,
                        request.Data.AccountNumber ?? string.Empty,
                        request.Data.Reference ?? string.Empty,
                        request.Data.TransactionDateTime ?? string.Empty,
                        request.Data.Currency ?? string.Empty,
                        request.Data.PaymentLinkId ?? string.Empty,
                        request.Data.Code ?? string.Empty,
                        request.Data.ProviderDescription ?? string.Empty,
                        request.Data.CounterAccountBankId,
                        request.Data.CounterAccountBankName,
                        request.Data.CounterAccountName,
                        request.Data.CounterAccountNumber,
                        request.Data.VirtualAccountName,
                        request.Data.VirtualAccountNumber),
                    request.Signature),
                ct);
            if (!result.IsSuccess)
                return BadRequest(ApiResponse<object>.Fail(result.Error!));
            return Ok(new { error = 0, message = "Webhook handled", data = (object?)null });
        }
        catch (PayOSException ex)
        {
            logger.LogWarning(ex, "Rejected PayOS webhook due to invalid provider data or signature.");
            return BadRequest(ApiResponse<object>.Fail("Chữ ký hoặc dữ liệu webhook PayOS không hợp lệ."));
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "PayOS webhook could not be processed because PayOS configuration is invalid.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                ApiResponse<object>.Fail("Máy chủ chưa cấu hình PayOS."));
        }
    }
}
