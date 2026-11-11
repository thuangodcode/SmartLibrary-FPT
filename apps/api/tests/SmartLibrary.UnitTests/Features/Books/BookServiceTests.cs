using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Application.Mapping;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Books;

/// <summary>
/// Unit tests for BookService – demonstrates testing patterns for the team.
/// </summary>
public class BookServiceTests
{
    private readonly Mock<IBookRepository> _bookRepositoryMock;
    private readonly Mock<IUnitOfWork> _unitOfWorkMock;
    private readonly IMapper _mapper;
    private readonly Mock<IBookCodeGenerator> _codeGeneratorMock = new();
    private readonly BookService _sut; // System Under Test

    public BookServiceTests()
    {
        _bookRepositoryMock = new Mock<IBookRepository>();
        _unitOfWorkMock = new Mock<IUnitOfWork>();

        var mapperConfig = new MapperConfiguration(
            cfg => cfg.AddMaps(typeof(MappingProfile).Assembly),
            NullLoggerFactory.Instance);
        _mapper = mapperConfig.CreateMapper();

        _codeGeneratorMock.Setup(generator => generator.GetNextAsync(It.IsAny<Guid>(), true, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("AUTO001"));
        _sut = new BookService(_bookRepositoryMock.Object, _unitOfWorkMock.Object, _mapper, _codeGeneratorMock.Object);
    }

    [Fact]
    public async Task GetPagedAsync_WithBorrowSort_ForwardsFiltersAndPaging()
    {
        var categoryId = Guid.NewGuid();
        var books = new List<Book> { new() { Id = Guid.NewGuid(), Title = "Algorithms", BorrowCount = 7 } };
        _bookRepositoryMock
            .Setup(repo => repo.GetPagedAsync(2, 18, "algorithm", categoryId, false, false, It.IsAny<CancellationToken>(), true))
            .ReturnsAsync(new PagedResult<Book>(books, 19, 2, 18));

        var result = await _sut.GetPagedAsync(2, 18, "algorithm", categoryId, sortByBorrowCount: true);

        result.Items.Should().ContainSingle(book => book.Title == "Algorithms" && book.BorrowCount == 7);
        result.TotalCount.Should().Be(19);
        _bookRepositoryMock.Verify(repo => repo.GetPagedAsync(2, 18, "algorithm", categoryId, false, false, It.IsAny<CancellationToken>(), true), Times.Once);
    }

    [Fact]
    public async Task GetPagedAsync_WithNoBorrows_ReturnsZeroBorrowCount()
    {
        var books = new List<Book> { new() { Id = Guid.NewGuid(), Title = "New book", BorrowCount = 0 } };
        _bookRepositoryMock
            .Setup(repo => repo.GetPagedAsync(1, 18, null, null, false, false, It.IsAny<CancellationToken>(), true))
            .ReturnsAsync(new PagedResult<Book>(books, 1, 1, 18));

        var result = await _sut.GetPagedAsync(1, 18, sortByBorrowCount: true);

        result.Items.Should().ContainSingle(book => book.BorrowCount == 0);
    }

    [Fact]
    public async Task GetByIdAsync_WhenBookExists_ReturnsSuccess()
    {
        // Arrange
        var bookId = Guid.NewGuid();
        var book = new Book
        {
            Id = bookId,
            Title = "Clean Code",
            Isbn = "9780132350884",
            Language = "en",
            Authors = new List<Author> { new() { Name = "Robert C. Martin" } },
            Categories = new List<Category> { new() { Name = "IT" } }
        };

        _bookRepositoryMock
            .Setup(r => r.GetWithDetailsAsync(bookId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(book);

        // Act
        var result = await _sut.GetByIdAsync(bookId);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Title.Should().Be("Clean Code");
        result.Data.AuthorNames.Should().Contain("Robert C. Martin");
    }

    [Fact]
    public async Task GetByIdAsync_WhenBookDoesNotExist_ReturnsFailure()
    {
        // Arrange
        var bookId = Guid.NewGuid();
        _bookRepositoryMock
            .Setup(r => r.GetWithDetailsAsync(bookId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Book?)null);

        // Act
        var result = await _sut.GetByIdAsync(bookId);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Be(Errors.NotFound);
    }

    [Fact]
    public async Task CreateAsync_WithValidRequest_ReturnsCreatedBook()
    {
        // Arrange
        var request = new CreateBookRequest
        {
            Code = "NEWBOOK",
            Title = "New Book",
            Isbn = "1234567890123",
            Language = "vi"
        };
        var category = new Category { Id = Guid.NewGuid(), Code = "AUTO", Name = "Category" };
        var categories = new Mock<IRepository<Category>>();
        categories.Setup(repo => repo.GetByIdAsync(category.Id, It.IsAny<CancellationToken>())).ReturnsAsync(category);
        _unitOfWorkMock.Setup(unit => unit.Repository<Category>()).Returns(categories.Object);
        request.CategoryIds = [category.Id];

        _bookRepositoryMock
            .Setup(r => r.AddAsync(It.IsAny<Book>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Book b, CancellationToken _) => b);

        _unitOfWorkMock
            .Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        var result = await _sut.CreateAsync(request);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Data!.Title.Should().Be("New Book");
        result.Data.Code.Should().Be("AUTO001");
        result.Data.CodeCategoryId.Should().Be(category.Id);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeleteAsync_WhenBookExists_SoftDeletesAndReturnsSuccess()
    {
        // Arrange
        var bookId = Guid.NewGuid();
        var book = new Book { Id = bookId, Title = "To Delete" };

        _bookRepositoryMock
            .Setup(r => r.GetByIdAsync(bookId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(book);

        _unitOfWorkMock
            .Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        var result = await _sut.DeleteAsync(bookId);

        // Assert
        result.IsSuccess.Should().BeTrue();
        book.IsDeleted.Should().BeTrue(); // Soft delete
        _bookRepositoryMock.Verify(r => r.UpdateAsync(book, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateFromFormAsync_WithMultipleCategories_PersistsEveryCategory()
    {
        var first = new Category { Id = Guid.NewGuid(), Code = "NN", Name = "Ngôn ngữ" };
        var second = new Category { Id = Guid.NewGuid(), Name = "Văn học" };
        var categories = new Mock<IRepository<Category>>();
        categories.Setup(repo => repo.GetByIdAsync(first.Id, It.IsAny<CancellationToken>())).ReturnsAsync(first);
        categories.Setup(repo => repo.GetByIdAsync(second.Id, It.IsAny<CancellationToken>())).ReturnsAsync(second);
        _unitOfWorkMock.Setup(unit => unit.Repository<Category>()).Returns(categories.Object);
        _bookRepositoryMock.Setup(repo => repo.IsCodeTakenAsync("MULTICAT", It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _bookRepositoryMock.Setup(repo => repo.AddAsync(It.IsAny<Book>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Book book, CancellationToken _) => book);
        _unitOfWorkMock.Setup(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        var result = await _sut.CreateFromFormAsync(new CreateBookForm
        {
            Code = "MULTICAT",
            Title = "Language and Literature",
            TotalCopies = 2,
            CodeCategoryId = first.Id,
            CategoryIds = [first.Id, second.Id, first.Id]
        });

        result.IsSuccess.Should().BeTrue();
        result.Data!.CategoryIds.Should().BeEquivalentTo(new[] { first.Id, second.Id });
        result.Data.CategoryNames.Should().BeEquivalentTo(new[] { first.Name, second.Name });
        result.Data.Code.Should().Be("AUTO001");
        _codeGeneratorMock.Verify(generator => generator.GetNextAsync(first.Id, true, It.IsAny<CancellationToken>()), Times.Once);
        _bookRepositoryMock.Verify(repo => repo.AddAsync(It.Is<Book>(book =>
            book.CodeCategoryId == first.Id && book.Copies.All(copy => copy.Barcode.StartsWith("AUTO001-"))), It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateFromFormAsync_WithoutCategories_FailsBeforePersisting()
    {
        _bookRepositoryMock.Setup(repo => repo.IsCodeTakenAsync("NOCATEGORY", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _sut.CreateFromFormAsync(new CreateBookForm
        {
            Code = "NOCATEGORY",
            Title = "Uncategorized book",
            TotalCopies = 1
        });

        result.IsSuccess.Should().BeFalse();
        _bookRepositoryMock.Verify(repo => repo.AddAsync(It.IsAny<Book>(), It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWorkMock.Verify(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_ReplacesCategoriesWithRequestedSet()
    {
        var first = new Category { Id = Guid.NewGuid(), Name = "Ngôn ngữ" };
        var second = new Category { Id = Guid.NewGuid(), Name = "Văn học" };
        var previous = new Category { Id = Guid.NewGuid(), Name = "Khoa học" };
        var book = new Book { Id = Guid.NewGuid(), Code = "UPDATEME", Title = "Old title", Categories = [previous] };
        var categories = new Mock<IRepository<Category>>();
        categories.Setup(repo => repo.GetByIdAsync(first.Id, It.IsAny<CancellationToken>())).ReturnsAsync(first);
        categories.Setup(repo => repo.GetByIdAsync(second.Id, It.IsAny<CancellationToken>())).ReturnsAsync(second);
        _unitOfWorkMock.Setup(unit => unit.Repository<Category>()).Returns(categories.Object);
        _bookRepositoryMock.Setup(repo => repo.GetWithDetailsAsync(book.Id, It.IsAny<CancellationToken>())).ReturnsAsync(book);
        _bookRepositoryMock.Setup(repo => repo.UpdateAsync(book, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _unitOfWorkMock.Setup(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        var result = await _sut.UpdateAsync(book.Id, new UpdateBookRequest
        {
            Title = "Updated title",
            CategoryIds = [first.Id, second.Id]
        });

        result.IsSuccess.Should().BeTrue();
        book.Categories.Select(category => category.Id).Should().BeEquivalentTo(new[] { first.Id, second.Id });
        result.Data!.CategoryNames.Should().BeEquivalentTo(new[] { first.Name, second.Name });
    }
}
