param([int]$TargetProcessId, [string]$OutputPath, [string]$StopPath)
$ErrorActionPreference = 'Stop'
$telemetryWatch = [Diagnostics.Stopwatch]::StartNew()
try {
    while ($telemetryWatch.Elapsed.TotalSeconds -lt 600 -and -not (Test-Path -LiteralPath $StopPath)) {
        $instances = @(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUProcessMemory |
            Where-Object { $_.Name -like "pid_${TargetProcessId}_*" } |
            Select-Object Name, DedicatedUsage, SharedUsage, TotalCommitted)
        $adapters = @(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory |
            Select-Object Name, DedicatedUsage, SharedUsage, TotalCommitted)
        $record = @{ elapsedSeconds = $telemetryWatch.Elapsed.TotalSeconds; utc = [DateTime]::UtcNow.ToString('o');
            processId = $TargetProcessId; processInstances = $instances; adapters = $adapters }
        [IO.File]::AppendAllText($OutputPath, ($record | ConvertTo-Json -Depth 5 -Compress) + "`n", [Text.UTF8Encoding]::new($false))
        Start-Sleep -Milliseconds 1000
    }
} catch {
    [IO.File]::AppendAllText($OutputPath, (@{error = $_.Exception.Message} | ConvertTo-Json -Compress) + "`n", [Text.UTF8Encoding]::new($false))
    exit 1
}
