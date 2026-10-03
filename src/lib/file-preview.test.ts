import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewKind,renderTextPreview,convertDocument} from './file-preview';
test('missing MIME metadata still identifies common file formats',()=>{for(const [name,want] of [['report.pdf','pdf'],['budget.xlsx','office'],['deck.ppt','office'],['notes.md','text'],['song.m4a','audio'],['movie.mp4','video']] as const)assert.equal(previewKind({name,mimeType:null}),want);});
test('HTML preview displays source text without executable markup',()=>{const html=renderTextPreview('<script>alert(1)</script>');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));});
test('conversion rejects unsupported extensions before invoking a process',async()=>{await assert.rejects(convertDocument(new Uint8Array([1]),'malicious.exe'),/Unsupported/);});

if(process.env.TEST_DOCUMENT_CONVERSION==='1')test('real Linux document conversion renders RTF and spreadsheet previews as PDF',async()=>{
 for(const [name,body] of [['sample.rtf','{\\rtf1\\ansi Preview fixture}'],['sample.csv','Name,Value\nSample,42']] as const){const pdf=await convertDocument(new TextEncoder().encode(body),name);assert.equal(new TextDecoder().decode(pdf.subarray(0,5)),'%PDF-');assert.ok(pdf.length>1000);}
});

if(process.env.TEST_DOCUMENT_CONVERSION==='1')test('real OOXML document spreadsheet and presentation files render PDF',async()=>{
 for(const name of ['sample.docx','sample.xlsx','sample.pptx']){const bytes=await readFile(new URL('../../tests/fixtures/previews/'+name,import.meta.url));const pdf=await convertDocument(bytes,name).catch(error=>{throw Error(name+': '+error.message);});assert.equal(new TextDecoder().decode(pdf.subarray(0,5)),'%PDF-');assert.ok(pdf.length>1000,name);}
});
test('native Work files receive an authenticated preview instead of unsupported fallback',()=>assert.equal(previewKind({name:'Budget',mimeType:'application/vnd.axxes.office.sheet'}),'native'));
test('converted PDFs use inline delivery without a sandbox that disables browser PDF viewers',async()=>{
 const {pdfPreviewResponse}=await import('./file-preview');const response=pdfPreviewResponse(new TextEncoder().encode('%PDF-1.4\n'));
 assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(response.headers.get('Content-Disposition'),'inline');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.ok(!response.headers.get('Content-Security-Policy')?.includes('sandbox'));
});
