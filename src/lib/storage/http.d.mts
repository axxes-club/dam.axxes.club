import type{Pool}from'pg';import type{QuotaActor}from'./types';
export function storageRoutes(options:{pool:Pool;getActor:(request:Request)=>Promise<QuotaActor|null>;origins:string[];verifyService?:(request:Request)=>Promise<void>}):Record<'GET'|'PATCH'|'MEMBERS'|'INTERNAL',(request:Request)=>Promise<Response>>;
