"""Assemble the three-part PaperTrace handoff (project book, technical book, design)."""
from pathlib import Path
import hashlib, json, shutil, zipfile, struct
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject

ROOT = Path(__file__).resolve().parents[3]
PKG = ROOT / 'docs/.build/deliverables/PaperTrace_Complete_v1.5_20261109'
OUT = ROOT / 'docs/.build/handoff-20261109/PaperTrace_Handoff_20261109'
ZIP = ROOT / 'docs/deliverables/PaperTrace_Handoff_20261109.zip'

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
(OUT / '03_Design').mkdir()

def copy(src, dest):
    src = ROOT / src
    assert src.is_file(), src
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)

copy(PKG / '01_Project_Book.pdf', OUT / '01_Project_Book.pdf')
copy('docs/.build/deliverables/PaperTrace_Technical_Book_ZH.pdf', OUT / '02_Technical_Book.pdf')
copy(PKG / '03_Design/PaperTrace_Design_v5.pdf', OUT / '03_Design/PaperTrace_Design_v5.pdf')
copy(PKG / '03_Design/Workspace_Design.pdf', OUT / '03_Design/Workspace_Design.pdf')
copy(PKG / '03_Design/Open_Figma.url', OUT / '03_Design/Open_Figma.url')
for name in ('01_Home.png', '02_Research.png', '03_Evidence.png'):
    copy(PKG / '03_Design/Previews' / name, OUT / '03_Design/Previews' / name)
for name in ('01_Home.svg', '02_Research.svg', '03_Evidence.svg'):
    copy(PKG / '03_Design/Editable_SVG' / name, OUT / '03_Design/Editable_SVG' / name)

def pages(path):
    return len(PdfReader(path).pages)

book_pages = pages(OUT / '01_Project_Book.pdf')
tech_pages = pages(OUT / '02_Technical_Book.pdf')
design_pages = pages(OUT / '03_Design/PaperTrace_Design_v5.pdf')
workspace_pages = pages(OUT / '03_Design/Workspace_Design.pdf')

(OUT / '00_README.txt').write_text(f'''PaperTrace 交付材料（2026-11-09）

本包按你要求只放三样东西：项目书、技术书、设计稿。

01_Project_Book.pdf
  产品项目书 v1.5，{book_pages} 页。当前产品定义、用户故事、概念对象、功能、Agent 架构、数据与评估计划。
  这份是产品规则与讨论的基线。

02_Technical_Book.pdf
  开发技术书，{tech_pages} 页。技术栈、进程架构与通信协议、数据与证据、Agent 控制与恢复、
  现成 harness 替代路线、开发方向与五项先做试验。
  属于拟议技术方案，没有运行原型、打包或解析实验；收益与体积数字均待实测。

03_Design/
  PaperTrace_Design_v5.pdf   三屏设计（首页、对话阅读、证据上下文），{design_pages} 页，Figma 导出。
  Workspace_Design.pdf       工作区设计说明，{workspace_pages} 页，界面与操作规则。
  Previews/                  三屏 1440×960 PNG。
  Editable_SVG/              三屏可编辑矢量。
  Open_Figma.url             在线设计稿入口。
  设计稿是静态视觉示意，不是可运行客户端。

阅读顺序建议：先看 01 了解产品，再看 03 看界面，最后看 02 看怎么实现。

说明：包内 PDF 的本地跳转已按本包目录校正，指向原工作目录的失效跳转已移除，
外部网址链接保留。需要完整源稿或评审记录可另发。
''', encoding='utf-8')

# Keep local links only when their target exists in this package; drop dead ones.
for pdf in sorted(OUT.rglob('*.pdf')):
    writer = PdfWriter(clone_from=str(pdf))
    any_change = False
    for page in writer.pages:
        annots = page.get('/Annots')
        if not annots:
            continue
        keep, page_change = [], False
        for ref in annots:
            obj = ref.get_object()
            action = obj.get('/A')
            uri = str(action.get('/URI')) if action and action.get('/S') == '/URI' else ''
            if uri and not uri.startswith('http'):
                target = (pdf.parent / uri.split('#')[0]).resolve()
                if not target.exists():
                    page_change = True
                    continue
            keep.append(ref)
        if page_change:
            any_change = True
            if keep:
                page[NameObject('/Annots')] = ArrayObject(keep)
            else:
                del page[NameObject('/Annots')]
    if any_change:
        writer.write(str(pdf))

files = sorted(p for p in OUT.rglob('*') if p.is_file())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def png_size(p):
    d = p.read_bytes()[:24]
    return struct.unpack('>II', d[16:24])
manifest = []
for p in files:
    rel = p.relative_to(OUT).as_posix()
    row = {'file': rel, 'bytes': p.stat().st_size, 'sha256': sha(p)}
    if p.suffix.lower() == '.pdf':
        row['pages'] = len(PdfReader(p).pages)
    if p.suffix.lower() == '.png':
        w, h = png_size(p); row['size'] = f'{w}x{h}'
    manifest.append(row)

missing = []
for row in manifest:
    if not row['file'].endswith('.pdf'):
        continue
    reader = PdfReader(OUT / row['file'])
    for page in reader.pages:
        for annot in (page.get('/Annots') or []):
            action = annot.get_object().get('/A')
            if action and action.get('/S') == '/URI':
                uri = str(action.get('/URI'))
                if uri.startswith('http'):
                    continue
                target = (OUT / uri).resolve()
                if not target.exists():
                    missing.append({'pdf': row['file'], 'target': uri})

if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        z.write(p, arcname=(OUT.name + '/' + p.relative_to(OUT).as_posix()))
with zipfile.ZipFile(ZIP) as z:
    bad = z.testzip()
    assert bad is None, bad
    names = z.namelist()
report = {
    'folder': str(OUT.relative_to(ROOT)),
    'zip': str(ZIP.relative_to(ROOT)),
    'zipBytes': ZIP.stat().st_size,
    'zipSha256': sha(ZIP),
    'fileCount': len(files),
    'zipEntryCount': len(names),
    'files': manifest,
    'unresolvedLocalLinks': missing,
}
(ROOT / 'docs/.build/handoff-20261109/Handoff_Manifest.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False, indent=1))
for row in manifest:
    print(row['file'], row['bytes'], row.get('pages') or row.get('size') or '')
