# FitLog

Lokale Fitness-PWA für Gewicht, Supplements, Kalorien, Protein, Schritte, Wasser, Schlaf und Training.

## GitHub Pages veröffentlichen

1. Neues GitHub Repository erstellen, z. B. `fitlog`.
2. Den gesamten Inhalt dieses Ordners in die oberste Ebene des Repositories hochladen.
3. GitHub: **Settings → Pages**.
4. Unter **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Speichern.

Danach ist die App normalerweise erreichbar unter:

`https://DEIN-GITHUB-NAME.github.io/fitlog/`

Auf dem iPhone:
Safari → FitLog öffnen → Teilen → **Zum Home-Bildschirm**.

## Datenschutz

Die Fitnessdaten werden nicht in GitHub gespeichert. GitHub hostet nur die statischen App-Dateien.
Deine persönlichen Einträge liegen lokal in IndexedDB auf deinem Gerät.

Regelmäßig in FitLog unter **Ziele & Daten** ein JSON-Backup exportieren.
