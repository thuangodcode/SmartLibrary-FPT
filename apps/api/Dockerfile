# ── Build stage ──
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution and project files for restore
COPY SmartLibrary.slnx .
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

COPY --from=build /app/publish .

# The .NET 8/9/10 base images already include a non-root user named 'app'
# Create logs directory and assign ownership to the 'app' user
RUN mkdir -p logs && chown -R app:app /app

USER app

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "SmartLibrary.Api.dll"]
