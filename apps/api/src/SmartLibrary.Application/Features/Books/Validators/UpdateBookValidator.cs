using FluentValidation;
using SmartLibrary.Application.Features.Books.DTOs;

namespace SmartLibrary.Application.Features.Books.Validators;

public class UpdateBookValidator : AbstractValidator<UpdateBookRequest>
{
    public UpdateBookValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title is required.")
            .MaximumLength(500).WithMessage("Title must not exceed 500 characters.");

        RuleFor(x => x.Isbn)
            .MaximumLength(20).WithMessage("ISBN must not exceed 20 characters.")
            .When(x => !string.IsNullOrEmpty(x.Isbn));

        RuleFor(x => x.Language)
            .NotEmpty().WithMessage("Language is required.")
            .MaximumLength(10);

        RuleFor(x => x.PublishedYear)
            .InclusiveBetween(1000, DateTime.UtcNow.Year + 1)
            .When(x => x.PublishedYear.HasValue)
            .WithMessage("Published year is invalid.");

        RuleFor(x => x.PageCount)
            .GreaterThan(0)
            .When(x => x.PageCount.HasValue)
            .WithMessage("Page count must be positive.");
    }
}
