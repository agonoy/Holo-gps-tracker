# Holoholo GPS Tracker

Holoholo GPS Tracker is now a fully static, local-only ride tracker that runs on GitHub Pages with no backend setup.

Your rides, trail profiles, and saved trails are stored in the browser with `localStorage`. Nothing is sent to Firebase or any other remote database.

## What Changed

- Firebase Auth was removed
- Firestore persistence was replaced with browser storage
- The app now works on GitHub Pages without backend credentials
- Ride history, tracker profiles, and saved trails persist on the current browser/device

## Run Locally

Prerequisite: Node.js 20+

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deploying To GitHub Pages

Push the branch to GitHub and let the existing Pages workflow build the app. The Vite base path is already configured for:

`https://agonoy.github.io/Holoholo-GPS-Tracker/`

## Local-Only Storage Notes

- Data is stored in this browser only
- Clearing browser storage will remove saved data
- Data does not sync across devices automatically
- GPX and KML export still work for saved trails

## Current Behavior

- Start and stop rides locally
- Save named tracker profiles
- Save and follow trails
- Export trails as GPX or KML
- Continue to use browser geolocation and reverse geocoding

## Development Notes

- Main app: [src/App.tsx](src/App.tsx)
- Local persistence helpers: [src/lib/localData.ts](src/lib/localData.ts)
- Map rendering: [src/components/Map.tsx](src/components/Map.tsx)
