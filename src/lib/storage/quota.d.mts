import type {Pool,PoolClient} from 'pg';
import type {StorageKey,StorageSnapshot} from './types';
export const DEFAULT_BASE_BYTES:bigint;
export class QuotaError extends Error{status:number;code:string;details:Record<string,unknown>;constructor(message:string,status?:number,code?:string,details?:Record<string,unknown>);}
export function parseBytes(value:unknown):bigint;
export function ensureAccount(client:Pool|PoolClient,key:StorageKey):Promise<void>;
export function readStorage(client:Pool|PoolClient,key:StorageKey,now?:Date):Promise<StorageSnapshot>;
export function lockAccount(client:PoolClient,key:StorageKey):Promise<void>;
export function reserveBatch(client:PoolClient,input:{key:StorageKey;records:Array<{id:string;descriptor:{size:number};maxExpiresAt:number;quota?:StorageKey}>;enforce:'shadow'|'enforce';now?:Date}):Promise<void>;
export function expireReservations(client:PoolClient,now?:Date):Promise<number>;
export function cancelReservations(client:PoolClient,input:{key:StorageKey;uploadIds:string[]}):Promise<number>;
export function commitCharge(client:PoolClient,input:{uploadId:string;assetId:string;objectKey:string;generation:string;actualBytes:string;now?:Date}):Promise<void>;
export function lockedCharge(client:PoolClient,input:{objectKey:string;generation:string}):Promise<any>;
export function objectRetained(client:PoolClient,input:{objectKey:string;generation:string}):Promise<boolean>;
export function releaseObjectCharge(client:PoolClient,input:{objectKey:string;generation:string}):Promise<boolean>;
export function deleteChargedObject(pool:Pool,input:{objectKey:string;generation:string},remove:()=>Promise<void>):Promise<boolean>;
