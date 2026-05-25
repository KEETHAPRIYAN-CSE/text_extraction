from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
import io
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Handwriting OCR API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── FIX 1: Use the LARGE model instead of base ───────────────────────────────
# trocr-large-handwritten is significantly more accurate for cursive writing
MODEL_NAME = "microsoft/trocr-large-handwritten"

logger.info(f"Loading model: {MODEL_NAME} ...")
processor = TrOCRProcessor.from_pretrained(MODEL_NAME)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)
model.eval()
logger.info("Model loaded successfully!")


# ─── FIX 2: Preprocess image before OCR ──────────────────────────────────────
def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Clean and crop the image so the model only sees the handwriting,
    not huge empty white areas.
    """
    # Convert to RGB
    image = image.convert("RGB")

    # Step 1: Resize to a standard width while keeping aspect ratio
    max_width = 1200
    if image.width > max_width:
        ratio = max_width / image.width
        new_height = int(image.height * ratio)
        image = image.resize((max_width, new_height), Image.LANCZOS)

    # Step 2: Convert to grayscale for processing
    gray = image.convert("L")

    # Step 3: Enhance contrast so handwriting stands out
    enhancer = ImageEnhance.Contrast(gray)
    gray = enhancer.enhance(2.5)

    # Step 4: Auto-crop white borders — find where the ink actually is
    # Convert to numpy, find non-white pixels
    np_img = np.array(gray)
    # Threshold: pixels darker than 200 are considered "ink"
    ink_mask = np_img < 200
    rows = np.any(ink_mask, axis=1)
    cols = np.any(ink_mask, axis=0)

    if rows.any() and cols.any():
        rmin, rmax = np.where(rows)[0][[0, -1]]
        cmin, cmax = np.where(cols)[0][[0, -1]]

        # Add padding around the cropped area
        padding = 40
        rmin = max(0, rmin - padding)
        rmax = min(np_img.shape[0], rmax + padding)
        cmin = max(0, cmin - padding)
        cmax = min(np_img.shape[1], cmax + padding)

        # Crop to just the handwriting region
        image = image.crop((cmin, rmin, cmax, rmax))
        logger.info(f"  Cropped to handwriting region: {image.size}")
    else:
        logger.warning("  No ink region found — using full image")

    # Step 5: Sharpen the result for better character recognition
    image = image.filter(ImageFilter.SHARPEN)

    # Step 6: Ensure minimum height for TrOCR (needs at least 32px)
    if image.height < 64:
        ratio = 64 / image.height
        image = image.resize((int(image.width * ratio), 64), Image.LANCZOS)

    return image


# ─── FIX 3: Split image into lines for multi-line handwriting ─────────────────
def split_into_lines(image: Image.Image) -> list:
    """
    For documents with multiple lines of handwriting,
    split into individual line images for better accuracy.
    Returns list of PIL images (one per line).
    If splitting fails, returns the whole image as one item.
    """
    gray = np.array(image.convert("L"))
    ink_mask = gray < 200

    # Find rows that have ink
    row_has_ink = np.any(ink_mask, axis=1)

    # Find line boundaries (transitions from no-ink to ink)
    lines = []
    in_line = False
    line_start = 0
    min_gap = 10  # minimum gap between lines (pixels)
    min_height = 20  # minimum line height to consider

    for i, has_ink in enumerate(row_has_ink):
        if has_ink and not in_line:
            in_line = True
            line_start = i
        elif not has_ink and in_line:
            in_line = False
            line_height = i - line_start
            if line_height >= min_height:
                padding = 10
                top = max(0, line_start - padding)
                bottom = min(image.height, i + padding)
                line_img = image.crop((0, top, image.width, bottom))
                lines.append(line_img)

    # Handle last line
    if in_line:
        line_img = image.crop((0, max(0, line_start - 10), image.width, image.height))
        if line_img.height >= min_height:
            lines.append(line_img)

    if len(lines) == 0:
        return [image]

    logger.info(f"  Split into {len(lines)} line(s)")
    return lines


# ─── Run OCR on a single preprocessed image ──────────────────────────────────
def run_ocr_on_line(image: Image.Image) -> str:
    """Run TrOCR on a single line image."""
    image = image.convert("RGB")
    pixel_values = processor(image, return_tensors="pt").pixel_values
    with torch.no_grad():
        generated_ids = model.generate(
            pixel_values,
            max_new_tokens=64,
        )
    text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return text.strip()


# ─── Full OCR pipeline for one image ─────────────────────────────────────────
def run_ocr(image: Image.Image) -> str:
    """Preprocess → split lines → OCR each line → join results."""
    # Step 1: Preprocess and crop to ink region
    processed = preprocess_image(image)

    # Step 2: Split into individual lines
    lines = split_into_lines(processed)

    # Step 3: OCR each line
    results = []
    for i, line_img in enumerate(lines):
        logger.info(f"    OCR line {i+1}/{len(lines)} ...")
        text = run_ocr_on_line(line_img)
        if text:
            results.append(text)

    full_text = "\n".join(results)
    logger.info(f"  Result: '{full_text}'")
    return full_text


# ─── PDF to images ────────────────────────────────────────────────────────────
def pdf_to_images(pdf_bytes: bytes) -> list:
    """Convert each PDF page to a high-resolution PIL Image."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        # 3x zoom for much better quality
        mat = fitz.Matrix(3, 3)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    return images


# ─── Build output PDF ─────────────────────────────────────────────────────────
def build_pdf(pages_text: list) -> bytes:
    """Create a clean PDF with the recognized typed text."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
    )

    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=13,
        leading=20,
        alignment=TA_LEFT,
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=8,
    )

    story = []
    for i, text in enumerate(pages_text):
        if len(pages_text) > 1:
            story.append(Paragraph(f"Page {i + 1}", heading_style))
            story.append(Spacer(1, 6))
        for line in text.split("\n"):
            if line.strip():
                story.append(Paragraph(line, body_style))
                story.append(Spacer(1, 4))
        story.append(Spacer(1, 20))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/")
def root():
    return {"status": "Handwriting OCR API v2 is running"}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/ocr/preview")
async def ocr_preview(file: UploadFile = File(...)):
    """Returns recognized text as JSON for frontend preview."""
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    file_bytes = await file.read()
    pages_text = []

    try:
        if file.content_type == "application/pdf":
            images = pdf_to_images(file_bytes)
            for idx, img in enumerate(images):
                logger.info(f"Processing PDF page {idx+1}/{len(images)}")
                pages_text.append(run_ocr(img))
        else:
            logger.info(f"Processing image: {file.filename}")
            image = Image.open(io.BytesIO(file_bytes))
            pages_text.append(run_ocr(image))

    except Exception as e:
        logger.error(f"OCR failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "success": True,
        "pages": len(pages_text),
        "text": pages_text,
        "full_text": "\n\n".join(pages_text),
    }


@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    """Returns a downloadable PDF with the recognized typed text."""
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    file_bytes = await file.read()
    pages_text = []

    try:
        if file.content_type == "application/pdf":
            images = pdf_to_images(file_bytes)
            for idx, img in enumerate(images):
                logger.info(f"Processing PDF page {idx+1}/{len(images)}")
                pages_text.append(run_ocr(img))
        else:
            image = Image.open(io.BytesIO(file_bytes))
            pages_text.append(run_ocr(image))

    except Exception as e:
        logger.error(f"OCR failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    pdf_bytes = build_pdf(pages_text)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=ocr_result.pdf",
            "X-OCR-Text": "|".join(pages_text),
        },
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
