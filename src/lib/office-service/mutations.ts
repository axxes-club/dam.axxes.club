import {and,eq,sql} from 'drizzle-orm'
import {z} from 'zod'
import {db} from '../db'
import {assets,assetAppLinks} from '../db/schema'
import {assertLibraryAccess,authorizeAsset,libraryOwnership,ensureFolder} from '../library'
import {normalizeFolder} from '../assets'
import type {Viewer} from '../types'
const uuid=z.string().uuid()
function owner(viewer:Viewer,libraryId:string){return libraryOwnership(libraryId,viewer.id)}
function matches(row:{tenantId:string|null;ownerUserId:string|null},viewer:Viewer,libraryId:string){const scope=owner(viewer,libraryId);return row.tenantId===scope.tenantId&&row.ownerUserId===scope.ownerUserId}
export async function mutateAsset(viewer:Viewer,libraryId:string,operation:string,payload:unknown){
 const input=z.object({assetId:uuid.optional(),assetIds:z.array(uuid).min(1).max(200).optional(),name:z.string().trim().min(1).max(200).optional(),folder:z.string().max(120).nullable().optional()}).parse(payload)
 const ids=Array.from(new Set(input.assetIds??(input.assetId?[input.assetId]:[])))
 if(!ids.length)throw new Error('File missing')
 const need=operation==='trash'||operation==='restore'?'delete':'write'
 for(const id of ids){
  const asset=await authorizeAsset(viewer,id,need)
  if(!matches(asset,viewer,libraryId))throw new Error('Forbidden')
  if(operation!=='restore')await assertLibraryAccess(viewer,libraryId,need,asset.folder)
  if(operation!=='restore'&&(asset.trashedAt||asset.expiresAt&&asset.expiresAt<=new Date()))throw new Error('File unavailable')
 }
 const folder=normalizeFolder(input.folder??null)
 if(operation==='move'){await assertLibraryAccess(viewer,libraryId,'write',folder);await ensureFolder(libraryId,viewer.id,folder)}
 if(operation==='rename'&&!input.name)throw new Error('File name missing')
 const result=await db.execute(sql`with changed as (
  update assets set
   name=case when ${operation}='rename' then ${input.name??''} else name end,
   folder=case when ${operation}='move' then ${folder} else folder end,
   trashed_at=case when ${operation}='trash' then now() when ${operation}='restore' then null else trashed_at end,
   trash_reason=case when ${operation}='trash' then 'deleted' when ${operation}='restore' then null else trash_reason end,
   expires_at=case when ${operation}='restore' and expires_at<=now() then null else expires_at end,
   updated_at=now()
  where id in (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})
  returning id,name,folder,trashed_at
 ), docs as (
  update office_documents d set title=a.name,folder=a.folder,deleted_at=a.trashed_at,version=d.version+1,updated_at=now()
  from changed a join asset_app_links l on l.asset_id=a.id and l.app_key='office'
  where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id
 ) select id from changed`)
 return {ok:true,count:result.rows.length}
}
export async function mutateFolder(viewer:Viewer,libraryId:string,operation:string,payload:unknown){
 const input=z.object({from:z.string().min(1).max(120).optional(),to:z.string().min(1).max(120).optional(),path:z.string().min(1).max(120).optional()}).parse(payload)
 const path=normalizeFolder(input.from??input.path);if(!path)throw new Error('Folder missing')
 // Restore must authorize the library while allowing the target itself to be trashed.
 await assertLibraryAccess(viewer,libraryId,'delete',operation==='restoreFolder'?null:path)
 const scope=owner(viewer,libraryId)
 const folderScope=scope.tenantId?sql`tenant_id=${scope.tenantId}::uuid`:sql`tenant_id is null and owner_user_id=${scope.ownerUserId}`
 const assetScope=scope.tenantId?sql`a.tenant_id=${scope.tenantId}::uuid`:sql`a.tenant_id is null and a.owner_user_id=${scope.ownerUserId}`
 if(operation==='renameFolder'){
  const to=normalizeFolder(input.to);if(!to||to===path||to.startsWith(path+'/'))throw new Error('Folder collision')
  await assertLibraryAccess(viewer,libraryId,'delete',to)
  const result=await db.execute(sql`with permitted as (
   select id from asset_folders root where library_id=${libraryId==='personal'?`user:${viewer.id}`:libraryId} and path=${path}
    and not exists(select 1 from asset_folders occupied join asset_folders original on occupied.path=${to}||substring(original.path from ${path.length+1}::integer) where occupied.library_id=root.library_id and original.library_id=root.library_id and (original.path=${path} or left(original.path,${path.length+1})=${path+'/'}))
   ), folders as (update asset_folders set path=${to}||substring(path from ${path.length+1}::integer) where ${folderScope} and (path=${path} or left(path,${path.length+1})=${path+'/'}) and exists(select 1 from permitted) returning id),
   changed as (update assets a set folder=${to}||substring(a.folder from ${path.length+1}::integer),updated_at=now() where ${assetScope} and (a.folder=${path} or left(a.folder,${path.length+1})=${path+'/'}) and exists(select 1 from folders) returning a.id,a.folder),
   docs as (update office_documents d set folder=a.folder,version=d.version+1,updated_at=now() from changed a join asset_app_links l on l.asset_id=a.id and l.app_key='office' where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id)
   select id from permitted`)
  if(!result.rows.length)throw new Error('Folder collision');return {ok:true}
 }
 if(operation==='trashFolder'){
  const result=await db.execute(sql`with root as (select id from asset_folders where ${folderScope} and path=${path}),
   folders as (update asset_folders set trashed_at=now(),trash_reason=case when path=${path} then 'deleted' else 'folder-deleted' end where ${folderScope} and (path=${path} or left(path,${path.length+1})=${path+'/'}) and exists(select 1 from root) returning id),
   changed as (update assets a set trashed_at=now(),trash_reason='folder-deleted',updated_at=now() where ${assetScope} and a.trashed_at is null and (a.folder=${path} or left(a.folder,${path.length+1})=${path+'/'}) and exists(select 1 from folders) returning a.id,a.trashed_at),
   docs as (update office_documents d set deleted_at=a.trashed_at,version=d.version+1,updated_at=now() from changed a join asset_app_links l on l.asset_id=a.id and l.app_key='office' where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id)
   select id from root`)
  if(!result.rows.length)throw new Error('Folder missing');return {ok:true}
 }
 if(operation==='restoreFolder'){
  const result=await db.execute(sql`with root as (
   select * from asset_folders r where ${folderScope} and path=${path} and not exists(select 1 from asset_folders parent where parent.library_id=r.library_id and parent.path<>r.path and left(r.path,length(parent.path)+1)=parent.path||'/' and (parent.trashed_at is not null or parent.expires_at<=now()))
  ), folders as (update asset_folders set trashed_at=null,trash_reason=null,expires_at=case when path=${path} and expires_at<=now() then null else expires_at end where ${folderScope} and exists(select 1 from root) and (path=${path} or (left(path,${path.length+1})=${path+'/'} and trash_reason='folder-deleted' and trashed_at=(select trashed_at from root) and (expires_at is null or expires_at>now()))) returning id),
  changed as (update assets a set trashed_at=null,trash_reason=null,updated_at=now() where ${assetScope} and exists(select 1 from root) and (a.folder=${path} or left(a.folder,${path.length+1})=${path+'/'}) and a.trash_reason='folder-deleted' and a.trashed_at=(select trashed_at from root) and (a.expires_at is null or a.expires_at>now()) and not exists(select 1 from asset_folders blocked where blocked.library_id=(select library_id from root) and blocked.path<>${path} and (a.folder=blocked.path or left(a.folder,length(blocked.path)+1)=blocked.path||'/') and (blocked.expires_at<=now() or (blocked.trashed_at is not null and not(blocked.trash_reason='folder-deleted' and blocked.trashed_at=(select trashed_at from root))))) returning a.id),
  docs as (update office_documents d set deleted_at=null,version=d.version+1,updated_at=now() from changed a join asset_app_links l on l.asset_id=a.id and l.app_key='office' where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id)
  select id from root`)
  if(!result.rows.length)throw new Error('Folder restore unavailable');return {ok:true}
 }
 throw new Error('Unknown folder operation')
}
export async function linkedOffice(viewer:Viewer,libraryId:string,payload:unknown){
 const input=z.object({documentId:uuid,need:z.enum(['read','write']).default('read')}).parse(payload)
 await assertLibraryAccess(viewer,libraryId,input.need)
 const [link]=await db.select({assetId:assetAppLinks.assetId}).from(assetAppLinks).where(and(eq(assetAppLinks.tenantId,libraryId),eq(assetAppLinks.appKey,'office'),eq(assetAppLinks.recordId,input.documentId))).limit(1)
 if(!link)return {assetId:null}
 const asset=await authorizeAsset(viewer,link.assetId,input.need)
 if(!matches(asset,viewer,libraryId)||asset.trashedAt||asset.expiresAt&&asset.expiresAt<=new Date())throw new Error('File unavailable')
 return {assetId:asset.id,folder:asset.folder,title:asset.name,active:true}
}
export async function linkOffice(viewer:Viewer,libraryId:string,payload:unknown){
 const input=z.object({documentId:uuid}).parse(payload)
 if(libraryId==='personal'||libraryId.startsWith('user:'))throw new Error('Forbidden')
 await assertLibraryAccess(viewer,libraryId,'write')
 const document=await db.execute(sql`select id,title,folder,kind from office_documents where id=${input.documentId}::uuid and tenant_id=${libraryId}::uuid and deleted_at is null`)
 const row=document.rows[0] as {id:string;title:string;folder:string|null;kind:string}|undefined
 if(!row)throw new Error('Document missing')
 await assertLibraryAccess(viewer,libraryId,'write',row.folder)
 const existing=await linkedOffice(viewer,libraryId,{documentId:row.id,need:'write'})
 if(existing.assetId)return existing
 await ensureFolder(libraryId,viewer.id,row.folder)
 const result=await db.execute(sql`with native as (
  insert into assets(id,tenant_id,name,folder,url,mime_type,source,category,app_key,uploaded_by_id)
  values(${row.id}::uuid,${libraryId}::uuid,${row.title},${row.folder},${`${process.env.OFFICE_PUBLIC_URL??'https://axxes.work'}/d/${row.id}?tenant=${libraryId}`},${'application/vnd.axxes.office.'+row.kind},'office','document','office',${viewer.id})
  on conflict(id) do update set name=excluded.name,folder=excluded.folder,updated_at=now() where assets.source='office' and assets.tenant_id=excluded.tenant_id returning id
 ), link as (
  insert into asset_app_links(tenant_id,asset_id,app_key,record_id)
  select ${libraryId}::uuid,id,'office',${row.id}::uuid from native
  on conflict(tenant_id,app_key,record_id) where app_key='office' do update set asset_id=asset_app_links.asset_id returning asset_id
 ) select asset_id from link`)
 const link=result.rows[0] as {asset_id:string}|undefined
 if(!link)throw new Error('Canonical file conflict')
 return {assetId:link.asset_id,title:row.title,folder:row.folder,active:true}
}
