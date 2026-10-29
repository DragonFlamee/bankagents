param([string]$pptx, [string]$outDir)
$app = New-Object -ComObject PowerPoint.Application
$p = $app.Presentations.Open($pptx, $true, $false, $false)
$i = 1
foreach ($s in $p.Slides) { $s.Export((Join-Path $outDir ("s{0:D2}.png" -f $i)), "PNG", 1600, 900); $i++ }
$p.Close(); $app.Quit()
