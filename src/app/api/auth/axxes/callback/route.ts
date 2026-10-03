import {NextRequest} from 'next/server';
import {finishFoldersSignIn} from '@/lib/folders-oidc-session';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){return finishFoldersSignIn(request);}
