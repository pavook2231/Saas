param(
  [string]$Label = '',
  [string]$BackupRoot = ''
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $BackupRoot = Join-Path (Split-Path -Parent $repoRoot) 'backups\saas-platform'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$head = (git -C $repoRoot rev-parse --short HEAD).Trim()
$safeLabel = ($Label -replace '[^a-zA-Z0-9_-]+', '-').Trim('-')
$tag = if ([string]::IsNullOrWhiteSpace($safeLabel)) {
  "backup-$stamp-$head"
} else {
  "backup-$stamp-$safeLabel-$head"
}

$backupDir = Join-Path $BackupRoot $stamp
$snapshotDir = Join-Path $backupDir 'working-tree'

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null

git -C $repoRoot tag -a $tag -m "Rollback point $tag" | Out-Null
git -C $repoRoot bundle create (Join-Path $backupDir 'repo.bundle') --all | Out-Null
git -C $repoRoot status --short | Out-File -Encoding utf8 (Join-Path $backupDir 'status.txt')
git -C $repoRoot log -1 --stat | Out-File -Encoding utf8 (Join-Path $backupDir 'head.txt')
git -C $repoRoot diff HEAD | Out-File -Encoding utf8 (Join-Path $backupDir 'working-tree.patch')
git -C $repoRoot ls-files --others --exclude-standard | Out-File -Encoding utf8 (Join-Path $backupDir 'untracked.txt')

$restoreNotes = @"
BACKUP TAG: $tag
BACKUP DIR: $backupDir

Quick restore options:
1. Git rollback to the tagged commit:
   git checkout $tag

2. Clone from bundle:
   git clone "$backupDir\repo.bundle" saas-platform-restore

3. Restore the exact source snapshot from:
   $snapshotDir

4. Review tracked worktree changes captured in:
   $backupDir\working-tree.patch
"@

$restoreNotes | Out-File -Encoding utf8 (Join-Path $backupDir 'RESTORE.txt')

robocopy $repoRoot $snapshotDir /E /XD .git node_modules .next dist coverage .turbo | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Robocopy failed with exit code $LASTEXITCODE"
}

Write-Output "BACKUP_DIR=$backupDir"
Write-Output "BACKUP_TAG=$tag"
