import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {SnipsDb} from '../src/main/db.js';import {execute} from '../src/main/operations.js';import {parse} from '../cli/parser.js';import {installCli} from '../src/main/cli-install.js';
let dir,db;
const snippet=(patch={})=>({name:'Deployment',abbreviation:';deploy',content:'Cloudflare deployment\ntext',groupId:'default',enabled:true,tags:['work'],...patch});
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'snips-test-'));db=new SnipsDb(dir);});
afterEach(()=>{if(db.db.open)db.db.close();fs.rmSync(dir,{recursive:true,force:true});});
describe('database boundaries',()=>{
 it('reuses trashed abbreviations and rejects restore collisions',()=>{const old=db.saveSnippet(snippet());db.deleteSnippet(old.id);expect(db.getSnippet(old.id)).toBeNull();expect(db.getSnippetByAbbreviation(';deploy')).toBeUndefined();db.saveSnippet(snippet());expect(()=>db.changeTrash(old.id,false)).toThrow();expect(db.listSnippets({trash:true})).toHaveLength(1);});
 it('restores, purges only trash, and removes content history',()=>{const s=db.saveSnippet(snippet());expect(()=>db.purgeSnippet(s.id)).toThrow('TRASH_REQUIRED');db.deleteSnippet(s.id);db.changeTrash(s.id,false);expect(db.getSnippet(s.id).revision).toBe(3);db.deleteSnippet(s.id);db.purgeSnippet(s.id);expect(db.history(s.id)).toEqual([]);});
 it('rolls back complete batches including tags/history',()=>{expect(()=>execute(db,[{type:'create',snippet:snippet()},{type:'create',snippet:snippet()}])).toThrow();expect(db.listSnippets()).toEqual([]);expect(db.db.prepare('select count(*) n from history').get().n).toBe(0);});
 it('dry run validates database constraints and rolls back',()=>{const result=execute(db,[{type:'create',snippet:snippet()}],{dryRun:true});expect(result.dryRun).toBe(true);expect(db.listSnippets()).toEqual([]);expect(()=>execute(db,[{type:'create',snippet:snippet({groupId:'missing'})}],{dryRun:true})).toThrow('GROUP_NOT_FOUND');});
 it('detects concurrent edits across connections',()=>{const s=db.saveSnippet(snippet());const other=new SnipsDb(dir);other.saveSnippet({...s,name:'GUI'});expect(()=>execute(db,[{type:'update',id:s.id,ifRevision:1,patch:{name:'agent'}}])).toThrow('REVISION_CONFLICT');other.db.close();expect(db.getSnippet(s.id).name).toBe('GUI');});
 it('replays explicit idempotency and refuses key reuse',()=>{const ops=[{type:'create',snippet:snippet()}];const first=execute(db,ops,{idempotencyKey:'retry'});expect(execute(db,ops,{idempotencyKey:'retry'})).toEqual(first);expect(db.listSnippets()).toHaveLength(1);expect(()=>execute(db,[{type:'create',snippet:snippet({name:'other'})}],{idempotencyKey:'retry'})).toThrow('IDEMPOTENCY_CONFLICT');});
 it('reverts through the normal revision and history path',()=>{const s=db.saveSnippet(snippet());db.saveSnippet({...s,content:'changed'});const h=db.history(s.id)[0];execute(db,[{type:'revert',id:s.id,ifRevision:2,historyId:h.id}]);expect(db.getSnippet(s.id).content).toBe(s.content);expect(db.getSnippet(s.id).revision).toBe(3);});
 it('moves groups atomically and records snippet revisions',()=>{const g=db.saveGroup({name:'Work'});const s=db.saveSnippet(snippet({groupId:g.id}));db.deleteGroup(g.id);expect(db.getSnippet(s.id).groupId).toBe('default');expect(db.getSnippet(s.id).revision).toBe(2);expect(()=>db.deleteGroup('default')).toThrow();});
 it('FTS updates on edits, filters trash and ranks names',()=>{const a=db.saveSnippet(snippet());db.saveSnippet(snippet({abbreviation:';other',name:'Other',content:'Deployment'}));expect(db.listSnippets({query:'deploy',limit:1})[0].id).toBe(a.id);db.saveSnippet({...a,name:'Renamed',content:'Unrelated'});db.deleteSnippet(a.id);expect(db.listSnippets({query:'deploy'})).toHaveLength(1);});
 it('bounds metadata and pagination',()=>{for(let i=0;i<3;i++)db.saveSnippet(snippet({abbreviation:';'+i}));const rows=db.listSnippets({metadata:true,limit:2,offset:1});expect(rows).toHaveLength(2);expect(rows[0].content).toBeUndefined();expect(rows[0].preview.length).toBeLessThanOrEqual(120);expect(()=>db.listSnippets({limit:-1})).toThrow();});
 it('fails unknown database versions and reopens current versions',()=>{db.db.close();db=new SnipsDb(dir);expect(db.db.pragma('user_version',{simple:true})).toBe(1);db.db.pragma('user_version=999');expect(()=>new SnipsDb(dir)).toThrow('DATABASE_TOO_NEW');});
 it('rejects unsafe settings and invalid snippet contracts',()=>{for(const s of [{wpm:'0'},{helperHost:'0.0.0.0'},{userAvatar:'data:image/svg+xml,<svg/>'},{excludedApps:'{}'}])expect(()=>db.saveSettings(s)).toThrow();for(const patch of [{triggerMode:'bad'},{caseMode:'insensitive'},{tags:['x'.repeat(100)]},{content:'[[cursor]][[cursor]]'}])expect(()=>db.saveSnippet(snippet(patch))).toThrow();});
});
describe('CLI',()=>{
 const cli=(args,input)=>spawnSync(process.execPath,[path.resolve('cli/index.js'),...args],{encoding:'utf8',input,env:{...process.env,SNIPS_DATA_DIR:dir}});
 it.each([['create','-c','text'],['create','--unknown'],['update','x','--dry-run','--confirm'],['create','--name'],['list','--json','--json'],['list','--content','x'],['nope']])('rejects ambiguous or invalid flags %j',(...args)=>{expect(()=>parse(args)).toThrow();});
 it('supports multiline and structured input with compact metadata output',()=>{let r=cli(['create','--stdin-json','--json'],JSON.stringify(snippet()));expect(r.status,r.stderr).toBe(0);const saved=JSON.parse(r.stdout).results[0];r=cli(['update',saved.id,'--content-stdin','--if-revision','1','--confirm','--json'],'line one\nline two\n');expect(r.status,r.stderr).toBe(0);r=cli(['list','--json']);expect(r.stdout.trim().split('\n')).toHaveLength(1);expect(JSON.parse(r.stdout).snippets[0].content).toBeUndefined();r=cli(['get',saved.id,'--json']);expect(JSON.parse(r.stdout).content).toBe('line one\nline two\n');});
 it('returns structured conflicts and verifies dry-run',()=>{const s=db.saveSnippet(snippet());const r=cli(['update',s.id,'--content','new','--if-revision','2','--dry-run','--json']);expect(r.status).toBe(1);expect(JSON.parse(r.stderr).error.code).toBe('REVISION_CONFLICT');expect(db.getSnippet(s.id).revision).toBe(1);});
 it('supports JSONL batches transactionally',()=>{const input=[{type:'create',snippet:snippet()},{type:'create',snippet:snippet({abbreviation:';two'})}].map(s=>JSON.stringify(s)).join('\n');expect(cli(['batch','--stdin-jsonl','--dry-run','--json'],input).status).toBe(0);expect(db.listSnippets()).toHaveLength(0);expect(cli(['batch','--stdin-jsonl','--confirm','--json'],input).status).toBe(0);expect(db.listSnippets()).toHaveLength(2);});
 it('refuses to overwrite unmanaged CLI executables',()=>{const opts={home:dir,executable:process.execPath,entry:'/path with spaces/cli.js'};expect(installCli(opts).ok).toBe(true);expect(installCli(opts).ok).toBe(true);fs.writeFileSync(path.join(dir,'.local/bin/snips'),'unrelated');expect(()=>installCli(opts)).toThrow('CLI_PATH_OCCUPIED');});
});
describe('legacy migrations',()=>{
 it('upgrades old schema with global uniqueness and no deletedAt',()=>{
  db.db.close();fs.rmSync(path.join(dir,'snips.db'));
  const legacy=new (require('better-sqlite3'))(path.join(dir,'snips.db'));
  legacy.exec(`CREATE TABLE groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,parentId TEXT,sortOrder INTEGER DEFAULT 0,createdAt INTEGER,updatedAt INTEGER);
  INSERT INTO groups VALUES('default','General',NULL,0,1,1);
  CREATE TABLE snippets(id TEXT PRIMARY KEY,groupId TEXT,name TEXT NOT NULL,abbreviation TEXT UNIQUE NOT NULL,content TEXT NOT NULL,enabled INTEGER DEFAULT 1,favorite INTEGER DEFAULT 0,notes TEXT,triggerMode TEXT DEFAULT 'immediate',caseMode TEXT DEFAULT 'exact',createdAt INTEGER,updatedAt INTEGER);
  INSERT INTO snippets VALUES('legacy','default','Legacy',';old','body',1,0,'','immediate','exact',1,1);`);legacy.close();
  db=new SnipsDb(dir);expect(db.getSnippet('legacy').content).toBe('body');db.deleteSnippet('legacy');db.saveSnippet(snippet({abbreviation:';old'}));expect(db.listSnippets()).toHaveLength(1);db.db.close();db=new SnipsDb(dir);expect(db.listSnippets({trash:true})).toHaveLength(1);
 });
 it('rolls back schema migration on invalid legacy data',()=>{
  db.db.close();fs.rmSync(path.join(dir,'snips.db'));
  const legacy=new (require('better-sqlite3'))(path.join(dir,'snips.db'));
  legacy.exec(`CREATE TABLE snippets(id TEXT PRIMARY KEY,groupId TEXT,name TEXT,abbreviation TEXT,content TEXT,enabled INTEGER,favorite INTEGER,notes TEXT,triggerMode TEXT,caseMode TEXT,createdAt INTEGER,updatedAt INTEGER,deletedAt INTEGER);
  INSERT INTO snippets VALUES('bad','default','Name',';bad','body',3,0,'','immediate','exact',1,1,NULL);`);legacy.close();
  expect(()=>new SnipsDb(dir)).toThrow();
  const check=new (require('better-sqlite3'))(path.join(dir,'snips.db'));expect(check.pragma('user_version',{simple:true})).toBe(0);expect(check.prepare('SELECT enabled FROM snippets').get().enabled).toBe(3);check.close();
 });
});
