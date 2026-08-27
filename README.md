# FitLog 3.0

Lokale Fitness-PWA für Gewicht, Ernährung, Supplements, Workouts und Kraftentwicklung.

## Erweiterung in Version 3.0
- Workout-Vorlagen speichern, starten und löschen
- Vorlagen übernehmen auf Wunsch die letzte Satzstruktur
- letzte Leistung direkt bei jeder Übung im Workout
- frei definierbarer Wiederholungsbereich pro Übung
- frei definierbarer Gewichtssprung pro Übung
- automatische Progressionshinweise
- persönliche Bestleistungen / PR-Übersicht
- Pausentimer mit 60, 90 oder 120 Sekunden
- Pausentimer bleibt anhand des Endzeitpunkts auch nach App-Wechsel korrekt
- e1RM-, Top-Gewicht-, Volumen- und Wiederholungsdiagramme
- JSON-Backup enthält Workout-Vorlagen
- bestehende Daten aus FitLog 2.0 bleiben beim Datenbank-Upgrade erhalten

## GitHub aktualisieren
Entpacke dieses ZIP und lade **alle enthaltenen Dateien** in dein bestehendes `fitlog`-Repository. Vorhandene Dateien ersetzen.

GitHub Pages bleibt unverändert:
Settings → Pages → Deploy from a branch → main → /(root)

Danach auf dem iPhone:
1. FitLog in Safari öffnen.
2. Seite neu laden.
3. Home-Screen-App vollständig schließen und erneut öffnen, falls noch die alte Version angezeigt wird.

## Datenschutz
GitHub hostet nur die statischen App-Dateien. Deine persönlichen Fitnessdaten liegen lokal in IndexedDB auf deinem Gerät.
Vor Updates am besten unter „Ziele & Daten“ ein JSON-Backup exportieren.
