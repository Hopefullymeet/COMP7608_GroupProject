"""Build a portable PaperTrace reading/design handoff, with rebased local links."""
from pathlib import Path
from urllib.parse import unquote, urlsplit, quote
import hashlib, html, json, os, re, shutil, zipfile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/deliverables/PaperTrace_Complete_v1.5_20261109'
REVIEW = ROOT / 'docs/product-plan/reviews/editorial-20261109'
LINK = re.compile(r'(!?\[[^\]]*\]\()([^\n)]+)(\))')
mapping = {}
source_files = [p for p in (ROOT / 'docs').rglob('*') if p.is_file() and not any(x in p.relative_to(ROOT / 'docs').parts for x in ('deliverables', '.build'))]

def resolve_local(src, uri):
    target = (src.parent / unquote(urlsplit(uri.strip('<>')).path)).resolve()
    if target.exists():
        return target
    # Historical review packets embed texts copied from other directories.
    # Reconnect a misplaced relative path only when its basename is unique.
    candidates = [p for p in source_files if p.name == target.name]
    return candidates[0] if len(candidates) == 1 else target

def add(src, dest):
    src = (ROOT / src).resolve()
    assert src.is_file(), src
    mapping[src] = OUT / dest

add('docs/deliverables/PaperTrace_Project_Book_ZH.pdf', '01_Project_Book.pdf')
add('docs/deliverables/Design/Research_Workspace_Design_ZH.pdf', '03_Design/Workspace_Design.pdf')
add('docs/deliverables/Reviews/PaperTrace_Competitive_Review_ZH.pdf', '06_Reviews/Competitive_Review.pdf')
add('docs/deliverables/Reviews/PaperTrace_v14_Dual_Review_ZH.pdf', '06_Reviews/v1.4_Second_Review.pdf')
add('docs/product-plan/reviews/v15-20261109/Revision_Record_ZH.md', '06_Reviews/Revision_v1.5_ZH.md')
for name in ['Claude_Review_ZH.md', 'DSH_Review_ZH.md', 'Review_Synthesis_ZH.md']:
    add('docs/product-plan/reviews/v14-second-review-20261109/' + name, '06_Reviews/v1.4_Second_Review/' + name)
for name in ['PaperTrace_Competitive_Review_ZH.md', 'Claude_Followup_ZH.md', 'Workspace_Followup_Review_ZH.md', 'Workspace_Revision_Audit_ZH.md']:
    review_file = ROOT / 'docs/product-plan/reviews/comparison-20261109' / name
    if review_file.exists():
        add(review_file, '06_Reviews/' + name)
add('docs/deliverables/Proposal/Potential_Solutions_Draft_ZH.pdf', '02_Proposal/Potential_Solutions_ZH.pdf')
add('docs/deliverables/Proposal/Potential_Solutions_Draft.pdf', '02_Proposal/Potential_Solutions_EN.pdf')
add('docs/deliverables/Proposal/COMP7608B_Group52_Proposal.pdf', '02_Proposal/Course_Proposal_20261008.pdf')
add('docs/product-plan/design-v4/PaperTrace_Prototype.html', '04_Prototype/PaperTrace_Prototype.html')
for file in (ROOT / 'docs/product-plan/figma-desktop-v5/previews').glob('*.png'):
    add(file, '03_Design/Previews/' + file.name)
for file in (ROOT / 'docs/product-plan/figma-desktop-v5/assets').glob('*.svg'):
    add(file, '03_Design/Editable_SVG/' + file.name)
for name in ['Claude_Review_ZH.md', 'DSH_Review_ZH.md', 'Final_Review_ZH.md']:
    if (REVIEW / name).exists():
        add(REVIEW / name, '06_Reviews/' + name)
story_review = ROOT / 'docs/product-plan/reviews/user-story-20261109/Claude_Discussion_ZH.md'
if story_review.exists():
    add(story_review, '06_Reviews/User_Story_Discussion_ZH.md')
for file in (ROOT / 'docs/source').rglob('*'):
    if file.is_file():
        add(file, '05_Source/' + str(file.relative_to(ROOT)))

missing = []
done = set()
while True:
    pending = [f for f in mapping if f.suffix == '.md' and f not in done]
    if not pending:
        break
    for src in pending:
        done.add(src)
        for match in LINK.finditer(src.read_text()):
            u = urlsplit(match[2].strip('<>'))
            if u.scheme or not u.path:
                continue
            target = resolve_local(src, match[2])
            if not target.is_relative_to(ROOT):
                continue
            if target.is_dir():
                for file in target.rglob('*'):
                    if file.is_file() and not any(x in file.parts for x in ('.git', '.build', '.history')):
                        mapping.setdefault(file, OUT / '05_Source' / file.relative_to(ROOT))
            elif target.is_file():
                mapping.setdefault(target, OUT / '05_Source' / target.relative_to(ROOT))
            else:
                missing.append({'source': str(src.relative_to(ROOT)), 'link': match[2]})

