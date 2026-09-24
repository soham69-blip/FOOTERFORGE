const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { convertToPdf } = require("./converter");

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

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

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".md",
  ".rtf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const isPdf = ext === ".pdf" || mime === "application/pdf";
  const isDocx = [".docx", ".doc"].includes(ext) || mime.includes("wordprocessingml") || mime.includes("msword");
  const isText = [".txt", ".md", ".rtf"].includes(ext) || mime.startsWith("text/");
  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) || mime.startsWith("image/");

  if (isPdf || isDocx || isText || isImage || ALLOWED_EXTENSIONS.has(ext)) {
    return cb(null, true);
  }

  cb(
    new Error(
      "Unsupported file format. Please upload a PDF, Word document (.docx, .doc), text file (.txt, .md), or image (.png, .jpg, .webp)."
    ),
    false
  );
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Middleware accepting either field name 'pdf' or 'file'
const uploadMiddleware = (req, res, next) => {
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);
    if (req.files?.pdf?.[0]) {
      req.file = req.files.pdf[0];
    } else if (req.files?.file?.[0]) {
      req.file = req.files.file[0];
    }
    next();
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanup(...filePaths) {
  filePaths.forEach((p) => {
    try {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {}
  });
}

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post("/upload", uploadMiddleware, async (req, res) => {
  const inputPath = req.file?.path;
  let intermediateCleanup = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document file uploaded." });
    }

    const { name, enrollmentNumber, semester } = req.body;
    if (!name?.trim() || !enrollmentNumber?.trim() || !semester?.trim()) {
      cleanup(inputPath);
      return res.status(400).json({ error: "Name, Enrollment Number, and Semester are required." });
    }

    // ── Universal conversion (DOCX / Image / Text -> PDF) ────────────────────
    const conversionResult = await convertToPdf(
      inputPath,
      req.file.originalname,
      req.file.mimetype,
      uploadsDir
    );

    const pdfPathToProcess = conversionResult.pdfPath;
    intermediateCleanup = conversionResult.cleanup;

    // ── Load & modify PDF ─────────────────────────────────────────────────────
    const pdfBytes = fs.readFileSync(pdfPathToProcess);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    if (pages.length === 0) {
      throw new Error("Document produced an empty PDF with no pages.");
    }

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

    const footerHeight = 70; // Covers any existing footer line completely
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

      // Draw Middle: Enrollment No.
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
    console.error("Document processing error:", err);
    res.status(500).json({
      error: err.message || "Failed to process document. Please ensure the file is valid and not corrupted.",
    });
  } finally {
    if (typeof intermediateCleanup === "function") intermediateCleanup();
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
    return res.status(413).json({ error: "File too large. Maximum size is 25 MB." });
  if (err.message && err.message.includes("Unsupported file format"))
    return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err.message || "An unexpected error occurred." });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Footer Changer running at http://localhost:${PORT}`);
  console.log(`   API: POST http://localhost:${PORT}/upload\n`);
});
