import {auth} from '@/lib/auth';
import {toNextJsHandler} from 'better-auth/next-js';
import {wrapAdmission} from '@/lib/security/admission-server';
const handlers=toNextJsHandler(auth);
export const GET=wrapAdmission(handlers.GET,'auth-read');
const admittedPost=wrapAdmission(handlers.POST,'auth-write',6000);
export async function POST(request:Request){
 if(new URL(request.url).pathname.endsWith('/sign-up/email'))return Response.json({error:'Account registration requires an invite.'},{status:404});
 return admittedPost(request);
}
