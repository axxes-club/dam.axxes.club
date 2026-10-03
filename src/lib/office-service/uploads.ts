import {createHmac,timingSafeEqual} from 'node:crypto'
import {and,eq} from 'drizzle-orm'
import {z} from 'zod'
import {db} from '../db'
import {officeUploads} from '../db/schema'
import {assertLibraryAccess} from '../library'
import {normalizeFolder} from '../assets'
import type {Viewer} from '../types'
const uuid=z.string().uuid()
export function packUploadGrant(uploadId:string,userId:string){
 const payload=Buffer.from(JSON.stringify({uploadId,userId,expiresAt:Date.now()+5*60_000})).toString('base64url')
 return payload+'.'+createHmac('sha256',process.env.FOLDERS_SERVICE_SECRET!).update('office-upload\n'+payload).digest('base64url')
}
export function readUploadGrant(grant:string):{uploadId:string;userId:string;expiresAt:number}{
 const [payload,signature,...extra]=grant.split('.')
 const expected=createHmac('sha256',process.env.FOLDERS_SERVICE_SECRET??'').update('office-upload\n'+payload).digest()
 const actual=Buffer.from(signature??'','base64url')
 if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid upload credential')
 const value=z.object({uploadId:uuid,userId:z.string().min(1),expiresAt:z.number()}).parse(JSON.parse(Buffer.from(payload,'base64url').toString()))
 if(value.expiresAt<=Date.now()||value.expiresAt>Date.now()+5*60_000)throw new Error('Upload credential expired')
 return value
}
export async function beginUpload(viewer:Viewer,libraryId:string,payload:unknown){
 const input=z.object({requestId:uuid,folder:z.string().max(120).nullable(),name:z.string().min(1).max(255),mimeType:z.string().max(150),size:z.number().int().min(0)}).parse(payload)
 const folder=normalizeFolder(input.folder)
 await assertLibraryAccess(viewer,libraryId,'write',folder)
 const maximum=input.mimeType.startsWith('image/')?16*1024*1024:input.mimeType.startsWith('video/')?512*1024*1024:input.mimeType.startsWith('text/')?4*1024*1024:64*1024*1024
 if(input.size>maximum)throw new Error('Upload size exceeds limit')
 if(!process.env.UPLOADTHING_TOKEN)throw new Error('Upload provider configuration missing')
 const [existing]=await db.select().from(officeUploads).where(and(eq(officeUploads.userId,viewer.id),eq(officeUploads.requestId,input.requestId))).limit(1)
 if(existing&&(existing.libraryId!==libraryId||existing.folder!==folder||existing.name!==input.name||existing.size!==input.size||existing.mimeType!==input.mimeType))throw new Error('Upload request conflict')
 const [intent]=await db.insert(officeUploads).values({requestId:input.requestId,userId:viewer.id,libraryId,folder,name:input.name,mimeType:input.mimeType,size:input.size,expiresAt:new Date(Date.now()+60*60_000)}).onConflictDoUpdate({target:[officeUploads.userId,officeUploads.requestId],set:{expiresAt:new Date(Date.now()+60*60_000)}}).returning()
 const endpoint=new URL('/api/uploadthing',process.env.FOLDERS_PUBLIC_URL??process.env.BETTER_AUTH_URL??'https://folders.axxes.club').href
 return {uploadId:intent.id,grant:packUploadGrant(intent.id,viewer.id),endpoint,expiresAt:intent.expiresAt.toISOString()}
}
export async function finishUpload(viewer:Viewer,libraryId:string,payload:unknown){
 const input=z.object({uploadId:uuid}).parse(payload)
 const [intent]=await db.select().from(officeUploads).where(and(eq(officeUploads.id,input.uploadId),eq(officeUploads.userId,viewer.id),eq(officeUploads.libraryId,libraryId))).limit(1)
 if(!intent)throw new Error('Upload missing')
 await assertLibraryAccess(viewer,libraryId,'write',intent.folder)
 if(!intent.assetId)throw new Error('Upload registration pending')
 return {assetId:intent.assetId}
}
