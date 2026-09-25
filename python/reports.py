"""Local branded reports. Validated JSON blocks in, PDF bytes out; no URLs or code execution."""
import base64
import html
import io
import json
import math
import re
import resource
import sys
import textwrap
from datetime import date
from pathlib import Path

resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))


def title_case(value, markup=False):
    """Capitalize major words without changing acronyms, mixed-case names, or code."""
    parts = re.split(r'(<font\b[^>]*>.*?</font>|<[^>]+>|&(?:\w+|#\d+|#x[0-9a-fA-F]+);)', value, flags=re.S) if markup else [value]
    protected = lambda text: markup and text.startswith(('<', '&'))
    words = re.compile(r"[^\W_]+(?:['’][^\W_]+)*", re.UNICODE)
    count = sum(len(words.findall(part)) for part in parts if not protected(part))
    minor = {'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs'}
    index = 0
    def replace(match):
        nonlocal index
        word = match.group()
        first_or_last = index in (0, count - 1)
        index += 1
        if (len(word) > 1 and word.isupper()) or any(c.isupper() for c in word[1:]):
            return word
        if not first_or_last and word.lower() in minor:
            return word.lower()
        return word[:1].upper() + word[1:]
    return ''.join(part if protected(part) else words.sub(replace, part) for part in parts)


def logo(data):
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 12_000_000
    raw = base64.b64decode(data['image'], validate=True)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('Logo must be at most 2 MiB.')
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in ('PNG', 'JPEG') or image.width * image.height > 12_000_000:
            raise ValueError('Use a PNG or JPEG logo up to 12 megapixels.')
        image = ImageOps.exif_transpose(image).convert('RGBA')
        image.thumbnail((1000, 500))
        output = io.BytesIO()
        image.save(output, 'PNG', optimize=True)
    if output.tell() > 500_000:
        raise ValueError('Logo is too complex. Use a smaller image.')
    return {'logo': base64.b64encode(output.getvalue()).decode('ascii')}


