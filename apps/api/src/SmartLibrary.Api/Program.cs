using Serilog;
using SmartLibrary.Api.Extensions;
using SmartLibrary.Api.Filters;
using SmartLibrary.Api.Middlewares;
using SmartLibrary.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Api.HostedServices;

// Load .env before configuration binds (repo root or API project folder)
static void LoadDotEnv()
{
    var candidates = new[]
    {
        Path.Combine(Directory.GetCurrentDirectory(), ".env"),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../../.env")),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../../../.env")),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../.env")),
        Path.Combine(AppContext.BaseDirectory, ".env"),
    };

    foreach (var path in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!File.Exists(path)) continue;
        DotNetEnv.Env.Load(path);
        Console.WriteLine($"[config] Loaded .env from {path}");
        return;
    }

    Console.WriteLine("[config] No .env file found. Using appsettings / process environment only.");
}

LoadDotEnv();

var builder = WebApplication.CreateBuilder(args);

// Ensure the API binds to port 5278 by default (consistent with web/mobile frontends)
var configuredUrls = builder.Configuration["ASPNETCORE_URLS"] ?? Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5278";
builder.WebHost.UseUrls(configuredUrls);

// ── Serilog ──
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// ── Services ──
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ValidationFilter>();
}).AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();
builder.Services.AddHostedService<BorrowPickupExpirationWorker>();

// Application services (AutoMapper, FluentValidation, business services)
builder.Services.AddApplicationServices();

// Infrastructure (EF Core, Repositories, External services)
builder.Services.AddInfrastructure(builder.Configuration);

// Auth
builder.Services.AddJwtAuthentication(builder.Configuration);

// Swagger
builder.Services.AddSwaggerConfiguration();

// CORS
builder.Services.AddCorsConfiguration(builder.Configuration);

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

