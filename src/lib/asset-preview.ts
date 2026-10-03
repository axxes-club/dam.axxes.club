import {db} from './db';
import {nativePreviewStatement} from './native-preview-query';
import {renderNativePreview} from './native-preview';
import type {AssetRow} from './db/schema';
import {deliverAsset} from './delivery';
import {previewKind,convertDocument,readPreviewBytes,renderTextPreview,pdfPreviewResponse} from './file-preview';
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"};
export async function previewAsset(row:AssetRow,request?:Request):Promise<Response>{
 const kind=previewKind(row);
 if(kind==='native'){
  // The caller has already authorized this canonical asset and its current lifecycle.
  const result=await db.execute(nativePreviewStatement(row));
  const document=result.rows[0] as {kind:string;content:unknown}|undefined;
  if(!document)return new Response('File unavailable',{status:404,headers:privateHeaders});
  return new Response(renderNativePreview(document.kind,document.content),{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}});
 }
 if(['image','video','audio','pdf'].includes(kind))return deliverAsset(row,undefined,request);
 if(kind==='unsupported')return new Response('This file format cannot be previewed. Download it to open in its original app.',{status:415,headers:privateHeaders});
 // External URLs are never fetched by the conversion service.
 if(row.source!=='upload')return new Response('Preview is available for uploaded files.',{status:415,headers:privateHeaders});
 try{
  const bytes=await readPreviewBytes(await deliverAsset(row),kind==='text'?2*1024*1024:32*1024*1024);
  if(kind==='text')return new Response(renderTextPreview(new TextDecoder().decode(bytes)),{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}});
  const pdf=await convertDocument(bytes,row.originalFilename??row.name);
  return pdfPreviewResponse(pdf);
 }catch(error){return new Response(error instanceof Error&&/limit|busy|exceeds/.test(error.message)?error.message:'Could not render this file. Download the original or retry.',{status:422,headers:privateHeaders});}
}
