param([ValidateSet('setup','cleanup','list-qa-mobile','experience','memories','browser-fixture')][string]$Action)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$projectRef = 'uyhavkmjvfaeoapzoobh'
$secretKey = $null
$apiKeys = $null
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $lines = & npx supabase projects api-keys --remote=$projectRef --reveal --output-format json 2>$null
  $cliExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($cliExitCode -ne 0) { throw 'Could not read the staging secret API key from the authenticated CLI.' }
  $apiKeys = ($lines -join "`n") | ConvertFrom-Json
  $secretKey = ($apiKeys.keys | Where-Object { $_.type -eq 'secret' -and $_.name -eq 'default' } | Select-Object -First 1).api_key
  if (-not $secretKey.StartsWith('sb_secret_')) { throw 'Staging secret API key was not available.' }
  $env:SUPABASE_STAGING_SECRET_KEY = $secretKey
  if ($Action -eq 'experience') { & node scripts/staging-experience-smoke.mjs }
  elseif ($Action -eq 'memories') { & node scripts/staging-memories-smoke.mjs }
  elseif ($Action -eq 'browser-fixture') { & node scripts/staging-memories-browser-fixture.mjs }
  else { & node scripts/staging-mobile-users.mjs $Action }
  if ($LASTEXITCODE -ne 0) { throw 'The staging mobile account operation failed.' }
} finally {
  Remove-Item Env:SUPABASE_STAGING_SECRET_KEY -ErrorAction SilentlyContinue
  $env:SUPABASE_QA_USER_IDS = $null
  $secretKey = $null
  $apiKeys = $null
  $lines = $null
}
