# Footer Changer — Universal Document to PDF Footer Replacer

A full-stack web application that converts documents in various formats (Word `.docx`/`.doc`, plain text `.txt`/`.md`, images `.png`/`.jpg`/`.webp`, or native `.pdf`) into PDF and stamps custom name, enrollment number, and semester across the bottom of every page.

## Tech Stack

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Frontend  | React 19 + Vite                              |
| Backend   | Node.js + Express                            |
| Converter | Mammoth, Headless Edge / Chrome, LibreOffice |
| PDF       | pdf-lib                                      |
| Uploads   | Multer (multipart/form-data)                 |

---

## Project Structure

```
pdf-footer-app/
├── backend/
│   ├── server.js          # Express API & stamping engine
│   ├── converter.js       # Universal document converter
│   ├── uploads/           # Temp storage (auto-cleaned)
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx        # Main React component
    │   ├── App.css        # Styles & format badges
    │   ├── main.jsx       # Entry point
    │   └── index.css      # Design system
    ├── vite.config.js     # Vite config + dev proxy
    └── package.json
```

---

## Running Locally

### Prerequisites
- Node.js v18+ (tested on v22+)
- npm

### 1. Install & start the backend

```bash
cd backend
npm install
node server.js
# → Server running at http://localhost:5000
```

### 2. Install & start the frontend (dev mode)

```bash
cd frontend
npm install
npm run dev
# → App running at http://localhost:5173
```

> The Vite dev server proxies `/upload` and `/health` to `localhost:5000` automatically.

### 3. Production build — single server

```bash
# Build the frontend
cd frontend && npm run build

# Run only the backend — it serves the built frontend too
cd ../backend && node server.js
# → Open http://localhost:5000
```

---

## API Reference

### `POST /upload`

Accepts a multipart/form-data request.

| Field             | Type   | Required | Description                                                    |
|-------------------|--------|----------|----------------------------------------------------------------|
| `file` or `pdf`   | File   | ✅       | Document file (`.docx`, `.doc`, `.pdf`, `.png`, `.jpg`, `.txt`) (max 25 MB) |
| `name`            | String | ✅       | Name for left of footer                                        |
| `enrollmentNumber`| String | ✅       | Enrollment number for center                                   |
| `semester`        | String | ✅       | Semester for right of footer                                   |

**Success response:** Binary PDF file download (`Content-Type: application/pdf`)

**Error responses:**

| Status | Reason                                                        |
|--------|---------------------------------------------------------------|
| 400    | Missing file, name, enrollment number, or semester; invalid format |
| 413    | File exceeds 25 MB                                            |
| 500    | Processing failure                                            |

### `GET /health`

Returns `{ "status": "ok" }`.

---

## How It Works

1. **Auto-Conversion**:
   - If a Word `.docx` is uploaded, it is converted via Mammoth to structured semantic HTML, then printed to PDF via headless browser (or LibreOffice).
   - If an image (`.png`, `.jpg`) is uploaded, it is embedded onto an A4 page with clearance for the footer.
   - If a text file (`.txt`, `.md`) is uploaded, it is converted to clean paginated text.
   - If already a PDF, it is processed directly.
2. **Footer Stamping**:
   - Covers the bottom 70pt with a clean white zone.
   - Adds a clean separator line.
   - Renders the 3-section footer layout:
     - **Left**: `Name: <name>`
     - **Middle**: `Enrollment No: <enrollmentNumber>`
     - **Right**: `Semester: <semester>`
   - Automatically calculates gap spacing and dynamically scales font size to fit.

---

## Environment Variables

| Variable | Default | Description         |
|----------|---------|---------------------|
| `PORT`   | `5000`  | Backend server port |
