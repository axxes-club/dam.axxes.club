import {createHash} from 'node:crypto';
export class AdmissionError extends Error {
 constructor(status,retryAfter=1){super(status===429?'Request limit exceeded. Retry shortly.':status===403?'Request origin denied.':status===413?'Request is too large.':'Request admission is temporarily unavailable.');this.status=status;this.retryAfter=retryAfter;}
}
/** Shared fixed window, atomically incremented by PostgreSQL across all instances. */
export async function admit(db,{service,scope,subject,tenant='',limit,windowMs=60000}){
 if(!service||!scope||!subject||!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1||windowMs>3600000)throw new AdmissionError(503);
 const bucket=createHash('sha256').update(JSON.stringify([scope,tenant,subject])).digest('hex');
 let row;
 try{
  const result=await db.query(`WITH cleanup AS (
   DELETE FROM security_request_limits WHERE expires_at < now()-interval '1 hour' AND (service,bucket)<>($1,$2) AND (service,bucket) IN (
    SELECT service,bucket FROM security_request_limits WHERE expires_at < now()-interval '1 hour' LIMIT 20
   )
  ) INSERT INTO security_request_limits(service,bucket,count,expires_at)
   VALUES($1,$2,1,now()+$3::int*interval '1 millisecond')
   ON CONFLICT(service,bucket) DO UPDATE SET
    count=CASE WHEN security_request_limits.expires_at<=now() THEN 1 ELSE LEAST(security_request_limits.count,2147483646)+1 END,
    expires_at=CASE WHEN security_request_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE security_request_limits.expires_at END
   RETURNING count, GREATEST(1,CEIL(EXTRACT(EPOCH FROM expires_at-now())))::int AS retry_after`,[service,bucket,windowMs]);
  row=result.rows[0];
 }catch{throw new AdmissionError(503);}
 if(!row||!Number.isInteger(row.count)||!Number.isInteger(row.retry_after))throw new AdmissionError(503);
 if(row.count>limit)throw new AdmissionError(429,row.retry_after);
 return {remaining:Math.max(0,limit-row.count),retryAfter:row.retry_after};
}
export function admissionResponse(error){return Response.json({error:error instanceof AdmissionError?error.message:'Request admission is temporarily unavailable.'},{status:error instanceof AdmissionError?error.status:503,headers:{'cache-control':'no-store','retry-after':String(error instanceof AdmissionError?error.retryAfter:1)}});}
export function assertCookieOrigin(request){
 if(['GET','HEAD','OPTIONS'].includes(request.method)||!/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(request.headers.get('cookie')??''))return;
 const url=new URL(request.url),host=request.headers.get('host');
 const expected=host&&/^(?:[a-z0-9-]+\.)*(?:axxes\.club|axxes\.app)(?::443)?$/i.test(host)?'https://'+host.replace(/:443$/,''):url.origin;
 if(request.headers.get('origin')!==expected)throw new AdmissionError(403);
}
export async function boundedText(request,limit=16384){
 const reader=request.clone().body?.getReader();if(!reader)return '';const chunks=[];let length=0;const deadline=Date.now()+5000;
 try{for(;;){let timer;const {value,done}=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel();reject(new AdmissionError(503));},Math.max(1,deadline-Date.now()));timer.unref();})]).finally(()=>clearTimeout(timer));if(done)break;length+=value.length;if(length>limit){void reader.cancel();throw new AdmissionError(413);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export async function boundedJson(request,limit=16384){const raw=await boundedText(request,limit);try{return JSON.parse(raw);}catch{return null;}}
export function wrapAdmission(handler,admission){return async(request,...args)=>{try{assertCookieOrigin(request);await admission(request);}catch(error){return admissionResponse(error);}return handler(request,...args);};}

/** One dedicated client and fixed global-first lock order; denied work commits no buckets. */
export async function admissionTransaction(pool,operation){
 let client;try{client=await pool.connect();}catch{throw new AdmissionError(503)}
 let failed=false;
 try{await client.query('BEGIN');const value=await operation(client);await client.query('COMMIT');return value;}
 catch(error){try{await client.query('ROLLBACK');}catch{failed=true;}throw error instanceof AdmissionError?error:new AdmissionError(503);}
 finally{client.release(failed);}
}
