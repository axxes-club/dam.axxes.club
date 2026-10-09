export class AdmissionError extends Error {status:number;retryAfter:number;constructor(status:number,retryAfter?:number);}
export type AdmissionInput={service:string;scope:string;subject:string;tenant?:string;limit:number;windowMs?:number};
export function admit(db:{query:(sql:string,values:unknown[])=>Promise<{rows:any[]}>},input:AdmissionInput):Promise<{remaining:number;retryAfter:number}>;
export function admissionResponse(error:unknown):Response;
export function wrapAdmission<T extends (...args:any[])=>any>(handler:T,admission:(request:Request)=>Promise<unknown>):T;

export function assertCookieOrigin(request:Request):void;
export function boundedJson(request:Request,limit?:number):Promise<unknown>;

export function boundedText(request:Request,limit?:number):Promise<string>;

export function admissionTransaction<T>(pool:{connect:()=>Promise<{query:(sql:string,values?:unknown[])=>Promise<{rows:any[]}>;release:(failed?:boolean)=>void}>},operation:(db:{query:(sql:string,values:unknown[])=>Promise<{rows:any[]}>})=>Promise<T>):Promise<T>;
