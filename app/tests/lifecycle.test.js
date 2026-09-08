import {it,expect} from 'vitest';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/main/main.js',import.meta.url),'utf8');
it('production broadcast tolerates missing/destroyed/recreated windows',()=>{
 const method=source.slice(source.indexOf('function broadcast('),source.indexOf('\nfunction createMainWindow'));
 const sent=[];const context={mainWindow:undefined};vm.createContext(context);vm.runInContext(method,context);
 context.broadcast('stats:updated');context.mainWindow={isDestroyed:()=>true};context.broadcast('stats:updated');
 context.mainWindow={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(...args)=>sent.push(args)}};
 context.broadcast('helper:status',{running:true});expect(sent).toEqual([['helper:status',{running:true}]]);
});
it('production shortcut registration exposes conflicts and malformed values',()=>{
 const method=source.slice(source.indexOf('function registerGlobalHotkey('),source.indexOf('\nasync function syncHelperConfig'));
 const helperStatus={};const context={helperStatus,db:{getSettings:()=>({globalHotkey:'conflict',hotkeyOpenSnips:'bad'})},globalShortcut:{unregisterAll:()=>{},register:key=>{if(key==='bad')throw new Error('bad');return false;}},showPalette:()=>{},showMainWindow:()=>{},broadcast:()=>{}};
 vm.createContext(context);vm.runInContext(method,context);context.registerGlobalHotkey();expect(helperStatus.hotkeyFailures).toEqual(['conflict: already in use','bad: invalid shortcut']);
});
