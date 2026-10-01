import {and,asc,desc,eq,gt,inArray,isNull,sql,type SQL} from 'drizzle-orm'
import {z} from 'zod'
import {db} from '../db'
import {assets,assetFolders,assetAppLinks,officeServiceRequests} from '../db/schema'
import {getViewerById} from '../access'
import {assertLibraryAccess,authorizeAsset,libraryScope,folderScope,ensureFolder,assetVisibleCondition,sharedFolderDestinations} from '../library'
import {normalizeFolder} from '../assets'
import {deliverAsset} from '../delivery'
import {MUTATING_OPERATIONS,verifyFoldersRequest} from './auth'
import type {FolderCapabilities,FolderAsset} from './contracts'
import type {Viewer} from '../types'
import {mutateAsset,mutateFolder,linkOffice,linkedOffice} from './mutations'
import {beginUpload,finishUpload} from './uploads'

const uuid=z.string().uuid()
const listInput=z.object({folder:z.string().max(120).nullable().optional(),q:z.string().max(200).optional(),cursor:z.string().max(200).optional(),limit:z.number().int().min(1).max(60).optional(),trash:z.boolean().optional()})
function capabilities(access:{canWrite:boolean;canDelete:boolean}):FolderCapabilities{return {canRead:true,canWrite:access.canWrite,canDelete:access.canDelete}}
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}})}
function activeFolderCondition(now=new Date()):SQL{return sql`${assetFolders.trashedAt} is null and (${assetFolders.expiresAt} is null or ${assetFolders.expiresAt}>${now}) and not exists(select 1 from asset_folders parent where parent.library_id=${assetFolders.libraryId} and parent.path<>${assetFolders.path} and left(${assetFolders.path},length(parent.path)+1)=parent.path||'/' and (parent.trashed_at is not null or parent.expires_at<=${now}))`}
export async function handleOfficeRequest(request:Request):Promise<Response>{
 try{
  const envelope=verifyFoldersRequest(await request.text(),request.headers.get('x-office-signature')??'',process.env.FOLDERS_SERVICE_SECRET??'')
  const viewer=await getViewerById(envelope.userId)
  if(!viewer)return json({error:'Forbidden'},403)
  if(MUTATING_OPERATIONS.has(envelope.operation)){
   const [accepted]=await db.insert(officeServiceRequests).values({caller:envelope.caller,requestId:envelope.requestId,expiresAt:new Date(envelope.expiresAt)}).onConflictDoNothing().returning({caller:officeServiceRequests.caller})
   if(!accepted)return json({error:'Request already consumed'},409)
   await db.delete(officeServiceRequests).where(sql`${officeServiceRequests.expiresAt}<now()-interval '1 day'`)
  }
  return await dispatch(viewer,envelope)
 }catch(error){
  if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'Invalid request'},400)
  if(error instanceof Error&&/signature|secret|credential|service request|expired/i.test(error.message))return json({error:'Invalid service credential'},401)
  if(error instanceof Error&&/Forbidden|unavailable|unauthorized/i.test(error.message))return json({error:'Forbidden'},403)
  if(error instanceof Error&&/collision|conflict|pending|restore|gone|missing/i.test(error.message))return json({error:'Operation cannot be completed'},409)
  console.error('Office service operation failed',error instanceof Error?error.name:'Error')
  return json({error:'Folders service unavailable'},503)
 }
}
async function dispatch(viewer:Viewer,envelope:import('./auth').SignedFoldersRequest):Promise<Response>{
 const {libraryId,operation,payload}=envelope
 if(operation==='libraries'){
  const shared=await sharedFolderDestinations(viewer)
  return json({libraries:[...viewer.tenants.map(t=>({id:t.id,name:t.name,capabilities:capabilities(t)})),...shared.filter(s=>s.canRead).map(s=>({id:s.libraryId,name:`Shared: ${s.folder}`,folder:s.folder,capabilities:{canRead:true,canWrite:s.canWrite,canDelete:false}}))]})
 }
 if(operation==='list'){
  const input=listInput.parse(payload);const folder=input.folder===undefined?undefined:normalizeFolder(input.folder)
  const access=await assertLibraryAccess(viewer,libraryId,'read',folder)
  const scope:SQL[]=[libraryScope(libraryId,viewer.id)]
  if(input.trash){if(!access.canDelete)throw new Error('Forbidden');scope.push(sql`${assets.trashedAt} is not null`)}else scope.push(assetVisibleCondition())
  if(folder!==undefined)scope.push(folder===null?isNull(assets.folder):eq(assets.folder,folder))
  if(input.q){const pattern=`%${input.q.replace(/[\\%_]/g,c=>'\\'+c)}%`;scope.push(sql`${assets.name} ilike ${pattern}`)}
  const cursor=input.cursor?z.object({updatedAt:z.string().datetime(),id:uuid}).parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString())):null
  if(cursor)scope.push(sql`(${assets.updatedAt},${assets.id})<(${cursor.updatedAt}::timestamptz,${cursor.id}::uuid)`)
  const limit=input.limit??60
  const rows=await db.select({id:assets.id,name:assets.name,folder:assets.folder,mimeType:assets.mimeType,fileSize:assets.fileSize,category:assets.category,updatedAt:assets.updatedAt,trashedAt:assets.trashedAt,expiresAt:assets.expiresAt}).from(assets).where(and(...scope)).orderBy(desc(assets.updatedAt),desc(assets.id)).limit(limit+1)
  const page=rows.slice(0,limit)
  const links=page.length?await db.select({assetId:assetAppLinks.assetId,documentId:assetAppLinks.recordId}).from(assetAppLinks).where(and(eq(assetAppLinks.appKey,'office'),inArray(assetAppLinks.assetId,page.map(r=>r.id)))):[]
  const items=page.map(row=>({ ...row,updatedAt:row.updatedAt.toISOString(),trashedAt:row.trashedAt?.toISOString()??null,expiresAt:row.expiresAt?.toISOString()??null,officeDocumentId:links.find(l=>l.assetId===row.id)?.documentId??null,officeKind:row.mimeType?.startsWith('application/vnd.axxes.office.')?row.mimeType.slice('application/vnd.axxes.office.'.length) as FolderAsset['officeKind']:null,capabilities:capabilities(access)}))
  const last=page.at(-1)
  return json({items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({updatedAt:last.updatedAt.toISOString(),id:last.id})).toString('base64url'):null})
 }
 if(operation==='folders'){
  const input=listInput.parse(payload);const access=await assertLibraryAccess(viewer,libraryId,'read',input.folder)
  const conditions:SQL[]=[folderScope(libraryId,viewer.id)]
  if(input.trash){if(!access.canDelete)throw new Error('Forbidden');conditions.push(sql`${assetFolders.trashedAt} is not null`)}else conditions.push(activeFolderCondition())
  if(input.cursor)conditions.push(gt(assetFolders.path,input.cursor))
  if(input.folder&&access.role==='shared')conditions.push(sql`(${assetFolders.path}=${input.folder} or left(${assetFolders.path},${input.folder.length+1})=${input.folder+'/'})`)
  const limit=input.limit??60;const rows=await db.select().from(assetFolders).where(and(...conditions)).orderBy(asc(assetFolders.path)).limit(limit+1)
  const page=rows.slice(0,limit)
  return json({items:page.map(row=>({id:row.id,path:row.path,trashedAt:row.trashedAt?.toISOString()??null,expiresAt:row.expiresAt?.toISOString()??null,capabilities:capabilities(access)})),nextCursor:rows.length>limit?page.at(-1)!.path:null})
 }
 if(operation==='authorize'||operation==='delivery'){
  const input=z.object({assetId:uuid,need:z.enum(['read','write','delete']).default('read')}).parse(payload)
  const asset=await authorizeAsset(viewer,input.assetId,operation==='delivery'?'read':input.need)
  const actualLibrary=asset.tenantId??(asset.ownerUserId===viewer.id?'personal':`user:${asset.ownerUserId}`)
  if(actualLibrary!==libraryId)throw new Error('Forbidden')
  if(operation==='delivery'||input.need!=='delete'){
   if(asset.trashedAt||asset.expiresAt&&asset.expiresAt<=new Date())throw new Error('File unavailable')
   await assertLibraryAccess(viewer,libraryId,operation==='delivery'?'read':input.need,asset.folder)
  }
  if(operation==='delivery')return deliverAsset(asset)
  return json({assetId:asset.id,name:asset.name,mimeType:asset.mimeType,folder:asset.folder,fileSize:asset.fileSize})
 }
 if(operation==='createFolder'){
  const input=z.object({path:z.string().min(1).max(120)}).parse(payload);const path=normalizeFolder(input.path);if(!path)throw new Error('Folder missing')
  await assertLibraryAccess(viewer,libraryId,'write',path)
  return json(await ensureFolder(libraryId,viewer.id,path))
 }
 if(['rename','move','trash','restore'].includes(operation))return json(await mutateAsset(viewer,libraryId,operation,payload))
 if(['renameFolder','trashFolder','restoreFolder'].includes(operation))return json(await mutateFolder(viewer,libraryId,operation,payload))
 if(operation==='linkOffice')return json(await linkOffice(viewer,libraryId,payload))
 if(operation==='linkedOffice')return json(await linkedOffice(viewer,libraryId,payload))
 if(operation==='uploadStart')return json(await beginUpload(viewer,libraryId,payload))
 if(operation==='uploadFinish')return json(await finishUpload(viewer,libraryId,payload))
 return json({error:'Unknown operation'},400)
}
