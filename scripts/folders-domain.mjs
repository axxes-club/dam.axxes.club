import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const project='gravy-meta',name='axxes-lb';
export function patchFoldersRouting(current){
 const map=structuredClone(current);
 const backend=map.pathMatchers?.find(p=>p.name==='dam-matcher')?.defaultService;
 if(!backend?.endsWith('/backendServices/dam-be'))throw Error('Folders backend is missing or changed; inspect before continuing');
 const owned=new Set(['folders.axxes.app','folders.axxes.club']);
 map.hostRules=map.hostRules.map(rule=>({...rule,hosts:rule.hosts.filter(host=>!owned.has(host))})).filter(rule=>rule.hosts.length);
 const removed=new Set(['folders-app-redirect','folders-app-matcher','folders-club-redirect']);
 if(map.hostRules.some(rule=>removed.has(rule.pathMatcher)))throw Error('A Folders matcher is used by an unrelated host');
 map.hostRules.push({hosts:['folders.axxes.app'],pathMatcher:'folders-app-matcher'},{hosts:['folders.axxes.club'],pathMatcher:'folders-club-redirect'});
 map.pathMatchers=map.pathMatchers.filter(m=>!removed.has(m.name));
 map.pathMatchers.push({name:'folders-app-matcher',defaultService:backend},{name:'folders-club-redirect',defaultUrlRedirect:{hostRedirect:'folders.axxes.app',httpsRedirect:true,redirectResponseCode:'PERMANENT_REDIRECT',stripQuery:false},pathRules:[{paths:['/api','/api/*'],service:backend}]});
 return map;
}
function writableMap(map){const copy=structuredClone(map);for(const key of ['id','creationTimestamp','selfLink','kind','fingerprint'])delete copy[key];return copy;}
async function main(){
 const args=process.argv.slice(2);if(args.some(arg=>!['--apply','--dry-run'].includes(arg)))throw Error('Usage: node scripts/folders-domain.mjs [--dry-run|--apply]');
 const current=JSON.parse(execFileSync('gcloud',['compute','url-maps','describe',name,`--project=${project}`,'--format=json'],{encoding:'utf8'}));
 const planned=patchFoldersRouting(current);
 const directory=resolve('.superpowers/folders-domain');mkdirSync(directory,{recursive:true});
 writeFileSync(`${directory}/before.json`,JSON.stringify(current,null,2));writeFileSync(`${directory}/planned.json`,JSON.stringify(writableMap(planned),null,2));
 execFileSync('gcloud',['compute','url-maps','validate',`--project=${project}`,'--global','--load-balancing-scheme=EXTERNAL_MANAGED',`--source=${directory}/planned.json`],{stdio:'inherit'});
 console.log(`Validated Folders routing; backup: ${directory}/before.json. Legacy API routes remain compatible.`);
 if(!args.includes('--apply'))return;
 const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
 const body=writableMap(planned);body.fingerprint=current.fingerprint;
 const response=await fetch(`https://compute.googleapis.com/compute/v1/projects/${project}/global/urlMaps/${name}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(`Routing update rejected (${response.status}): ${result.error?.message??'Unknown error'}`);
 console.log(`Routing operation submitted: ${result.name}`);
 const deadline=Date.now()+180_000;
 while(Date.now()<deadline){
  const poll=await fetch(`https://compute.googleapis.com/compute/v1/projects/${project}/global/operations/${result.name}`,{headers:{Authorization:`Bearer ${token}`}});
  const operation=await poll.json();if(!poll.ok)throw Error(`Could not read routing operation (${poll.status})`);
  if(operation.status==='DONE'){if(operation.error)throw Error(`Routing operation failed: ${operation.error.errors?.map(e=>e.message).join('; ')??'Unknown error'}`);console.log('Folders routing applied successfully.');return;}
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error(`Routing operation still pending after 3 minutes: ${result.name}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
