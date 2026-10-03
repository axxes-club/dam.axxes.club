import {NextRequest} from 'next/server';
import {startFoldersSignIn} from '@/lib/folders-oidc-session';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){return startFoldersSignIn(request.nextUrl.searchParams.get('next')??'/');}
