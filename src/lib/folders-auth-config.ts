type Env=Record<string,string|undefined>;
export function foldersAuthConfig(env:Env){
 const origin=new URL(env.FOLDERS_PUBLIC_URL||'https://folders.axxes.app');
 const local=env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(origin.hostname);
 if(origin.protocol!=='https:'&&!local)throw Error('Folders requires HTTPS');
 if(!['folders.axxes.app','folders.axxes.club','dam.axxes.club','dam.v2.axxes.app','folders.v2.axxes.app'].includes(origin.hostname)&&!local)throw Error('Untrusted Folders origin');
 const domain=env.AUTH_COOKIE_DOMAIN?.replace(/^\./,'');
 const cookieDomain=domain&&(origin.hostname===domain||origin.hostname.endsWith(`.${domain}`))?domain:undefined;
 const trustedOrigins=['https://folders.axxes.app','https://folders.axxes.club','https://dam.axxes.club','https://axxes.club','https://*.axxes.club','https://*.v2.axxes.app','axxes-folders://'];
 if(local)trustedOrigins.push(origin.origin);
 for(const key of ['VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL','VERCEL_URL'])if(env[key])trustedOrigins.push(`https://${env[key]}`);
 return {baseURL:origin.origin,cookieDomain,trustedOrigins};
}
