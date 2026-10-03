import 'server-only'
import {randomUUID,createHmac} from 'node:crypto'
import {and,eq,lt,like} from 'drizzle-orm'
import {NextRequest,NextResponse} from 'next/server'
import {auth,AUTH_ORIGIN,HANDSHAKE_URL} from '@/lib/auth'
import {db} from '@/lib/db'
import {user,verification} from '@/lib/db/schema'
import {authorizeFolders,exchangeFoldersCode,packTransaction,unpackTransaction} from './folders-oidc'

const transactionCookie='folders.oidc_transaction'
function options(){
 if(!process.env.AXXES_OIDC_CLIENT_ID||!process.env.AXXES_OIDC_CLIENT_SECRET||!HANDSHAKE_URL)throw new Error('AXXES sign-in is not configured')
 return {issuer:HANDSHAKE_URL,clientId:process.env.AXXES_OIDC_CLIENT_ID,clientSecret:process.env.AXXES_OIDC_CLIENT_SECRET,origin:AUTH_ORIGIN,allowHttp:process.env.NODE_ENV!=='production'}
}
function privateResponse(response:NextResponse){response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response}
function transactionAttributes(){return {httpOnly:true,secure:AUTH_ORIGIN.startsWith('https:'),sameSite:'lax' as const,path:'/api/auth/axxes',maxAge:300}}
export async function startFoldersSignIn(next:string):Promise<NextResponse>{
 try{
  const settings=options()
  const authorization=await authorizeFolders(settings,next)
  const context=await auth.$context
  await db.delete(verification).where(and(like(verification.identifier,'folders:oidc:%'),lt(verification.expiresAt,new Date())))
  await db.insert(verification).values({id:randomUUID(),identifier:`folders:oidc:${authorization.transaction.state}`,value:'pending',expiresAt:new Date(authorization.transaction.expiresAt)})
  const response=privateResponse(NextResponse.redirect(authorization.url))
  response.cookies.set(transactionCookie,packTransaction(authorization.transaction,context.secret),transactionAttributes())
  return response
 }catch{
  return privateResponse(NextResponse.redirect(new URL('/sign-in?error=configuration',AUTH_ORIGIN)))
 }
}
export async function finishFoldersSignIn(request:NextRequest):Promise<NextResponse>{
 let response:NextResponse
 try{
  const settings=options()
  const context=await auth.$context
  const transaction=unpackTransaction(request.cookies.get(transactionCookie)?.value??'',context.secret)
  if(request.nextUrl.searchParams.get('state')!==transaction.state)throw new Error('State mismatch')
  // Atomic consume: a replay cannot issue another local session on another worker.
  const [pending]=await db.delete(verification).where(and(eq(verification.identifier,`folders:oidc:${transaction.state}`),eq(verification.value,'pending'))).returning({expiresAt:verification.expiresAt})
  if(!pending||pending.expiresAt<=new Date())throw new Error('Sign-in transaction expired')
  const callback=new URL('/api/auth/axxes/callback',AUTH_ORIGIN);callback.search=request.nextUrl.search
  const subject=await exchangeFoldersCode(settings,callback,transaction)
  const [existing]=await db.select({id:user.id}).from(user).where(eq(user.id,subject)).limit(1)
  if(!existing)throw new Error('Unknown AXXES identity')
  const session=await context.internalAdapter.createSession(existing.id)
  if(!session)throw new Error('Could not establish session')
  response=privateResponse(NextResponse.redirect(new URL(transaction.next,AUTH_ORIGIN)))
  const cookie=context.authCookies.sessionToken
  const signature=createHmac('sha256',context.secret).update(session.token).digest('base64')
  response.cookies.set(cookie.name,`${session.token}.${signature}`,{httpOnly:true,secure:AUTH_ORIGIN.startsWith('https:'),sameSite:'lax',path:'/',expires:new Date(session.expiresAt),})
 }catch{
  response=privateResponse(NextResponse.redirect(new URL('/sign-in?error=identity',AUTH_ORIGIN)))
 }
 response.cookies.set(transactionCookie,'',{...transactionAttributes(),maxAge:0})
 return response
}
