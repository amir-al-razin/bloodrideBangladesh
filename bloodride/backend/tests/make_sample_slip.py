"""Draws a sample blood requisition slip (for tests and the demo).

    python tests/make_sample_slip.py [out.png] [blood_group] [hospital]

Each call adds the time to the slip, so every image is different (a reused image is rejected).
"""
import sys
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make(out: str, group: str = "AB-", hospital: str = "Dhaka Medical College Hospital") -> str:
    img = Image.new("RGB", (1240, 1500), "white")
    d = ImageDraw.Draw(img)
    now = datetime.now()
    d.text((80, 70), hospital.upper(), font=font(46, True), fill="black")
    d.text((80, 135), "Department of Medicine - Blood Requisition", font=font(32), fill="black")
    d.line((80, 195, 1160, 195), fill="black", width=3)
    lines = [
        f"Date: {now:%d/%m/%Y}",
        "Patient name: Rahim Uddin       Age: 45      Bed: 12",
        f"Blood group: {group.replace('-', ' (-ve)').replace('+', ' (+ve)')}",
        "Required: 1 bag whole blood",
        "Reason: surgery",
        "",
        "Dr. Abdul Karim, MBBS, FCPS",
        "BMDC Reg No: A-12345",
        f"Slip ref {now:%H%M%S%f}",
    ]
    for i, line in enumerate(lines):
        d.text((80, 250 + i * 80), line, font=font(38), fill="black")
    img.save(out)
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    print(make(args[0] if args else "sample_slip.png", *(args[1:3])))
