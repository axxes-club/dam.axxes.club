const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
async function check(app,cookie,landing){
 let user={user:{id:'member'}},rows=[{id:'allowed'}],query,queried=false;
 const columns=new Proxy({}, {get:(_,key)=>key});
 const db={select:()=>({from:()=>({innerJoin:()=>({where:w=>{query=w;queried=true;return{limit:async()=>rows}}})})})};
 const response=(status,location)=>({status,location,cookies:{values:[],set(...a){this.values.push(a)}}});
 const NextResponse={json:(_,o={})=>response(o.status||200),redirect:url=>response(307,url)};
 const path=require("node:path").resolve(__dirname,"../src/app/api/organization/open/route.ts");
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const sandbox={exports:{},URL,process:{env:{NODE_ENV:'production'}},require:id=>{
  if(id==='next/server')return{NextResponse};if(id==='next/headers')return{headers:async()=>new Headers()};
  if(id==='drizzle-orm')return{and:(...a)=>a,eq:(a,b)=>({eq:[a,b]}),isNull:a=>({isNull:a})};
  if(id==='@/lib/auth')return{auth:{api:{getSession:async()=>user}}};
  if(id==='@/lib/db')return{db,schema:{tenants:columns,tenantMemberships:columns}};
  if(id==='@/lib/db/schema')return{tenants:columns,tenantMemberships:columns};throw Error(id);
 }};vm.runInNewContext(code,sandbox);
 const id='11111111-1111-1111-1111-111111111111';
 const request=value=>({nextUrl:new URL(`https://app.axxes.club/api/organization/open?tenant=${value}&next=https://evil.example`),url:'https://app.axxes.club/api/organization/open'});
 let r=await sandbox.exports.GET(request('invalid'));assert.equal(r.status,400);assert.equal(queried,false);
 user=null;r=await sandbox.exports.GET(request(id));assert.equal(r.status,307);assert.equal(r.location.pathname,'/sign-in');assert.equal(queried,false);
 user={user:{id:'member'}};rows=[];r=await sandbox.exports.GET(request(id));assert.equal(r.status,403);assert.equal(r.cookies.values.length,0);
 rows=[{id}];r=await sandbox.exports.GET(request(id));assert.equal(r.status,307);assert.equal(r.location.pathname,landing);assert.equal(r.location.origin,'https://app.axxes.club');assert.equal(r.cookies.values[0][0],cookie);assert.equal(r.cookies.values[0][1],id);assert.equal(r.cookies.values[0][2].httpOnly,true);
 assert(query.some(p=>p.eq&&p.eq[0]==='status'&&p.eq[1]==='active'));assert.equal(query.filter(p=>p.isNull==='deletedAt').length,2);assert(query.some(p=>p.eq&&p.eq[0]==='userId'&&p.eq[1]==='member'));assert(query.some(p=>p.eq&&p.eq[0]==='tenantId'&&p.eq[1]===id));if(app==='dam.axxes.club'){rows=[{id,settings:{features:{folders:false}}}];r=await sandbox.exports.GET(request(id));assert.equal(r.status,403)}console.log(app+': 4 opener authorization cases passed');
}
check("dam.axxes.club","folders_tenant_id","/").catch(e=>{console.error(e);process.exitCode=1});
