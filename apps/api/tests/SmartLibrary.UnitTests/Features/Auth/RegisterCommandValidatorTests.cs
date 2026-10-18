using FluentAssertions;
using SmartLibrary.Application.Features.Auth.Commands;

namespace SmartLibrary.UnitTests.Features.Auth;

public class RegisterCommandValidatorTests
{
    private readonly RegisterCommandValidator _validator = new();

    [Theory]
    [InlineData("1")]
    [InlineData("simple")]
    [InlineData("  password with spaces  ")]
    public void Validate_WithAnyNonEmptyMatchingPassword_AcceptsPassword(string password)
    {
        var command = new RegisterCommand(
            "reader@example.com",
            password,
            password,
            "Reader Name",
            null);

        var result = _validator.Validate(command);

        result.Errors.Should().NotContain(error =>
            error.PropertyName == nameof(RegisterCommand.Password) ||
            error.PropertyName == nameof(RegisterCommand.ConfirmPassword));
    }

    [Fact]
    public void Validate_WhenPasswordsDoNotMatch_RejectsConfirmation()
    {
        var command = new RegisterCommand(
            "reader@example.com",
            "simple",
            "different",
            "Reader Name",
            null);

        var result = _validator.Validate(command);

        result.Errors.Should().ContainSingle(error =>
            error.PropertyName == nameof(RegisterCommand.ConfirmPassword));
    }
}
