import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {FOLDERS_OPERATIONS,type FoldersOperation} from './contracts'
export type SignedFoldersRequest={version:1;caller:'office';userId:string;libraryId:string;operation:FoldersOperation;requestId:string;expiresAt:number;bodyDigest:string;payload:unknown}
function secretCheck(secret:string){if(secret.length<32)throw new Error('Folders service secret must have at least 32 characters')}
function digest(payload:unknown){return createHash('sha256').update(JSON.stringify(payload)).digest('hex')}
function signature(body:string,secret:string){return createHmac('sha256',secret).update('POST\n/api/internal/office\n'+body).digest('hex')}
export function signFoldersRequest(input:{userId:string;libraryId:string;operation:FoldersOperation;payload:unknown},secret:string,now=Date.now()){
 secretCheck(secret)
 if(!FOLDERS_OPERATIONS.includes(input.operation))throw new Error('Unknown service operation')
 const envelope:SignedFoldersRequest={version:1,caller:'office',...input,requestId:randomUUID(),expiresAt:now+60_000,bodyDigest:digest(input.payload)}
 const body=JSON.stringify(envelope);return {body,signature:signature(body,secret)}
}
export function verifyFoldersRequest(body:string,supplied:string,secret:string,now=Date.now()):SignedFoldersRequest{
 secretCheck(secret)
 if(body.length>65_536||!/^[a-f0-9]{64}$/i.test(supplied))throw new Error('Invalid service request')
 const expected=Buffer.from(signature(body,secret),'hex');const actual=Buffer.from(supplied,'hex')
 if(!timingSafeEqual(expected,actual))throw new Error('Invalid service signature')
 const value=JSON.parse(body) as SignedFoldersRequest
 if(value.version!==1||value.caller!=='office'||typeof value.userId!=='string'||!value.userId||value.userId.length>200||typeof value.libraryId!=='string'||!value.libraryId||value.libraryId.length>200||typeof value.requestId!=='string'||value.requestId.length>100||!value.requestId||!FOLDERS_OPERATIONS.includes(value.operation)||value.bodyDigest!==digest(value.payload))throw new Error('Invalid service request')
 if(!Number.isFinite(value.expiresAt)||value.expiresAt<=now||value.expiresAt>now+60_000)throw new Error('Service credential expired')
 return value
}
export const MUTATING_OPERATIONS=new Set<FoldersOperation>(['createFolder','rename','move','trash','restore','renameFolder','trashFolder','restoreFolder','uploadStart','uploadFinish','linkOffice'])
