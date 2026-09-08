// Real Swift TCP protocol on an ephemeral port. No event tap, permissions, clipboard or injection.
const net=require('net'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snips-ipc-')),token='a'.repeat(64),tokenPath=path.join(dir,'token');fs.writeFileSync(tokenPath,token,{mode:0o600});
const binary=path.resolve(`helper/.build/${process.arch==='arm64'?'arm64':'x86_64'}-apple-macosx/release/SnipsHelper`);
const child=spawn(binary,['--ipc-test-server'],{env:{...process.env,SNIPS_TOKEN_PATH:tokenPath},stdio:['ignore','pipe','pipe']});
async function main(){
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),5000);child.stdout.on('data',chunk=>{const m=String(chunk).match(/TEST_PORT=(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.once('exit',()=>reject(new Error('Helper exited')));});
 const send=body=>new Promise((resolve,reject)=>{let response='';const socket=net.connect(port,'127.0.0.1',()=>socket.end(body));socket.on('data',b=>response+=b);socket.on('error',reject);socket.on('close',()=>resolve(response));socket.setTimeout(7000,()=>{socket.destroy();reject(new Error('Command timeout'));});});
 const envelope={protocolVersion:1,requestId:'test',token,type:'ping',payload:{}};
 assert.equal(JSON.parse(await send(JSON.stringify(envelope)+'\n')).ok,true);
 assert.equal(JSON.parse(await send(JSON.stringify({...envelope,token:'wrong'})+'\n')).message,'UNAUTHORIZED');
 assert.equal(JSON.parse(await send(JSON.stringify({...envelope,protocolVersion:2})+'\n')).message,'PROTOCOL_MISMATCH');
 assert.equal(JSON.parse(await send('{\n')).ok,false);
 try{assert.equal(await send('x'.repeat(16777217)),'');}catch(e){assert.ok(['ECONNRESET','EPIPE'].includes(e.code));}
 console.log('PASS actual Swift loopback TCP authentication/version/malformed/oversize rejection');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
