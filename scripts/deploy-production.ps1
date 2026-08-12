$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:VITE_CLERK_PUBLISHABLE_KEY)) {
  throw "VITE_CLERK_PUBLISHABLE_KEY must be injected before deployment"
}

if (-not $env:VITE_CLERK_PUBLISHABLE_KEY.StartsWith("pk_")) {
  throw "VITE_CLERK_PUBLISHABLE_KEY has an invalid format"
}

flyctl deploy `
  --app creatoros-app `
  --remote-only `
  --release-command-timeout 10m `
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY=$env:VITE_CLERK_PUBLISHABLE_KEY"
