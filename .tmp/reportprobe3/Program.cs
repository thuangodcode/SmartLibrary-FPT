using System;
using System.IO;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Reports;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Repositories;

var csLine = File.ReadAllLines("D:\\SmartLibrary-FPT\\.env")
    .First(x => x.StartsWith("ConnectionStrings__DefaultConnection="));
var connString = csLine.Split('=', 2)[1].Trim();
var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connString).Options;
await using var db = new AppDbContext(options);
var repo = new ReportRepository(db);
var service = new ReportService(repo);
var templateId = Guid.Parse("bf8e3fee-e364-4f79-82c6-6f4f78533c98");
var userId = Guid.Parse("e464f184-a8eb-4b04-b5a8-88ea49946354");
var rows = new[] { new ReportRowDto(new DateTime(2026,10,12), "CNTT", 1, 1, 0, 1, "") };
try
{
    var result = await service.CreateAsync(new CreateReportRequest(templateId, "CSV", new DateTime(2026,10,1), new DateTime(2026,10,30), "Test report", rows), userId, default);
    Console.WriteLine("OK: " + result.Id);
}
catch (Exception ex)
{
    Console.WriteLine("EX: " + ex.GetType().FullName);
    Console.WriteLine(ex.Message);
    Console.WriteLine(ex.StackTrace);
}
