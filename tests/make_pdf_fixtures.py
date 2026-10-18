"""Small local fixtures covering text, CJK, rotated pages, scans, and passwords."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject

target = Path(__file__).parent / '.tmp'
target.mkdir(exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
c = canvas.Canvas(str(target / 'manuscript.pdf'), pagesize=(595, 842))
c.setTitle('Import verification manuscript')
c.setFont('Helvetica-Bold', 22)
c.drawString(50, 780, 'A Personal Research Paper')
c.setFont('STSong-Light', 16)
c.drawString(50, 742, '中文论文导入测试：自己的论文也能粉碎')
c.setFont('Helvetica', 11)
for i in range(26):
    c.drawString(50, 700 - i * 20, f'Left column {i}: reliable data and reproducible science.')
    c.drawString(320, 700 - i * 20, f'Right column {i}: seed = {42 + i}.')
c.setFillColorRGB(.1, .3, .8)
c.rect(50, 90, 300, 45, fill=1, stroke=0)
c.showPage()
c.setPageSize((842, 595))
c.setFont('Helvetica-Bold', 24)
c.drawString(45, 540, 'Landscape Results - PAGE TWO')
c.setFont('Helvetica', 13)
c.drawString(45, 480, 'Accuracy = 99.9%; loss = 0.0001; contribution = marginal.')
c.showPage()
c.setPageSize((595, 842))
c.setPageRotation(90)
c.setFont('Helvetica', 18)
c.drawString(60, 450, 'Rotated page three is readable.')
c.showPage()
c.setPageRotation(0)
c.showPage()  # Blank PDF page still becomes a playable sheet.
image = Image.new('RGB', (600, 800), '#f7eee0')
draw = ImageDraw.Draw(image)
draw.rectangle((40, 40, 560, 150), fill='#274b77')
for i in range(15):
    draw.text((50, 200 + i * 28), f'Scanned research line {i}: no extractable text layer.', fill='#202020')
image_bytes = BytesIO()
image.save(image_bytes, format='PNG')
from reportlab.lib.utils import ImageReader
c.drawImage(ImageReader(image_bytes), 0, 0, width=595, height=842)
c.showPage()
c.setFont('Helvetica', 18)
c.drawString(50, 750, 'LastPage sentinel - PAGE SIX')
c.save()
writer = PdfWriter()
writer.clone_document_from_reader(PdfReader(target / 'manuscript.pdf'))
writer._ID = ArrayObject([ByteStringObject(b'local-fixture-01'), ByteStringObject(b'local-fixture-02')])
writer.encrypt('secret')
with (target / 'encrypted.pdf').open('wb') as stream:
    writer.write(stream)
(target / 'broken.pdf').write_bytes(b'%PDF-1.7\nnot a valid PDF structure')
