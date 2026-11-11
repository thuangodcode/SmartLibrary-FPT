using FluentAssertions;
using SmartLibrary.Application.Features.Notifications;

namespace SmartLibrary.UnitTests.Features.Notifications;

public class AiCredentialAlertTests
{
    [Theory]
    [InlineData("Gemini: API Key không hợp lệ hoặc đã bị thu hồi.", AiCredentialAlert.KeyType)]
    [InlineData("API_KEY_INVALID", AiCredentialAlert.KeyType)]
    [InlineData("Gemini: hết hạn mức hoặc bị giới hạn tốc độ. Thử lại sau.", AiCredentialAlert.QuotaType)]
    [InlineData("RESOURCE_EXHAUSTED quota", AiCredentialAlert.QuotaType)]
    public void Classify_DetectsKeyAndQuotaErrors(string message, string expected)
        => AiCredentialAlert.Classify(message).Should().Be(expected);

    [Fact]
    public void Classify_IgnoresUnrelatedErrors()
        => AiCredentialAlert.Classify("Model embedding Gemini hiện không dùng được.").Should().BeNull();
}
