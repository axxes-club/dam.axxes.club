import type {Adapter} from './core.mjs';
import type {StoredFile} from './contracts.mjs';
export function handlers<Transaction>(adapter:Adapter<Transaction>,hooks:{resolveKey(request:Request):Promise<string>;authorizeRead(request:Request|null,key:string,file:StoredFile):Promise<boolean>;authorizeDelete(request:Request|null,key:string,file:StoredFile):Promise<boolean>}):{POST(request:Request):Promise<Response>;GET(request:Request):Promise<Response>;DELETE(request:Request):Promise<Response>};
