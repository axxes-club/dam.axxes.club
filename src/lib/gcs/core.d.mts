import type {Receipt,Descriptor,StoredFile,Registry,Store,CompiledRoute,UploadedFile,PostPolicy} from './contracts.mjs';
export class StorageError extends Error {constructor(message:string,status?:number);status:number;}
export class Adapter<Transaction = unknown> {
 constructor(options:{app:string;bucket:string;baseUrl:string;origins?:string[];routes:Record<string,CompiledRoute<Transaction>>;store:Store;registry:Registry<Transaction>;now?:()=>number});
 store:Store;registry:Registry<Transaction>;
 init(request:Request,route:string,files:Descriptor[],input?:unknown):Promise<{uploadId:string;policy:PostPolicy}[]>;
 renew(request:Request,id:string,input?:unknown):Promise<unknown>;
 complete(request:Request,id:string,input?:unknown):Promise<UploadedFile>;
 read(request:Request|null,key:string,authorize:(request:Request|null,key:string,file:StoredFile)=>Promise<boolean>):Promise<string>;
 remove(request:Request|null,key:string,authorize:(request:Request|null,key:string,file:StoredFile)=>Promise<boolean>):Promise<boolean>;
 checkObject(file:StoredFile,record:Receipt):void;
}
export function safeKey(key:unknown):string;
export function objectKeyFromUrl(url:string,options:{bucket:string;origins:string[];aliases?:Record<string,{bucket:string;object_name:string}>;verifiedKeys?:Set<string>}):string|null;
export function ownerDigest(owner:string):string;
export function validateFiles(files:unknown,rules:Record<string,{bytes:number;count:number}>):void;
export function assertPrivateBucket(metadata:unknown):void;
export function corsForOrigins(origins:string[]):unknown[];
