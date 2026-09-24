const fs = require("fs");
const path = require("path");
const { execFile, execSync } = require("child_process");
const mammoth = require("mammoth");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

/**
 * Locate a headless browser binary (Edge, Chrome, or Chromium) across platforms.
 */
function findBrowserExecutable() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidates = [];

  if (process.platform === "win32") {
    const progFiles86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const progFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const localAppData = process.env["LOCALAPPDATA"] || "";

    candidates.push(
      path.join(progFiles86, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(progFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(progFiles, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(progFiles86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localAppData, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    // Linux / Render / Docker
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }

  // Last-ditch check via PATH
  try {
    const whichCmd = process.platform === "win32" ? "where msedge || where chrome" : "which google-chrome || which chromium || which chromium-browser";
    const out = execSync(whichCmd, { stdio: ["pipe", "pipe", "ignore"], encoding: "utf8" });
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch (_) {}

  return null;
}

/**
 * Locate LibreOffice soffice binary if available.
 */
function findLibreOffice() {
  if (process.env.SOFFICE_PATH && fs.existsSync(process.env.SOFFICE_PATH)) {
    return process.env.SOFFICE_PATH;
  }

  const candidates = [];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    );
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
  } else {
    candidates.push("/usr/bin/soffice", "/usr/bin/libreoffice");
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const whichCmd = process.platform === "win32" ? "where soffice" : "which soffice";
    const out = execSync(whichCmd, { stdio: ["pipe", "pipe", "ignore"], encoding: "utf8" });
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch (_) {}

  return null;
}

/**
 * Convert HTML string to PDF using Headless Edge/Chrome.
 */
function htmlToPdfViaBrowser(htmlContent, outputPath, uploadsDir) {
  return new Promise((resolve, reject) => {
    const browserBin = findBrowserExecutable();
    if (!browserBin) {
      return reject(new Error("No headless browser (Edge/Chrome) found for HTML to PDF conversion."));
    }

    const tempHtml = path.join(uploadsDir, `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tempHtml, htmlContent, "utf8");

    const fileUrl = `file:///${tempHtml.replace(/\\/g, "/")}`;
    const args = [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      `--print-to-pdf=${outputPath}`,
      fileUrl,
    ];

    execFile(browserBin, args, { timeout: 30000 }, (err) => {
      try { if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml); } catch (_) {}
      if (err) return reject(err);
      if (!fs.existsSync(outputPath)) {
        return reject(new Error("Headless browser failed to produce output PDF."));
      }
      resolve(outputPath);
    });
  });
}

/**
 * Convert document to PDF using LibreOffice headless.
 */
function convertViaLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const sofficeBin = findLibreOffice();
    if (!sofficeBin) {
      return reject(new Error("LibreOffice not found."));
    }

    const args = ["--headless", "--convert-to", "pdf", "--outdir", outputDir, inputPath];
    execFile(sofficeBin, args, { timeout: 45000 }, (err) => {
      if (err) return reject(err);
      const base = path.basename(inputPath, path.extname(inputPath));
      const expectedPdf = path.join(outputDir, `${base}.pdf`);
      if (fs.existsSync(expectedPdf)) return resolve(expectedPdf);
      reject(new Error("LibreOffice conversion finished but output PDF was not found."));
    });
  });
}

/**
 * Pure pdf-lib fallback: render extracted text cleanly onto A4 PDF pages.
 */
async function renderTextToPdf(text, outputPath) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 pt
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;
  const bottomMargin = 85; // leaves 70pt space for footer + 15pt buffer
  const fontSize = 10.5;
  const lineHeight = 15;

  const rawLines = text.split(/\r?\n/);
  const wrappedLines = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      wrappedLines.push({ text: "", isHeading: false });
      continue;
    }

    const isHeading = rawLine.startsWith("#") || (rawLine.length < 60 && /^[A-Z0-9\s:.-]{4,}$/.test(rawLine.trim()));
    const cleanText = rawLine.replace(/^#+\s*/, "");
    const words = cleanText.split(" ");
    let curLine = "";

    for (const w of words) {
      const testLine = curLine ? `${curLine} ${w}` : w;
      const curFont = isHeading ? boldFont : font;
      const wWidth = curFont.widthOfTextAtSize(testLine, isHeading ? 13 : fontSize);

      if (wWidth > contentWidth && curLine) {
        wrappedLines.push({ text: curLine, isHeading });
        curLine = w;
      } else {
        curLine = testLine;
      }
    }
    if (curLine) wrappedLines.push({ text: curLine, isHeading });
  }

  let curPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const item of wrappedLines) {
    const itemHeight = item.isHeading ? 22 : lineHeight;
    if (y - itemHeight < bottomMargin) {
      curPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    if (item.text) {
      curPage.drawText(item.text, {
        x: margin,
        y,
        size: item.isHeading ? 13 : fontSize,
        font: item.isHeading ? boldFont : font,
        color: item.isHeading ? rgb(0.1, 0.1, 0.1) : rgb(0.18, 0.18, 0.18),
      });
    }

    y -= itemHeight;
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}

/**
 * Convert Image (PNG, JPG, JPEG, WEBP) to A4 PDF with bottom footer clearance.
 */
async function convertImageToPdf(imagePath, outputPath) {
  const ext = path.extname(imagePath).toLowerCase();
  const pdfDoc = await PDFDocument.create();
  const imgBytes = fs.readFileSync(imagePath);

  let image;
  if (ext === ".jpg" || ext === ".jpeg") {
    image = await pdfDoc.embedJpg(imgBytes);
  } else if (ext === ".png") {
    image = await pdfDoc.embedPng(imgBytes);
  } else {
    // For other formats like WEBP, attempt embedJpg/Png or throw
    try {
      image = await pdfDoc.embedPng(imgBytes);
    } catch (_) {
      image = await pdfDoc.embedJpg(imgBytes);
    }
  }

  const pageWidth = 595.28; // A4 pt
  const pageHeight = 841.89;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const marginX = 36;
  const marginTop = 36;
  const marginBottom = 85; // Leave 70pt for footer + 15pt margin
  const availW = pageWidth - 2 * marginX;
  const availH = pageHeight - marginTop - marginBottom;

  const { width: imgW, height: imgH } = image.scale(1);
  const scale = Math.min(availW / imgW, availH / imgH, 1);

  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = marginX + (availW - drawW) / 2;
  const drawY = marginBottom + (availH - drawH) / 2;

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}

/**
 * Main universal converter function.
 * Accepts any supported document/image/text file and converts it to a standard PDF.
 * Returns { pdfPath, isConverted, cleanup: () => void }
 */
async function convertToPdf(inputPath, originalFilename, mimeType, uploadsDir) {
  const ext = path.extname(originalFilename || inputPath).toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();

  // 1. If already PDF, pass-through directly
  if (ext === ".pdf" || lowerMime === "application/pdf") {
    return {
      pdfPath: inputPath,
      isConverted: false,
      cleanup: () => {},
    };
  }

  const intermediatePdf = path.join(uploadsDir, `converted-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  const cleanupFn = () => {
    try { if (fs.existsSync(intermediatePdf)) fs.unlinkSync(intermediatePdf); } catch (_) {}
  };

  // 2. Images: PNG, JPG, JPEG, WEBP, BMP
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext) || lowerMime.startsWith("image/")) {
    try {
      await convertImageToPdf(inputPath, intermediatePdf);
      return { pdfPath: intermediatePdf, isConverted: true, cleanup: cleanupFn };
    } catch (err) {
      cleanupFn();
      throw new Error(`Failed to convert image to PDF: ${err.message}`);
    }
  }

  // 3. Plain text / Markdown / CSV / Log
  if ([".txt", ".md", ".csv", ".log", ".rtf"].includes(ext) || lowerMime.startsWith("text/")) {
    try {
      const text = fs.readFileSync(inputPath, "utf8");
      // Try HTML printing first for best styling, fallback to pure text layout
      const browserBin = findBrowserExecutable();
      if (browserBin) {
        const safeHtml = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 20mm 20mm 28mm 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.65;
      color: #1a1a1a;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
    }
  </style>
</head>
<body>${safeHtml}</body>
</html>`;
        await htmlToPdfViaBrowser(styledHtml, intermediatePdf, uploadsDir);
      } else {
        await renderTextToPdf(text, intermediatePdf);
      }
      return { pdfPath: intermediatePdf, isConverted: true, cleanup: cleanupFn };
    } catch (err) {
      cleanupFn();
      throw new Error(`Failed to convert text document to PDF: ${err.message}`);
    }
  }

  // 4. Word Documents: DOCX, DOC
  if ([".docx", ".doc"].includes(ext) || lowerMime.includes("wordprocessingml") || lowerMime.includes("msword")) {
    // Strategy A: Try LibreOffice if available
    if (findLibreOffice()) {
      try {
        const converted = await convertViaLibreOffice(inputPath, uploadsDir);
        return {
          pdfPath: converted,
          isConverted: true,
          cleanup: () => {
            try { if (fs.existsSync(converted)) fs.unlinkSync(converted); } catch (_) {}
          },
        };
      } catch (loErr) {
        console.warn("LibreOffice conversion failed, falling back to Mammoth pipeline:", loErr.message);
      }
    }

    // Strategy B: Mammoth (DOCX -> HTML) + Headless Edge/Chrome
    try {
      const { value: bodyHtml } = await mammoth.convertToHtml({ path: inputPath });
      const browserBin = findBrowserExecutable();

      if (browserBin && bodyHtml && bodyHtml.trim().length > 0) {
        const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: A4;
      margin: 20mm 20mm 28mm 20mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      font-weight: 700;
      margin-top: 1.2em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    h1 { font-size: 1.7rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
    h2 { font-size: 1.35rem; }
    h3 { font-size: 1.15rem; }
    p { margin: 0.75em 0; }
    ul, ol { margin: 0.75em 0; padding-left: 1.6em; }
    li { margin: 0.3em 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.2em 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
    }
    tr:nth-child(even) td {
      background: #fafafa;
    }
    img {
      max-width: 100%;
      height: auto;
      margin: 1em auto;
      display: block;
    }
    blockquote {
      border-left: 4px solid #3b82f6;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #475569;
      background: #f8fafc;
    }
    pre, code {
      font-family: 'Consolas', 'Courier New', monospace;
      background: #f1f5f9;
      border-radius: 4px;
    }
    code { padding: 0.15em 0.35em; font-size: 9.5pt; }
    pre { padding: 1em; overflow-x: auto; font-size: 9.5pt; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

        await htmlToPdfViaBrowser(styledHtml, intermediatePdf, uploadsDir);
        return { pdfPath: intermediatePdf, isConverted: true, cleanup: cleanupFn };
      }

      // Strategy C: Pure pdf-lib layout fallback if no browser or empty HTML
      const { value: rawText } = await mammoth.extractRawText({ path: inputPath });
      await renderTextToPdf(rawText || "No readable content found in Word document.", intermediatePdf);
      return { pdfPath: intermediatePdf, isConverted: true, cleanup: cleanupFn };

    } catch (docxErr) {
      cleanupFn();
      throw new Error(`Failed to convert Word document to PDF: ${docxErr.message}`);
    }
  }

  // If unsupported format
  throw new Error(
    `Unsupported file format (${ext || "unknown"}). Supported formats are PDF, Word (DOCX/DOC), Text (TXT/MD), and Images (PNG/JPG).`
  );
}

module.exports = {
  convertToPdf,
  findBrowserExecutable,
  findLibreOffice,
};
