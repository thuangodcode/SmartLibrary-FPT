using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _context;

    public DashboardController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken ct = default)
    {
        var pendingRegistrations = await _context.RegistrationRequests
            .CountAsync(r => r.Status == RegistrationRequestStatus.Submitted, ct);

        var totalReaders = await _context.UserProfiles
            .CountAsync(p => !p.IsDeleted, ct);

        var totalBooks = await _context.Books
            .CountAsync(b => !b.IsDeleted, ct);

        var availableCopies = await _context.Books
            .SumAsync(b => b.AvailableCopies, ct);

        var borrowedCount = await _context.BorrowRecords
            .CountAsync(b => b.Status == BorrowStatus.Borrowed, ct);

        var overdueCount = await _context.BorrowRecords
            .CountAsync(b => b.Status == BorrowStatus.Overdue, ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            pendingRegistrations,
            totalReaders,
            totalBooks,
            availableCopies,
            borrowedCount,
            overdueCount
        }));
    }
}
