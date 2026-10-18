using FluentValidation;

namespace SmartLibrary.Application.Features.Auth.Commands;

public record RegisterCommand(
    string Email,
    string Password,
    string ConfirmPassword,
    string FullName,
    string? StudentId
);

public class RegisterCommandValidator : AbstractValidator<RegisterCommand>
{
    public RegisterCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email không được để trống.")
            .EmailAddress().WithMessage("Định dạng email không hợp lệ.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Mật khẩu không được để trống.");

        RuleFor(x => x.ConfirmPassword)
            .NotEmpty().WithMessage("Vui lòng xác nhận mật khẩu.")
            .Equal(x => x.Password).WithMessage("Xác nhận mật khẩu không trùng khớp.");

        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Họ và tên không được để trống.")
            .MaximumLength(100).WithMessage("Họ và tên không quá 100 ký tự.");
    }
}
