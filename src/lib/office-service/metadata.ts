import {sql,type SQL} from 'drizzle-orm'
const columns:Record<string,string>={name:'name',folder:'folder',tags:'tags',description:'description',altText:'alt_text',expiresAt:'expires_at',trashedAt:'trashed_at',trashReason:'trash_reason',updatedAt:'updated_at'}
/** Shared by the existing Folders API and signed Office API. */
export function updateAssetMetadataStatement(scope:SQL,updates:Record<string,unknown>):SQL{
 const setters=Object.entries(updates).map(([key,value])=>{
  const name=columns[key];if(!name)throw new Error('Unsupported metadata field')
  const wire=value instanceof Date?value.toISOString():key==='tags'?JSON.stringify(value):value
  return sql`${sql.identifier(name)}=${wire}${key==='tags'?sql`::jsonb`:sql``}`
 })
 return sql`with changed as (update assets set ${sql.join(setters,sql`, `)} where ${scope} returning id,name,folder,trashed_at),
 docs as (update office_documents d set title=a.name,folder=a.folder,deleted_at=a.trashed_at,version=d.version+1,updated_at=now()
 from changed a join asset_app_links l on l.asset_id=a.id and l.app_key='office' where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id)
 select id from changed`
}
export function deleteAssetStatement(scope:SQL):SQL{
 return sql`with removed as (delete from assets where ${scope} returning id,url,source),
 docs as (update office_documents d set deleted_at=now(),version=d.version+1,updated_at=now() from removed a join asset_app_links l on l.asset_id=a.id and l.app_key='office' where d.id=l.record_id and d.tenant_id=l.tenant_id returning d.id)
 select url,source from removed`
}
