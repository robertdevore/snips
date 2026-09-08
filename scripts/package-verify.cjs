const {spawnSync}=require('child_process');const fs=require('fs'),path=require('path'),os=require('os');
function run(file,args,env={}){const r=spawnSync(file,args,{encoding:'utf8',env:{...process.env,...env}});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout;}
run('npm',['run','package:dir','--workspace','app','--','--x64'],{CSC_IDENTITY_AUTO_DISCOVERY:'false'});
run('npm',['run','package:dir','--workspace','app','--','--arm64'],{CSC_IDENTITY_AUTO_DISCOVERY:'false'});
const output=path.resolve('app/dist');const folders=fs.readdirSync(output).filter(f=>f.startsWith('mac')&&fs.existsSync(path.join(output,f,'Snips.app')));
if(!folders.length)throw new Error('Packaged app missing');
for(const folder of folders){
 const app=path.join(output,folder,'Snips.app/Contents');const runtime=path.join(app,'MacOS/Snips');const archive=path.join(app,'Resources/app.asar');
 const architecture=run('/usr/bin/file',[runtime]);
 if(process.arch==='x64' && !architecture.includes('x86_64')){const entries=require('@electron/asar').listPackage(archive);if(!entries.includes('/cli/index.js'))throw new Error('ARM64 CLI missing');const native=path.join(app,'Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node');if(!run('/usr/bin/file',[native]).includes('arm64'))throw new Error('ARM64 SQLite architecture mismatch');console.log('PASS fresh arm64 app/CLI/native SQLite artifact; execution requires Apple Silicon');continue;}
 const script=`const Db=require(${JSON.stringify(archive+'/node_modules/better-sqlite3')}); const db=new Db(':memory:');if(db.prepare('select 1 n').get().n!==1)process.exit(1);console.log('SQLite OK')`;
 console.log(run(runtime,['-e',script],{ELECTRON_RUN_AS_NODE:'1'}).trim());
 console.log(run(runtime,[archive+'/cli/index.js','capabilities','--json'],{ELECTRON_RUN_AS_NODE:'1'}).trim());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snips-package-'));try{
 run(runtime,['-e',`new (require(${JSON.stringify(archive+'/src/main/db')}).SnipsDb)(${JSON.stringify(dir)}).db.close()`],{ELECTRON_RUN_AS_NODE:'1'});
 const r=JSON.parse(run(runtime,[archive+'/cli/index.js','create','--name','Package smoke','--abbr',';pkg','--content','synthetic','--json'],{ELECTRON_RUN_AS_NODE:'1',SNIPS_DATA_DIR:dir}));if(!r.ok)throw new Error('Packaged CLI failed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 for(const arch of ['arm64','x86_64']){const helper=path.join(app,'Resources/helper-build',arch+'-apple-macosx/release/SnipsHelper');if(!fs.existsSync(helper))throw new Error('Missing helper '+arch);}
 console.log('PASS packaged native SQLite, CLI mutations, helper discovery: '+folder);
}
