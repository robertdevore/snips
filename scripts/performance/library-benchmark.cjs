// Synthetic only. Includes SQLite query, metadata projection and compact JSON serialization.
const {SnipsDb}=require('../../app/src/main/db');const fs=require('fs'),os=require('os'),path=require('path');const {spawnSync}=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snips-bench-'));const db=new SnipsDb(dir);
try {for(const n of [100,1000,10000,50000]){
 const start=db.db.prepare('select count(*) n from snippets').get().n;
 const insert=db.db.prepare("INSERT INTO snippets(id,groupId,name,abbreviation,content,createdAt,updatedAt) VALUES(?,'default',?,?,?,?,?)");
 db.db.transaction(()=>{for(let i=start;i<n;i++)insert.run('bench_'+i,'Deployment '+i,';b'+i,'Cloudflare deployment '+('synthetic text '.repeat(100)),i,i);})();
 const measure=(options)=>{const times=[];let bytes;for(let i=0;i<7;i++){const t=performance.now();const rows=db.listSnippets(options);bytes=Buffer.byteLength(JSON.stringify({count:rows.length,snippets:rows}));times.push(performance.now()-t)}return {medianMs:times.sort((a,b)=>a-b)[3],bytes}};
 const t=performance.now();const cli=spawnSync(process.execPath,[path.resolve('app/cli/index.js'),'list','--json'],{encoding:'utf8',env:{...process.env,SNIPS_DATA_DIR:dir}});if(cli.status)throw new Error(cli.stderr);const cliMs=performance.now()-t;
 console.log(JSON.stringify({n,search:measure({query:'deployment',metadata:true,limit:50}),list:measure({metadata:true,limit:50}),cliStartupAndListMs:cliMs}));
}} finally {db.db.close();fs.rmSync(dir,{recursive:true,force:true});}
