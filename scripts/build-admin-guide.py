"""Build the owner-facing admin PDF from its editable Markdown source.

Requires reportlab. Example (temporary runtime, outside website dependencies):
  py scripts/build-admin-guide.py --tools-dir <temporary-python-package-directory>
"""
from __future__ import annotations
import argparse
import html
import os
from pathlib import Path
import re
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tools-dir', type=Path)
args = parser.parse_args()
if args.tools_dir:
    sys.path.insert(0, str(args.tools_dir))

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs' / 'ASCEND_Admin_Guide.md'
OUTPUT = ROOT / 'docs' / 'ASCEND_Admin_Guide.pdf'
FONT_DIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
for font, filename in [('Guide', 'arial.ttf'), ('Guide-Bold', 'arialbd.ttf'),
                       ('Guide-Italic', 'ariali.ttf'), ('Guide-BoldItalic', 'arialbi.ttf')]:
    pdfmetrics.registerFont(TTFont(font, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='Guide-Bold',
                             italic='Guide-Italic', boldItalic='Guide-BoldItalic')

GOLD = colors.HexColor('#A67C32')
DARK = colors.HexColor('#171715')
TEXT = colors.HexColor('#282824')
MUTED = colors.HexColor('#686860')
LINE = colors.HexColor('#DDDDD6')
PALE = colors.HexColor('#F8F5EE')
PAGE_W, PAGE_H = A4
MARGIN = 45
WIDTH = PAGE_W - 2 * MARGIN

styles = {
    'title': ParagraphStyle('GuideTitle', fontName='Guide-Bold', fontSize=25,
                            leading=30, textColor=DARK, spaceAfter=14),
    'cover': ParagraphStyle('CoverTitle', fontName='Guide-Bold', fontSize=36,
                            leading=40, textColor=DARK, spaceAfter=14),
    'subtitle': ParagraphStyle('CoverSubtitle', fontName='Guide-Bold', fontSize=21,
                               leading=27, textColor=GOLD, spaceAfter=14),
    'h3': ParagraphStyle('GuideHeading', fontName='Guide-Bold', fontSize=12,
                         leading=16, textColor=DARK, spaceBefore=8, spaceAfter=5,
                         keepWithNext=True),
    'body': ParagraphStyle('GuideBody', fontName='Guide', fontSize=10,
                           leading=13.5, textColor=TEXT, spaceAfter=6),
    'list': ParagraphStyle('GuideList', fontName='Guide', fontSize=10,
                           leading=13.5, textColor=TEXT, leftIndent=18,
                           bulletFontName='Guide', bulletFontSize=10,
                           firstLineIndent=0, bulletIndent=0, spaceAfter=5),
    'cell': ParagraphStyle('GuideCell', fontName='Guide', fontSize=9.2,
                           leading=12, textColor=TEXT),
    'cellhead': ParagraphStyle('GuideCellHead', fontName='Guide-Bold', fontSize=9,
                               leading=12, textColor=colors.white),
    'note': ParagraphStyle('GuideNote', fontName='Guide', fontSize=9.8,
                           leading=13.8, textColor=TEXT),
}

def inline(text: str) -> str:
    result = html.escape(text.replace('\\*', '*'), quote=True)
    result = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', result)
    result = re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', result)
    result = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',
                    r'<link href="\2" color="#8A6326">\1</link>', result)
    result = result.replace('http://localhost:3000/admin',
        '<link href="http://localhost:3000/admin" color="#8A6326">http://localhost:3000/admin</link>')
    return result

class GuideDoc(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ('GuideTitle', 'CoverTitle'):
            key = 'guide-chapter-' + str(self.page)
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(), key, level=0)


def decorate(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(DARK)
    canvas.rect(0, PAGE_H - 30, PAGE_W, 30, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('Guide-Bold', 8)
    canvas.drawString(MARGIN, PAGE_H - 19, 'ASCEND ATHLETICS')
    canvas.setFont('Guide', 8)
    canvas.setFillColor(colors.HexColor('#D7BF8D'))
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 19, 'ADMIN HANDBOOK')
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.3)
    canvas.line(MARGIN, 39, PAGE_W - MARGIN, 39)
    canvas.setFont('Guide', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 25, 'Staff guide | 16 October 2026')
    canvas.drawRightString(PAGE_W - MARGIN, 25, str(doc.page))
    canvas.restoreState()


def note(text):
    box = Table([[Paragraph(inline(text), styles['note'])]], colWidths=[WIDTH])
    box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), PALE),
        ('LINEBEFORE', (0,0), (0,-1), 3, GOLD),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 9),
    ]))
    return [Spacer(1, 4), box, Spacer(1, 9)]


def table(rows):
    cols = len(rows[0])
    if rows[0][0] == 'Page': ratios = [0.1, 0.9]
    elif cols == 3: ratios = [0.20, 0.40, 0.40]
    else: ratios = [0.28, 0.72]
    data = [[Paragraph(inline(cell.strip()), styles['cellhead' if r == 0 else 'cell'])
             for cell in row] for r, row in enumerate(rows)]
    block = Table(data, colWidths=[WIDTH * r for r in ratios], repeatRows=1,
                  hAlign='LEFT')
    block.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F4F4F0')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 9),
        ('RIGHTPADDING', (0,0), (-1,-1), 9),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LINEBELOW', (0,0), (-1,0), 1, GOLD),
        ('LINEBELOW', (0,1), (-1,-1), 0.3, LINE),
    ]))
    return [block, Spacer(1, 8)]

story = []
pages = re.split(r'^---\s*$', SOURCE.read_text(encoding='utf-8'), flags=re.M)
for page_index, page in enumerate(pages):
    if page_index: story.append(PageBreak())
    lines = page.strip().splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith('|'):
            rows = []
            while index < len(lines) and lines[index].strip().startswith('|'):
                cells = lines[index].strip().strip('|').split('|')
                if not all(re.fullmatch(r'\s*:?-+:?\s*', cell) for cell in cells):
                    rows.append(cells)
                index += 1
            story.extend(table(rows))
            continue
        if line.startswith('# '):
            heading_style = styles['cover'] if page_index == 0 else styles['title']
            story.append(Paragraph(inline(line[2:]), heading_style))
        elif line.startswith('## '):
            story.append(Paragraph(inline(line[3:]), styles['subtitle']))
        elif line.startswith('### '):
            story.append(Paragraph(inline(line[4:]), styles['h3']))
        elif line.startswith('> '):
            story.extend(note(line[2:]))
        else:
            numbered = re.match(r'^(\d+)\.\s+(.+)$', line)
            if numbered:
                story.append(Paragraph(inline(numbered[2]), styles['list'],
                                       bulletText=numbered[1] + '.'))
            elif line.startswith('- '):
                story.append(Paragraph(inline(line[2:]), styles['list'], bulletText='\u2022'))
            else:
                story.append(Paragraph(inline(line), styles['body']))
        index += 1

GuideDoc(str(OUTPUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
         topMargin=49, bottomMargin=51,
         title='ASCEND ATHLETICS - Admin Guide', author='ASCEND ATHLETICS',
         subject='Step-by-step administration handbook for the owner and assistants',
         pageCompression=1).build(story, onFirstPage=decorate, onLaterPages=decorate)
print(str(OUTPUT))
print('Size:', OUTPUT.stat().st_size, 'bytes')
