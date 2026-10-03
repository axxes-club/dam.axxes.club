import {createHmac,timingSafeEqual} from 'node:crypto'
import {jwtVerify} from 'jose'
import * as oidc from 'openid-client'
export function safeLocalPath(value:string|undefined,fallback='/'):string {
 if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20]/.test(value))return fallback;
 try {const decoded=decodeURIComponent(value);if(decoded.startsWith('//')||/[\\\x00-\x20]/.test(decoded))return fallback;const url=new URL(value,'https://folders.invalid');return url.origin==='https://folders.invalid'?value:fallback;}catch{return fallback;}
}

export type FoldersOidcOptions={issuer:string;clientId:string;clientSecret:string;origin:string;allowHttp?:boolean}
export type SignInTransaction={state:string;nonce:string;verifier:string;next:string;expiresAt:number}
export function hostAuthMode(origin:string):'shared'|'oidc'|'local'{
 const host=new URL(origin).hostname
 return host==='folders.axxes.app'?'oidc':host==='axxes.club'||host.endsWith('.axxes.club')?'shared':'local'
}
export function packTransaction(transaction:SignInTransaction,secret:string){
 if(secret.length<10)throw new Error('Sign-in transaction secret missing')
 const payload=Buffer.from(JSON.stringify(transaction)).toString('base64url')
 return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')
}
export function unpackTransaction(value:string,secret:string):SignInTransaction{
 try{
  const [payload,signature,...extra]=value.split('.')
  const expected=createHmac('sha256',secret).update(payload).digest()
  const supplied=Buffer.from(signature,'base64url')
  if(extra.length||expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new Error('Invalid sign-in transaction')
  const transaction=JSON.parse(Buffer.from(payload,'base64url').toString()) as SignInTransaction
  if(!transaction.state||!transaction.nonce||!transaction.verifier||typeof transaction.expiresAt!=='number')throw new Error('Invalid sign-in transaction')
  if(transaction.expiresAt<=Date.now()||transaction.expiresAt>Date.now()+10*60_000)throw new Error('Sign-in transaction expired')
  return {...transaction,next:safeLocalPath(transaction.next)}
 }catch(error){if(error instanceof Error&&/expired/.test(error.message))throw error;throw new Error('Invalid sign-in transaction')}
}
async function configuration(options:FoldersOidcOptions){
 const issuer=new URL(options.issuer)
 const origin=new URL(options.origin)
 if(!options.clientId||!options.clientSecret)throw new Error('AXXES sign-in is not configured')
 const local=(url:URL)=>['localhost','127.0.0.1'].includes(url.hostname)
 if((issuer.protocol!=='https:'||origin.protocol!=='https:')&&!(options.allowHttp&&local(issuer)&&local(origin)))throw new Error('Sign-in requires HTTPS')
 let config=await oidc.discovery(new URL('/api/auth/.well-known/openid-configuration',issuer),options.clientId,options.clientSecret,oidc.ClientSecretPost(options.clientSecret),{execute:options.allowHttp&&local(issuer)?[oidc.allowInsecureRequests]:[],timeout:10})
 if(config.serverMetadata().issuer.replace(/\/$/,'')!==issuer.href.replace(/\/$/,''))throw new Error('Unexpected identity provider issuer')
 const algorithms=config.serverMetadata().id_token_signing_alg_values_supported??[]
 const hmac=!algorithms.includes('RS256')&&algorithms.includes('HS256')
 if(hmac){
  // Handshake's existing provider signs with this client's own secret.
  // oauth4webapi deliberately leaves HMAC signature verification to callers.
  config=new oidc.Configuration(config.serverMetadata(),options.clientId,{client_secret:options.clientSecret,id_token_signed_response_alg:'HS256'},oidc.ClientSecretPost(options.clientSecret))
  if(options.allowHttp&&local(issuer))oidc.allowInsecureRequests(config)
  config.timeout=10
 }else oidc.enableNonRepudiationChecks(config)
 return {config,hmac}
}
export async function authorizeFolders(options:FoldersOidcOptions,next:string){
 const {config}=await configuration(options)
 const transaction:SignInTransaction={state:oidc.randomState(),nonce:oidc.randomNonce(),verifier:oidc.randomPKCECodeVerifier(),next:safeLocalPath(next),expiresAt:Date.now()+5*60_000}
 const url=oidc.buildAuthorizationUrl(config,{redirect_uri:new URL('/api/auth/axxes/callback',options.origin).href,scope:'openid email profile',state:transaction.state,nonce:transaction.nonce,code_challenge:await oidc.calculatePKCECodeChallenge(transaction.verifier),code_challenge_method:'S256'})
 return {url:url.href,transaction}
}
export async function exchangeFoldersCode(options:FoldersOidcOptions,currentUrl:URL,transaction:SignInTransaction):Promise<string>{
 if(transaction.expiresAt<=Date.now())throw new Error('Sign-in transaction expired')
 const callback=new URL('/api/auth/axxes/callback',options.origin)
 if(currentUrl.origin!==callback.origin||currentUrl.pathname!==callback.pathname)throw new Error('Invalid sign-in callback')
 const {config,hmac}=await configuration(options)
 const tokens=await oidc.authorizationCodeGrant(config,currentUrl,{pkceCodeVerifier:transaction.verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true})
 if(hmac){
  if(!tokens.id_token)throw new Error('Identity token missing')
  await jwtVerify(tokens.id_token,new TextEncoder().encode(options.clientSecret),{algorithms:['HS256'],issuer:config.serverMetadata().issuer,audience:options.clientId,requiredClaims:['sub','exp','iat','nonce']})
 }
 const claims=tokens.claims()
 if(!claims?.sub)throw new Error('Identity provider did not identify an account')
 return claims.sub
}
