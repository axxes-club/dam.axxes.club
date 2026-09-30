import {handleOfficeRequest} from '@/lib/office-service/service'
export const dynamic='force-dynamic'
export async function POST(request:Request){return handleOfficeRequest(request)}
