import test from 'node:test';import assert from 'node:assert/strict';
import {auth} from '../src/lib/auth';
test('public email registration cannot create a shared identity without an invite',async()=>{
 const origin='http://localhost:3000';
 const response=await auth.handler(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:'Uninvited',email:'uninvited@example.test',password:'unit-test-password'})}));
 assert.equal(response.status,404);
});
