import {storageService} from "@/lib/storage/service";
export const dynamic="force-dynamic";
export async function GET(request:Request){return storageService().GET(request);}
export async function PATCH(request:Request){return storageService().PATCH(request);}
