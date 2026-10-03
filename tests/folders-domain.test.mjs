import test from 'node:test';
import assert from 'node:assert/strict';
import {patchFoldersRouting} from '../scripts/folders-domain.mjs';
const backend='https://www.googleapis.com/compute/v1/projects/gravy-meta/global/backendServices/dam-be';
function fixture(){return {name:'axxes-lb',fingerprint:'current',defaultService:backend,hostRules:[{hosts:['dam.axxes.club','folders.axxes.club'],pathMatcher:'dam-matcher'},{hosts:['folders.axxes.app'],pathMatcher:'folders-app-redirect'},{hosts:['other.example'],pathMatcher:'other-matcher'}],pathMatchers:[{name:'dam-matcher',defaultService:backend},{name:'folders-app-redirect',defaultUrlRedirect:{hostRedirect:'folders.axxes.club',stripQuery:false}},{name:'other-matcher',defaultService:'other-backend'}]};}
test('canonical app goes to the backend; legacy public links redirect with path/query intact',()=>{
 const after=patchFoldersRouting(fixture());
 const canonical=after.hostRules.find(r=>r.hosts.includes('folders.axxes.app'));
 assert.equal(after.pathMatchers.find(p=>p.name===canonical.pathMatcher).defaultService,backend);
 const old=after.pathMatchers.find(p=>p.name==='folders-club-redirect');
 assert.deepEqual(old.defaultUrlRedirect,{hostRedirect:'folders.axxes.app',httpsRedirect:true,redirectResponseCode:'PERMANENT_REDIRECT',stripQuery:false});
 assert.deepEqual(old.pathRules,[{paths:['/api','/api/*'],service:backend}]);
});
test('unrelated routing and concurrency fingerprint survive; inputs are not mutated',()=>{
 const before=fixture(),copy=structuredClone(before),after=patchFoldersRouting(before);
 assert.deepEqual(before,copy);assert.equal(after.fingerprint,'current');
 assert.deepEqual(after.hostRules.find(r=>r.hosts.includes('other.example')),before.hostRules[2]);
 assert.deepEqual(after.pathMatchers.find(p=>p.name==='other-matcher'),before.pathMatchers[2]);
 assert.deepEqual(after.hostRules.find(r=>r.hosts.includes('dam.axxes.club')),{hosts:['dam.axxes.club'],pathMatcher:'dam-matcher'});
 assert.deepEqual(patchFoldersRouting(after),after);
});
test('missing Folders backend fails before any routing can be changed',()=>{const map=fixture();map.pathMatchers[0].defaultService='other-backend';assert.throws(()=>patchFoldersRouting(map),/backend/);});
