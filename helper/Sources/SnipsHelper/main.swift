import Foundation
import Cocoa
import ApplicationServices
import Carbon
import CoreGraphics
import Network

struct Snippet: Codable {
	let id: String
	let abbreviation: String
	let content: String
	let triggerMode: String
	let caseMode: String
}

struct HelperSettings: Codable {
	let enabled: Bool
	let expandOn: String
	let maxBufferLength: Int
	let excludedApps: [String]
	let secureInputBehavior: String
	let pauseExpansions: Bool
	let eventCallbackUrl: String
	let wpm: Int
	let charsPerWord: Int
}

struct ConfigPayload: Codable {
	let snippets: [Snippet]
	let settings: HelperSettings
}

struct CommandEnvelope: Codable {
	let type: String
	let payload: [String: AnyCodable]
}

struct AnyCodable: Codable {
	let value: Any

	init(_ value: Any) {
		self.value = value
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.singleValueContainer()
		if let intValue = try? container.decode(Int.self) {
			value = intValue
			return
		}
		if let doubleValue = try? container.decode(Double.self) {
			value = doubleValue
			return
		}
		if let boolValue = try? container.decode(Bool.self) {
			value = boolValue
			return
		}
		if let stringValue = try? container.decode(String.self) {
			value = stringValue
			return
		}
		if let arrayValue = try? container.decode([AnyCodable].self) {
			value = arrayValue.map { $0.value }
			return
		}
		if let objectValue = try? container.decode([String: AnyCodable].self) {
			var mapped: [String: Any] = [:]
			for (key, value) in objectValue {
				mapped[key] = value.value
			}
			self.value = mapped
			return
		}
		throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
	}

	func encode(to encoder: Encoder) throws {
		var container = encoder.singleValueContainer()
		switch value {
		case let intValue as Int:
			try container.encode(intValue)
		case let doubleValue as Double:
			try container.encode(doubleValue)
		case let boolValue as Bool:
			try container.encode(boolValue)
		case let stringValue as String:
			try container.encode(stringValue)
		case let arrayValue as [Any]:
			try container.encode(arrayValue.map { AnyCodable($0) })
		case let objectValue as [String: Any]:
			var mapped: [String: AnyCodable] = [:]
			for (key, item) in objectValue {
				mapped[key] = AnyCodable(item)
			}
			try container.encode(mapped)
		default:
			try container.encodeNil()
		}
	}
}

final class SnipsHelper {
	private var listener: NWListener?
	private var snippets: [Snippet] = []
	private var snippetById: [String: Snippet] = [:]
	private var endingsMap: [Character: [Snippet]] = [:]
	private var excludedAppBundleIds: Set<String> = []
	private var settings = HelperSettings(enabled: true, expandOn: "whitespace", maxBufferLength: 200, excludedApps: [], secureInputBehavior: "disable", pauseExpansions: false, eventCallbackUrl: "", wpm: 220, charsPerWord: 6)
	private var buffer = ""
	private var isInjecting = false
	private var eventTap: CFMachPort?
	private var runLoopSource: CFRunLoopSource?
	private var accessibilityGranted = false
	private var listenEventAccessGranted = false
	private var postEventAccessGranted = false
	private var eventTapActive = false
	private var secureInputEnabled = false
	private var frontmostBundleId: String?
	private var frontmostProcessIdentifier: pid_t?
	private var workspaceObserver: NSObjectProtocol?
	private var permissionTimer: Timer?
	private let queue = DispatchQueue(label: "com.snips.helper.event", qos: .userInteractive)
	private let fillLock = NSLock()
	private var pendingFillRequests: [String: PendingFillRequest] = [:]

	final class PendingFillRequest {
		let semaphore = DispatchSemaphore(value: 0)
		var values: [String: String] = [:]
		var cancelled = false
	}

