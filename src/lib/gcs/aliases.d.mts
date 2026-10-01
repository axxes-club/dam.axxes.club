import type {Storage} from '@google-cloud/storage';
export function loadAliases(options:{storage?:Storage;bucket:string;manifestObject?:string;progressObject?:string;now?:()=>number}):()=>Promise<{aliases:Record<string,{bucket:string;object_name:string}>;verifiedKeys:Set<string>;reverse:Record<string,string[]>}>;
