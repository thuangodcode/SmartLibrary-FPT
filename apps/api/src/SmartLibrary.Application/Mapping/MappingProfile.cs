using AutoMapper;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Mapping;

/// <summary>
/// AutoMapper profile for mapping between entities and DTOs.
/// </summary>
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        // Book mappings
        CreateMap<Book, BookDto>()
            .ForMember(dest => dest.AuthorNames, opt => opt.MapFrom(src => src.Authors.Select(a => a.Name).ToList()))
            .ForMember(dest => dest.CategoryNames, opt => opt.MapFrom(src => src.Categories.Select(c => c.Name).ToList()));

        CreateMap<CreateBookRequest, Book>();
        CreateMap<UpdateBookRequest, Book>();
    }
}
