#!/usr/bin/env python3
"""Compile production focus method with instrumented effects; no event injection."""
import pathlib, subprocess, tempfile
source=(pathlib.Path(__file__).resolve().parents[2]/'helper/Sources/SnipsHelper/main.swift').read_text()
start=source.index('\tprivate func refocusFrontmost(')
end=source.index('\n\tprivate func formatDate(',start)
method=source[start:end].replace('private func','func',1).replace('usleep(','recordSleep(')
harness='''import Foundation
struct ActivationOptions: OptionSet {let rawValue:Int;static let activateIgnoringOtherApps=ActivationOptions(rawValue:1)}
var active=true
var calls:[String]=[]
func recordSleep(_ micros:UInt32){calls.append("sleep")}
class NSRunningApplication {
 init?(processIdentifier:pid_t){}
 var isActive:Bool {active}
 func activate(options:ActivationOptions)->Bool {calls.append("activate");return true}
}
class Harness {
METHOD
}
let helper=Harness()
helper.refocusFrontmost(pid:123,bundleId:nil)
precondition(calls.isEmpty)
active=false
helper.refocusFrontmost(pid:123,bundleId:nil)
precondition(calls==["activate","sleep"])
calls=[]
helper.refocusFrontmost(pid:nil,bundleId:nil)
precondition(calls.isEmpty)
print("PASS production focus: active fast path, inactive restoration, missing destination")
'''.replace('METHOD',method)
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'main.swift';p.write_text(harness);binary=pathlib.Path(d)/'test'
 subprocess.run(['swiftc',str(p),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
