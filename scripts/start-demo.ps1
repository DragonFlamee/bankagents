param([int]$Port = 8765, [string]$DataDir = 'data/user-demo-20261021', [switch]$Background)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configNames = @('TRACEBANK_PLANNER','TRACEBANK_LLM_BASE_URL','TRACEBANK_LLM_MODEL','TRACEBANK_LLM_API_KEY','TRACEBANK_LLM_ENABLE_THINKING','TRACEBANK_LLM_THINKING_BUDGET','TRACEBANK_LLM_RESPONSE_FORMAT')
foreach ($configName in $configNames) {
    if (-not [Environment]::GetEnvironmentVariable($configName, 'Process')) {
        $userValue = [Environment]::GetEnvironmentVariable($configName, 'User')
        if ($userValue) { [Environment]::SetEnvironmentVariable($configName, $userValue, 'Process') }
    }
}
$pythonPath = Join-Path $projectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Install the project .venv first as described in README.md.' }
$dataPath = if ([IO.Path]::IsPathRooted($DataDir)) { $DataDir } else { Join-Path $projectRoot $DataDir }
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$arguments = @('-m','banking_agent','--host','127.0.0.1','--port',"$Port",'--data-dir',$dataPath)
if ($Background) {
    $backgroundArguments = @('-m','banking_agent','--host','127.0.0.1','--port',"$Port",'--data-dir',('"' + $dataPath + '"'))
    $started = Start-Process -FilePath $pythonPath -ArgumentList $backgroundArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.stdout.log') -RedirectStandardError (Join-Path $dataPath 'server.stderr.log') -PassThru
    [pscustomobject]@{ProcessId=$started.Id; Url="http://127.0.0.1:$Port"; Planner=$env:TRACEBANK_PLANNER; Model=$env:TRACEBANK_LLM_MODEL}
} else {
    Push-Location $projectRoot
    try { & $pythonPath @arguments } finally { Pop-Location }
}
