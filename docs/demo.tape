# Terminal demo for the README. Re-record with: vhs docs/demo.tape
# Needs vhs (https://github.com/charmbracelet/vhs), a built copy (pnpm build),
# and local data from "uk-sponsors update" and "uk-sponsors enrich".
Output docs/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 450
Set Padding 20
Set Theme "GitHub Dark"
Set TypingSpeed 35ms

Hide
Type 'export PS1="$ " && alias uk-sponsors="node dist/cli.js" && clear'
Enter
Show

Type 'uk-sponsors check "Aire Logic Limited"'
Sleep 300ms
Enter
Sleep 3s
Hide
Type "clear"
Enter
Show

Type 'uk-sponsors search --city Leeds --route "Skilled Worker" --industry software --limit 7'
Sleep 300ms
Enter
Sleep 5s
