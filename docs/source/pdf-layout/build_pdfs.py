from pathlib import Path
from urllib.parse import urlsplit,unquote,quote
import subprocess,json,re,os,hashlib,sys
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[3]
LAYOUT=Path(__file__).resolve().parent
BUILD=ROOT/'docs/.build/academic-pdf';BUILD.mkdir(parents=True,exist_ok=True)
SPECS=[('PaperTrace_Project_Book_ZH','docs/source/PaperTrace_Project_Book_ZH.md','docs/deliverables/PaperTrace_Project_Book_ZH.pdf','PaperTrace 项目书','项目书',True),('Potential_Solutions_Draft','docs/source/Proposal/Potential_Solutions_Draft.md','docs/deliverables/Proposal/Potential_Solutions_Draft.pdf','PaperTrace: Potential Solutions','Potential Solutions',False),('Potential_Solutions_Draft_ZH','docs/source/Proposal/Potential_Solutions_Draft_ZH.md','docs/deliverables/Proposal/Potential_Solutions_Draft_ZH.pdf','PaperTrace 潜在解决方案','潜在解决方案',True)]
SPECS.append(('Research_Workspace_Design_ZH','docs/product-plan/Research_Workspace_Design_ZH.md','docs/deliverables/Design/Research_Workspace_Design_ZH.pdf','PaperTrace 主题科研工作区设计','工作区设计',True))
SPECS.append(('PaperTrace_Technical_Book_ZH','docs/source/PaperTrace_Technical_Book_ZH.md','docs/.build/deliverables/PaperTrace_Technical_Book_ZH.pdf','PaperTrace 开发技术书','开发技术书',True))
PDFMAP={(ROOT/src).resolve():(ROOT/out).resolve() for _,src,out,*_ in SPECS}
def plain(x):
 if isinstance(x,list):return ''.join(plain(i) for i in x)
 if isinstance(x,dict):
  if x.get('t')=='Str':return x['c']
  if x.get('t') in ('Space','SoftBreak','LineBreak'):return ' '
  if x.get('t')=='Code':return x['c'][1]
  return plain(x.get('c',[]))
 return ''
def latex_code(s):
 chars={'\\':r'\textbackslash{}','{':r'\{','}':r'\}','_':r'\_','%':r'\%','&':r'\&','#':r'\#','$':r'\$','^':r'\textasciicircum{}','~':r'\textasciitilde{}'}
 return r'\texttt{'+''.join(chars.get(c,c)+(r'\allowbreak{}' if c in '/_.:-' else '') for c in s)+'}'