def rebase(uri, src, dest):
    u = urlsplit(uri.strip('<>'))
    if u.scheme or not u.path:
        return uri
    target = resolve_local(src, uri)
    if target not in mapping:
        return uri
    href = os.path.relpath(mapping[target], dest.parent).replace(os.sep, '/')
    return quote(href, safe='/') + (('#' + u.fragment) if u.fragment else '')

assert not OUT.exists(), 'Use a new dated package directory, or archive before rebuilding.'
OUT.mkdir(parents=True)
for src, dest in mapping.items():
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix == '.md':
        text = LINK.sub(lambda m: m[1] + rebase(m[2], src, dest) + m[3], src.read_text())
        dest.write_text(text)
    elif dest == OUT / '04_Prototype/PaperTrace_Prototype.html':
        text = src.read_text()
        text = text.replace('不过，这段摘要信息不能证明系统已具备通用科研问答能力。它描述的是数据集的设计。', 'QASPER 聚焦自然语言处理论文。可以继续查看问题、答案与证据之间的对应关系。')
        text = text.replace('这版原型演示的是学术问答与证据工作流，还没有连接模型。你可以使用下方建议，体验论文比较或引用检查。', '请从下方建议继续：比较论文，或检查草稿引用。')
        text = text.replace('<h2>关于这个阅读视图</h2><p class="zh">论文的标题、段落、引用和证据位置保留在阅读版中；原文仍是判断依据。你阅读的是排版后的文档，Agent 可使用结构化文本处理相同内容。</p>', '')
        text = text.replace('设计演示：本页仅包含已核对的短摘录及明确标注的中文导读，并非论文全文，也没有执行 PDF 转换。', '阅读范围：摘要摘录与中文导读。')
        dest.write_text(text)
    elif src.suffix == '.pdf' and src.name != 'COMP7608B_Group52_Proposal.pdf':
        writer = PdfWriter()
        writer.clone_document_from_reader(PdfReader(src))
        for page in writer.pages:
            for ref in page.get('/Annots', []):
                action = ref.get_object().get('/A')
                if action and '/URI' in action:
                    action[NameObject('/URI')] = TextStringObject(rebase(str(action['/URI']), src, dest))
        with dest.open('wb') as f:
            writer.write(f)
    else:
        shutil.copy2(src, dest)