def render(data):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, letter, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import BaseDocTemplate, PageTemplate, NextPageTemplate, Frame, Paragraph, Spacer, PageBreak, LongTable, TableStyle, KeepTogether, KeepInFrame, Image, HRFlowable
    from reportlab.graphics.shapes import Drawing, Rect, Line, String, Circle, Polygon
    import reportlab
    fonts = Path(reportlab.__file__).parent / 'fonts'
    for name, file in [('FrameText', 'Vera.ttf'), ('FrameBold', 'VeraBd.ttf'), ('FrameItalic', 'VeraIt.ttf'), ('FrameBoldItalic', 'VeraBI.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
    pdfmetrics.registerFontFamily('FrameText', normal='FrameText', bold='FrameBold', italic='FrameItalic', boldItalic='FrameBoldItalic')
    profile = data['profile']
    primary, secondary, accent = [colors.HexColor(profile[k]) for k in ('primary', 'secondary', 'accent')]
    ink, muted, line = colors.HexColor('#22333c'), colors.HexColor('#52636b'), colors.HexColor('#dce3e6')
    template = profile['template']
    page = A4 if profile['paper'] == 'a4' else letter
    if profile['landscape']:
        page = landscape(page)
    pw, ph = page
    margin = 44 if template == 'analytical' else 50
    width = pw - 2 * margin
    body_size = {'executive': 10.5, 'analytical': 9.5, 'technical': 9.5}[template]
    def style(name, **kwargs):
        return ParagraphStyle(name, fontName='FrameText', fontSize=body_size, leading=body_size * 1.5, textColor=ink, spaceAfter=9, **kwargs)
    body = style('body')
    heading = ParagraphStyle('heading', parent=body, fontName='FrameBold', fontSize=17 if template == 'executive' else 14, leading=22, textColor=primary, spaceBefore=18, spaceAfter=10, keepWithNext=True)
    subheading = ParagraphStyle('subheading', parent=heading, fontSize=11.5, leading=16, textColor=secondary, spaceBefore=12)
    title_style = ParagraphStyle('title', parent=body, fontName='FrameBold', fontSize=26 if template == 'executive' else 23, leading=33 if template == 'executive' else 29, textColor=primary, spaceAfter=20)
    small = ParagraphStyle('small', parent=body, fontSize=8, leading=12, textColor=muted, spaceAfter=8)
    cell_style = ParagraphStyle('cell', parent=body, fontSize=8, leading=11, spaceAfter=0, splitLongWords=True)
    header_ink = colors.white if sum(c * w for c, w in zip(primary.rgb(), [.2126, .7152, .0722])) < .55 else ink
    header_style = ParagraphStyle('table-head', parent=cell_style, fontName='FrameBold', textColor=header_ink)
    logo_bytes = base64.b64decode(data['logo']) if data.get('logo') else None
    logo_img = Image(io.BytesIO(logo_bytes)) if logo_bytes else None
    if logo_img:
        ratio = min(min(260, width) / logo_img.imageWidth, 110 / logo_img.imageHeight)
        logo_img.drawWidth, logo_img.drawHeight = logo_img.imageWidth * ratio, logo_img.imageHeight * ratio
        logo_img.hAlign = 'CENTER'
    output = io.BytesIO()
    class ReportDoc(BaseDocTemplate):
        pages = 0
        def afterPage(self):
            self.pages += 1
            if self.pages > 100:
                raise ValueError('Report exceeds 100 pages. Summarize or split it.')
    doc = ReportDoc(output, pagesize=page, title=title_case(data['title']), author=profile['organization'] or 'Frame', leftMargin=margin, rightMargin=margin, topMargin=65, bottomMargin=52)
    def shorten(value, limit):
        value = str(value)
        return value if len(value) <= limit else value[:limit-3] + '...'
    def fit_text(value, font, size, available):
        value = str(value)
        if pdfmetrics.stringWidth(value, font, size) <= available:
            return value
        while value and pdfmetrics.stringWidth(value + '...', font, size) > available:
            value = value[:-1]
        return value + '...'
    def chrome(canvas, document):
        canvas.saveState()
        canvas.setFillColor(primary)
        canvas.rect(0, ph - 7, pw, 7, fill=1, stroke=0)
        canvas.setFillColor(accent)
        canvas.rect(margin, ph - 37, 23, 3, fill=1, stroke=0)
        canvas.setFont('FrameBold', 8)
        canvas.setFillColor(primary)
        canvas.drawString(margin + 33, ph - 38, fit_text(profile['organization'], 'FrameBold', 8, width - 33))
        canvas.setStrokeColor(line)
        canvas.line(margin, 37, pw - margin, 37)
        canvas.setFillColor(muted)
        canvas.setFont('FrameText', 7)
        canvas.drawString(margin, 24, fit_text(profile['footer'] or profile['organization'], 'FrameText', 7, width - 35))
        number = document.page - (2 if profile['cover'] else 0)
        if number > 0:
            canvas.drawRightString(pw-margin, 24, str(number))
        canvas.restoreState()
    def confidentiality(canvas, document):
        # This page deliberately has no report chrome, footer, logo, or page number.
        notice_style = ParagraphStyle('notice', parent=small, fontSize=9, leading=14, alignment=1)
        notice = Paragraph(html.escape(profile['confidentialityNotice']).replace('\n', '<br/>'), notice_style)
        _, height = notice.wrap(width, ph - 104)
        if height > ph - 104:
            raise ValueError('Confidentiality notice is too tall. Shorten it or remove extra line breaks.')
        canvas.saveState()
        notice.drawOn(canvas, margin, 52)
        canvas.restoreState()
    def frame():
        return Frame(margin, 52, width, ph-117, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id='report', frames=[frame()], onPage=chrome),
        PageTemplate(id='confidential', frames=[frame()], onPage=confidentiality),
    ])
    story = []
    if logo_img:
        story += [logo_img, Spacer(1, 22)]
    if profile['cover']:
        story.append(Spacer(1, 60 if ph > 700 else 20))
    story.append(Paragraph(html.escape(title_case(data['title'])), title_style))
    if data.get('subtitle'):
        story.append(Paragraph(html.escape(data['subtitle']), ParagraphStyle('subtitle', parent=body, fontSize=12, leading=18, textColor=muted)))
    story += [Spacer(1, 12), HRFlowable(width='22%', thickness=3, color=accent, hAlign='LEFT'), Spacer(1, 14), Paragraph(date.today().isoformat(), small)]
    if profile['cover']:
        # Keep long titles/subtitles on a single cover, even in landscape orientation.
        story = [KeepInFrame(width, ph-117, story, mode='shrink'), NextPageTemplate('confidential'), PageBreak(),
                 Spacer(1, 1), NextPageTemplate('report'), PageBreak()]
    else:
        story.append(Spacer(1, 12))
    palette = [primary, secondary, accent, colors.HexColor('#6486a4'), colors.HexColor('#926f9f')]
    def chart_plot(chart):
        d = Drawing(width, 310)
        rows, kind = chart['rows'], chart['kind']
        title = Paragraph(html.escape(title_case(chart['title'])), subheading)
        if kind == 'pie':
            total = sum(float(r[1]) for r in rows)
            cx, cy, radius = width * .30, 155, min(106, width * .23)
            angle = math.pi / 2
            for i, row in enumerate(rows):
                sweep = float(row[1]) / total * 2 * math.pi
                if not sweep:
                    continue
                steps = max(2, int(sweep * 24))
                points = [cx, cy]
                for j in range(steps + 1):
                    theta = angle - sweep * j / steps
                    points += [cx + radius * math.cos(theta), cy + radius * math.sin(theta)]
                d.add(Polygon(points, fillColor=palette[i % len(palette)], strokeColor=colors.white, strokeWidth=.5))
                angle -= sweep
            if chart.get('donut'):
                d.add(Circle(cx, cy, radius * .53, fillColor=colors.white, strokeColor=None))
            for i, row in enumerate(rows):
                y = 294 - i * 14
                x = width * .58
                d.add(Rect(x, y-3, 6, 6, fillColor=palette[i % len(palette)], strokeColor=None))
                label = f'{shorten(row[0], 20)}: {float(row[1]):g} ({float(row[1])/total:.1%})'
                d.add(String(x+12, y-3, label, fontName='FrameText', fontSize=7, fillColor=ink))
        else:
            left, right, bottom, top = 48, width - 12, 50, 270
            values = [float(v) for r in rows for v in r[1:] if v is not None]
            lo, hi = min(0, *values), max(0, *values)
            if lo == hi:
                hi = lo + 1
            y = lambda v: bottom + (float(v)-lo)/(hi-lo)*(top-bottom)
            xs = [float(r[0]) for r in rows if r[0] is not None] if kind == 'scatter' else []
            xmin, xmax = (min(xs), max(xs)) if xs else (0, 1)
            if xmin == xmax:
                xmin, xmax = xmin-1, xmax+1
            x = lambda row, i: left + ((float(row[0])-xmin)/(xmax-xmin) if kind == 'scatter' else (i+.5)/len(rows))*(right-left)
            for i in range(5):
                value = lo + (hi-lo)*i/4
                d.add(Line(left, y(value), right, y(value), strokeColor=line, strokeWidth=.5))
                d.add(String(left-7, y(value)-3, f'{value:,.3g}', textAnchor='end', fontName='FrameText', fontSize=7, fillColor=muted))
            d.add(Line(left, y(0), right, y(0), strokeColor=muted, strokeWidth=.7))
            if kind == 'scatter':
                for i in range(5):
                    d.add(String(left+(right-left)*i/4, 34, f'{xmin+(xmax-xmin)*i/4:g}', textAnchor='middle', fontName='FrameText', fontSize=7, fillColor=muted))
            else:
                for i, row in enumerate(rows):
                    if i % max(1, math.ceil(len(rows)/6)) == 0:
                        d.add(String(x(row, i), 34, shorten(row[0], 13), textAnchor='middle', fontName='FrameText', fontSize=7, fillColor=muted))
            for s, name in enumerate(chart['y']):
                previous = None
                for i, row in enumerate(rows):
                    if row[0] is None or row[s+1] is None:
                        previous = None
                        continue
                    px, py = x(row, i), y(row[s+1])
                    color = palette[s % len(palette)]
                    if kind == 'bar':
                        group = (right-left)/len(rows)*.8
                        bw = group/len(chart['y'])
                        d.add(Rect(px-group/2+s*bw, min(y(0), py), bw*.9, abs(py-y(0)), fillColor=color, strokeColor=None))
                    else:
                        if kind == 'line' and previous:
                            d.add(Line(*previous, px, py, strokeColor=color, strokeWidth=1.5))
                        d.add(Circle(px, py, 2.5, fillColor=color, strokeColor=None))
                        previous = (px, py)
                lx = left + s * (right-left)/len(chart['y'])
                d.add(Rect(lx, 8, 6, 6, fillColor=palette[s % len(palette)], strokeColor=None))
                d.add(String(lx+10, 8, fit_text(name, 'FrameText', 7, (right-left)/len(chart['y']) - 16), fontName='FrameText', fontSize=7, fillColor=ink))
            d.add(String((left+right)/2, 295, shorten(chart['x'], 70), textAnchor='middle', fontName='FrameText', fontSize=8, fillColor=muted))
        return [title, d]
    def table(block):
        columns, rows = block['columns'], block['rows']
        if not columns or len(columns) > 20 or len(rows) > 1000 or any(len(r) != len(columns) for r in rows):
            raise ValueError('Report tables support 1-20 columns and up to 1,000 consistent rows.')
        bands = 8 if profile['landscape'] else 6
        groups = [list(range(len(columns)))] if len(columns) <= bands else [[0] + list(range(i, min(i+bands-1, len(columns)))) for i in range(1, len(columns), bands-1)]
        for group_number, indices in enumerate(groups):
            if len(groups) > 1:
                story.append(Paragraph(f'Table columns - part {group_number+1} of {len(groups)} (first column repeated)', small))
            vals = [[Paragraph(html.escape(str(columns[i])), header_style) for i in indices]]
            for row in rows:
                vals.append([Paragraph(html.escape('NULL' if row[i] is None else str(row[i])).replace('\n', '<br/>'), cell_style) for i in indices])
            weights = [min(32, max(10, len(str(columns[i])), *(len(str(r[i])) for r in rows[:30]))) for i in indices]
            col_widths = [width*w/sum(weights) for w in weights]
            t = LongTable(vals, colWidths=col_widths, repeatRows=1, splitByRow=1, splitInRow=1, hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), primary), ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f3f6f7')]), ('VALIGN', (0,0), (-1,-1), 'TOP'), ('LEFTPADDING', (0,0), (-1,-1), 8), ('RIGHTPADDING', (0,0), (-1,-1), 8), ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7), ('LINEBELOW', (0,0), (-1,0), 1, accent), ('LINEBELOW', (0,1), (-1,-1), .3, line)]))
            story.extend([t, Spacer(1, 12)])
    section = 0
    for block in data['blocks']:
        kind = block['type']
        if kind == 'heading':
            level = block.get('level', 2)
            prefix = ''
            if template == 'technical' and level <= 2:
                section += 1
                prefix = f'{section}. '
            story.append(Paragraph(prefix + title_case(block['text'], markup=True), heading if level <= 2 else subheading))
        elif kind == 'paragraph':
            story.append(Paragraph(block['text'], body))
        elif kind == 'callout':
            st = ParagraphStyle('callout', parent=body, borderColor=accent, borderWidth=1, borderPadding=12, backColor=colors.HexColor('#f3f6f7'), spaceBefore=8, spaceAfter=18)
            story.append(Paragraph(block['text'], st))
        elif kind == 'code':
            st = ParagraphStyle('code', parent=body, fontName='Courier', fontSize=8, leading=11, backColor=colors.HexColor('#f3f6f7'), borderPadding=8)
            # Separate lines can flow across page boundaries instead of an unsplittable code box.
            for raw in block['text'].splitlines():
                for segment in textwrap.wrap(raw, max(30, int(width/5.4)), replace_whitespace=False) or [' ']:
                    story.append(Paragraph(html.escape(segment).replace(' ', '&nbsp;'), st))
        elif kind == 'rule':
            story.extend([HRFlowable(width='100%', color=line), Spacer(1, 10)])
        elif kind == 'page_break':
            story.append(PageBreak())
        elif kind == 'table':
            if block.get('caption'):
                story.append(Paragraph(html.escape(title_case(block['caption'])), subheading))
            table(block)
        elif kind == 'chart':
            story.append(KeepTogether(chart_plot(block['chart'])))
            if block.get('caption'):
                story.append(Paragraph(html.escape(block['caption']), small))
            for notice in block['chart'].get('notices', []):
                story.append(Paragraph(html.escape(notice), small))
        for notice in block.get('notices', []):
            story.append(Paragraph(html.escape(notice), small))
    doc.build(story)
    pdf = output.getvalue()
    if len(pdf) > 8_000_000:
        raise ValueError('PDF exceeds 8 MB. Reduce report content.')
    return {'pdf': base64.b64encode(pdf).decode('ascii'), 'pages': doc.pages}


try:
    raw = sys.stdin.buffer.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError('Report input is too large.')
    request = json.loads(raw)
    result = logo(request) if request['command'] == 'logo' else render(request)
    print(json.dumps(result))
except Exception as error:
    message = str(error) if isinstance(error, ValueError) else 'Report rendering failed. Check the document runtime, table sizes, and report content.'
    print(json.dumps({'error': message}))
    sys.exit(1)
