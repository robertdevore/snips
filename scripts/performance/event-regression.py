#!/usr/bin/env python3
"""Exercise production key matching/control flow without posting any events."""
import pathlib, subprocess, tempfile
source=(pathlib.Path(__file__).resolve().parents[2]/'helper/Sources/SnipsHelper/main.swift').read_text()
def method(name,after):
 start=source.index(f'\tprivate func {name}(')
 end=source.index(f'\n\tprivate func {after}(',start) if f'\n\tprivate func {after}(' in source[start:] else source.index(f'\n    private func {after}(',start)
 return source[start:end].replace('private func','func',1)
harness='''import Cocoa
struct Snippet {let id:String;let abbreviation:String;let triggerMode:String}
struct Settings {let maxBufferLength=200;let expandOn="whitespace"}
class Harness {
 var buffer="";let settings=Settings();var endingsMap:[Character:[Snippet]]=[:];var calls:[String]=[]
 func scheduleExpansion(snippet:Snippet,typedLength:Int,delimiter:String){calls.append("\\(snippet.id):\\(typedLength):\\(delimiter)")}
KEY
SHOULD
}
func key(_ text:String,_ flags:NSEvent.ModifierFlags=[])->NSEvent {NSEvent.keyEvent(with:.keyDown,location:.zero,modifierFlags:flags,timestamp:0,windowNumber:0,context:nil,characters:text,charactersIgnoringModifiers:text,isARepeat:false,keyCode:7)!}
let h=Harness()
h.endingsMap["x"]=[Snippet(id:"immediate",abbreviation:";x",triggerMode:"immediate")]
h.buffer=";"
precondition(!h.handleKey(key("x")))
precondition(h.calls==["immediate:2:"] && h.buffer.isEmpty)
h.calls=[];h.buffer=";"
precondition(!h.handleKey(key("X")) && h.calls.isEmpty)
h.buffer=";";precondition(!h.handleKey(key("x",.command)) && h.buffer.isEmpty)
h.endingsMap["x"]=[Snippet(id:"space",abbreviation:";x",triggerMode:"whitespace")]
h.buffer=";x";precondition(!h.handleKey(key(" ")))
precondition(h.calls==["space:2: "])
h.calls=[];h.endingsMap["!"]=[Snippet(id:"punctuation",abbreviation:";!",triggerMode:"immediate")]
h.buffer=";";precondition(!h.handleKey(key("!")))
precondition(h.calls==["punctuation:2:"])
print("PASS production immediate/delimiter/punctuation scheduling, exact case, modifier reset, original key delivery")
'''.replace('KEY',method('handleKey','shouldExpand')).replace('SHOULD',method('shouldExpand','scheduleExpansion'))
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'main.swift';p.write_text(harness);binary=pathlib.Path(d)/'test'
 subprocess.run(['swiftc',str(p),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
