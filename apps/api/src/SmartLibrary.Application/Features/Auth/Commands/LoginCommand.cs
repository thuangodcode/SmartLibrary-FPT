using FluentValidation;

namespace SmartLibrary.Application.Features.Auth.Commands;

public record LoginCommand(
    string Email,
    string Password
);

public class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email hoặc tên đăng nhập không được để trống.")
            .MaximumLength(320).WithMessage("Thông tin đăng nhập quá dài.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Mật khẩu không được để trống.");
    }
}
