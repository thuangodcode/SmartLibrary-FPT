using AutoMapper;
using FluentAssertions;
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
    private readonly BookService _sut; // System Under Test

    public BookServiceTests()
    {
        _bookRepositoryMock = new Mock<IBookRepository>();
        _unitOfWorkMock = new Mock<IUnitOfWork>();

        var mapperConfig = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>());
        _mapper = mapperConfig.CreateMapper();

        _sut = new BookService(_bookRepositoryMock.Object, _unitOfWorkMock.Object, _mapper);
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
            Title = "New Book",
            Isbn = "1234567890123",
            Language = "vi"
        };

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
}
