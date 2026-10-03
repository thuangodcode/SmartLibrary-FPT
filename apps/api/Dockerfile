# ── Build stage ──
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution and project files for restore
COPY SmartLibrary.sln .
COPY src/SmartLibrary.Domain/SmartLibrary.Domain.csproj src/SmartLibrary.Domain/
COPY src/SmartLibrary.Application/SmartLibrary.Application.csproj src/SmartLibrary.Application/
COPY src/SmartLibrary.Infrastructure/SmartLibrary.Infrastructure.csproj src/SmartLibrary.Infrastructure/
COPY src/SmartLibrary.Api/SmartLibrary.Api.csproj src/SmartLibrary.Api/

RUN dotnet restore

# Copy all source code and build
COPY . .
RUN dotnet publish src/SmartLibrary.Api/SmartLibrary.Api.csproj -c Release -o /app/publish --no-restore

# ── Runtime stage ──
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser

COPY --from=build /app/publish .

# Create logs directory
RUN mkdir -p logs && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "SmartLibrary.Api.dll"]