reports=[]
for key,source,output,title,short,chinese in SPECS:
 if len(sys.argv)>1 and key not in sys.argv[1:]:continue
 src=ROOT/source;out=ROOT/output
 doc=json.loads(subprocess.check_output(['pandoc',str(src),'-f','markdown','-t','json']))
 blocks=doc['blocks'];subtitle='';version=None
 if blocks and blocks[0]['t']=='Header' and blocks[0]['c'][0]==1:blocks.pop(0)
 if key in ('PaperTrace_Project_Book_ZH','PaperTrace_Technical_Book_ZH') and blocks and blocks[0]['t']=='Para' and blocks[0]['c'][0].get('t')=='Strong':subtitle=plain(blocks.pop(0))
 if key not in ('PaperTrace_Project_Book_ZH','PaperTrace_Technical_Book_ZH') and blocks and blocks[0]['t']=='Para' and (plain(blocks[0]).startswith('Draft date:') or plain(blocks[0]).startswith('版本日期：')):version=blocks.pop(0)
 counters={'wideTablesReflowed':0,'workflowRows':0,'diagrams':0}
 def visit(x):
  if isinstance(x,list):return [visit(i) for i in x]
  if not isinstance(x,dict):return x
  t=x.get('t')
  if t=='Header':x['c'][0]=max(1,x['c'][0]-1)
  if t=='Link':
   target=x['c'][2][0];u=urlsplit(target)
   if not u.scheme and u.path:
    dest=(src.parent/unquote(u.path)).resolve();dest=PDFMAP.get(dest,dest)
    href=os.path.relpath(dest,out.parent).replace(os.sep,'/')
    if u.fragment:href+='#'+u.fragment
    x['c'][2][0]=quote(href,safe='/#?=:')
  if t=='Code':return {'t':'RawInline','c':['latex',latex_code(x['c'][1])]}
  if t=='CodeBlock' and 'mermaid' in x['c'][0][1]:counters['diagrams']+=1;return {'t':'RawBlock','c':['latex',(LAYOUT/('tech-architecture.tex' if key=='PaperTrace_Technical_Book_ZH' else 'workflow.tex')).read_text()]}
  return {k:visit(v) for k,v in x.items()}
 blocks=visit(blocks)
 final=[]
 for b in blocks:
  if b['t']=='RawBlock' and b['c'][0]=='html' and '<!--' in b['c'][1]:continue
  if b['t']=='Table':
   c=b['c'];cols=len(c[2]);headers=c[3][1][0][1]
   rows=[]
   for body in c[4]:rows.extend(body[3])
   if cols>=5:
    counters['wideTablesReflowed']+=1
    for idx,row in enumerate(rows):
     cells=row[1];name=cells[0][4];inlines=name[0]['c'] if name and name[0]['t'] in ('Para','Plain') else [{'t':'Str','c':plain(name)}]
     def esc_text(value):
      chars={'\\':r'\textbackslash{}','{':r'\{','}':r'\}','_':r'\_','%':r'\%','&':r'\&','#':r'\#','$':r'\$','^':r'\textasciicircum{}','~':r'\textasciitilde{}'}
      return ''.join(chars.get(ch,ch) for ch in value)
     entries=[]
     for i,cell in enumerate(cells[1:],1):
      label=plain(headers[i][4]);value=plain(cell[4]).strip()
      if label=='完成条件' and '部分：' in value:
       complete,partial=value.split('部分：',1)
       complete=complete.removeprefix('完成：').strip().rstrip('。')
       action=''
       if '。用户' in partial:
        partial,action=partial.split('。用户',1);action='用户'+action
       entries.extend([('完成条件',complete),('部分完成',partial.strip().rstrip('。'))])
       if action:entries.append(('后续操作',action.strip().rstrip('。')))
      else:entries.append((label,value))
     panel=[r'\par\vspace{10pt}\noindent\begin{minipage}{\linewidth}',r'{\large\bfseries '+f'4.{idx+1}'+r'\quad '+esc_text(plain(name))+r'}\par\vspace{7pt}',r'\begingroup\setlength{\tabcolsep}{6pt}\renewcommand{\arraystretch}{1.28}',r'\begin{tabular}{@{}>{\bfseries\raggedright\arraybackslash}p{2.25cm}>{\raggedright\arraybackslash}p{\dimexpr\linewidth-2.25cm-2\tabcolsep\relax}@{}}',r'\toprule']
     panel.extend(esc_text(label)+' & '+esc_text(value)+r' \\[3pt]' for label,value in entries)
     panel.extend([r'\bottomrule',r'\end{tabular}\endgroup',r'\end{minipage}\par\vspace{13pt}'])
     if idx==3:final.append({'t':'RawBlock','c':['latex',r'\newpage']})
     final.append({'t':'RawBlock','c':['latex','\n'.join(panel)]});counters['workflowRows']+=1

   else:final.extend([{'t':'RawBlock','c':['latex',r'\begingroup\small']},b,{'t':'RawBlock','c':['latex',r'\endgroup']}])
  else:final.append(b)
 if version:
  final.extend([{'t':'Header','c':[1,['version-note',[],[]],[{'t':'Str','c':'版本说明' if chinese else 'Version note'}]]},{'t':'RawBlock','c':['latex',r'\begingroup\small']},visit(version),{'t':'RawBlock','c':['latex',r'\endgroup']}])
 if key=='Research_Workspace_Design_ZH':
  final.insert(0,{'t':'RawBlock','c':['latex',r'\linespread{1.12}\selectfont']})
 doc['blocks']=final
 doc['meta'].update({'title':{'t':'MetaInlines','c':[{'t':'Str','c':title}]},'shorttitle':{'t':'MetaInlines','c':[{'t':'Str','c':short}]},'chinese':{'t':'MetaBool','c':chinese}})
 if subtitle:doc['meta']['subtitle']={'t':'MetaInlines','c':[{'t':'Str','c':subtitle}]}
 ast=BUILD/(key+'.json');ast.write_text(json.dumps(doc,ensure_ascii=False))
 tex=BUILD/(key+'.tex')
 with tex.open('w') as f:subprocess.run(['pandoc',str(ast),'-f','json','-t','latex','--standalone','--no-highlight','--template',str(LAYOUT/'academic.tex')],stdout=f,check=True)
 for run in range(2):
  r=subprocess.run(['xelatex','-interaction=nonstopmode','-halt-on-error','-output-directory',str(BUILD),str(tex)],capture_output=True,text=True,cwd=ROOT)
  (BUILD/(key+f'.run{run+1}.txt')).write_text(r.stdout+r.stderr)
  if r.returncode:raise RuntimeError((r.stdout+r.stderr)[-6500:])
 output_pdf=BUILD/(key+'.pdf');out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(output_pdf.read_bytes())
 reader=PdfReader(out);texts=[p.extract_text() or '' for p in reader.pages]
 report={'source':source,'pdf':output,'pages':len(reader.pages),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'pdfSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'pageTextLengths':[len(t) for t in texts],**counters}
 reports.append(report);print(json.dumps(report,ensure_ascii=False),flush=True)
previous=json.loads((BUILD/'Build_Report.json').read_text()) if (BUILD/'Build_Report.json').exists() else []
updated={r['source']:r for r in previous+reports}
(BUILD/'Build_Report.json').write_text(json.dumps(list(updated.values()),ensure_ascii=False,indent=2)+'\n')
