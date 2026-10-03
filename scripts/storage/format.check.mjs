import{test}from'node:test';import assert from'node:assert/strict';import{formatBytes,gigabytesToBytes,bytesToGigabytes,storagePercent}from'../../src/lib/storage/format.mjs';
test('decimal GB entry is exact and excludes exponent/negative/overflow inputs',()=>{
assert.equal(gigabytesToBytes('5'),'5000000000');assert.equal(gigabytesToBytes('1.25'),'1250000000');assert.equal(bytesToGigabytes('1250000000'),'1.25');
for(const value of ['-1','1e3','1.0000000001','','999999999999'])assert.throws(()=>gigabytesToBytes(value));
});
test('storage meter handles tiny, empty, zero capacity and over-limit usage',()=>{
assert.equal(formatBytes('68'),'68 B');assert.equal(formatBytes('5000000000'),'5.00 GB');assert.equal(storagePercent('0','0'),0);assert.equal(storagePercent('1','0'),100);assert.equal(storagePercent('6000000000','5000000000'),100);assert.equal(storagePercent('2500000000','5000000000'),50);
});
