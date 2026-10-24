using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.UnitTests.Features.Circulation;

public class CirculationServiceTests
{
    private readonly Mock<ICirculationRepository> _repo = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly CirculationService _sut;
    private readonly CirculationSettings _settings = new()
    {
        MaxBooks = 2,
        BorrowDays = 14,
        MaxRenewals = 4,
        FinePerDay = 5000,
        RestrictIfUnpaid = true,
        AllowReservation = true,
        PickupCapacityPerSlot = 5,
        PickupSlotMinutes = 30,
        PickupDaysAhead = 14
    };

    public CirculationServiceTests()
    {
        _sut = new CirculationService(_repo.Object, _uow.Object);
        _repo.Setup(x => x.GetSettingsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(_settings);
        _repo.Setup(x => x.CountActiveLoansAsync(It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.HasOverdueLoansAsync(It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.CountPickupRequestsAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.GetPickupRequestCountsAsync(It.IsAny<IReadOnlyList<DateTime>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<DateTime, int>());
        _repo.Setup(x => x.GetExpiredPickupRequestIdsAsync(It.IsAny<DateTime>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<Guid>());
        _repo.Setup(x => x.LockBorrowReaderAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.LockPickupSlotAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.LockBorrowRequestAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.ReloadTrackedLoanAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.InTransactionAsync(It.IsAny<Func<Task<SmartLibrary.Application.Common.Result<CirculationLoanDto>>>>(), It.IsAny<CancellationToken>()))
            .Returns((Func<Task<SmartLibrary.Application.Common.Result<CirculationLoanDto>>> work, CancellationToken _) => work());
        _repo.Setup(x => x.InTransactionAsync(It.IsAny<Func<Task<SmartLibrary.Application.Common.Result<CirculationIncidentDto>>>>(), It.IsAny<CancellationToken>()))
            .Returns((Func<Task<SmartLibrary.Application.Common.Result<CirculationIncidentDto>>> work, CancellationToken _) => work());
        _repo.Setup(x => x.InTransactionAsync(It.IsAny<Func<Task<CirculationLoanDto>>>(), It.IsAny<CancellationToken>()))
            .Returns((Func<Task<CirculationLoanDto>> work, CancellationToken _) => work());
        _repo.Setup(x => x.AddNotificationAsync(It.IsAny<Notification>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.AddLoanAsync(It.IsAny<BorrowRecord>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.CountReadyReservationsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.CountAvailableCopiesAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _repo.Setup(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Guid>());
        _repo.Setup(x => x.TryClaimIncidentAsync(It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _repo.Setup(x => x.ReadyNextReservationAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Reservation?)null);
        _uow.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private static UserProfile ActiveReader() => new()
    {
        Id = Guid.NewGuid(),
        Email = "sv@fpt.edu.vn",
        FullName = "Nguyen Van A",
        Status = AccountStatus.Active,
        IsActive = true
    };

    private static BookCopy ReadyCopy() => new()
    {
        Id = Guid.NewGuid(),
        BookId = Guid.NewGuid(),
        Barcode = "SL-000101",
        IsAvailable = true,
        Condition = BookCondition.Good,
        Book = new Book { Title = "Clean Code", Language = "en", AvailableCopies = 2, Categories = [] }
    };

    [Fact]
    public async Task Checkout_WhenCopyUnavailable_Fails()
    {
        var reader = ActiveReader();
        _repo.Setup(x => x.FindReaderAsync("sv@fpt.edu.vn", It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        _repo.Setup(x => x.FindCopyByBarcodeAsync("SL-000101", It.IsAny<CancellationToken>())).ReturnsAsync(copy);

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = "sv@fpt.edu.vn", Barcode = "SL-000101" }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("không sẵn sàng");
    }

    [Fact]
    public async Task Checkout_WhenTwoClaimsRace_FailsSecond()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        _repo.Setup(x => x.FindReaderAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.FindCopyByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.HasActiveLoanAsync(copy.Id, null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.TryClaimCopyAsync(copy.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = reader.Email, Barcode = copy.Barcode }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("người khác mượn");
    }

    [Fact]
    public async Task Checkout_WhenUnpaidFines_BlocksBorrow()
    {
        var reader = ActiveReader();
        _repo.Setup(x => x.FindReaderAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = reader.Email, Barcode = "SL-1" }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("phí chưa thanh toán");
    }

    [Fact]
    public async Task PayFine_WhenAlreadyPaid_IsIdempotent()
    {
        var id = Guid.NewGuid();
        _repo.Setup(x => x.GetTrackedFineAsync(id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Fine { Id = id, Status = FineStatus.Paid, Amount = 5000, PaidAt = DateTime.UtcNow });
        _repo.Setup(x => x.GetFineDtoAsync(id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationFineDto { Id = id, Status = "Paid", Amount = 5000 });

        var first = await _sut.PayFineAsync(id);
        var second = await _sut.PayFineAsync(id);

        first.IsSuccess.Should().BeTrue();
        second.IsSuccess.Should().BeTrue();
        _uow.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RecordFine_WhenOverdueFineExists_DoesNotDuplicate()
    {
        var loanId = Guid.NewGuid();
        _repo.Setup(x => x.GetTrackedLoanAsync(loanId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BorrowRecord { Id = loanId, ReaderId = Guid.NewGuid() });
        _repo.Setup(x => x.HasOverdueFineAsync(loanId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.RecordFineAsync(new RecordFineRequest { BorrowRecordId = loanId, Amount = 15000 });

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("đã có phí quá hạn");
    }

    [Fact]
    public async Task Return_WhenLost_OpensIncidentWithoutCompensation()
    {
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            BookCopyId = copy.Id,
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddDays(-3),
            BookCopy = copy
        };
        _repo.Setup(x => x.FindActiveLoanByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasOpenIncidentAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.HasCompensationFineAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.AddIncidentAsync(It.IsAny<BookIncident>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Barcode = copy.Barcode, Status = "Returned" });

        var result = await _sut.ReturnAsync(new ReturnLoanRequest { Barcode = copy.Barcode, Condition = "Lost" }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        result.Data!.IncidentOpened.Should().BeTrue();
        result.Data.CreatedFineAmount.Should().BeNull();
        _repo.Verify(x => x.AddIncidentAsync(It.Is<BookIncident>(i =>
            i.Kind == BookIncidentKind.Lost && i.Status == BookIncidentStatus.PendingReview), It.IsAny<CancellationToken>()), Times.Once);
        _repo.Verify(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfirmIncident_WhenLostWithoutValue_Fails()
    {
        var incident = PendingLostIncident();
        _repo.Setup(x => x.GetTrackedIncidentAsync(incident.Id, It.IsAny<CancellationToken>())).ReturnsAsync(incident);

        var result = await _sut.ConfirmIncidentAsync(incident.Id, new ConfirmIncidentRequest { Severity = "Lost" }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("giá trị tài liệu");
        _repo.Verify(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfirmIncident_WhenLostWithOverdue_CreatesCompensationAndOverdueOnce()
    {
        var incident = PendingLostIncident();
        incident.BorrowRecord.DueDate = DateTime.UtcNow.AddDays(-3);
        incident.BorrowRecord.ReturnDate = DateTime.UtcNow;
        _repo.Setup(x => x.GetTrackedIncidentAsync(incident.Id, It.IsAny<CancellationToken>())).ReturnsAsync(incident);
        _repo.Setup(x => x.HasCompensationFineAsync(incident.BorrowRecordId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.HasOverdueFineAsync(incident.BorrowRecordId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.AddNotificationAsync(It.IsAny<Notification>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.GetIncidentDtoAsync(incident.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationIncidentDto
            {
                Id = incident.Id,
                Status = "CompensationPending",
                CompensationAmount = 200000,
                OverdueAmount = 15000,
                TotalAmount = 215000
            });

        var result = await _sut.ConfirmIncidentAsync(incident.Id, new ConfirmIncidentRequest
        {
            Severity = "Lost",
            ReplacementValue = 200000,
            ApplyOverdue = true
        }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalAmount.Should().Be(215000);
        incident.Status.Should().Be(BookIncidentStatus.CompensationPending);
        incident.BookCopy.Condition.Should().Be(BookCondition.Lost);
        incident.BookCopy.IsAvailable.Should().BeFalse();
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Amount == 200000 && f.Reason.StartsWith("Bồi thường mất sách")), It.IsAny<CancellationToken>()), Times.Once);
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Amount == 15000 && f.Reason.StartsWith("Phạt quá hạn")), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfirmIncident_WhenAlreadyCharged_DoesNotDuplicate()
    {
        var incident = PendingLostIncident();
        _repo.Setup(x => x.GetTrackedIncidentAsync(incident.Id, It.IsAny<CancellationToken>())).ReturnsAsync(incident);
        _repo.Setup(x => x.HasCompensationFineAsync(incident.BorrowRecordId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.ConfirmIncidentAsync(incident.Id, new ConfirmIncidentRequest
        {
            Severity = "Lost",
            ReplacementValue = 200000
        }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("hai lần");
    }

    [Fact]
    public async Task ConfirmIncident_WhenLightDamage_DoesNotChargeReplacement()
    {
        var incident = PendingLostIncident();
        incident.Kind = BookIncidentKind.Damage;
        incident.Severity = BookIncidentSeverity.Unknown;
        _repo.Setup(x => x.GetTrackedIncidentAsync(incident.Id, It.IsAny<CancellationToken>())).ReturnsAsync(incident);
        _repo.Setup(x => x.HasCompensationFineAsync(incident.BorrowRecordId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.AddNotificationAsync(It.IsAny<Notification>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.GetIncidentDtoAsync(incident.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationIncidentDto { Id = incident.Id, Status = "CompensationPending", CompensationAmount = 20000 });

        var result = await _sut.ConfirmIncidentAsync(incident.Id, new ConfirmIncidentRequest
        {
            Severity = "Light",
            AssessedFee = 20000
        }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        incident.BookCopy.IsAvailable.Should().BeTrue();
        incident.BookCopy.Condition.Should().Be(BookCondition.Damaged);
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Amount == 20000 && f.Reason.StartsWith("Bồi thường hư hỏng")), It.IsAny<CancellationToken>()), Times.Once);
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Reason.StartsWith("Phạt quá hạn")), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Checkout_WhenReadyHoldConsumesLastCopy_BlocksOtherReader()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        _repo.Setup(x => x.FindReaderAsync(reader.Email, It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.CountActiveLoansAsync(reader.Id, It.IsAny<Guid?>(), It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.FindCopyByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.HasActiveLoanAsync(copy.Id, null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.CountReadyReservationsAsync(copy.BookId, reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _repo.Setup(x => x.CountAvailableCopiesAsync(copy.BookId, It.IsAny<CancellationToken>())).ReturnsAsync(1);

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = reader.Email, Barcode = copy.Barcode }, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("đặt trước");
    }

    [Fact]
    public async Task RequestBorrow_CreatesPendingAndClaimsCopy()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        var pickupAt = CirculationRules.PickupSlots(_settings, DateTimeOffset.UtcNow).First().PickupAt;
        _repo.Setup(x => x.FindReaderAsync(reader.Id.ToString(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.FindCopyByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.FindAvailableCopyForBookAsync(copy.BookId, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.HasActiveLoanAsync(copy.Id, null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.TryClaimCopyAsync(copy.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _repo.Setup(x => x.GetLoanAsync(It.IsAny<Guid>(), _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Status = "Pending", Barcode = copy.Barcode, PickupAt = pickupAt.UtcDateTime });

        var result = await _sut.RequestBorrowAsync(reader.Id, new BorrowRequest { Barcode = copy.Barcode, PickupAt = pickupAt });

        result.IsSuccess.Should().BeTrue();
        result.Data!.Status.Should().Be("Pending");
        _repo.Verify(x => x.TryClaimCopyAsync(copy.Id, It.IsAny<CancellationToken>()), Times.Once);
        _repo.Verify(x => x.AddLoanAsync(It.Is<BorrowRecord>(l =>
            l.Status == BorrowStatus.Pending && l.PickupAt == pickupAt.UtcDateTime), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RequestBorrow_WhenSlotCapacityReached_DoesNotClaimCopy()
    {
        var reader = ActiveReader();
        var pickupAt = CirculationRules.PickupSlots(_settings, DateTimeOffset.UtcNow).First().PickupAt;
        _repo.Setup(x => x.FindReaderAsync(reader.Id.ToString(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.CountPickupRequestsAsync(pickupAt.UtcDateTime, It.IsAny<CancellationToken>())).ReturnsAsync(5);

        var result = await _sut.RequestBorrowBookAsync(reader.Id, Guid.NewGuid(), pickupAt);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("đã đủ số lượt");
        _repo.Verify(x => x.TryClaimCopyAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RequestBorrow_WhenReaderHasOverdueBooks_IsBlockedByPolicy()
    {
        var reader = ActiveReader();
        var pickupAt = CirculationRules.PickupSlots(_settings, DateTimeOffset.UtcNow).First().PickupAt;
        _repo.Setup(x => x.FindReaderAsync(reader.Id.ToString(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasOverdueLoansAsync(reader.Id, It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.RequestBorrowBookAsync(reader.Id, Guid.NewGuid(), pickupAt);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("quá hạn");
        _repo.Verify(x => x.FindAvailableCopyForBookAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _repo.Verify(x => x.AddNotificationAsync(It.Is<Notification>(n => n.Title.Contains("bị từ chối")), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CompleteCheckout_WhenApproved_StartsBorrowPeriodAndNotifiesReader()
    {
        var reader = ActiveReader();
        reader.StudentId = "SE123456";
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = reader.Id,
            BookCopyId = copy.Id,
            Status = BorrowStatus.Approved,
            PickupAt = DateTime.UtcNow.AddHours(1),
            AcceptedAt = DateTime.UtcNow,
            BookCopy = copy
        };
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.FindReaderAsync(reader.Id.ToString(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Borrowed", ReaderId = reader.Id });

        var result = await _sut.CompleteCheckoutAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        loan.Status.Should().Be(BorrowStatus.Borrowed);
        loan.BorrowDate.Should().NotBeNull();
        loan.DueDate.Should().BeCloseTo(loan.BorrowDate!.Value.AddDays(14), TimeSpan.FromSeconds(1));
        _repo.Verify(x => x.AddNotificationAsync(It.Is<Notification>(notification =>
            notification.Title == "Đã hoàn tất mượn sách"
            && notification.Message.Contains("SE123456")
            && notification.Message.Contains(copy.Id.ToString())
            && notification.Message.Contains(copy.Barcode)), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExpireUncollectedPickup_ReleasesHeldCopyAfterGracePeriod()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = reader.Id,
            BookCopyId = copy.Id,
            PickupAt = DateTime.UtcNow.AddMinutes(-31),
            Status = BorrowStatus.Approved,
            BookCopy = copy
        };
        _repo.Setup(x => x.GetExpiredPickupRequestIdsAsync(It.IsAny<DateTime>(), 100, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { loan.Id });
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Rejected", ReaderId = reader.Id });

        var expired = await _sut.ExpireUncollectedPickupsAsync();

        expired.Should().ContainSingle();
        loan.Status.Should().Be(BorrowStatus.Rejected);
        copy.IsAvailable.Should().BeTrue();
        copy.Book.AvailableCopies.Should().Be(3);
        _repo.Verify(x => x.AddNotificationAsync(It.Is<Notification>(notification =>
            notification.Title == "Yêu cầu mượn đã hết hạn"), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Return_WhenOnTime_DoesNotCreateFine()
    {
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            BookCopyId = copy.Id,
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddDays(2),
            BookCopy = copy
        };
        _repo.Setup(x => x.FindActiveLoanByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Returned" });

        var result = await _sut.ReturnAsync(new ReturnLoanRequest { Barcode = copy.Barcode, Condition = "Good" }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        result.Data!.CreatedFineAmount.Should().BeNull();
        _repo.Verify(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Return_WhenOverdue_CreatesFineOnce()
    {
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            BookCopyId = copy.Id,
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddDays(-3),
            BookCopy = copy
        };
        _repo.Setup(x => x.FindActiveLoanByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasOverdueFineAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Returned" });

        var result = await _sut.ReturnAsync(new ReturnLoanRequest { Barcode = copy.Barcode, Condition = "Good" }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        var expected = CirculationRules.OverdueFineAmount(
            CirculationRules.CalendarOverdueDays(loan.DueDate, DateTime.UtcNow), 5000);
        result.Data!.CreatedFineAmount.Should().Be(expected);
        expected.Should().BeGreaterThan(0);
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Amount == expected && f.Reason.StartsWith("Phạt quá hạn")), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Return_WhenAlreadyCompleted_Fails()
    {
        _repo.Setup(x => x.FindActiveLoanByBarcodeAsync("SL-1", It.IsAny<CancellationToken>())).ReturnsAsync((BorrowRecord?)null);
        var result = await _sut.ReturnAsync(new ReturnLoanRequest { Barcode = "SL-1" }, Guid.NewGuid());
        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Không có phiếu");
    }

    [Fact]
    public async Task Renew_WhenUnpaidAndSelfService_Fails()
    {
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddHours(12),
            BookCopy = ReadyCopy()
        };
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasUnpaidFinesAsync(loan.ReaderId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.RenewAsync(loan.Id, loan.ReaderId, byLibrarian: false);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("phí chưa thanh toán");
    }

    [Fact]
    public async Task ReportIncident_DoesNotCreateCompensation()
    {
        var readerId = Guid.NewGuid();
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = readerId,
            BookCopyId = Guid.NewGuid(),
            Status = BorrowStatus.Borrowed
        };
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasOpenIncidentAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.HasCompensationFineAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.AddIncidentAsync(It.IsAny<BookIncident>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.GetIncidentDtoAsync(It.IsAny<Guid>(), _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationIncidentDto { Status = "PendingReview" });

        var result = await _sut.ReportIncidentAsync(readerId, loan.Id, new ReportIncidentRequest { Kind = "Lost" });

        result.IsSuccess.Should().BeTrue();
        result.Data!.Status.Should().Be("PendingReview");
        _repo.Verify(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>()), Times.Never);
        loan.Status.Should().Be(BorrowStatus.Borrowed);
    }

    private static BookIncident PendingLostIncident()
    {
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        return new BookIncident
        {
            Id = Guid.NewGuid(),
            BorrowRecordId = Guid.NewGuid(),
            BookCopyId = copy.Id,
            ReaderId = Guid.NewGuid(),
            Kind = BookIncidentKind.Lost,
            Severity = BookIncidentSeverity.Lost,
            Status = BookIncidentStatus.PendingReview,
            BookCopy = copy,
            BorrowRecord = new BorrowRecord { DueDate = DateTime.UtcNow.AddDays(2) }
        };
    }

    [Fact]
    public async Task Renew_WhenExceedingMax_Fails()
    {
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddDays(1),
            RenewalCount = 4,
            BookCopy = ReadyCopy()
        };
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasOtherReservationAsync(It.IsAny<Guid>(), loan.ReaderId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _sut.RenewAsync(loan.Id, Guid.NewGuid(), byLibrarian: true);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("hết số lần");
    }

    [Fact]
    public async Task GetMyFines_WhenAnonymous_Fails()
    {
        var result = await _sut.GetMyFinesAsync(Guid.Empty);
        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task Checkout_ExpiresHoldsBeforeCheckingCopy()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        var order = new List<string>();
        SetupEligibleReader(reader);
        _repo.Setup(x => x.FindCopyByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.HasActiveLoanAsync(copy.Id, null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>()))
            .Callback(() => order.Add("expire"))
            .ReturnsAsync(Array.Empty<Guid>());
        _repo.Setup(x => x.CountReadyReservationsAsync(copy.BookId, reader.Id, It.IsAny<CancellationToken>()))
            .Callback(() => order.Add("ready"))
            .ReturnsAsync(0);
        _repo.Setup(x => x.TryClaimCopyAsync(copy.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _repo.Setup(x => x.GetLoanAsync(It.IsAny<Guid>(), _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Status = "Borrowed", Barcode = copy.Barcode });

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = reader.Email, Barcode = copy.Barcode }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        order.Should().Equal("expire", "ready");
    }

    [Fact]
    public async Task Checkout_WhenHoldExpired_DoesNotBlockWalkIn()
    {
        var reader = ActiveReader();
        var copy = ReadyCopy();
        SetupEligibleReader(reader);
        _repo.Setup(x => x.FindCopyByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(copy);
        _repo.Setup(x => x.HasActiveLoanAsync(copy.Id, null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.CountReadyReservationsAsync(copy.BookId, reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.TryClaimCopyAsync(copy.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _repo.Setup(x => x.GetLoanAsync(It.IsAny<Guid>(), _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Status = "Borrowed", Barcode = copy.Barcode });

        var result = await _sut.CheckoutAsync(new CheckoutRequest { ReaderKey = reader.Email, Barcode = copy.Barcode }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        _repo.Verify(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task Approve_WhenCopyValid_ClaimsAndMarksBorrowed()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        SetupApprovePath(loan, reader, claim: true);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Borrowed", Barcode = loan.BookCopy.Barcode });

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        loan.Status.Should().Be(BorrowStatus.Approved);
        loan.BorrowDate.Should().BeNull();
        loan.AcceptedAt.Should().NotBeNull();
        _repo.Verify(x => x.TryClaimCopyAsync(loan.BookCopyId, It.IsAny<CancellationToken>()), Times.Once);
        _repo.Verify(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task Approve_WhenCopyAlreadyBorrowed_DoesNotMarkBorrowed()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        SetupApprovePath(loan, reader, claim: true);
        _repo.Setup(x => x.HasActiveLoanAsync(loan.BookCopyId, loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("không sẵn sàng");
        loan.Status.Should().Be(BorrowStatus.Pending);
        _repo.Verify(x => x.TryClaimCopyAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_WhenHeldForAnotherReader_DoesNotMarkBorrowed()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        SetupApprovePath(loan, reader, claim: true);
        _repo.Setup(x => x.HasOtherBorrowRequestAsync(loan.BookCopyId, loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("phân cho phiếu khác");
        loan.Status.Should().Be(BorrowStatus.Pending);
        _repo.Verify(x => x.TryClaimCopyAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_WhenCopyDamagedOrLost_DoesNotMarkBorrowed()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        loan.BookCopy.Condition = BookCondition.Lost;
        SetupApprovePath(loan, reader, claim: true);

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("thất lạc");
        loan.Status.Should().Be(BorrowStatus.Pending);
        _repo.Verify(x => x.TryClaimCopyAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_WhenCopyAlreadyHeldForThisRequest_DoesNotClaimAgain()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        loan.BookCopy.IsAvailable = false;
        SetupApprovePath(loan, reader, claim: true);

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        loan.Status.Should().Be(BorrowStatus.Approved);
        _repo.Verify(x => x.TryClaimCopyAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_WhenClaimFails_LeavesRequestPending()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        SetupApprovePath(loan, reader, claim: false);

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("không còn sẵn sàng");
        loan.Status.Should().Be(BorrowStatus.Pending);
        loan.BorrowDate.Should().BeNull();
    }

    [Fact]
    public async Task Approve_WhenHoldExpired_AllowsClaim()
    {
        var reader = ActiveReader();
        var loan = PendingLoan(reader);
        SetupApprovePath(loan, reader, claim: true);
        _repo.Setup(x => x.CountReadyReservationsAsync(loan.BookCopy.BookId, loan.ReaderId, It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Borrowed" });

        var result = await _sut.ApproveAsync(loan.Id, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        _repo.Verify(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExpireHold_WhenCopyUnusable_DoesNotReadyNextReader()
    {
        var bookId = Guid.NewGuid();
        _repo.Setup(x => x.ExpireReadyReservationsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new[] { bookId });
        _repo.Setup(x => x.CountAvailableCopiesAsync(bookId, It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _repo.Setup(x => x.GetReservationsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CirculationReservationDto>());

        await _sut.GetReservationsAsync();

        _repo.Verify(x => x.ReadyNextReservationAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_WhenTwoClaimsRace_OnlyOneSucceeds()
    {
        var firstReader = ActiveReader();
        var secondReader = ActiveReader();
        var first = PendingLoan(firstReader);
        var second = PendingLoan(secondReader, CloneCopy(first.BookCopy));
        var claimed = 0;
        SetupApprovePath(first, firstReader, claim: true);
        SetupApprovePath(second, secondReader, claim: true);
        _repo.Setup(x => x.TryClaimCopyAsync(first.BookCopyId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => Interlocked.Increment(ref claimed) == 1);
        _repo.Setup(x => x.GetLoanAsync(It.IsAny<Guid>(), _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid id, int _, CancellationToken _) => new CirculationLoanDto { Id = id, Status = "Borrowed" });

        var results = await Task.WhenAll(
            _sut.ApproveAsync(first.Id, Guid.NewGuid()),
            _sut.ApproveAsync(second.Id, Guid.NewGuid()));

        results.Count(x => x.IsSuccess).Should().Be(1);
        results.Count(x => !x.IsSuccess).Should().Be(1);
        results.Single(x => !x.IsSuccess).Error.Should().Contain("không còn sẵn sàng");
        claimed.Should().Be(2);
    }

    [Fact]
    public async Task ConfirmIncident_WhenTwoClaimsRace_OnlyOneCreatesCompensation()
    {
        var first = PendingLostIncident();
        var claimed = 0;
        _repo.Setup(x => x.GetTrackedIncidentAsync(first.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(first);
        _repo.Setup(x => x.HasCompensationFineAsync(first.BorrowRecordId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.TryClaimIncidentAsync(first.Id, It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => Interlocked.Increment(ref claimed) == 1);
        _repo.Setup(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _repo.Setup(x => x.GetIncidentDtoAsync(first.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationIncidentDto { Id = first.Id, Status = "CompensationPending", CompensationAmount = 200000 });

        var request = new ConfirmIncidentRequest { Severity = "Lost", ReplacementValue = 200000 };
        var results = await Task.WhenAll(
            _sut.ConfirmIncidentAsync(first.Id, request, Guid.NewGuid()),
            _sut.ConfirmIncidentAsync(first.Id, request, Guid.NewGuid()));

        results.Count(x => x.IsSuccess).Should().Be(1);
        results.Count(x => !x.IsSuccess).Should().Be(1);
        _repo.Verify(x => x.AddFineAsync(It.Is<Fine>(f => f.Reason.StartsWith("Bồi thường mất sách")), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Return_WhenOverdueFineAlreadyExists_DoesNotDuplicate()
    {
        var copy = ReadyCopy();
        copy.IsAvailable = false;
        var loan = new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = Guid.NewGuid(),
            BookCopyId = copy.Id,
            Status = BorrowStatus.Borrowed,
            DueDate = DateTime.UtcNow.AddDays(-3),
            BookCopy = copy
        };
        _repo.Setup(x => x.FindActiveLoanByBarcodeAsync(copy.Barcode, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.HasOverdueFineAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _repo.Setup(x => x.GetLoanAsync(loan.Id, _settings.FinePerDay, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CirculationLoanDto { Id = loan.Id, Status = "Returned" });

        var result = await _sut.ReturnAsync(new ReturnLoanRequest { Barcode = copy.Barcode, Condition = "Good" }, Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        result.Data!.CreatedFineAmount.Should().BeNull();
        _repo.Verify(x => x.AddFineAsync(It.IsAny<Fine>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private void SetupEligibleReader(UserProfile reader)
    {
        _repo.Setup(x => x.FindReaderAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
    }

    private void SetupApprovePath(BorrowRecord loan, UserProfile reader, bool claim)
    {
        _repo.Setup(x => x.GetTrackedLoanAsync(loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(loan);
        _repo.Setup(x => x.FindReaderAsync(loan.ReaderId.ToString(), It.IsAny<CancellationToken>())).ReturnsAsync(reader);
        _repo.Setup(x => x.HasUnpaidFinesAsync(reader.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.HasActiveLoanAsync(loan.BookCopyId, loan.Id, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(x => x.TryClaimCopyAsync(loan.BookCopyId, It.IsAny<CancellationToken>())).ReturnsAsync(claim);
    }

    private static BorrowRecord PendingLoan(UserProfile reader, BookCopy? copy = null)
    {
        copy ??= ReadyCopy();
        return new BorrowRecord
        {
            Id = Guid.NewGuid(),
            ReaderId = reader.Id,
            BookCopyId = copy.Id,
            Status = BorrowStatus.Pending,
            BookCopy = copy
        };
    }

    private static BookCopy CloneCopy(BookCopy source) => new()
    {
        Id = source.Id,
        BookId = source.BookId,
        Barcode = source.Barcode,
        IsAvailable = source.IsAvailable,
        Condition = source.Condition,
        Book = source.Book
    };
}
