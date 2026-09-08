import {it,expect} from 'vitest';
import {HelperBridge} from '../src/main/helper-bridge.js';
import {validEvent} from '../src/main/helper-protocol.js';
it('event server authenticates, bounds and validates requests',async()=>{
 const events=[];const bridge=new HelperBridge({token:'secret',onEvent:e=>events.push(e)});bridge.appEventPort=0;bridge.startEventServer();await new Promise(r=>bridge.server.once('listening',r));
 const url=`http://127.0.0.1:${bridge.server.address().port}/helper-event`;
 const event={protocolVersion:1,requestId:'r',type:'status',payload:{secureInput:false,accessibilityEnabled:false,listenEventAccess:false,postEventAccess:false,eventTapActive:false,helperExecutable:'/helper'}};
 const send=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 try {
 expect((await send(JSON.stringify(event))).status).toBe(401);
 expect((await send(JSON.stringify(event),{Authorization:'Bearer secret','Content-Type':'text/plain'})).status).toBe(415);
 expect((await send('{',{Authorization:'Bearer secret'})).status).toBe(400);
 expect((await send(JSON.stringify({...event,type:'fill_response'}),{Authorization:'Bearer secret'})).status).toBe(400);
 expect((await send(JSON.stringify(event),{Authorization:'Bearer secret'})).status).toBe(200);
 try {expect((await send('x'.repeat(300000),{Authorization:'Bearer secret'})).status).toBe(413);}catch(e){expect(e.message).toMatch(/fetch failed/);}
 expect(events).toHaveLength(1);
 }finally{bridge.server.closeAllConnections();await new Promise(r=>bridge.server.close(r));}
});
it('rejects malformed payload schemas',()=>{expect(validEvent({protocolVersion:1,requestId:'r',type:'expansion_event',payload:{charsInserted:-1}})).toBe(false);});
it('sends ordered incremental changes and resets after rejection',async()=>{
 const bridge=new HelperBridge({token:'s',onEvent:()=>{}});const calls=[];bridge.sendCommand=async c=>{calls.push(c);return {ok:true};};
 const settings={};await bridge.sendConfig({snippets:[{id:'a',content:'one'}],settings});await bridge.sendConfig({snippets:[{id:'a',content:'two'}],settings});await bridge.sendConfig({snippets:[],settings});expect(calls.map(c=>c.type)).toEqual(['config_update','config_patch','config_patch']);expect(calls[1].payload.baseRevision).toBe(1);expect(calls[2].payload.deletes).toEqual(['a']);
});
it('chunks oversized recovery libraries with expansion disabled until complete',async()=>{
 const bridge=new HelperBridge({token:'s',onEvent:()=>{}}),calls=[];
 bridge.sendCommand=async c=>{calls.push(c);return {ok:true};};
 const snippets=Array.from({length:20},(_,i)=>({id:'large'+i,content:'x'.repeat(900000)}));
 await bridge.sendConfig({snippets,settings:{enabled:'true'}});
 expect(calls[0].payload.snippets).toEqual([]);expect(calls[0].payload.settings.enabled).toBe(false);
 expect(calls.at(-1).payload.settings.enabled).toBe(true);
 expect(calls.slice(1,-1).reduce((n,c)=>n+c.payload.upserts.length,0)).toBe(20);
 expect(calls.every(c=>Buffer.byteLength(JSON.stringify(c))<16777216)).toBe(true);
});
