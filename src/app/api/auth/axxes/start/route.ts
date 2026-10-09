import {wrapAdmission} from '@/lib/security/admission-server';
import {NextRequest} from 'next/server';
import {startFoldersSignIn} from '@/lib/folders-oidc-session';
export const dynamic='force-dynamic';
async function GETHandler(request:NextRequest){return startFoldersSignIn(request.nextUrl.searchParams.get('next')??'/');}

export const GET=wrapAdmission(GETHandler,'oidc-start',6000);
