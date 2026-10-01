import type {Pool,PoolClient}from'pg';import type{StorageKey,QuotaActor}from'./types';
export function validateKey(key:unknown):StorageKey;
export function assertChargingUser(client:Pool|PoolClient,key:StorageKey):Promise<void>;
export function authorizeQuota(client:Pool|PoolClient,actor:QuotaActor,key:StorageKey,write?:boolean):Promise<QuotaActor>;

export function chargingUserForHandoff(client:Pool|PoolClient,session:{tenantId:string;createdById:string}):Promise<string>;
