using System;
using System.IO;
using System.Linq;
using Npgsql;

var csLine = File.ReadAllLines("D:\\SmartLibrary-FPT\\.env")
    .FirstOrDefault(x => x.StartsWith("ConnectionStrings__DefaultConnection="));
var connString = csLine?.Split('=', 2)[1].Trim();
Console.WriteLine(connString is null ? "NO_CONNECTION" : "FOUND");
if (string.IsNullOrWhiteSpace(connString)) return;
await using var conn = new NpgsqlConnection(connString);
await conn.OpenAsync();
using (var cmd = new NpgsqlCommand("SELECT id, full_name, email, role_id FROM profiles WHERE is_active = true AND is_deleted = false ORDER BY created_at LIMIT 5", conn))
await using (var rdr = await cmd.ExecuteReaderAsync())
{
    while (await rdr.ReadAsync())
    {
        Console.WriteLine($"PROFILE {rdr.GetGuid(0)} | {rdr.GetString(1)} | {rdr.GetValue(2)} | {rdr.GetValue(3)}");
    }
}
using (var cmd = new NpgsqlCommand("SELECT id, name, is_enabled, is_deleted, configuration FROM report_templates WHERE is_deleted = false ORDER BY created_at LIMIT 5", conn))
await using (var rdr = await cmd.ExecuteReaderAsync())
{
    while (await rdr.ReadAsync())
    {
        var config = rdr.IsDBNull(4) ? "NULL" : rdr.GetString(4);
        Console.WriteLine($"TEMPLATE {rdr.GetGuid(0)} | {rdr.GetString(1)} | {rdr.GetBoolean(2)} | {rdr.GetBoolean(3)} | {config.Substring(0, Math.Min(120, config.Length))}");
    }
}
