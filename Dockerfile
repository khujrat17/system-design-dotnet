# System Design Lab (src/SystemDesign.Web) in a container.
#   docker build -t system-design-lab .
#   docker run --rm -p 8080:8080 system-design-lab      -> http://localhost:8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
COPY global.json SystemDesign.sln ./
COPY src/SystemDesign.Concepts/SystemDesign.Concepts.csproj src/SystemDesign.Concepts/
COPY src/SystemDesign.Web/SystemDesign.Web.csproj src/SystemDesign.Web/
RUN dotnet restore src/SystemDesign.Web/SystemDesign.Web.csproj
COPY docs/ docs/
COPY src/SystemDesign.Concepts/ src/SystemDesign.Concepts/
COPY src/SystemDesign.Web/ src/SystemDesign.Web/
RUN dotnet publish src/SystemDesign.Web/SystemDesign.Web.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "SystemDesign.Web.dll"]
