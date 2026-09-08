#!/usr/bin/env python3
"""Measure the production refocus method against a git revision on macOS.

Does not type or read snippet/clipboard data. Both versions target only the app
that is already frontmost. Aborts if focus changes during the measurement.
"""
import pathlib
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
source_path = 'helper/Sources/SnipsHelper/main.swift'
base = sys.argv[1] if len(sys.argv) > 1 else 'origin/main'

def extract(source):
    start = source.index('\tprivate func refocusFrontmost(')
    end = source.index('\n\tprivate func formatDate(', start)
    return source[start:end].replace('private func', 'func', 1)

before = extract(subprocess.check_output(['git', 'show', f'{base}:{source_path}'], cwd=root, text=True))
after = extract((root / source_path).read_text())
swift = '''import Cocoa
class Before {
BEFORE
}
class After {
AFTER
}
guard let target = NSWorkspace.shared.frontmostApplication, target.isActive else {
    fatalError("No active destination app")
}
let before = Before()
let after = After()
var samples: [String: [Double]] = ["before": [], "after": []]
for _ in 0..<9 {
    for label in ["before", "after"] {
        guard target.isActive else { fatalError("Focus changed; rerun benchmark") }
        let start = DispatchTime.now().uptimeNanoseconds
        if label == "before" {
            before.refocusFrontmost(pid: target.processIdentifier, bundleId: target.bundleIdentifier)
        } else {
            after.refocusFrontmost(pid: target.processIdentifier, bundleId: target.bundleIdentifier)
        }
        let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
        guard target.isActive else { fatalError("Focus changed; rerun benchmark") }
        samples[label]!.append(elapsed)
    }
}
for label in ["before", "after"] {
    let sorted = samples[label]!.sorted()
    print("\\(label): median=\\(sorted[4]) ms min=\\(sorted.first!) ms max=\\(sorted.last!) ms n=9")
}
'''.replace('BEFORE', before).replace('AFTER', after)
with tempfile.TemporaryDirectory(prefix='snips-focus-') as directory:
    source = pathlib.Path(directory) / 'main.swift'
    binary = pathlib.Path(directory) / 'benchmark'
    source.write_text(swift)
    subprocess.run(['swiftc', '-O', str(source), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
