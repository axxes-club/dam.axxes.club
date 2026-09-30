import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOwnAsset, effectiveDeadline, lifecycleAvailable, restoreDeadline } from './asset-policy';
test('personal owner is required even when an ID is known',()=>{assert.equal(canOwnAsset({tenantId:null,ownerUserId:'a'},'b',[]),false);assert.equal(canOwnAsset({tenantId:null,ownerUserId:'a'},'a',[]),true)});
test('workspace membership never grants personal access',()=>assert.equal(canOwnAsset({tenantId:null,ownerUserId:'a'},'b',['workspace']),false));
test('earliest ancestor deadline wins',()=>assert.equal(effectiveDeadline(new Date(200),[new Date(100),null])?.getTime(),100));
test('trash and expiry immediately block delivery',()=>{assert.equal(lifecycleAvailable(null,new Date(100),new Date(100)),false);assert.equal(lifecycleAvailable(new Date(1),null,new Date(0)),false)});
test('restore requires explicit removal or replacement of elapsed deadline',()=>{assert.throws(()=>restoreDeadline(new Date(1),undefined,new Date(2)));assert.equal(restoreDeadline(new Date(1),null,new Date(2)),null)});
