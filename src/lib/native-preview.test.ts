import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderNativePreview} from './native-preview';
test('native document and presentation content is escaped in preview',()=>{
 for(const [kind,content] of [['doc',{blocks:[{type:'heading1',text:'<script>alert(1)</script>'}]}],['slides',{slides:[{title:'<script>alert(1)</script>',body:'Slide body',bullets:['Bullet']}]}]] as const){const html=renderNativePreview(kind,content);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));}
});
test('native sheet preview preserves positions and escapes cell markup',()=>{const html=renderNativePreview('sheet',{cells:{A1:'Label',B2:'<img onerror=alert(1)>'}});assert.ok(html.includes('<td>Label</td>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));});
test('native empty file preview is readable',()=>assert.ok(renderNativePreview('doc',null).includes('This file is empty')));
