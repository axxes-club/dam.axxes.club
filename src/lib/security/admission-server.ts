import {accountAllowed,accountSessionAllowed} from './account.mjs';
import {wrapAccountAuth} from './auth-guard';
import {Pool} from 'pg';
import {admissionTransaction,admit,AdmissionError,boundedJson,wrapAdmission as wrap} from './admission.mjs';
const service='folders';
const state=globalThis as unknown as {securityAdmissionPool?:Pool};
export function securityPool(){
 if(!process.env.DATABASE_URL)throw new AdmissionError(503);
 if(!state.securityAdmissionPool){const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:2000,statement_timeout:2000,query_timeout:3000,idleTimeoutMillis:30000});pool.on('error',()=>{});state.securityAdmissionPool=pool;}
 return state.securityAdmissionPool;
}
export async function admitAction(userId:string,tenantId:string,scope='workspace',limit=1200){if(!await accountAllowed(securityPool(),userId))throw new AdmissionError(403);return admit(securityPool(),{service,scope,subject:userId,tenant:tenantId,limit});}
export async function admitRequest(request:Request,scope:string,limit=12000){
 // Bound parsing before taking shared database locks.
 const pathname=new URL(request.url).pathname;
 let credentialEmail:string|undefined;
 if(request.method==='POST'&&pathname.includes('/api/auth/')){
  const length=Number(request.headers.get('content-length')??0);if(length>16384)throw new AdmissionError(413);
  const body=await boundedJson(request) as {email?:unknown}|null;
  if(typeof body?.email==='string')credentialEmail=body.email.trim().toLowerCase().slice(0,254);
 }
 const tenantSlug=pathname.match(/\/public\/tenants\/([^/]+)\//)?.[1];
 return admissionTransaction(securityPool(),async client=>{
  await admit(client,{service,scope,subject:'service',limit});
  if(tenantSlug&&request.method!=='GET')await admit(client,{service,scope,subject:'public',tenant:tenantSlug.slice(0,128),limit:120});
  if(credentialEmail!==undefined)await admit(client,{service,scope:'credential:'+scope,subject:credentialEmail,limit:30});
 });
}

export const wrapAdmission=<T extends (...args:never[])=>unknown>(handler:T,scope:string,limit?:number):T=>wrap(handler,request=>admitRequest(request,scope,limit));

export const guardAccountAuth=<T extends object>(base:T)=>wrapAccountAuth(base,(userId,sessionId)=>accountSessionAllowed(securityPool(),userId,sessionId));
export async function assertActiveAccount(userId:string){if(!await accountAllowed(securityPool(),userId))throw new AdmissionError(403);}
