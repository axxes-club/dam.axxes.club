import {wrapAdmission} from '@/lib/security/admission-server';
import {NextRequest} from 'next/server';
import {finishFoldersSignIn} from '@/lib/folders-oidc-session';
export const dynamic='force-dynamic';
async function GETHandler(request:NextRequest){return finishFoldersSignIn(request);}

export const GET=wrapAdmission(GETHandler,'oidc-callback',6000);
