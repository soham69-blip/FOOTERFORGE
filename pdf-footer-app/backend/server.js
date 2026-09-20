const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve built React frontend (production) ───────────────────────────────────
const frontendDist = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ── Temp uploads dir ──────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") return cb(null, true);
  cb(new Error("Only PDF files are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanup(...filePaths) {
  filePaths.forEach((p) => {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  });
}

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post("/upload", upload.single("pdf"), async (req, res) => {
  const inputPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded." });
    }

    const { name, enrollmentNumber, semester } = req.body;
    if (!name?.trim() || !enrollmentNumber?.trim() || !semester?.trim()) {
      cleanup(inputPath);
      return res.status(400).json({ error: "Name, Enrollment Number, and Semester are required." });
    }

    // ── Load & modify PDF ─────────────────────────────────────────────────────
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    // Format footer text components
    // Left: Name
    let leftText = name.trim();
    if (!/^name[\s:-]/i.test(leftText)) {
      leftText = `Name: ${leftText}`;
    }

    // Middle: Enrollment No
    let centerText = enrollmentNumber.trim();
    if (!/^(?:enrollment|enrolment)(?:\s*no\.?)?[\s:-]/i.test(centerText)) {
      centerText = `Enrollment No: ${centerText}`;
    }

    // Right: Semester
    let rightText = semester.trim();
    const semClean = rightText.replace(/^(?:semester|sem)[\s:-]*/i, "");
    rightText = `Semester: ${semClean || rightText}`;

    const footerHeight = 70; // Covers any existing footer line (such as Word's at 62pt) completely
    const baseFontSize = 10;

    for (const page of pages) {
      const { width } = page.getSize();
      const margin = Math.min(36, Math.max(16, width * 0.05));

      // Cover previous footer area and any existing separator line completely
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height: footerHeight,
        color: rgb(1, 1, 1),
      });

      // Exactly ONE clean divider line between page content and footer
      page.drawRectangle({
        x: 0,
        y: footerHeight - 0.75,
        width,
        height: 0.75,
        color: rgb(0.75, 0.75, 0.75),
      });

      // Calculate exact equal spacing between Name, Enrollment No, and Semester
      const availableWidth = width - 2 * margin;
      let fontSize = baseFontSize;
      let leftWidth = font.widthOfTextAtSize(leftText, fontSize);
      let centerWidth = font.widthOfTextAtSize(centerText, fontSize);
      let rightWidth = font.widthOfTextAtSize(rightText, fontSize);
      let gap = (availableWidth - (leftWidth + centerWidth + rightWidth)) / 2;

      while (fontSize > 6.5 && gap < 16) {
        fontSize -= 0.5;
        leftWidth = font.widthOfTextAtSize(leftText, fontSize);
        centerWidth = font.widthOfTextAtSize(centerText, fontSize);
        rightWidth = font.widthOfTextAtSize(rightText, fontSize);
        gap = (availableWidth - (leftWidth + centerWidth + rightWidth)) / 2;
      }

      const xLeft = margin;
      const xCenter = margin + leftWidth + gap;
      const xRight = xCenter + centerWidth + gap;
      const textY = Math.round((footerHeight - fontSize) / 2);

      // Draw Left: Name
      page.drawText(leftText, {
        x: xLeft,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });

      // Draw Middle: Enrollment No. (with equal spacing on both sides)
      page.drawText(centerText, {
        x: xCenter,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });

      // Draw Right: Semester
      page.drawText(rightText, {
        x: xRight,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    }

    const modifiedBytes = await pdfDoc.save();

    // ── Send download ─────────────────────────────────────────────────────────
    const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const downloadName = `${baseName}_modified.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.send(Buffer.from(modifiedBytes));

  } catch (err) {
    console.error("PDF processing error:", err);
    res.status(500).json({ error: "Failed to process PDF. Ensure the file is a valid, non-encrypted PDF." });
  } finally {
    cleanup(inputPath);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── SPA fallback (serve React for all non-API routes) ─────────────────────────
if (fs.existsSync(frontendDist)) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "File too large. Maximum size is 10 MB." });
  if (err.message === "Only PDF files are allowed")
    return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "An unexpected error occurred." });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Footer Changer running at http://localhost:${PORT}`);
  console.log(`   API: POST http://localhost:${PORT}/upload\n`);
});
