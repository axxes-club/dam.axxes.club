import {test} from 'node:test'
import assert from 'node:assert/strict'
import {appTarget} from '../src/lib/app-links'

test('Office links use Work and retain record, asset and tenant',()=>{
 const target=appTarget('office')!
 assert.equal(target.base,'https://axxes.work')
 assert.equal(target.url('document-123','team-456'),'https://axxes.work/d/document-123?tenant=team-456')
 assert.equal(target.quickLook!('document-123','team-456'),'https://axxes.work/quicklook/document-123?tenant=team-456')
 const opened=new URL(target.openUnlinked!('asset-123','team-456'))
 assert.equal(opened.origin,'https://axxes.work')
 assert.equal(opened.pathname,'/open')
 assert.equal(opened.searchParams.get('asset'),'asset-123')
 assert.equal(opened.searchParams.get('tenant'),'team-456')
 assert.equal(appTarget('lanes')!.base,'https://lanes.axxes.club')
})
