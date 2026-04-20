param(
    [string]$TaskName = "PeopleCounterETL",
    [string]$RunAt = "06:00",
    [string]$RunnerScriptPath = (Join-Path -Path $PSScriptRoot -ChildPath "run_people_counter_etl.ps1"),
    [switch]$SingleZip,
    [switch]$VerboseLogging
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not ($RunAt -match "^([01]\d|2[0-3]):[0-5]\d$")) {
    throw "RunAt must use HH:mm (24h), for example 06:00"
}

$runnerResolved = (Resolve-Path -Path $RunnerScriptPath).Path

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $runnerResolved)
)
if ($SingleZip) {
    $arguments += "-SingleZip"
}
if ($VerboseLogging) {
    $arguments += "-VerboseLogging"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($arguments -join " ")
$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled task '$TaskName' created."
Write-Host "Runs daily at $RunAt using: $runnerResolved"
Write-Host "To test now: Start-ScheduledTask -TaskName '$TaskName'"
