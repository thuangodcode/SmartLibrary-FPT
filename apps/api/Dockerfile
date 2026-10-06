# ── Build stage ──
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files for restore (only src projects, not tests)
COPY src/SmartLibrary.Domain/SmartLibrary.Domain.csproj src/SmartLibrary.Domain/
COPY src/SmartLibrary.Application/SmartLibrary.Application.csproj src/SmartLibrary.Application/
COPY src/SmartLibrary.Infrastructure/SmartLibrary.Infrastructure.csproj src/SmartLibrary.Infrastructure/
COPY src/SmartLibrary.Api/SmartLibrary.Api.csproj src/SmartLibrary.Api/

RUN dotnet restore src/SmartLibrary.Api/SmartLibrary.Api.csproj

# Copy all source code and build
COPY . .
RUN dotnet publish src/SmartLibrary.Api/SmartLibrary.Api.csproj -c Release -o /app/publish --no-restore

# ── Runtime stage ──
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# Create logs directory (use built-in 'app' user from .NET 8+ images)
RUN mkdir -p logs && chown -R app:app /app

USER app

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check using dotnet instead of curl (curl is not available in aspnet images)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["dotnet", "--list-runtimes"]

ENTRYPOINT ["dotnet", "SmartLibrary.Api.dll"]
