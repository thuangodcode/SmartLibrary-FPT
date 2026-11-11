using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SmartLibrary.Application.Features.Categories;
using SmartLibrary.Application.Features.Categories.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Categories;

public class CategoryCodeTests
{
    private readonly Mock<ICategoryRepository> _repository = new();
    private readonly Mock<IUnitOfWork> _unit = new();
    private CategoryService Service() => new(_repository.Object, _unit.Object,
        Mock.Of<IStorageService>(), NullLogger<CategoryService>.Instance);

    [Fact]
    public async Task CreatesNormalizedCategoryPrefix()
    {
        var result = await Service().CreateAsync(new CreateCategoryForm { Name = "Khoa học tự nhiên", Code = " khtn " });
        Assert.True(result.IsSuccess);
        Assert.Equal("KHTN", result.Data!.Code);
        _repository.Verify(repo => repo.AddAsync(It.Is<Category>(category => category.Code == "KHTN"), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RejectsAReservedPrefixBeforeUploadingOrPersisting()
    {
        _repository.Setup(repo => repo.ExistsByCodeAsync("IT", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await Service().CreateAsync(new CreateCategoryForm { Name = "Another category", Code = "IT" });
        Assert.False(result.IsSuccess);
        _repository.Verify(repo => repo.AddAsync(It.IsAny<Category>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RejectsPrefixesEndingInDigitsToKeepNumberBoundariesUnambiguous()
    {
        var result = await Service().CreateAsync(new CreateCategoryForm { Name = "Science", Code = "KH1" });
        Assert.False(result.IsSuccess);
        _unit.Verify(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task LegacyEditWithoutCodeKeepsTheExistingPrefix()
    {
        var category = new Category { Id = Guid.NewGuid(), Name = "Old name", Code = "KHTN" };
        _repository.Setup(repo => repo.GetByIdAsync(category.Id, It.IsAny<CancellationToken>())).ReturnsAsync(category);
        var result = await Service().UpdateAsync(category.Id, new UpdateCategoryForm { Name = "New name" });
        Assert.True(result.IsSuccess);
        Assert.Equal("KHTN", category.Code);
    }
}
