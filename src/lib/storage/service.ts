import {auth} from "@/lib/auth";
import {storagePool} from "./database";
import {storageRoutes} from "./http.mjs";
export function storageService(){return storageRoutes({pool:storagePool(),getActor:async(request:Request)=>{const session=await auth.api.getSession({headers:request.headers});return session?.user?{kind:"member" as const,id:session.user.id}:null;},origins:["https://dam.axxes.club", "https://folders.axxes.club"]});}
