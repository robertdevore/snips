// Read-only baseline comparison using an archived revision and generated data.
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve('.'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'snips-cli-baseline-'));
const run=(file,args,options={})=>{const r=spawnSync(file,args,{encoding:'utf8',...options});if(r.status)throw new Error(r.stderr);return r.stdout;};
try{
 for(const relative of ['app/cli/index.js','app/src/main/db.js','app/src/main/db-utils.js','app/src/main/validation.js','app/package.json']){const target=path.join(temp,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,run('git',['show','31be5c8:'+relative]));}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'));
 const {SnipsDb}=require(path.join(temp,'app/src/main/db.js'));const data=path.join(temp,'data'),db=new SnipsDb(data);
 const insert=db.db.prepare("INSERT INTO snippets(id,groupId,name,abbreviation,content,createdAt,updatedAt) VALUES(?,'default',?,?,?,?,?)");
 db.db.transaction(()=>{for(let i=0;i<10000;i++)insert.run('bench_'+i,'Deployment '+i,';b'+i,'Cloudflare deployment '+('synthetic text '.repeat(100)),i,i);})();db.db.close();
 for(const label of ['before','after']){const entry=path.join(label==='before'?temp:root,'app/cli/index.js');const times=[];let bytes;
 for(let i=0;i<5;i++){const t=performance.now();const output=run(process.execPath,[entry,'search','deployment','--json'],{maxBuffer:100*1024*1024,env:{...process.env,SNIPS_DATA_DIR:data}});times.push(performance.now()-t);bytes=Buffer.byteLength(output);}
 console.log(JSON.stringify({label,snippets:10000,medianProcessMs:times.sort((a,b)=>a-b)[2],bytes}));}
}finally{fs.rmSync(temp,{recursive:true,force:true});}
