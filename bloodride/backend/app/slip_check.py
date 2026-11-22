"""OCR for the doctor's slip. Owner: Ayman.

Python only reads the text. The decision (auto_verified or needs_review) is made in the
database by auto_check_slip(), so the rule lives in one place.
If Tesseract is not installed, the text is empty and every slip goes to admin review.
"""
import logging
import shutil

from PIL import Image, ImageOps

from .config import TESSERACT_CMD

log = logging.getLogger("bloodride.ocr")

try:
    import pytesseract
except ImportError:          # the package is in requirements.txt; this only guards odd setups
    pytesseract = None

_CANDIDATES = [TESSERACT_CMD, shutil.which("tesseract") or "",
               r"C:\Program Files\Tesseract-OCR\tesseract.exe"]


def _find_tesseract() -> str:
    for path in _CANDIDATES:
        if path and shutil.which(path):
            return path
    return ""


TESSERACT = _find_tesseract() if pytesseract else ""
if TESSERACT:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT
else:
    log.warning("Tesseract not found: slips will go to admin review (install it to auto-verify)")


def ocr_available() -> bool:
    return bool(TESSERACT)


def read_slip(path: str) -> str:
    """Return the slip's text, or '' when OCR is unavailable or fails."""
    if not TESSERACT:
        return ""
    try:
        img = Image.open(path)
        img = ImageOps.exif_transpose(img).convert("L")      # phone photos: fix rotation, greyscale
        if img.width < 1400:                                  # small photos read better enlarged
            scale = 1400 / img.width
            img = img.resize((1400, int(img.height * scale)))
        return pytesseract.image_to_string(img, lang="eng")
    except Exception as exc:                                  # a bad image must not block the request
        log.warning("OCR failed for %s: %s", path, exc)
        return ""
