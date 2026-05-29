# Metsa Menetleja

A web application for forest enthusiasts that lets you explore any Estonian forest parcel by cadastre ID. Enter your land's cadastre code and the app fetches the official boundary, downloads a live aerial infrared map from the Estonian Land Board, and clips it to the exact shape of your parcel — giving you a clean satellite-style image of just your forest.

Future versions will use the clipped imagery to predict tree species composition and estimate stem counts using remote sensing models.

---

## What it does

```
User inputs cadastre ID
        │
        ▼
Fetch parcel boundary from Estonian Cadastre API (kolvikud.kataster.ee)
        │  GeoJSON polygon in EPSG:3301
        ▼
Calculate bounding box (min/max coordinates + 5% padding)
        │
        ▼
Download WMS aerial image from Estonian Land Board (xgis.maaamet.ee)
        │  CIR/NGR layer — colour infrared, good for vegetation analysis
        ▼
Clip image to exact cadastre polygon using SVG mask (sharp)
        │
        ▼
Display: cadastre info · original map · clipped parcel image
```

Progress is streamed to the browser in real time via Server-Sent Events so you can see each step as it happens.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | NestJS (TypeScript) |
| Frontend | React + Vite (TypeScript) + Tailwind CSS |
| Image processing | sharp (SVG polygon mask) |
| Map data | Estonian Land Board WMS — CIR/NGR layer, EPSG:3301 |
| Cadastre data | kolvikud.kataster.ee REST API |
| Real-time progress | Server-Sent Events (SSE) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- npm v9 or newer

---

## Getting started

### 1. Clone the repository

```bash
git clone <repo-url>
cd metsa-menetleja
```

### 2. Install dependencies

```bash
npm run install:all
```

This installs dependencies for both backend and frontend.

### 3. Start both servers

```bash
npm run dev
```

This starts both servers at once:
- **Backend** → http://localhost:3001 (NestJS, watch mode)
- **Frontend** → http://localhost:5173 (Vite)

### 4. Open the app

Go to **http://localhost:5173** in your browser.

Enter a cadastre code — for example `79501:027:0011` — and click **Analüüsi**.

---

## Using the app

1. Type or paste an Estonian cadastre unit code into the input field.
   The format is `XXXXX:XXX:XXXX` (e.g. `79501:027:0011`).
2. Click **Analüüsi** (Analyse).
3. Watch the live progress panel as the app works through each step.
4. Once complete, the results section shows:
   - **Cadastre info** — code, address, area, and bounding box coordinates
   - **Original aerial photo** — the full WMS tile covering the parcel
   - **Clipped parcel** — the aerial photo cut to the exact cadastre boundary, transparent outside

---

## Project structure

```
metsa-menetleja/
├── backend/
│   └── src/
│       ├── cadastre/
│       │   ├── cadastre.controller.ts   SSE endpoint GET /cadastre/analyze
│       │   ├── cadastre.service.ts      Fetch → BBOX → WMS → clip pipeline
│       │   └── cadastre.module.ts
│       ├── app.module.ts
│       └── main.ts                      Port 3001, CORS for localhost:5173
└── frontend/
    └── src/
        ├── App.tsx                      State machine + EventSource logic
        ├── components/
        │   ├── CadastreInput.tsx        Code input + submit button
        │   ├── ProgressSteps.tsx        Live SSE step display
        │   └── ResultsDisplay.tsx       Info card + two image panels
        └── index.css                    Tailwind + checkerboard utility
```

---

## API

### `GET /cadastre/analyze?code=<cadastre-code>`

Returns a Server-Sent Events stream. Each event is a JSON object:

| `step` | Description |
|---|---|
| `fetching` | Fetching parcel boundary from cadastre API |
| `bbox` | Calculating bounding box and padding |
| `downloading` | Downloading WMS aerial image |
| `clipping` | Applying polygon mask with sharp |
| `complete` | Done — `payload` contains the full result |
| `error` | Something went wrong — `message` contains the reason |

**Complete payload structure:**
```json
{
  "info": {
    "code": "79501:027:0011",
    "address": "Taara pst 2",
    "area": 1408,
    "bbox": { "minX": 658320.96, "minY": 6474148.07, "maxX": 658385.57, "maxY": 6474205.67 },
    "coordinates": [[[658365.01, 6474203.05], ...]]
  },
  "originalImage": "<base64 JPEG>",
  "clippedImage": "<base64 PNG>"
}
```

---

## Data sources

- **Cadastre boundaries** — [kolvikud.kataster.ee](https://kolvikud.kataster.ee) by Estonian Land Board (Maa-amet)
- **Aerial imagery** — [xgis.maaamet.ee](https://xgis.maaamet.ee) WMS service, `cir_ngr` layer (colour infrared), EPSG:3301 (L-EST97)
