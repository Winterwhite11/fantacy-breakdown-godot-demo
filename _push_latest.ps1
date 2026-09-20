Set-Location (Join-Path $env:USERPROFILE "Desktop\Fantacy Breakdown\godot-demo")

# do not commit local helper scripts if any
Remove-Item -Force "html-demo\_open_demo.ps1" -ErrorAction SilentlyContinue

git add -A
git status --short

git commit -m @"
Ship HTML demo run loop: events, Hard ice-fire loot, extract, and save.

Add IS-style events, backpack/collectible hall, Hard pool with fixed purple drops, corner extract anytime, and localStorage run progress; restore compact map node icons.
"@

if ($LASTEXITCODE -ne 0) {
  Write-Output "COMMIT_FAILED=$LASTEXITCODE"
  exit $LASTEXITCODE
}

git push -u origin main
Write-Output "PUSH_EXIT=$LASTEXITCODE"
git status -sb
git log -1 --oneline
