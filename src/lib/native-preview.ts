import {escapePreviewText} from './file-preview';
type WriterNode={type?:string;text?:string;attrs?:Record<string,unknown>;content?:WriterNode[];marks?:{type:string}[]};
function renderWriterNode(node:WriterNode,depth=0):string{
 if(depth>100)return '';
 const esc=(v:unknown)=>escapePreviewText(String(v??''));
 if(node.type==='text'){
  let text=esc(node.text);for(const mark of node.marks??[]){const tag=({bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'} as Record<string,string>)[mark.type];if(tag)text=`<${tag}>${text}</${tag}>`;}return text;
 }
 if(node.type==='hardBreak')return '<br>';
 if(node.type==='horizontalRule'||node.type==='pageBreak')return '<hr>';
 if(node.type==='image'||node.type==='inlineImage')return `<p>[Image: ${esc(node.attrs?.alt??'embedded image')}]</p>`;
 const children=(node.content??[]).slice(0,10000).map(n=>renderWriterNode(n,depth+1)).join('');
 const tag=node.type==='heading'?`h${Math.min(3,Math.max(1,Number(node.attrs?.level)||1))}`:({paragraph:'p',bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote',codeBlock:'pre',table:'table',tableRow:'tr',tableCell:'td',tableHeader:'th'} as Record<string,string>)[node.type??''];
 return tag?`<${tag}>${children}</${tag}>`:children;
}
export function renderNativePreview(kind:string,content:unknown):string {
 const envelope=content as {format?:string;payload?:{tree?:WriterNode}}|null;
 const writerTree=envelope?.format==='axxes-office'?envelope.payload?.tree:undefined;
 const data=(content && typeof content==='object'?content:{}) as {blocks?:{type?:string;text?:string}[];cells?:Record<string,string>;slides?:{title?:string;body?:string;bullets?:string[]}[]};
 const esc=(value:unknown)=>escapePreviewText(String(value??''));let body='';
 if(kind==='doc' && writerTree)body=renderWriterNode(writerTree);
 else if(kind==='doc')body=(data.blocks??[]).slice(0,2000).map(b=>b.type==='heading1'?`<h1>${esc(b.text)}</h1>`:b.type==='heading2'?`<h2>${esc(b.text)}</h2>`:b.type==='divider'?'<hr>':`<p>${esc(b.text)}</p>`).join('');
 if(kind==='sheet'){
  const cells=data.cells??{};let rows=0,cols=0;
  for(const ref of Object.keys(cells)){const match=/^([A-Z]{1,3})(\d{1,7})$/.exec(ref);if(!match)continue;let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;cols=Math.min(100,Math.max(cols,col));rows=Math.min(500,Math.max(rows,Number(match[2])));}
  const column=(index:number)=>{let name='';for(let n=index;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  body='<table><thead><tr><th></th>'+Array.from({length:cols},(_,c)=>`<th>${column(c+1)}</th>`).join('')+'</tr></thead><tbody>'+Array.from({length:rows},(_,r)=>'<tr><th>'+String(r+1)+'</th>'+Array.from({length:cols},(_,c)=>`<td>${esc(cells[column(c+1)+(r+1)])}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
 }
 if(kind==='slides')body=(data.slides??[]).slice(0,200).map((s,i)=>`<section><small>Slide ${i+1}</small><h1>${esc(s.title)}</h1><p>${esc(s.body)}</p><ul>${(s.bullets??[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul></section>`).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><style>body{padding:24px;font:16px/1.6 system-ui;background:white;color:#171717}p{white-space:pre-wrap}section{padding:32px;border:1px solid #ddd;margin:16px 0}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;white-space:pre-wrap}th{background:#f5f5f5}</style></head><body>${body||'<p>This file is empty.</p>'}</body></html>`;
}
