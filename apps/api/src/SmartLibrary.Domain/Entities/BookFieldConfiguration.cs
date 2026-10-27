namespace SmartLibrary.Domain.Entities;

public sealed class BookFieldConfiguration
{
    public int Id { get; set; }
    public string FieldsJson { get; set; } = "[]";
    public DateTime UpdatedAt { get; set; }
}
