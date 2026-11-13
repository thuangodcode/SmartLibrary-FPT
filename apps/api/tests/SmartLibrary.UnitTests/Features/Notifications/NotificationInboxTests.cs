using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Notifications;

public class NotificationInboxTests
{
    [Theory]
    [InlineData("return", "loans", "loanId")]
    [InlineData("borrow", "loans", "loanId")]
    [InlineData("renewal", "loans", "loanId")]
    [InlineData("due_soon", "loans", "loanId")]
    [InlineData("overdue", "loans", "loanId")]
    [InlineData("due_date_email_reminder", "loans", "loanId")]
    [InlineData("fine_paid", "fines", "fineId")]
    [InlineData("fine", "fines", "fineId")]
    [InlineData("fine_payment_reconciliation", "fines", "fineId")]
    public void Map_UpgradesGenericLegacyHrefToExactEntity(string type, string tab, string key)
    {
        var id = Guid.NewGuid();
        var notification = new Notification { Type = type, Metadata = $$"""{"href":"/history?tab={{tab}}","entityId":"{{id}}"}""" };
        NotificationInbox.Map(notification).Href.Should().Be($"/history?tab={tab}&{key}={id}");
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("42")]
    [InlineData("{\"entityId\":42}")]
    [InlineData("{\"href\":\"//other.example/path\"}")]
    [InlineData("{\"href\":\"https://other.example/path\"}")]
    public void Map_MalformedOrExternalMetadataFallsBackSafely(string metadata)
        => NotificationInbox.Map(new Notification { Type = "return", Metadata = metadata })
            .Href.Should().BeNull();

    [Fact]
    public void Map_ReservationIdIsNeverUsedAsABookId()
    {
        var id = Guid.NewGuid();
        NotificationInbox.Map(new Notification { Type = "reservation", Metadata = $$"""{"entityId":"{{id}}"}""" })
            .Href.Should().BeNull();
        NotificationInbox.Map(new Notification { Type = "reservation", Metadata = $$"""{"bookId":"{{id}}"}""" })
            .Href.Should().Be($"/books/{id}");
    }

    [Fact]
    public async Task NotifyAiCredentialAsync_SkipsUnrelatedErrors()
    {
        var uow = new Mock<IUnitOfWork>();
        var inbox = new NotificationInbox(uow.Object);

        await inbox.NotifyAiCredentialAsync(Guid.NewGuid(), "Model embedding không dùng được.");

        uow.Verify(item => item.Repository<Notification>(), Times.Never);
    }

    [Fact]
    public async Task NotifyAiCredentialAsync_DoesNotInsertWhenUnreadDuplicateExists()
    {
        var userId = Guid.NewGuid();
        var repo = new Mock<IRepository<Notification>>();
        repo.Setup(item => item.CountAsync(It.IsAny<System.Linq.Expressions.Expression<Func<Notification, bool>>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        var uow = new Mock<IUnitOfWork>();
        uow.Setup(item => item.Repository<Notification>()).Returns(repo.Object);
        var inbox = new NotificationInbox(uow.Object);

        await inbox.NotifyAiCredentialAsync(userId, "Gemini: hết hạn mức hoặc bị giới hạn tốc độ.");

        repo.Verify(item => item.AddAsync(It.IsAny<Notification>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void Map_UsesHrefStoredInMetadata()
    {
        var notification = new Notification
        {
            UserId = Guid.NewGuid(),
            Type = "reservation",
            Metadata = "{\"href\":\"/books/book-id\",\"entityId\":\"book-id\"}"
        };

        var result = NotificationInbox.Map(notification);

        result.UserId.Should().Be(notification.UserId);
        result.Href.Should().Be("/books/book-id");
    }

    [Theory]
    [InlineData("renewal", null)]
    [InlineData("fine_paid", null)]
    [InlineData("membership_expiring", "/profile")]
    public void Map_FallsBackToTypeRoute_WhenMetadataIsMissingOrInvalid(string type, string? expectedHref)
    {
        var notification = new Notification
        {
            UserId = Guid.NewGuid(),
            Type = type,
            Metadata = "not-json"
        };

        NotificationInbox.Map(notification).Href.Should().Be(expectedHref);
    }
}
