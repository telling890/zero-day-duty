# Store Page Copy (English)

> Paste into Steamworks → Store Page. Character limits are noted.

## Name

```
Zero-Day Duty
```

## Short Description (≤300 characters)

```
You are the only security analyst on the night shift. 10 hours, 6 attack chains, 6 action points per turn. Investigate, contain, eradicate, recover — in that order.
```

## About This Game

```
All six attack chains have to be dead by 08:00. And the company still has to be open.

Zero-Day Duty is a turn-based security operations game about trade-offs. You are the sole
night-shift analyst at a fictional company. You clock in at 22:00, you report at 08:00, and
you get ten hours of actions — six action points per turn.

■ Four steps. Skip one and it does not count.
Investigate → Contain → Eradicate → Recover. Isolate a host and stop there, and the incident
stays open (and your score drops). Eradicate the root cause but leave the service down, and
revenue keeps bleeding. You can also lose by over-defending: if availability stays too low
for three turns, the business collapses before the attackers do.

■ Three ways to play, one set of rules
- Mouse: click alerts and action buttons, think as you go
- Terminal: press ` and type scan PC-01 / isolate PC-01 / clean PC-01, with Tab completion and history
- Scripts: press C and write a few lines of ZDD Script (a small Python-like language) to handle a whole chain at once
All three spend the same action points and money. There are no free shortcuts, and scripts
will not tell you which alert is a false positive.

■ Every decision costs something
Isolation cuts a service. Shutdown kills revenue. Hardening eats budget. Story decisions in
turns 4, 5 and 7 list only their immediate cost — the real consequence may show up two turns later.

■ A night you can replay exactly
Same seed plus same difficulty produces the same events. Great for comparing approaches,
and for running the same scenario in a classroom.

■ Built for first-timers too
A 15-page illustrated tutorial plus a 6-step guided drill: the screen dims, a spotlight rings
the exact control, and you practise all three input methods — click, command, script.

■ This is fiction
All companies, people, IPs, domains, alerts and data are invented. The game never touches a
real network, never runs system commands, and collects no user data.
```

## Key Features

```
Turn-based SOC gameplay: 10 turns, 6 attack chains, 6 AP per turn
Full incident lifecycle: investigate → contain → eradicate → recover
Three input methods: mouse, terminal commands, ZDD Script automation
Risk and false positives: investigate to learn the truth and the likely next hop
Economic trade-offs: isolation cuts service, hardening costs budget
Deterministic runs: same seed + difficulty, same outcome
```

## Privacy Policy (required field)

```
This game collects no personal data. It runs fully offline, contacts no servers, and writes
saves only to the saves folder next to the executable.
```

## Developer blurb (optional)

```
A one-person project: rules, pixel UI, and the embedded script interpreter were all written
for this game. It started as a way to explain why incident response has to happen in order,
and grew into a full turn-based game.
```
