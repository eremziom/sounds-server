param([int]$RootProcessId,[string]$OutputPath,[string]$PhasePath,[string]$StopPath)
$ErrorActionPreference='Stop'
$budgetWatch=[Diagnostics.Stopwatch]::StartNew()
$knownProcesses=[Collections.Generic.HashSet[int]]::new()
[void]$knownProcesses.Add($RootProcessId)
try {
    while ($budgetWatch.Elapsed.TotalSeconds -lt 1200 -and -not (Test-Path -LiteralPath $StopPath)) {
        $allProcesses=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PageFileUsage)
        $ownedProcesses=[Collections.Generic.HashSet[int]]::new()
        [void]$ownedProcesses.Add($RootProcessId)
        do {
            $addedProcess=$false
            foreach ($entry in $allProcesses) {
                if ($ownedProcesses.Contains([int]$entry.ParentProcessId) -and $ownedProcesses.Add([int]$entry.ProcessId)) {
                    [void]$knownProcesses.Add([int]$entry.ProcessId)
                    $addedProcess=$true
                }
            }
        } while ($addedProcess)
        $os=Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory,TotalVirtualMemorySize,FreeVirtualMemory
        $adapters=@(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory | Select-Object Name,DedicatedUsage,SharedUsage,TotalCommitted)
        $gpuProcesses=@(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUProcessMemory |
            Where-Object { $_.Name -match '^pid_(\d+)_' -and $knownProcesses.Contains([int]$Matches[1]) } |
            Select-Object Name,DedicatedUsage,SharedUsage,TotalCommitted)
        $phase=if(Test-Path -LiteralPath $PhasePath){[IO.File]::ReadAllText($PhasePath)}else{'starting'}
        $record=@{elapsedSeconds=$budgetWatch.Elapsed.TotalSeconds;utc=[DateTime]::UtcNow.ToString('o');phase=$phase;
            osKiB=$os;adapters=$adapters;gpuProcesses=$gpuProcesses;
            ownedProcesses=@($allProcesses | Where-Object {$ownedProcesses.Contains([int]$_.ProcessId)})}
        [IO.File]::AppendAllText($OutputPath,($record | ConvertTo-Json -Depth 6 -Compress)+"`n",[Text.UTF8Encoding]::new($false))
        Start-Sleep -Milliseconds 1000
    }
} catch {
    [IO.File]::AppendAllText($OutputPath,(@{error=$_.Exception.Message} | ConvertTo-Json -Compress)+"`n",[Text.UTF8Encoding]::new($false))
    exit 1
}
