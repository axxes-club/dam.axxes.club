import {wrapAdmission} from '@/lib/security/admission-server';
import {storageService} from "@/lib/storage/service";
export const dynamic="force-dynamic";
async function GETHandler(request:Request){return storageService().GET(request);}
async function PATCHHandler(request:Request){return storageService().PATCH(request);}

export const GET=wrapAdmission(GETHandler,'src/app/api/storage/allowance/route.ts'+':GET',12000);

export const PATCH=wrapAdmission(PATCHHandler,'src/app/api/storage/allowance/route.ts'+':PATCH',3000);
