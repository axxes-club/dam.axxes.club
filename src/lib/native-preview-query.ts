import {sql} from 'drizzle-orm';
export function nativePreviewStatement(row:{id:string;tenantId:string|null}){
 return sql`select d.kind,d.content from office_documents d join asset_app_links l on l.record_id=d.id and l.app_key='office' where l.asset_id=${row.id}::uuid and d.tenant_id=${row.tenantId}::uuid and d.deleted_at is null limit 1`;
}
