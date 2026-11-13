using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.AspNetCore.Http;
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

    [Fact]
    public async Task FailedCategoryImageUploadDoesNotReportSuccessOrPersistAnInlineImage()
    {
        var storage = new Mock<IStorageService>();
        storage.Setup(item => item.UploadFileAsync(It.IsAny<Stream>(), It.IsAny<string>(), "categories", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Storage unavailable"));
        var service = new CategoryService(_repository.Object, _unit.Object, storage.Object, NullLogger<CategoryService>.Instance);
        using var stream = new MemoryStream(new byte[] { 1, 2, 3 });
        var image = new FormFile(stream, 0, stream.Length, "Image", "cover.png");
        var create = await service.CreateAsync(new() { Code = "KH", Name = "Science", Image = image });
        Assert.False(create.IsSuccess);
        Assert.Contains("bỏ ảnh", create.Error);
        _repository.Verify(repo => repo.AddAsync(It.IsAny<Category>(), It.IsAny<CancellationToken>()), Times.Never);

        var category = new Category { Code = "KH", Name = "Science", ImageUrl = "https://example.test/old.png" };
        _repository.Setup(repo => repo.GetByIdAsync(category.Id, It.IsAny<CancellationToken>())).ReturnsAsync(category);
        var update = await service.UpdateAsync(category.Id, new() { Name = "Science", Image = image });
        Assert.False(update.IsSuccess);
        Assert.Equal("https://example.test/old.png", category.ImageUrl);
        _unit.Verify(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
