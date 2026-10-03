import type {Storage} from '@google-cloud/storage';
import type {Descriptor,StoredFile,PostPolicy,Store} from './contracts.mjs';
export class GoogleStore implements Store {
 constructor(options:{storage?:Storage;bucket:string});
 assertPrivate():Promise<void>;signPost(key:string,file:Descriptor,metadata:Record<string,string>,expires:number):Promise<PostPolicy>;
 save(key:string,data:Uint8Array,metadata:Record<string,string>):Promise<void>;
 stat(key:string):Promise<StoredFile|null>;freeze(from:string,to:string,generation:string,metadata:Record<string,string>,contentType:string):Promise<StoredFile>;
 readUrl(key:string,generation:string,expires:number):Promise<string>;delete(key:string,generation:string):Promise<void>;
}
