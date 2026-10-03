import {eq,isNull,sql,type SQLWrapper} from 'drizzle-orm';
export function folderFilter(column:SQLWrapper,path:string|null|undefined,recursive=false){
 if(path==='__unfiled__')return isNull(column);
 if(!path)return undefined;
 return recursive?sql`(${column}=${path} or left(${column},${path.length+1})=${path+'/'})`:eq(column,path);
}
