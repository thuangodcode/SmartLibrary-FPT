using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Users;
using SmartLibrary.Application.Features.Users.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize(Policy = "LibrarianOnly")]
public class ReadersController : ControllerBase
{
    private readonly ReaderService _readerService;

    public ReadersController(ReaderService readerService)
    {
        _readerService = readerService;
    }

    [HttpGet]
    public async Task<IActionResult> GetReaders(
        [FromQuery] string? q,
        [FromQuery] string? status,
        [FromQuery] string? readerType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
        var result = await _readerService.GetReadersAsync(q, status, readerType, page, pageSize, ct);
        return Ok(ApiResponse<ReaderListResultDto>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetReaderDetail(Guid id, CancellationToken ct = default)
    {
        var result = await _readerService.GetByIdAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<ReaderDetailDto>.Ok(result.Data!));
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateReaderStatus(
        Guid id,
        [FromBody] UpdateReaderStatusRequest request,
        CancellationToken ct = default)
    {
        var result = await _readerService.UpdateStatusAsync(id, request, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<UpdateReaderStatusResultDto>.Ok(result.Data!, new { message = "Cập nhật trạng thái thành công!" }));
    }

    [HttpPost("{id:guid}/extend-membership")]
    public async Task<IActionResult> ExtendMembership(
        Guid id,
        [FromBody] ExtendMembershipRequest request,
        CancellationToken ct = default)
    {
        var result = await _readerService.ExtendMembershipAsync(id, request, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        var months = request.Months > 0 ? request.Months : 12;
        return Ok(ApiResponse<ExtendMembershipResultDto>.Ok(
            result.Data!,
            new { message = $"Đã gia hạn thẻ thêm {months} tháng thành công!" }));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateReader(
        Guid id,
        [FromBody] UpdateReaderRequest request,
        CancellationToken ct = default)
    {
        var result = await _readerService.UpdateAsync(id, request, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<UpdateReaderResultDto>.Ok(
            result.Data!,
            new { message = "Cập nhật thông tin độc giả thành công!" }));
    }
}
