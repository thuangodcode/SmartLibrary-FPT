using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Users.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Users;

public class ReaderService
{
    private readonly IReaderRepository _readerRepository;
    private readonly IUnitOfWork _unitOfWork;

    public ReaderService(IReaderRepository readerRepository, IUnitOfWork unitOfWork)
    {
        _readerRepository = readerRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<ReaderListResultDto> GetReadersAsync(
        string? query,
        string? status,
        string? readerType,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        AccountStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase)
            && Enum.TryParse<AccountStatus>(status, true, out var statusValue))
        {
            parsedStatus = statusValue;
        }

        ReaderType? parsedType = null;
        if (!string.IsNullOrWhiteSpace(readerType) && !readerType.Equals("All", StringComparison.OrdinalIgnoreCase)
            && Enum.TryParse<ReaderType>(readerType, true, out var typeValue))
        {
            parsedType = typeValue;
        }

        var safePage = page < 1 ? 1 : page;
        var safePageSize = pageSize < 1 ? 15 : pageSize;

        var (items, totalCount) = await _readerRepository.GetPagedAsync(
            query, parsedStatus, parsedType, safePage, safePageSize, ct);
        var stats = await _readerRepository.GetStatsAsync(ct);

        return new ReaderListResultDto
        {
            Items = items,
            TotalCount = totalCount,
            Page = safePage,
            PageSize = safePageSize,
            TotalPages = (int)Math.Ceiling(totalCount / (double)safePageSize),
            Stats = stats
        };
    }

    public async Task<Result<ReaderDetailDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var reader = await _readerRepository.GetDetailAsync(id, ct);
        if (reader is null)
            return Result<ReaderDetailDto>.Failure("Không tìm thấy độc giả.");

        return Result<ReaderDetailDto>.Success(reader);
    }

    public async Task<Result<UpdateReaderStatusResultDto>> UpdateStatusAsync(
        Guid id,
        UpdateReaderStatusRequest request,
        CancellationToken ct = default)
    {
        var user = await _readerRepository.GetByIdAsync(id, ct);
        if (user is null)
            return Result<UpdateReaderStatusResultDto>.Failure("Không tìm thấy độc giả.");

        if (!Enum.TryParse<AccountStatus>(request.Status, true, out var newStatus))
            return Result<UpdateReaderStatusResultDto>.Failure("Trạng thái không hợp lệ.");

        user.Status = newStatus;
        user.IsActive = newStatus == AccountStatus.Active;
        await _readerRepository.UpdateAsync(user, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<UpdateReaderStatusResultDto>.Success(new UpdateReaderStatusResultDto
        {
            Id = user.Id,
            Status = user.Status.ToString()
        });
    }

    public async Task<Result<ExtendMembershipResultDto>> ExtendMembershipAsync(
        Guid id,
        ExtendMembershipRequest request,
        CancellationToken ct = default)
    {
        var user = await _readerRepository.GetByIdAsync(id, ct);
        if (user is null)
            return Result<ExtendMembershipResultDto>.Failure("Không tìm thấy độc giả.");

        var months = request.Months > 0 ? request.Months : 12;
        var currentExpiry = user.MembershipExpiresAt.HasValue && user.MembershipExpiresAt.Value > DateTime.UtcNow
            ? user.MembershipExpiresAt.Value
            : DateTime.UtcNow;

        user.MembershipExpiresAt = currentExpiry.AddMonths(months);
        if (user.Status != AccountStatus.Active)
        {
            user.Status = AccountStatus.Active;
            user.IsActive = true;
        }

        await _readerRepository.UpdateAsync(user, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<ExtendMembershipResultDto>.Success(new ExtendMembershipResultDto
        {
            Id = user.Id,
            MembershipExpiresAt = user.MembershipExpiresAt
        });
    }

    public async Task<Result<UpdateReaderResultDto>> UpdateAsync(
        Guid id,
        UpdateReaderRequest request,
        CancellationToken ct = default)
    {
        var user = await _readerRepository.GetByIdAsync(id, ct);
        if (user is null)
            return Result<UpdateReaderResultDto>.Failure("Không tìm thấy độc giả.");

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Phone)) user.Phone = request.Phone.Trim();
        if (!string.IsNullOrWhiteSpace(request.Address)) user.Address = request.Address.Trim();
        if (!string.IsNullOrWhiteSpace(request.StudentId)) user.StudentId = request.StudentId.Trim();
        if (!string.IsNullOrWhiteSpace(request.ReaderType)
            && Enum.TryParse<ReaderType>(request.ReaderType, true, out var readerType))
        {
            user.ReaderType = readerType;
        }

        await _readerRepository.UpdateAsync(user, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<UpdateReaderResultDto>.Success(new UpdateReaderResultDto
        {
            Id = user.Id,
            FullName = user.FullName,
            Phone = user.Phone,
            Address = user.Address,
            StudentId = user.StudentId,
            ReaderType = user.ReaderType
        });
    }
}
