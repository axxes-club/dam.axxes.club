import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {generateKeyPair, exportJWK, SignJWT} from 'jose'
import {authorizeFolders, exchangeFoldersCode, packTransaction, unpackTransaction, hostAuthMode} from './folders-oidc'

test('signed sign-in transactions reject changed state and expiry',()=>{
 const transaction={state:'state',nonce:'nonce',verifier:'verifier',next:'/d/123?tenant=studio',expiresAt:Date.now()+60000}
 const value=packTransaction(transaction,'synthetic-test-secret-at-least-32-characters')
 assert.deepEqual(unpackTransaction(value,'synthetic-test-secret-at-least-32-characters'),transaction)
 assert.throws(()=>unpackTransaction(value+'x','synthetic-test-secret-at-least-32-characters'),/transaction/i)
 assert.throws(()=>unpackTransaction(value,'wrong-secret'),/transaction/i)
 assert.throws(()=>unpackTransaction(packTransaction({...transaction,expiresAt:1},'synthetic-test-secret-at-least-32-characters'),'synthetic-test-secret-at-least-32-characters'),/expired/i)
})
test('axxes.work never attempts to share axxes.club cookies',()=>{
 assert.equal(hostAuthMode('https://folders.axxes.app'),'oidc')
 assert.equal(hostAuthMode('https://quill.axxes.club'),'shared')
 assert.equal(hostAuthMode('http://localhost:3111'),'local')
})
test('OIDC validates signature, issuer, audience, nonce, state and PKCE at a real protocol boundary',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256')
 const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'}
 let issuer=''
 let nonce=''
 let challenge=''
 let mode='valid'
 let algorithm='RS256'
 const used=new Set<string>()
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url!,issuer)
  res.setHeader('content-type','application/json')
  if(url.pathname.endsWith('.well-known/openid-configuration')) return res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:[algorithm],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']}))
  if(url.pathname==='/jwks') return res.end(JSON.stringify({keys:[jwk]}))
  if(url.pathname==='/token'){
   let body='';for await(const chunk of req) body+=chunk
   const params=new URLSearchParams(body)
   if(used.has(params.get('code')!) || createHash('sha256').update(params.get('code_verifier')!).digest('base64url')!==challenge){res.statusCode=400;return res.end(JSON.stringify({error:'invalid_grant'}))}
   used.add(params.get('code')!)
   const signingKey=algorithm==='HS256'?new TextEncoder().encode(mode==='signature'?'wrong-client-secret':'synthetic-client-secret'):mode==='signature'?(await generateKeyPair('RS256')).privateKey:privateKey
   const token=await new SignJWT({nonce:mode==='nonce'?'wrong':nonce}).setProtectedHeader({alg:algorithm,kid:'test-key'}).setIssuer(mode==='issuer'?'https://evil.test':issuer).setAudience(mode==='audience'?'wrong':'folders').setSubject('existing-axxes-user').setIssuedAt().setExpirationTime('5m').sign(signingKey)
   return res.end(JSON.stringify({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:300,id_token:token}))
  }
  res.statusCode=404;res.end('{}')
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 issuer=`http://127.0.0.1:${(server.address() as {port:number}).port}`
 const options={issuer,clientId:'folders',clientSecret:'synthetic-client-secret',origin:'http://localhost:3111',allowHttp:true}
 try{
  for(const tokenAlgorithm of ['RS256','HS256']) {
   algorithm=tokenAlgorithm
   for(const scenario of ['valid','state','nonce','issuer','audience','signature','pkce']){
   mode=scenario
   const authorization=await authorizeFolders(options,'/d/123?tenant=studio')
   const url=new URL(authorization.url);nonce=url.searchParams.get('nonce')!;challenge=url.searchParams.get('code_challenge')!
   assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3111/api/auth/axxes/callback')
   const callback=new URL('http://localhost:3111/api/auth/axxes/callback');callback.searchParams.set('code','code-'+algorithm+'-'+scenario);callback.searchParams.set('state',scenario==='state'?'wrong':authorization.transaction.state)
   const transaction=scenario==='pkce'?{...authorization.transaction,verifier:'wrong'}:authorization.transaction
   if(scenario==='valid'){
    assert.equal(await exchangeFoldersCode(options,callback,transaction),'existing-axxes-user')
    await assert.rejects(exchangeFoldersCode(options,callback,transaction))
   }else await assert.rejects(exchangeFoldersCode(options,callback,transaction))
   }
  }
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
})

test('missing OIDC configuration and nonlocal HTTP fail before discovery',async()=>{
 await assert.rejects(authorizeFolders({issuer:'https://handshake.axxes.club',clientId:'',clientSecret:'',origin:'https://folders.axxes.app'},'/overview'),/not configured/)
 await assert.rejects(authorizeFolders({issuer:'http://evil.test',clientId:'folders',clientSecret:'secret',origin:'https://folders.axxes.app',allowHttp:true},'/overview'),/HTTPS/)
})

test('untrusted destinations cannot survive browser sign-in',async()=>{
 const {safeLocalPath}=await import('./folders-oidc');
 for(const path of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/hello%0aevil'])assert.equal(safeLocalPath(path),'/');
 assert.equal(safeLocalPath('/share/token?view=files'),'/share/token?view=files');
});
