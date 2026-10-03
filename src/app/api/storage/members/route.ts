import {storageService} from "@/lib/storage/service";
export const dynamic="force-dynamic";
export async function GET(request:Request){return storageService().MEMBERS(request);}
