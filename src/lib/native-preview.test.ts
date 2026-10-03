import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderNativePreview} from './native-preview';
test('native document and presentation content is escaped in preview',()=>{
 for(const [kind,content] of [['doc',{blocks:[{type:'heading1',text:'<script>alert(1)</script>'}]}],['slides',{slides:[{title:'<script>alert(1)</script>',body:'Slide body',bullets:['Bullet']}]}]] as const){const html=renderNativePreview(kind,content);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));}
});
test('native sheet preview preserves positions and escapes cell markup',()=>{const html=renderNativePreview('sheet',{cells:{A1:'Label',B2:'<img onerror=alert(1)>'}});assert.ok(html.includes('<td>Label</td>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));});
test('native empty file preview is readable',()=>assert.ok(renderNativePreview('doc',null).includes('This file is empty')));
test('current Writer format envelopes render document text and tables instead of an empty file',()=>{
 const html=renderNativePreview('doc',{format:'axxes-office',formatVersion:1,kind:'doc',payload:{tree:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'Current Writer'}]},{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'Private cell <script>'}]}]}]}]}]}}});
 assert.ok(html.includes('<h1>Current Writer</h1>'));assert.ok(html.includes('<table>'));assert.ok(html.includes('Private cell &lt;script&gt;'));assert.ok(!html.includes('This file is empty'));
});
