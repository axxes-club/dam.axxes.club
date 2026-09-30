import { sql, type SQL } from 'drizzle-orm';
function ownerScope(alias:string,tenantId:string|null,userId:string|null):SQL {
 const table=sql.identifier(alias);
 return tenantId ? sql`${table}.tenant_id=${tenantId}` : sql`${table}.tenant_id is null and ${table}.owner_user_id=${userId}`;
}
function subtree(alias:string,column:string,path:string):SQL {
 const field=sql`${sql.identifier(alias)}.${sql.identifier(column)}`;
 return sql`(${field}=${path} or left(${field},${path.length+1})=${path+'/'})`;
}
/** One SQL statement keeps asset paths and all inherited policies atomic. */
export function renameFolderStatement(tenantId:string|null,userId:string|null,from:string,to:string):SQL {
 return sql`
 with permitted as (
   select id from asset_folders root where ${ownerScope('root',tenantId,userId)} and root.path=${from}
   and not exists (
     select 1 from asset_folders old join asset_folders occupied on occupied.path=${to}||substring(old.path from ${from.length+1}::integer)
     where ${ownerScope('old',tenantId,userId)} and ${ownerScope('occupied',tenantId,userId)}
       and ${subtree('old','path',from)} and not ${subtree('occupied','path',from)}
   )
 ), moved as (
   update asset_folders f set path=${to}||substring(f.path from ${from.length+1}::integer)
   where ${ownerScope('f',tenantId,userId)} and ${subtree('f','path',from)} and exists(select 1 from permitted)
   returning id
 ), files as (
   update assets a set folder=${to}||substring(a.folder from ${from.length+1}::integer),updated_at=now()
   where ${ownerScope('a',tenantId,userId)} and ${subtree('a','folder',from)} and exists(select 1 from moved)
   returning id
 ) select id from permitted
 `;
}
/** Restore only content trashed with this folder; independent trash remains intact. */
export function restoreFolderStatement(tenantId:string|null,userId:string|null,path:string,expiresAt:Date|null,now=new Date()):SQL {
 return sql`
 with root as (
   select id,trashed_at,trash_reason from asset_folders r where ${ownerScope('r',tenantId,userId)} and r.path=${path}
     and (${expiresAt?.toISOString()??null}::timestamptz is null or ${expiresAt?.toISOString()??null}::timestamptz>${now.toISOString()}::timestamptz)
     and not exists(select 1 from asset_folders parent where ${ownerScope('parent',tenantId,userId)}
       and parent.path<>${path} and left(${path},length(parent.path)+1)=parent.path||'/'
       and (parent.trashed_at is not null or parent.expires_at<=${now.toISOString()}::timestamptz))
 ), restored as (
   update asset_folders f set trashed_at=null,trash_reason=null,
     expires_at=case when f.path=${path} then ${expiresAt?.toISOString()??null}::timestamptz else f.expires_at end
   where ${ownerScope('f',tenantId,userId)} and exists(select 1 from root)
     and (f.path=${path} or (${subtree('f','path',path)}
       and f.trash_reason in ('folder-deleted','expired')
       and f.trashed_at=(select trashed_at from root)
       and (f.expires_at is null or f.expires_at>${now.toISOString()}::timestamptz)))
   returning id
 ), files as (
   update assets a set trashed_at=null,trash_reason=null,updated_at=now()
   where ${ownerScope('a',tenantId,userId)} and ${subtree('a','folder',path)} and exists(select 1 from root)
     and a.trash_reason in ('folder-deleted','expired') and a.trashed_at=(select trashed_at from root)
     and (a.expires_at is null or a.expires_at>${now.toISOString()}::timestamptz)
     and not exists(select 1 from asset_folders blocked where ${ownerScope('blocked',tenantId,userId)}
       and blocked.path<>${path} and (a.folder=blocked.path or left(a.folder,length(blocked.path)+1)=blocked.path||'/')
       and (blocked.expires_at<=${now.toISOString()}::timestamptz or (blocked.trashed_at is not null
         and not (blocked.trash_reason in ('folder-deleted','expired') and blocked.trashed_at=(select trashed_at from root)))))
   returning id
 ) select id from root
 `;
}
