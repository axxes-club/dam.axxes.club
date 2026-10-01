import type {Pool,PoolClient} from 'pg';
import type {StorageKey,StorageSnapshot} from './types';
export const DEFAULT_BASE_BYTES:bigint;
export class QuotaError extends Error{status:number;code:string;details:Record<string,unknown>;constructor(message:string,status?:number,code?:string,details?:Record<string,unknown>);}
export function parseBytes(value:unknown):bigint;
export function ensureAccount(client:Pool|PoolClient,key:StorageKey):Promise<void>;
export function readStorage(client:Pool|PoolClient,key:StorageKey,now?:Date):Promise<StorageSnapshot>;
