export function gigabytesToBytes(value){
 if(typeof value!=='string'||!/^\d+(?:\.\d{0,9})?$/.test(value))throw Error('Enter a nonnegative GB amount with up to nine decimal places.');
 const [whole,fraction='']=value.split('.'),bytes=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
 if(bytes>9223372036854775807n)throw Error('Storage amount is too large.');return bytes.toString();
}
export function bytesToGigabytes(value){const bytes=BigInt(value),fraction=(bytes%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');return(bytes/1000000000n).toString()+(fraction?'.'+fraction:'');}
export function formatBytes(value){const bytes=BigInt(value);if(bytes<1000n)return bytes+' B';const units=[['TB',1000000000000n],['GB',1000000000n],['MB',1000000n],['KB',1000n]];const[label,unit]=units.find(([,size])=>bytes>=size);const hundredths=bytes*100n/unit;return(hundredths/100n)+'.'+(hundredths%100n).toString().padStart(2,'0')+' '+label;}
export function storagePercent(used,capacity){const u=BigInt(used),c=BigInt(capacity);if(c===0n)return u>0n?100:0;const percent=u*100n/c;return Number(percent>100n?100n:percent);}
