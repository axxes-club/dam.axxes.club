import {wrapAdmission} from '@/lib/security/admission-server';
import {storageService} from "@/lib/storage/service";
export const dynamic="force-dynamic";
async function GETHandler(request:Request){return storageService().MEMBERS(request);}

export const GET=wrapAdmission(GETHandler,'src/app/api/storage/members/route.ts'+':GET',12000);