	func run() {
		startCommandServer(port: 50555)
		// Never prompt automatically; only prompt when explicitly requested by the UI.
		checkAccessibilityPermission(prompt: false)
		checkListenEventAccess(prompt: false)
		checkPostEventAccess(prompt: false)
		refreshSecureInputState()
		updateFrontmostApplication(NSWorkspace.shared.frontmostApplication)
		workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
			forName: NSWorkspace.didActivateApplicationNotification,
			object: nil,
			queue: OperationQueue.main
		) { [weak self] notification in
				let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
				guard let self = self else {
					return
				}
				self.updateFrontmostApplication(application)
				let previousSecureInput = self.secureInputEnabled
				self.refreshSecureInputState()
				if previousSecureInput != self.secureInputEnabled {
					self.sendStatusEvent()
				}
			}
		startEventTap()
		startPermissionMonitoring()
		sendStatusEvent()
		RunLoop.main.run()
	}

	private func checkAccessibilityPermission(prompt: Bool) {
		let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: prompt] as CFDictionary
		accessibilityGranted = AXIsProcessTrustedWithOptions(options)
	}

	private func checkListenEventAccess(prompt: Bool) {
		listenEventAccessGranted = CGPreflightListenEventAccess()
		if prompt && !listenEventAccessGranted {
			_ = CGRequestListenEventAccess()
			listenEventAccessGranted = CGPreflightListenEventAccess()
		}
	}

	private func checkPostEventAccess(prompt: Bool) {
		postEventAccessGranted = CGPreflightPostEventAccess()
		if prompt && !postEventAccessGranted {
			_ = CGRequestPostEventAccess()
			postEventAccessGranted = CGPreflightPostEventAccess()
		}
	}

	private func startPermissionMonitoring() {
		permissionTimer?.invalidate()
		permissionTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
			guard let self = self else {
				return
			}
			let previous = self.accessibilityGranted
			let previousListen = self.listenEventAccessGranted
			let previousPost = self.postEventAccessGranted
			let previousSecureInput = self.secureInputEnabled
			self.checkAccessibilityPermission(prompt: false)
			self.checkListenEventAccess(prompt: false)
			self.checkPostEventAccess(prompt: false)
			self.refreshSecureInputState()
			if self.accessibilityGranted && self.eventTap == nil {
				self.startEventTap()
			}
			if previous != self.accessibilityGranted || previousListen != self.listenEventAccessGranted || previousPost != self.postEventAccessGranted || previousSecureInput != self.secureInputEnabled {
				self.sendStatusEvent()
			}
		}
	}

	private func startCommandServer(port: UInt16) {
		do {
			listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
			listener?.newConnectionHandler = { [weak self] connection in
				self?.handle(connection: connection)
			}
			listener?.start(queue: queue)
		} catch {
			fputs("Failed to start command server: \(error)\n", stderr)
		}
	}

	private func handle(connection: NWConnection) {
		connection.start(queue: queue)
		receiveLine(connection: connection, partial: Data())
	}

	private func receiveLine(connection: NWConnection, partial: Data) {
		connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
			guard let self = self else {
				connection.cancel()
				return
			}
			if let error = error {
				fputs("Connection error: \(error)\n", stderr)
				connection.cancel()
				return
			}
			let chunk = data ?? Data()
			var combined = partial
			if !chunk.isEmpty {
				combined.append(chunk)
			}
			guard !combined.isEmpty else {
				if isComplete {
					connection.cancel()
				}
				return
			}
			if let newlineIndex = combined.firstIndex(of: 0x0A) {
				let lineData = combined.prefix(upTo: newlineIndex)
				let line = String(decoding: lineData, as: UTF8.self)
				let response = self.processCommand(line)
				let out = Data((response + "\n").utf8)
				connection.send(content: out, completion: .contentProcessed { _ in
					connection.cancel()
				})
				return
			}
			if isComplete {
				let line = String(decoding: combined, as: UTF8.self)
				let response = self.processCommand(line)
				let out = Data((response + "\n").utf8)
				connection.send(content: out, completion: .contentProcessed { _ in
					connection.cancel()
				})
				return
			}
			self.receiveLine(connection: connection, partial: combined)
		}
	}

	private func processCommand(_ line: String) -> String {
		guard let data = line.data(using: .utf8) else {
			return jsonResponse(["ok": false, "message": "Invalid UTF-8"])
		}
		do {
			let decoder = JSONDecoder()
			let envelope = try decoder.decode(CommandEnvelope.self, from: data)
			switch envelope.type {
			case "config_update":
				var payloadRaw: [String: Any] = [:]
				for (key, value) in envelope.payload {
					payloadRaw[key] = value.value
				}
				if let payloadData = try? JSONSerialization.data(withJSONObject: payloadRaw),
				   let payload = try? decoder.decode(ConfigPayload.self, from: payloadData) {
					applyConfig(payload)
					return jsonResponse([
						"ok": true,
						"helperExecutable": CommandLine.arguments.first ?? "",
						"accessibilityEnabled": accessibilityGranted,
						"listenEventAccess": listenEventAccessGranted,
						"postEventAccess": postEventAccessGranted,
						"eventTapActive": eventTapActive,
						"secureInput": isSecureInputEnabled()
					])
				}
				return jsonResponse(["ok": false, "message": "Invalid config payload"])
			case "insert_by_id":
				if let snippetIdAny = envelope.payload["snippetId"],
				   let snippetId = snippetIdAny.value as? String,
				   let snippet = snippetById[snippetId] {
					expand(snippet: snippet, typedLength: 0, suppressCurrentKey: false)
					return jsonResponse(["ok": true])
				}
				if let payloadAny = envelope.payload["payload"]?.value as? [String: Any],
				   let snippetId = payloadAny["snippetId"] as? String,
				   let snippet = snippetById[snippetId] {
					expand(snippet: snippet, typedLength: 0, suppressCurrentKey: false)
					return jsonResponse(["ok": true])
				}
				return jsonResponse(["ok": false, "message": "Snippet not found"])
			case "ping":
				return jsonResponse(["ok": true])
			case "request_accessibility":
				checkAccessibilityPermission(prompt: true)
				sendStatusEvent()
				return jsonResponse([
					"ok": true,
					"helperExecutable": CommandLine.arguments.first ?? "",
					"accessibilityEnabled": accessibilityGranted,
					"listenEventAccess": listenEventAccessGranted,
					"postEventAccess": postEventAccessGranted,
					"eventTapActive": eventTapActive,
					"secureInput": isSecureInputEnabled()
				])
			case "request_input_monitoring":
				checkListenEventAccess(prompt: true)
				sendStatusEvent()
				return jsonResponse([
					"ok": true,
					"helperExecutable": CommandLine.arguments.first ?? "",
					"listenEventAccess": listenEventAccessGranted,
					"accessibilityEnabled": accessibilityGranted,
					"postEventAccess": postEventAccessGranted,
					"eventTapActive": eventTapActive,
					"secureInput": isSecureInputEnabled()
				])
			case "fill_response":
				if let requestIdAny = envelope.payload["requestId"],
				   let requestId = requestIdAny.value as? String,
				   let pending = getPendingFill(requestId: requestId) {
					if let valuesAny = envelope.payload["values"]?.value as? [String: Any] {
						var mapped: [String: String] = [:]
						for (key, value) in valuesAny {
							mapped[key] = String(describing: value)
						}
						pending.values = mapped
					}
					if let cancelledAny = envelope.payload["cancelled"]?.value as? Bool {
						pending.cancelled = cancelledAny
					}
					pending.semaphore.signal()
					removePendingFill(requestId: requestId)
					return jsonResponse(["ok": true])
				}
				return jsonResponse(["ok": false, "message": "Unknown requestId"])
			default:
				return jsonResponse(["ok": false, "message": "Unknown command"])
			}
		} catch {
			return jsonResponse(["ok": false, "message": "Bad JSON"])
		}
	}

	private func jsonResponse(_ object: [String: Any]) -> String {
		guard let data = try? JSONSerialization.data(withJSONObject: object),
		      let text = String(data: data, encoding: .utf8) else {
			return "{\"ok\":false,\"message\":\"Response serialization failed\"}"
		}
		return text
	}

	private func applyConfig(_ payload: ConfigPayload) {
		snippets = payload.snippets
		settings = payload.settings
		var map: [Character: [Snippet]] = [:]
		var byId: [String: Snippet] = [:]
		for snippet in snippets {
			byId[snippet.id] = snippet
			if let last = snippet.abbreviation.last {
				map[last, default: []].append(snippet)
			}
		}
		for key in map.keys {
			map[key]?.sort(by: { $0.abbreviation.count > $1.abbreviation.count })
		}
		endingsMap = map
		snippetById = byId
		excludedAppBundleIds = Set(payload.settings.excludedApps)
		if buffer.count > settings.maxBufferLength {
			buffer = String(buffer.suffix(settings.maxBufferLength))
		}
	}

	private func startEventTap() {
		if eventTap != nil {
			return
		}
		let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
		let callback: CGEventTapCallBack = { proxy, type, event, userInfo in
			guard let userInfo = userInfo else {
				return Unmanaged.passUnretained(event)
			}
			let helper = Unmanaged<SnipsHelper>.fromOpaque(userInfo).takeUnretainedValue()
			return helper.handleEvent(proxy: proxy, type: type, event: event)
		}
		eventTap = CGEvent.tapCreate(
			tap: .cgSessionEventTap,
			place: .headInsertEventTap,
			options: .defaultTap,
			eventsOfInterest: mask,
			callback: callback,
			userInfo: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
		)
		guard let tap = eventTap else {
			fputs("Could not create event tap. Accessibility likely denied.\n", stderr)
			eventTapActive = false
			return
		}
		eventTapActive = true
		runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
		CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
		CGEvent.tapEnable(tap: tap, enable: true)
		sendStatusEvent()
	}

	private func handleEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
		if type == .tapDisabledByTimeout {
			if let tap = eventTap {
				CGEvent.tapEnable(tap: tap, enable: true)
			}
			return Unmanaged.passUnretained(event)
		}
		if isInjecting || !settings.enabled || settings.pauseExpansions {
			return Unmanaged.passUnretained(event)
		}
		if secureInputEnabled {
			if "ignore" != settings.secureInputBehavior {
				return Unmanaged.passUnretained(event)
			}
		}
		if isExcludedFrontmostApp() {
			return Unmanaged.passUnretained(event)
		}

		guard let nsEvent = NSEvent(cgEvent: event) else {
			return Unmanaged.passUnretained(event)
		}
		let suppress = handleKey(nsEvent)
		if suppress {
			return nil
		}
		return Unmanaged.passUnretained(event)
	}

	private func handleKey(_ event: NSEvent) -> Bool {
		let keyCode = event.keyCode
		if 51 == keyCode {
			if !buffer.isEmpty {
				buffer.removeLast()
			}
			return false
		}
		if 123 == keyCode || 124 == keyCode || 125 == keyCode || 126 == keyCode {
			buffer = ""
			return false
		}

		let typed = event.characters ?? ""
		if typed.isEmpty {
			return false
		}
		if typed.count > 1 && typed != "\n" && typed != "\t" {
			buffer = ""
			return false
		}

		buffer += typed
		if buffer.count > settings.maxBufferLength {
			buffer = String(buffer.suffix(settings.maxBufferLength))
		}

		let isWhitespaceDelimiter = " " == typed || "\n" == typed || "\t" == typed
		let isPunctuationDelimiter = typed.rangeOfCharacter(from: CharacterSet.punctuationCharacters) != nil
		let isDelimiter = isWhitespaceDelimiter || isPunctuationDelimiter
		let targetBuffer = isDelimiter ? String(buffer.dropLast(typed.count)) : buffer
		let candidates = targetBuffer.last.flatMap { endingsMap[$0] } ?? []

		for snippet in candidates {
			let abbr = snippet.abbreviation
			if targetBuffer.hasSuffix(abbr) {
				if shouldExpand(snippet: snippet, lastTyped: typed, isDelimiter: isDelimiter) {
					let suppressCurrentKey = "immediate" == snippet.triggerMode
					expand(snippet: snippet, typedLength: abbr.count, suppressCurrentKey: suppressCurrentKey)
					buffer = ""
					return suppressCurrentKey
				}
			}
		}
		return false
	}

	private func shouldExpand(snippet: Snippet, lastTyped: String, isDelimiter: Bool) -> Bool {
		switch snippet.triggerMode {
		case "immediate":
			return !isDelimiter
		case "enterTab":
			return "\n" == lastTyped || "\t" == lastTyped
		case "wordBoundary":
			if !isDelimiter {
				return false
			}
			if let prev = buffer.dropLast(snippet.abbreviation.count + 1).last {
				return !prev.isLetter && !prev.isNumber && prev != "_"
			}
			return true
		case "whitespace":
			return " " == lastTyped || "\n" == lastTyped || "\t" == lastTyped
		default:
			if "enterTab" == settings.expandOn {
				return "\n" == lastTyped || "\t" == lastTyped
			}
			if "immediate" == settings.expandOn {
				return !isDelimiter
			}
			return isDelimiter
		}
	}

	private func expand(snippet: Snippet, typedLength: Int, suppressCurrentKey: Bool) {
		isInjecting = true
		defer {
			isInjecting = false
		}
		let frontmostPid = frontmostProcessIdentifier
		let frontmostBundleId = self.frontmostBundleId
		let hasFill = snippet.content.contains("[[fill:")
		let deleteCount = suppressCurrentKey ? max(0, typedLength - 1) : typedLength
		let output: String
		if hasFill {
			let fields = extractFillFields(snippet.content)
			let values = requestFillValues(fields: fields, frontmostBundleId: frontmostBundleId)
			output = renderWithFillValues(content: snippet.content, fillValues: values)
		} else {
			output = render(content: snippet.content, frontmostBundleId: frontmostBundleId)
		}

		refocusFrontmost(pid: frontmostPid, bundleId: frontmostBundleId)
		sendBackspaces(count: deleteCount)
		usleep(90000)
		insertByTyping(output)
		emitExpansionEvent(snippet: snippet, output: output)
	}

	private func renderWithFillValues(content: String, fillValues: [String: String]) -> String {
		var rendered = content
		let datePattern = #"\[\[date:([^\]]+)\]\]"#
		if let regex = try? NSRegularExpression(pattern: datePattern) {
			let matches = regex.matches(in: rendered, range: NSRange(location: 0, length: rendered.utf16.count))
			for match in matches.reversed() {
				if let range = Range(match.range(at: 1), in: rendered), let full = Range(match.range(at: 0), in: rendered) {
					let format = String(rendered[range])
					let replacement = formatDate(format)
					rendered.replaceSubrange(full, with: replacement)
				}
			}
		}

		rendered = rendered.replacingOccurrences(of: "[[clipboard]]", with: NSPasteboard.general.string(forType: .string) ?? "")

		let fillPattern = #"\[\[fill:([^\]|]+)(?:\|([^\]]*))?\]\]"#
		if let regex = try? NSRegularExpression(pattern: fillPattern) {
			let matches = regex.matches(in: rendered, range: NSRange(location: 0, length: rendered.utf16.count))
			for match in matches.reversed() {
				guard let labelRange = Range(match.range(at: 1), in: rendered),
				      let fullRange = Range(match.range(at: 0), in: rendered) else {
					continue
				}
				let label = String(rendered[labelRange]).trimmingCharacters(in: .whitespacesAndNewlines)
				var defaultValue = ""
				if match.range(at: 2).location != NSNotFound, let defaultRange = Range(match.range(at: 2), in: rendered) {
					defaultValue = String(rendered[defaultRange])
				}
				let replacement = fillValues[label] ?? defaultValue
				rendered.replaceSubrange(fullRange, with: replacement)
			}
		}

		rendered = rendered.replacingOccurrences(of: "[[cursor]]", with: "")
		return rendered
	}

	private func render(content: String, frontmostBundleId: String?) -> String {
		var rendered = content

		let datePattern = #"\[\[date:([^\]]+)\]\]"#
		if let regex = try? NSRegularExpression(pattern: datePattern) {
			let matches = regex.matches(in: rendered, range: NSRange(location: 0, length: rendered.utf16.count))
			for match in matches.reversed() {
				if let range = Range(match.range(at: 1), in: rendered), let full = Range(match.range(at: 0), in: rendered) {
					let format = String(rendered[range])
					let replacement = formatDate(format)
					rendered.replaceSubrange(full, with: replacement)
				}
			}
		}

		rendered = rendered.replacingOccurrences(of: "[[clipboard]]", with: NSPasteboard.general.string(forType: .string) ?? "")

		let fields = extractFillFields(rendered)
		if !fields.isEmpty {
			let values = requestFillValues(fields: fields, frontmostBundleId: frontmostBundleId)
			let fillPattern = #"\[\[fill:([^\]|]+)(?:\|([^\]]*))?\]\]"#
			if let regex = try? NSRegularExpression(pattern: fillPattern) {
				let matches = regex.matches(in: rendered, range: NSRange(location: 0, length: rendered.utf16.count))
				for match in matches.reversed() {
					guard let labelRange = Range(match.range(at: 1), in: rendered),
					      let fullRange = Range(match.range(at: 0), in: rendered) else {
						continue
					}
					let label = String(rendered[labelRange]).trimmingCharacters(in: .whitespacesAndNewlines)
					var defaultValue = ""
					if match.range(at: 2).location != NSNotFound, let defaultRange = Range(match.range(at: 2), in: rendered) {
						defaultValue = String(rendered[defaultRange])
					}
					let replacement = values[label] ?? defaultValue
					rendered.replaceSubrange(fullRange, with: replacement)
				}
			}
		}

		rendered = rendered.replacingOccurrences(of: "[[cursor]]", with: "")
		return rendered
	}

	private func extractFillFields(_ template: String) -> [(label: String, defaultValue: String)] {
		let pattern = #"\[\[fill:([^\]|]+)(?:\|([^\]]*))?\]\]"#
		guard let regex = try? NSRegularExpression(pattern: pattern) else {
			return []
		}
		let matches = regex.matches(in: template, range: NSRange(location: 0, length: template.utf16.count))
		var out: [(String, String)] = []
		for match in matches {
			guard let labelRange = Range(match.range(at: 1), in: template) else {
				continue
			}
			let label = String(template[labelRange]).trimmingCharacters(in: .whitespacesAndNewlines)
			var defaultValue = ""
			if match.range(at: 2).location != NSNotFound, let defaultRange = Range(match.range(at: 2), in: template) {
				defaultValue = String(template[defaultRange])
			}
			out.append((label, defaultValue))
		}
		return out
	}

	private func requestFillValues(fields: [(label: String, defaultValue: String)], frontmostBundleId: String?) -> [String: String] {
		if settings.eventCallbackUrl.isEmpty {
			var out: [String: String] = [:]
			for field in fields {
				out[field.label] = field.defaultValue
			}
			return out
		}

		let requestId = UUID().uuidString
		let pending = PendingFillRequest()
		fillLock.lock()
		pendingFillRequests[requestId] = pending
		fillLock.unlock()

		let fieldsPayload = fields.map { ["label": $0.label, "defaultValue": $0.defaultValue] }
		let payload: [String: Any] = [
			"type": "fill_request",
			"payload": [
				"requestId": requestId,
				"fields": fieldsPayload,
				"frontmostBundleId": frontmostBundleId ?? ""
			]
		]
		postEvent(payload)

		_ = pending.semaphore.wait(timeout: .now() + 90)
		if pending.cancelled {
			var out: [String: String] = [:]
			for field in fields {
				out[field.label] = field.defaultValue
			}
			return out
		}
		return pending.values
	}

	private func getPendingFill(requestId: String) -> PendingFillRequest? {
		fillLock.lock()
		defer { fillLock.unlock() }
		return pendingFillRequests[requestId]
	}

	private func removePendingFill(requestId: String) {
		fillLock.lock()
		pendingFillRequests.removeValue(forKey: requestId)
		fillLock.unlock()
	}

	private func refocusFrontmost(pid: pid_t?, bundleId: String?) {
		guard let pid = pid else {
			return
		}
		if let app = NSRunningApplication(processIdentifier: pid) {
			// Typed expansions already have focus. Only wait when restoring it
			// after a palette or fill-in window has activated another app.
			if app.isActive {
				return
			}
			_ = app.activate(options: [.activateIgnoringOtherApps])
			usleep(420000)
			return
		}
		guard let bundleId = bundleId, !bundleId.isEmpty else {
			return
		}
		let script = "tell application id \"\(bundleId.replacingOccurrences(of: "\"", with: "\\\""))\" to activate"
		let process = Process()
		process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
		process.arguments = ["-e", script]
		do {
			try process.run()
			process.waitUntilExit()
			usleep(420000)
		} catch {
			return
		}
	}

	private func formatDate(_ format: String) -> String {
		let formatter = DateFormatter()
		if "iso" == format.lowercased() {
			return ISO8601DateFormatter().string(from: Date())
		}
		if "short" == format.lowercased() {
			formatter.dateStyle = .short
			formatter.timeStyle = .none
			return formatter.string(from: Date())
		}
		formatter.dateFormat = format
		return formatter.string(from: Date())
	}

	private func sendBackspaces(count: Int) {
		guard count > 0 else {
			return
		}
		for _ in 0..<count {
			sendKey(keyCode: 51)
		}
	}

	private func insertByTyping(_ text: String) {
		guard !text.isEmpty else {
			return
		}

		for character in text {
			sendUnicodeCharacter(character)
		}
	}

	private func sendUnicodeCharacter(_ character: Character) {
		let characterString = String(character)
		let unicodeScalars = Array(characterString.utf16)
		guard !unicodeScalars.isEmpty else {
			return
		}
		guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
		      let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
			return
		}

		unicodeScalars.withUnsafeBufferPointer { pointer in
			guard let baseAddress = pointer.baseAddress else {
				return
			}
			down.keyboardSetUnicodeString(stringLength: pointer.count, unicodeString: baseAddress)
			up.keyboardSetUnicodeString(stringLength: pointer.count, unicodeString: baseAddress)
		}

		down.post(tap: .cghidEventTap)
		up.post(tap: .cghidEventTap)
	}

	private func sendKey(keyCode: CGKeyCode) {
		guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
		      let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
			return
		}
		down.post(tap: .cghidEventTap)
		up.post(tap: .cghidEventTap)
	}

	private func isExcludedFrontmostApp() -> Bool {
		guard let bundleId = frontmostBundleId else {
			return false
		}
		return excludedAppBundleIds.contains(bundleId)
	}

	private func isSecureInputEnabled() -> Bool {
		return secureInputEnabled
	}

	private func refreshSecureInputState() {
		secureInputEnabled = IsSecureEventInputEnabled()
	}

	private func updateFrontmostApplication(_ application: NSRunningApplication?) {
		frontmostProcessIdentifier = application?.processIdentifier
		frontmostBundleId = application?.bundleIdentifier
	}

	private func emitExpansionEvent(snippet: Snippet, output: String) {
		let charsInserted = output.count
		let charsSaved = max(0, charsInserted - snippet.abbreviation.count)
		let charsPerMinute = max(1, settings.wpm * settings.charsPerWord)
		let cps = Double(charsPerMinute) / 60.0
		let timeSavedMs = Int((Double(charsSaved) / cps) * 1000.0)
		let eventPayload: [String: Any] = [
			"type": "expansion_event",
			"payload": [
				"id": "event_\(Int(Date().timeIntervalSince1970 * 1000.0))",
				"snippetId": snippet.id,
				"timestamp": Int(Date().timeIntervalSince1970 * 1000.0),
				"charsInserted": charsInserted,
				"charsSaved": charsSaved,
				"timeSavedMs": timeSavedMs,
				"appBundleId": frontmostBundleId ?? ""
			]
		]
		postEvent(eventPayload)
	}

	private func sendStatusEvent() {
		let payload: [String: Any] = [
			"type": "status",
			"payload": [
				"secureInput": isSecureInputEnabled(),
				"accessibilityEnabled": accessibilityGranted,
				"listenEventAccess": listenEventAccessGranted,
				"postEventAccess": postEventAccessGranted,
				"eventTapActive": eventTapActive,
				"helperExecutable": CommandLine.arguments.first ?? ""
			]
		]
		postEvent(payload)
	}

	private func postEvent(_ payload: [String: Any]) {
		guard !settings.eventCallbackUrl.isEmpty,
		      let url = URL(string: settings.eventCallbackUrl),
		      let body = try? JSONSerialization.data(withJSONObject: payload) else {
			return
		}
		var request = URLRequest(url: url)
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = body
		URLSession.shared.dataTask(with: request).resume()
	}
}

let helper = SnipsHelper()
helper.run()
