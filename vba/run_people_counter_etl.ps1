param(
    [switch]$SingleZip,
    [switch]$VerboseLogging,
    [string]$PythonExe = "python",
    [string]$EnvFile = ".env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
    param([string]$Path)

    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            return
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()

        if ((($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or (($value.StartsWith("'")) -and ($value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $scriptFolder

$envPath = Join-Path -Path $scriptFolder -ChildPath $EnvFile
if (Test-Path -Path $envPath) {
    Import-DotEnv -Path $envPath
}

if ($PythonExe -eq "python") {
    $venvPython = Join-Path -Path $scriptFolder -ChildPath ".venv\Scripts\python.exe"
    if (Test-Path -Path $venvPython) {
        $PythonExe = $venvPython
    }
}

if (-not (Get-Command -Name $PythonExe -ErrorAction SilentlyContinue)) {
    Write-Error "Python executable not found: $PythonExe"
    exit 2
}

$logFolder = Join-Path -Path $scriptFolder -ChildPath "runtime\logs"
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path -Path $logFolder -ChildPath "etl_run_$timestamp.log"

$arguments = @("people_counter_etl.py", "run")
if ($SingleZip) {
    $arguments += "--single-zip"
}
if ($VerboseLogging) {
    $arguments += "--verbose"
}

Write-Host "Running People Counter ETL..."
Write-Host "Python: $PythonExe"
Write-Host "Arguments: $($arguments -join ' ')"
Write-Host "Log file: $logFile"

& $PythonExe @arguments 2>&1 | Tee-Object -FilePath $logFile
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Error "ETL failed with exit code $exitCode"
    exit $exitCode
}

Write-Host "ETL finished successfully."
exit 0
