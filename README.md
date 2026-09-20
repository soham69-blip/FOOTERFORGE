# FOOTERFORGE — PDF Footer Replacer

A modern full-stack web application that dynamically covers and replaces the footer on every page of a PDF document with custom student/user details (Name, Enrollment Number, and Semester) with automatic spacing and font scaling.

---

## Features

- **Automated Footer Replacement**: Overlays a clean white zone and divider line across the bottom of every page to conceal existing footers.
- **Three-Section Balanced Layout**:
  - **Left**: `Name: <name>`
  - **Middle**: `Enrollment No: <enrollmentNumber>`
  - **Right**: `Semester: <semester>`
- **Smart Auto-Scaling**: Dynamically computes text width and adjusts font size so text never clips or overlaps, even with long entries.
- **Live Interactive Preview**: Instant real-time footer preview in the browser before processing.
- **Direct PDF Processing**: High-performance, memory-efficient PDF manipulation using `pdf-lib` without quality loss.
- **Privacy-First**: Uploaded files are processed in-memory / temporary storage and immediately cleaned up after processing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Vanilla CSS |
| **Backend** | Node.js, Express |
| **PDF Engine** | `pdf-lib` |
| **File Handling** | Multer (multipart/form-data) |

---

## Project Structure

```
FOOTERFORGE/
├── README.md
├── .gitignore
└── pdf-footer-app/
    ├── backend/
    │   ├── server.js          # Express API & PDF stamping engine
    │   ├── uploads/           # Temp storage (auto-cleaned)
    │   └── package.json
    └── frontend/
        ├── src/
        │   ├── App.jsx        # Main application component
        │   ├── App.css        # Styles & responsive design
        │   ├── main.jsx       # React entry point
        │   └── index.css      # Design system & tokens
        ├── vite.config.js     # Vite configuration & dev proxy
        └── package.json
```

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (tested on v22+)
- `npm`

### 1. Backend Setup

```bash
cd pdf-footer-app/backend
npm install
node server.js
```
The server will run at `http://localhost:5000`.

### 2. Frontend Setup

In a new terminal:

```bash
cd pdf-footer-app/frontend
npm install
npm run dev
```
The frontend will start at `http://localhost:5173` (proxies `/upload` and `/health` to `http://localhost:5000`).

### 3. Integrated Production Mode

Build the frontend assets and let the Express server serve the unified application:

```bash
cd pdf-footer-app/frontend
npm run build

cd ../backend
node server.js
```
Open `http://localhost:5000` in your browser.

---

## API Reference

### `POST /upload`
Multipart form-data endpoint to stamp footer onto an uploaded PDF.

| Field | Type | Required | Description |
|---|---|---|---|
| `pdf` | File | Yes | PDF file (max 10 MB) |
| `name` | String | Yes | Name for left footer section |
| `enrollmentNumber` | String | Yes | Enrollment number for center section |
| `semester` | String | Yes | Semester for right footer section |

**Response**: Binary PDF file download (`Content-Type: application/pdf`).

### `GET /health`
Health check endpoint.
```json
{ "status": "ok" }
```

---

## License

MIT