# The original TeX directory is copied together for an editable course snapshot.
shutil.copytree(ROOT / 'docs/deliverables/Proposal/tex', OUT / '02_Proposal/tex')
shutil.copy2(ROOT / 'docs/.build/academic-pdf/PaperTrace_Design_v5.pdf', OUT / '03_Design/PaperTrace_Design_v5.pdf')
figma = 'https://www.figma.com/design/kvobBlB2qwar3B83XCtAQ8?node-id=116-1466'
(OUT / '03_Design/Open_Figma.url').write_text('[InternetShortcut]\nURL=' + figma + '\n')
navigation = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PaperTrace · 交付导航</title>
<style>*{box-sizing:border-box}body{margin:0;background:#fbf6f1;color:#2b211d;font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:920px;margin:64px auto;padding:0 28px 64px}h1{font:42px Georgia,serif;margin:0 0 6px}h2{font-size:21px;margin:36px 0 12px}p{margin:8px 0;color:#665850}a{color:#8d3a28;text-decoration:none}a:hover{text-decoration:underline}.links a{display:block;padding:13px 0;border-bottom:1px solid #e2d3c7}.links small{color:#665850;margin-left:12px}.screens{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.screens img{width:100%;border:1px solid #e2d3c7}.screens span{display:block;font-size:13px;margin-top:4px}footer{margin-top:42px;font-size:13px;color:#665850}@media(max-width:600px){main{margin-top:32px}.screens{grid-template-columns:1fr}h1{font-size:34px}.links small{display:block;margin-left:0}}</style>
<main><h1>PaperTrace</h1><p>从主题文献到有原文证据的研究讨论与写作</p><p>2026-11-09 · 产品与系统设计交付包</p>
<h2>先读方案</h2><div class="links"><a href="01_Project_Book.pdf">项目书<small>用户故事、完整功能、Agent 架构与评估设计</small></a><a href="02_Proposal/Potential_Solutions_ZH.pdf">Potential Solutions · 中文</a><a href="02_Proposal/Potential_Solutions_EN.pdf">Potential Solutions · English</a><a href="02_Proposal/Course_Proposal_20261008.pdf">课程 Proposal<small>2026-10-08 课程稿快照；第5节数据与评估待合稿</small></a></div>
<h2>看设计与体验</h2><div class="screens"><a href="03_Design/Previews/01_Home.png"><img src="03_Design/Previews/01_Home.png" alt="研究主题与最近会话"><span>研究入口</span></a><a href="03_Design/Previews/02_Research.png"><img src="03_Design/Previews/02_Research.png" alt="左聊右读"><span>对话与阅读</span></a><a href="03_Design/Previews/03_Evidence.png"><img src="03_Design/Previews/03_Evidence.png" alt="原文证据浮层"><span>证据上下文</span></a></div>
<div class="links"><a href="FIGMA_URL">打开 Figma<small>v5 三屏桌面视觉稿</small></a><a href="03_Design/PaperTrace_Design_v5.pdf">三屏设计 PDF</a><a href="04_Prototype/PaperTrace_Prototype.html">打开离线交互原型<small>v4 预设场景：主题、阅读、比较、引用与回查；刷新重置</small></a></div>
<h2>修改与交接</h2><p>05_Source 保存 Markdown、排版脚本及技术参考；03_Design/Editable_SVG 保存三屏矢量素材。06_Reviews 收录 Claude、DeepSeek 的审阅意见及整合记录。</p><footer>项目阶段与后续工作集中见项目书“交付与后续工作”。</footer></main></html>'''
navigation = navigation.replace('2026-11-09 · 产品与系统设计交付包', 'v1.5 · 2026-11-09 · 产品与系统设计交付包')
navigation = navigation.replace('<h2>看设计与体验</h2>', '<h2>看设计与体验</h2><div class="links"><a href="03_Design/Workspace_Design.pdf">主题科研工作区设计<small>完整用户故事、材料管理、阅读积累、稿件往返与来源更新规则</small></a></div>')
navigation = navigation.replace('<h2>修改与交接</h2>', '<h2>调研依据</h2><div class="links"><a href="06_Reviews/Competitive_Review.pdf">Agentero / DeepTutor 三方对照<small>官方资料、固定提交源码、产品取舍与验证任务</small></a></div><h2>修改与交接</h2>')
(OUT / 'START_HERE.html').write_text(navigation.replace('FIGMA_URL', html.escape(figma)))

# Validate every rebased link in the three edited source documents and reading PDFs.
checked = 0
for src, dest in mapping.items():
    if src in [ROOT / 'docs/source/PaperTrace_Project_Book_ZH.md', ROOT / 'docs/source/Proposal/Potential_Solutions_Draft.md', ROOT / 'docs/source/Proposal/Potential_Solutions_Draft_ZH.md', ROOT / 'docs/product-plan/Research_Workspace_Design_ZH.md']:
        uris = [m[2] for m in LINK.finditer(dest.read_text())]
    elif dest.suffix == '.pdf' and (dest.parent in [OUT, OUT / '02_Proposal'] or dest == OUT / '03_Design/Workspace_Design.pdf') and src.name != 'COMP7608B_Group52_Proposal.pdf':
        uris = [str(a.get_object()['/A']['/URI']) for p in PdfReader(dest).pages for a in p.get('/Annots', []) if a.get_object().get('/A', {}).get('/URI')]
    else:
        continue
    for uri in uris:
        u = urlsplit(uri)
        if u.scheme or not u.path:
            continue
        assert (dest.parent / unquote(u.path)).exists(), (dest, uri)
        checked += 1
records = []
for path in sorted(OUT.rglob('*')):
    if path.is_file():
        records.append({'path': str(path.relative_to(OUT)), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
audit = {'date': '2026-11-09', 'files': records, 'mainLocalLinksChecked': checked, 'supportingMissingLinks': missing}
(OUT / '06_Reviews/Package_Manifest.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
archive = OUT.parent / (OUT.name + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(OUT.rglob('*')):
        if path.is_file():
            z.write(path, path.relative_to(OUT.parent))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({'folder': str(OUT), 'zip': str(archive), 'bytes': archive.stat().st_size, 'files': len(records) + 1, 'mainLocalLinksChecked': checked, 'supportingMissingLinks': missing}, ensure_ascii=False, indent=2))
