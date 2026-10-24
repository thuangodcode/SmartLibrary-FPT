using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Notifications;

public class NotificationInboxTests
{
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
}
