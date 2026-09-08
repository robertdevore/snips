#!/usr/bin/env python3
"""Exercise production focus/expansion control flow with instrumented OS effects.

No event injection, clipboard access, or app activation. Compile extracted Swift
methods so the test follows the shipped implementation rather than a copy.
"""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
source = (root / 'helper/Sources/SnipsHelper/main.swift').read_text()
def method(name, following):
    start = source.index(f'\tprivate func {name}(')
    end = source.index(f'\n\tprivate func {following}(', start)
    return source[start:end].replace('private func', 'func', 1).replace('usleep(', 'recordSleep(')

harness = r'''
import Foundation
struct ActivationOptions: OptionSet {
    let rawValue: Int
    static let activateIgnoringOtherApps = ActivationOptions(rawValue: 1)
}
var active = true
var calls: [String] = []
func recordSleep(_ micros: UInt32) { calls.append("sleep:\(micros)") }
class NSRunningApplication {
    init?(processIdentifier: pid_t) {}
    var isActive: Bool { active }
    func activate(options: ActivationOptions) -> Bool { calls.append("activate"); return true }
}
struct Snippet { let content: String }
class Harness {
    var isInjecting = false
    let frontmostProcessIdentifier: pid_t? = 123
    let frontmostBundleId: String? = nil
    var output = ""
    func render(content: String, frontmostBundleId: String?) -> String { content }
    func extractFillFields(_ content: String) -> [String] { [] }
    func requestFillValues(fields: [String], frontmostBundleId: String?) -> [String: String] { active = false; return [:] }
    func renderWithFillValues(content: String, fillValues: [String: String]) -> String { "filled 👋" }
    func sendBackspaces(count: Int) { calls.append("delete:\(count)") }
    func insertByTyping(_ text: String) { output = text; calls.append("type") }
    func emitExpansionEvent(snippet: Snippet, output: String) { calls.append("emit") }
EXPAND
FOCUS
}
let helper = Harness()
let text = "Hello 👋🏽\n日本語\tRésumé"
active = true
helper.expand(snippet: Snippet(content: text), typedLength: 5, suppressCurrentKey: true)
precondition(calls == ["delete:4", "sleep:90000", "type", "emit"])
precondition(helper.output == text && !helper.isInjecting)
calls = []
helper.expand(snippet: Snippet(content: text), typedLength: 5, suppressCurrentKey: false)
precondition(calls == ["delete:5", "sleep:90000", "type", "emit"])
precondition(helper.output == text)
calls = []
active = false
helper.expand(snippet: Snippet(content: text), typedLength: 0, suppressCurrentKey: false)
precondition(calls == ["activate", "sleep:420000", "delete:0", "sleep:90000", "type", "emit"])
calls = []
active = true
helper.expand(snippet: Snippet(content: "[[fill:name]]"), typedLength: 4, suppressCurrentKey: true)
precondition(calls == ["activate", "sleep:420000", "delete:3", "sleep:90000", "type", "emit"])
precondition(helper.output == "filled 👋" && !helper.isInjecting)
calls = []
helper.refocusFrontmost(pid: nil, bundleId: nil)
precondition(calls.isEmpty)
print("PASS active destination, immediate/delimited deletion, inactive palette destination, fill focus restoration, Unicode handoff, injection reset, missing PID")
'''.replace('EXPAND', method('expand', 'renderWithFillValues')).replace('FOCUS', method('refocusFrontmost', 'formatDate'))
with tempfile.TemporaryDirectory(prefix='snips-focus-test-') as directory:
    source_path = pathlib.Path(directory) / 'main.swift'
    binary = pathlib.Path(directory) / 'test'
    source_path.write_text(harness)
    subprocess.run(['swiftc', str(source_path), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