// ── Apply Migrations ──
try
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        try
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;");
            db.Database.ExecuteSqlRaw("""
                CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
                CREATE TABLE IF NOT EXISTS ai_settings (
                    id UUID PRIMARY KEY,
                    encrypted_api_key TEXT,
                    api_key_last4 VARCHAR(8),
                    provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
                    chat_model VARCHAR(100) NOT NULL DEFAULT 'gemini-3.8-flash',
                    embedding_model VARCHAR(100) NOT NULL DEFAULT 'gemini-embedding-001',
                    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    reader_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    librarian_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    last_tested_at TIMESTAMPTZ,
                    last_test_ok BOOLEAN,
                    last_test_message VARCHAR(500),
                    documents_synced_at TIMESTAMPTZ,
                    document_count INTEGER NOT NULL DEFAULT 0,
                    updated_by UUID,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_type VARCHAR(20) NOT NULL,
                    source_id UUID NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    content TEXT NOT NULL,
                    content_hash VARCHAR(64) NOT NULL,
                    embedding extensions.vector(768),
                    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (source_type, source_id)
                );
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS base_url VARCHAR(500);
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS provider_keys_json TEXT;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS recommend_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS trends_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS overdue_predict_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS librarian_criteria_json TEXT;

                CREATE TABLE IF NOT EXISTS news_articles (
                    id UUID PRIMARY KEY,
                    title VARCHAR(300) NOT NULL,
                    category VARCHAR(100) NOT NULL DEFAULT 'Thông báo',
                    summary VARCHAR(1000) NOT NULL,
                    content TEXT NOT NULL,
                    image_url TEXT,
                    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
                    is_published BOOLEAN NOT NULL DEFAULT TRUE,
                    author_name VARCHAR(150) NOT NULL DEFAULT 'Ban Quản lý Thư viện FPT',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """);

            if (!db.NewsArticles.Any())
            {
                db.NewsArticles.AddRange(
                    new SmartLibrary.Domain.Entities.NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Title = "Thư viện SmartLibrary chính thức tích hợp AI Tìm kiếm Ngữ nghĩa",
                        Category = "Tính năng mới",
                        Summary = "Sinh viên giờ đây có thể tìm sách bằng các câu mô tả tự nhiên như 'Sách học vẽ sơ đồ tư duy cho dân IT' mà không cần biết chính xác tên tác giả.",
                        Content = "Hệ thống AI Tìm kiếm Ngữ nghĩa (RAG & Semantic Embedding) giúp kết nối nhu cầu học tập của sinh viên với kho tài liệu đồ sộ của thư viện FPT. Các bạn có thể tra cứu bằng ngôn ngữ tự nhiên, đặt câu hỏi về nội dung cuốn sách và nhận đề xuất chính xác từ hệ thống.",
                        ImageUrl = "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80",
                        IsPinned = true,
                        IsPublished = true,
                        AuthorName = "Bộ phận Kỹ thuật Thư viện",
                        CreatedAt = DateTime.UtcNow.AddDays(-2),
                        UpdatedAt = DateTime.UtcNow.AddDays(-2)
                    },
                    new SmartLibrary.Domain.Entities.NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Title = "Thông báo lịch mở cửa xuyên suốt kỳ thi Học kỳ 1 (2026 - 2027)",
                        Category = "Thông báo quan trọng",
                        Summary = "Phòng đọc tự học 24/7 tại tầng 2 sẽ phục vụ liên tục trong 2 tuần thi từ ngày 05/10 đến hết ngày 20/10/2026.",
                        Content = "Nhằm hỗ trợ tốt nhất cho sinh viên trong giai đoạn ôn thi cuối kỳ, Thư viện mở rộng khung giờ hoạt động khu vực tự học. Vui lòng mang theo thẻ sinh viên và tuân thủ quy định giữ gìn vệ sinh chung, trật tự trong phòng đọc.",
                        ImageUrl = "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80",
                        IsPinned = true,
                        IsPublished = true,
                        AuthorName = "Thủ thư Trưởng",
                        CreatedAt = DateTime.UtcNow.AddDays(-5),
                        UpdatedAt = DateTime.UtcNow.AddDays(-5)
                    },
                    new SmartLibrary.Domain.Entities.NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Title = "Cập nhật thêm 500+ đầu sách CNTT, AI và Kinh tế mới nhập kho",
                        Category = "Sách mới",
                        Summary = "Các giáo trình và tài liệu quốc tế cập nhật nhất về LLM, Prompt Engineering, React 19 và Phân tích tài chính đã sẵn sàng trên kệ sách.",
                        Content = "Kho tài liệu vừa được bổ sung đợt sách mới với các tựa sách bán chạy từ NXB O'Reilly, Pearson, McGraw-Hill và các tác giả hàng đầu trong nước. Bạn đọc có thể đặt mượn trực tiếp trên cổng SmartLibrary.",
                        ImageUrl = "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1200&q=80",
                        IsPinned = false,
                        IsPublished = true,
                        AuthorName = "Bộ phận Biên mục Thư viện",
                        CreatedAt = DateTime.UtcNow.AddDays(-8),
                        UpdatedAt = DateTime.UtcNow.AddDays(-8)
                    },
                    new SmartLibrary.Domain.Entities.NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Title = "Hướng dẫn quy trình gia hạn và trả sách trực tuyến không cần tới quầy",
                        Category = "Hướng dẫn độc giả",
                        Summary = "Tính năng trả sách nhanh và gia hạn qua cổng thông tin cá nhân giúp tiết kiệm thời gian cho bạn đọc.",
                        Content = "Độc giả chỉ cần truy cập vào mục 'Lịch sử mượn sách' trên trang cá nhân để theo dõi ngày đến hạn và bấm gia hạn thêm thời gian mượn. Nếu có bất kỳ thắc mắc nào, hãy nhắn tin trực tiếp với thủ thư qua mục Hỗ trợ trực tuyến.",
                        ImageUrl = "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
                        IsPinned = false,
                        IsPublished = true,
                        AuthorName = "Ban Quản lý Dịch vụ",
                        CreatedAt = DateTime.UtcNow.AddDays(-12),
                        UpdatedAt = DateTime.UtcNow.AddDays(-12)
                    }
                );
                db.SaveChanges();
            }
        }
        catch (Exception exSql)
        {
            Log.Warning(exSql, "Could not ensure news_articles table or seed defaults.");
        }

        db.Database.Migrate();
    }
}
catch (Exception ex)
{
    Log.Warning(ex, "Could not apply migrations at startup. The database may not be reachable yet.");
}

// ── Middleware pipeline ──

// Swagger MUST be before GlobalExceptionMiddleware so that swagger.json
// generation errors are not swallowed and turned into a generic 500 response.
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "SmartLibrary API v1");
    c.RoutePrefix = "swagger";
});

app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors(CorsExtensions.PolicyName);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<SupportChatHub>("/hubs/support-chat");
app.MapHealthChecks("/api/health-check");
app.MapGet("/", () => Results.Redirect("/swagger"));

app.Run();
