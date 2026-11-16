$ErrorActionPreference = 'Stop'
$projectRef = 'uyhavkmjvfaeoapzoobh'
$apiKeys = $null
$adminKey = $null

try {
  # The CLI writes an informational "Target: ..." line to stderr; with 'Stop' Windows PowerShell 5.1 turns it into a terminating error.
  $ErrorActionPreference = 'Continue'
  $jsonLines = & npx supabase projects api-keys --remote=$projectRef --reveal --output-format json 2>$null
  $cliExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($cliExitCode -ne 0) { throw 'Supabase CLI cannot reveal the staging secret API key. Grant api_gateway_keys_secret_read or run this test from an authorized Supabase CLI session.' }
  $apiKeys = ($jsonLines -join "`n") | ConvertFrom-Json
  $adminKey = ($apiKeys.keys | Where-Object { $_.type -eq 'secret' -and $_.name -eq 'default' } | Select-Object -First 1).api_key
  if (-not $adminKey -or -not $adminKey.StartsWith('sb_secret_')) { throw 'No new-format staging secret API key was available; no test users were created.' }

  $env:SUPABASE_STAGING_SECRET_KEY = $adminKey
  & node scripts/test-staging-auth-rls.mjs
  if ($LASTEXITCODE -ne 0) { throw 'The staging auth/RLS test runner failed. Review the assertion output; temporary records are cleaned in its finally block.' }
} finally {
  Remove-Item Env:SUPABASE_STAGING_SECRET_KEY -ErrorAction SilentlyContinue
  $adminKey = $null
  $apiKeys = $null
  $jsonLines = $null
}
