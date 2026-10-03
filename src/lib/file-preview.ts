import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {officeExtensions,previewKind} from './preview-kind';
export {previewKind};
const run=promisify(execFile);
export function escapePreviewText(text:string):string {return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function renderTextPreview(text:string):string {
 const escaped=escapePreviewText(text);
 return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#fff;color:#171717;font:14px/1.6 ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><pre>${escaped}</pre></body></html>`;
}
let converting=false;
export async function convertDocument(bytes:Uint8Array,filename:string):Promise<Uint8Array> {
 const extension=filename.split('.').pop()?.toLowerCase() ?? '';
 if(!officeExtensions.has(extension))throw Error('Unsupported document format');
 if(bytes.length>32*1024*1024)throw Error('Document exceeds the 32 MB preview limit');
 if(converting)throw Error('Preview service is busy. Please retry.');
 converting=true;
 let dir:string|undefined;
 try{
  dir=await mkdtemp(join(tmpdir(),'folders-preview-'));
  const input=join(dir,`source.${extension}`);
  await writeFile(input,bytes);
  await mkdir(join(dir,'profile'));
  await writeFile(join(dir,'profile','registrymodifications.xcu'),`<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>`);
  const converted=await run('libreoffice',[`-env:UserInstallation=${pathToFileURL(join(dir,'profile')).href}`,'--headless','--nologo','--nodefault','--norestore','--convert-to','pdf','--outdir',dir,input],{timeout:45_000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,LANG:'C.UTF-8',HOME:dir,TMPDIR:dir}});
  const pdf=await readFile(join(dir,'source.pdf')).catch(()=>{throw Error('Document conversion failed: '+converted.stdout+' '+converted.stderr);});
  if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Could not render this document');
  return pdf;
 }finally{try{if(dir)await rm(dir,{recursive:true,force:true});}finally{converting=false;}}
}
export async function readPreviewBytes(response:Response,limit=32*1024*1024):Promise<Uint8Array>{
 if(!response.ok||!response.body)throw Error('File unavailable');
 if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw Error('File exceeds the preview limit');}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('File exceeds the preview limit');parts.push(value);}}finally{await reader.cancel();}
 const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
