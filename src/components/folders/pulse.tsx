"use client";
import {organizationId} from "@/lib/organization-id";
import {useEffect,useState} from 'react';
import {PulseTrackerClient} from '../pulse-tracker-client';
export function FoldersPulse({tenantId}:{tenantId:string}){
 const [data,setData]=useState<{tenantId:string;siteId:string;identityMode:string}|null>(null);
 useEffect(()=>{setData(null);if(!organizationId(tenantId))return;let active=true;const controller=new AbortController();fetch('/api/pulse/config?tenant='+encodeURIComponent(tenantId),{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)return;const config=await response.json();if(active&&config.siteId)setData({...config,tenantId})}).catch(()=>{});return ()=>{active=false;controller.abort()}},[tenantId]);
 return data?.tenantId===tenantId?<PulseTrackerClient siteId={data.siteId} persistent={data.identityMode==='persistent'}/>:null;
}
