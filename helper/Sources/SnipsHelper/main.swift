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
	let revision: Int
}

struct CommandEnvelope: Codable {
	let protocolVersion: Int
	let requestId: String
	let token: String
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
    private var activeConnections=Set<ObjectIdentifier>()
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
    private var destinationPid:pid_t?
    private var destinationBundleId:String?
	private var workspaceObserver: NSObjectProtocol?
	private var permissionTimer: Timer?
	private let queue = DispatchQueue.main
    private let executionQueue = DispatchQueue(label: "com.snips.helper.expansion", qos: .userInteractive)
    private let injectionMarker: Int64 = 0x534E495053
    private var injectionPid:pid_t?
    private var deferredKeys: [CGEvent] = []
    private var expansionPending = false
    private var configRevision = 0
    private let token: String = {
        let path = ProcessInfo.processInfo.environment["SNIPS_TOKEN_PATH"] ?? NSHomeDirectory() + "/Library/Application Support/Snips/helper-token"
        guard let attrs = try? FileManager.default.attributesOfItem(atPath:path),
              (attrs[.posixPermissions] as? NSNumber)?.intValue == 384,
              (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              attrs[.type] as? FileAttributeType == .typeRegular,
              let value=try? String(contentsOfFile:path,encoding:.utf8),value.count==64 else { return "" }
        return value
    }()
	private var pendingFillRequests: [String: PendingFillRequest] = [:]

    final class PendingFillRequest {
        let complete: ([String:String]?) -> Void
        init(_ complete: @escaping ([String:String]?) -> Void) { self.complete=complete }
    }

    func benchmark() {
        func median(_ block:()->Void)->Double {
            var times:[Double]=[]
            for _ in 0..<9 {let start=DispatchTime.now().uptimeNanoseconds;block();times.append(Double(DispatchTime.now().uptimeNanoseconds-start)/1_000_000)}
            return times.sorted()[4]
        }
        for count in [100,1000,10000,50000] {
            let generated=(0..<count).map{Snippet(id:"b\($0)",abbreviation:";b\($0)",content:"synthetic text",triggerMode:"immediate",caseMode:"exact")}
            let full=median{self.applyConfig(ConfigPayload(snippets:generated,settings:self.settings,revision:1))}
            let target=";b\(count-1)"
            let matching=median{for _ in 0..<100 {let candidates=self.endingsMap[target.last!] ?? [];precondition(candidates.contains{target.hasSuffix($0.abbreviation)})}}/100
            let configSettings=HelperSettings(enabled:true,expandOn:"whitespace",maxBufferLength:200,excludedApps:[],secureInputBehavior:"disable",pauseExpansions:false,eventCallbackUrl:"http://127.0.0.1:50556/helper-event",wpm:220,charsPerWord:6)
            let settingsObject=try! JSONSerialization.jsonObject(with:JSONEncoder().encode(configSettings))
            let update=try! JSONSerialization.jsonObject(with:JSONEncoder().encode(generated[0]))
            let patch=median{
                let request:[String:Any]=["protocolVersion":1,"requestId":"bench","token":self.token,"type":"config_patch","payload":["baseRevision":self.configRevision,"revision":self.configRevision+1,"upserts":[update],"deletes":[],"settings":settingsObject]]
                let data=try! JSONSerialization.data(withJSONObject:request)
                precondition(self.processCommand(String(decoding:data,as:UTF8.self)).contains("true"))
            }
            print("helper n=\(count) fullApplyMs=\(full) matchMs=\(matching) patchMs=\(patch)")
        }
        let generation=median{
            for character in String(repeating:"synthetic 👋",count:100) {
                let units=Array(String(character).utf16)
                let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:true)!
                units.withUnsafeBufferPointer{event.keyboardSetUnicodeString(stringLength:$0.count,unicodeString:$0.baseAddress!)}
            }
        }
        print("Unicode event generation 1100 graphemes (no posting): \(generation) ms")
    }

    func selfTest() {
        func command(_ type:String,_ payload:[String:Any]=[:],version:Int=1,secret:String?=nil)->[String:Any] {
            let data=try! JSONSerialization.data(withJSONObject:["protocolVersion":version,"requestId":"test","token":secret ?? token,"type":type,"payload":payload])
            return try! JSONSerialization.jsonObject(with:Data(processCommand(String(decoding:data,as:UTF8.self)).utf8)) as! [String:Any]
        }
        precondition(command("ping",secret:"wrong")["ok"] as? Bool == false)
        precondition(command("ping",version:2)["ok"] as? Bool == false)
        precondition(command("ping")["ok"] as? Bool == true)
        precondition(command("unknown")["ok"] as? Bool == false)
        precondition(command("config_patch",["baseRevision":99])["ok"] as? Bool == false)
        precondition(processCommand("{").contains("Bad JSON"))
        let sample=Snippet(id:"one",abbreviation:";x",content:"Hello",triggerMode:"immediate",caseMode:"exact")
        let config=ConfigPayload(snippets:[sample],settings:HelperSettings(enabled:true,expandOn:"whitespace",maxBufferLength:200,excludedApps:[],secureInputBehavior:"disable",pauseExpansions:false,eventCallbackUrl:"http://127.0.0.1:50556/helper-event",wpm:220,charsPerWord:6),revision:1)
        precondition(validConfig(config));applyConfig(config)
        precondition(snippetById["one"]?.content=="Hello")
        precondition(shouldExpand(snippet:sample,lastTyped:"x",isDelimiter:false))
        for (mode,delimiter) in [("whitespace"," "),("enterTab","\t"),("wordBoundary",".")] {
            buffer=";x"+delimiter
            precondition(shouldExpand(snippet:Snippet(id:"t",abbreviation:";x",content:"t",triggerMode:mode,caseMode:"exact"),lastTyped:delimiter,isDelimiter:true))
        }
        let plan=outputPlan("Hello \u{E000}👋🏽é",delimiter:" ")
        precondition(plan.text=="Hello 👋🏽é " && plan.leftMoves==3)
        precondition(outputPlan("plain",delimiter:"").leftMoves==0)
        precondition(renderWithFillValues(content:"[[fill:Name]][[cursor]]",fillValues:["Name":"[[cursor]]"],cursorMarker:"POSITION")=="[[cursor]]POSITION")
        var completed=0
        pendingFillRequests["f"]=PendingFillRequest{values in precondition(values?["Name"]=="Alice");completed+=1}
        precondition(command("fill_response",["requestId":"f","values":["Name":"Alice"],"cancelled":false])["ok"] as? Bool == true)
        precondition(completed==1 && pendingFillRequests.isEmpty)
        precondition(command("fill_response",["requestId":"f","values":[:],"cancelled":true])["ok"] as? Bool == false)
        pendingFillRequests["cancel"]=PendingFillRequest{values in precondition(values==nil);completed+=1}
        _=command("fill_response",["requestId":"cancel","values":[:],"cancelled":true])
        precondition(completed==2 && pendingFillRequests.isEmpty)
        pendingFillRequests["invalid"]=PendingFillRequest{_ in preconditionFailure("Malformed fill completed")}
        precondition(command("fill_response",["requestId":"invalid","values":["x":5],"cancelled":false])["ok"] as? Bool == false)
        pendingFillRequests.removeAll()
        // Timeout path uses the production cleanup, without posting to the user's app.
        settings=HelperSettings(enabled:true,expandOn:"whitespace",maxBufferLength:200,excludedApps:[],secureInputBehavior:"disable",pauseExpansions:false,eventCallbackUrl:"invalid:",wpm:220,charsPerWord:6)
        requestFillValues(fields:[],frontmostBundleId:nil,timeout:0.01){values in
            precondition(values==nil && self.pendingFillRequests.isEmpty)
            print("PASS helper authentication, protocol, full config, stale revision, trigger modes, Unicode cursor, fill completion/cancel/duplicate/malformed/timeout")
            exit(0)
        }
        DispatchQueue.main.asyncAfter(deadline:.now()+2){exit(1)}
        dispatchMain()
    }

    func serveTest() {
        guard !token.isEmpty else {exit(1)}
        startCommandServer(port:0)
        listener?.stateUpdateHandler={ [weak self] state in
            if case .ready=state {print("TEST_PORT=\(self?.listener?.port?.rawValue ?? 0)");fflush(stdout)}
        }
        RunLoop.main.run()
    }
	func run() {
		guard !token.isEmpty else { fputs("Missing private helper token; start Snips first.\n",stderr); return }
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
			let parameters=NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1",port:NWEndpoint.Port(rawValue:port)!)
            listener = try NWListener(using: parameters)
			listener?.newConnectionHandler = { [weak self] connection in
				self?.handle(connection: connection)
			}
			listener?.start(queue: queue)
		} catch {
			fputs("Failed to start command server: \(error)\n", stderr)
		}
	}

	private func handle(connection: NWConnection) {
        guard activeConnections.count<8 else {connection.cancel();return}
        let id=ObjectIdentifier(connection);activeConnections.insert(id)
        connection.stateUpdateHandler={ [weak self] state in if case .cancelled=state {self?.activeConnections.remove(id)} }
		connection.start(queue: queue)
        queue.asyncAfter(deadline:.now()+5) {connection.cancel()}
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
			guard combined.count <= 16_777_216 else {connection.cancel();return}
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
            guard envelope.protocolVersion==1 else {return jsonResponse(["ok":false,"message":"PROTOCOL_MISMATCH"])}
            guard envelope.token.utf8.count==token.utf8.count,
                zip(envelope.token.utf8,token.utf8).reduce(UInt8(0), { $0 | ($1.0 ^ $1.1) })==0 else {return jsonResponse(["ok":false,"message":"UNAUTHORIZED"])}
			switch envelope.type {
			case "config_update":
				var payloadRaw: [String: Any] = [:]
				for (key, value) in envelope.payload {
					payloadRaw[key] = value.value
				}
				if let payloadData = try? JSONSerialization.data(withJSONObject: payloadRaw),
				   let payload = try? decoder.decode(ConfigPayload.self, from: payloadData) {
					guard validConfig(payload) else {return jsonResponse(["ok":false,"message":"INVALID_CONFIG"])}
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
            case "config_patch":
                guard envelope.payload["baseRevision"]?.value as? Int == configRevision,
                      let revision=envelope.payload["revision"]?.value as? Int, revision==configRevision+1,
                      let upserts=envelope.payload["upserts"]?.value as? [[String:Any]],
                      let deletes=envelope.payload["deletes"]?.value as? [String],
                      let settingsRaw=envelope.payload["settings"]?.value as? [String:Any],
                      let settingsData=try? JSONSerialization.data(withJSONObject:settingsRaw),
                      let nextSettings=try? decoder.decode(HelperSettings.self,from:settingsData),
                      let upsertData=try? JSONSerialization.data(withJSONObject:upserts),
                      let updates=try? decoder.decode([Snippet].self,from:upsertData) else {return jsonResponse(["ok":false,"message":"RESYNC_REQUIRED"])}
                let config=ConfigPayload(snippets:updates,settings:nextSettings,revision:revision)
                guard validConfig(config),snippetById.count+updates.filter({snippetById[$0.id]==nil}).count-deletes.filter({snippetById[$0] != nil}).count<=50000 else {return jsonResponse(["ok":false,"message":"INVALID_CONFIG"])}
                for id in Set(deletes+updates.map{$0.id}) {
                    if let old=snippetById[id],let key=old.abbreviation.last {endingsMap[key]?.removeAll{$0.id==id}}
                    snippetById.removeValue(forKey:id)
                }
                for snippet in updates {
                    snippetById[snippet.id]=snippet
                    if let key=snippet.abbreviation.last {endingsMap[key,default:[]].append(snippet);endingsMap[key]?.sort{ $0.abbreviation.count == $1.abbreviation.count ? $0.id < $1.id : $0.abbreviation.count > $1.abbreviation.count }}
                }
                settings=nextSettings;configRevision=revision;excludedAppBundleIds=Set(nextSettings.excludedApps)
                return jsonResponse(["ok":true])
			case "insert_by_id":
				if let snippetIdAny = envelope.payload["snippetId"],
				   let snippetId = snippetIdAny.value as? String,
				   let snippet = snippetById[snippetId] {
					scheduleExpansion(snippet: snippet, typedLength: 0, delimiter: "")
					return jsonResponse(["ok": true])
				}
				if let payloadAny = envelope.payload["payload"]?.value as? [String: Any],
				   let snippetId = payloadAny["snippetId"] as? String,
				   let snippet = snippetById[snippetId] {
					scheduleExpansion(snippet: snippet, typedLength: 0, delimiter: "")
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
                guard let requestId=envelope.payload["requestId"]?.value as? String,
                      let cancelled=envelope.payload["cancelled"]?.value as? Bool,
                      let raw=envelope.payload["values"]?.value as? [String:Any],raw.count<=50,
                      raw.allSatisfy({$0.key.count<=256 && ($0.value as? String)?.count ?? 10001 <= 10000}),
                      let pending=pendingFillRequests.removeValue(forKey:requestId) else {return jsonResponse(["ok":false,"message":"INVALID_FILL_RESPONSE"])}
                pending.complete(cancelled ? nil : raw.mapValues{$0 as! String})
                return jsonResponse(["ok":true])
			default:
				return jsonResponse(["ok": false, "message": "Unknown command"])
			}
		} catch {
			return jsonResponse(["ok": false, "message": "Bad JSON"])
		}
	}

	private func jsonResponse(_ object: [String: Any]) -> String {
		guard let data = try? JSONSerialization.data(withJSONObject: object.merging(["protocolVersion":1,"helperVersion":"0.5.0"]){_,new in new}),
		      let text = String(data: data, encoding: .utf8) else {
			return "{\"ok\":false,\"message\":\"Response serialization failed\"}"
		}
		return text
	}

    private func validConfig(_ payload: ConfigPayload) -> Bool {
        let settings=payload.settings
        return payload.revision>0 && payload.snippets.count<=50000 && settings.maxBufferLength>=1 && settings.maxBufferLength<=2000 && settings.wpm>=1 && settings.wpm<=1000 && settings.charsPerWord>=1 && settings.charsPerWord<=20 && settings.secureInputBehavior=="disable" && settings.eventCallbackUrl=="http://127.0.0.1:50556/helper-event" && payload.snippets.allSatisfy { !$0.abbreviation.isEmpty && $0.abbreviation.count<=200 && $0.content.utf8.count<=1_048_576 && $0.caseMode=="exact" && ["immediate","whitespace","enterTab","wordBoundary"].contains($0.triggerMode) }
    }

	private func applyConfig(_ payload: ConfigPayload) {
		configRevision=payload.revision
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
		let mask = CGEventMask((1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue))
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
		if event.getIntegerValueField(.eventSourceUserData)==injectionMarker {return Unmanaged.passUnretained(event)}
        if isInjecting {
            // Bounded input ordering during the short injection stage. Fill UI never uses this gate.
            if deferredKeys.count<256, let copy=event.copy() {deferredKeys.append(copy);return nil}
            return Unmanaged.passUnretained(event)
        }
        if type != .keyDown {return Unmanaged.passUnretained(event)}
        if expansionPending {
            if frontmostBundleId != "com.snips.app" && frontmostBundleId != "com.github.Electron" {
                let pending=Array(pendingFillRequests.values);pendingFillRequests.removeAll()
                for request in pending {request.complete(nil)}
            }
            return Unmanaged.passUnretained(event)
        }
        if !settings.enabled || settings.pauseExpansions {
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
		if !event.modifierFlags.intersection([.command,.control,.option]).isEmpty {buffer="";return false}
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
		let candidates = (buffer.last.flatMap { endingsMap[$0] } ?? []) + (targetBuffer.last.flatMap { endingsMap[$0] } ?? [])

		for snippet in candidates {
			let abbr = snippet.abbreviation
			if (snippet.triggerMode=="immediate" ? buffer : targetBuffer).hasSuffix(abbr) {
				if shouldExpand(snippet: snippet, lastTyped: typed, isDelimiter: isDelimiter) {
					scheduleExpansion(snippet: snippet, typedLength: abbr.count, delimiter: snippet.triggerMode=="immediate" ? "" : typed)
					buffer = ""
					return false
				}
			}
		}
		return false
	}

	private func shouldExpand(snippet: Snippet, lastTyped: String, isDelimiter: Bool) -> Bool {
		switch snippet.triggerMode {
		case "immediate":
			return true
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

    private func scheduleExpansion(snippet: Snippet, typedLength: Int, delimiter: String) {
        guard !expansionPending && !isInjecting else {return}
        expansionPending=true;isInjecting=true
        queue.async { self.prepareExpansion(snippet:snippet,typedLength:typedLength,delimiter:delimiter) }
    }
    private func prepareExpansion(snippet: Snippet, typedLength: Int, delimiter: String) {
        buffer=""
        let pid=destinationPid, bundleId=destinationBundleId
        let complete: ([String:String]?) -> Void = { [weak self] values in
            guard let self=self else {return}
            self.expansionPending=false
            guard let values=values else {
                self.isInjecting=false
                let keys=self.deferredKeys;self.deferredKeys.removeAll()
                for event in keys {event.setIntegerValueField(.eventSourceUserData,value:self.injectionMarker);event.post(tap:.cghidEventTap)}
                return
            } // Cancellation leaves the original abbreviation intact.
            let cursorMarker=UUID().uuidString
            let rendered=self.renderWithFillValues(content:snippet.content,fillValues:values,cursorMarker:cursorMarker)
            let plan=self.outputPlan(rendered,delimiter:delimiter,cursorMarker:cursorMarker)
            let output=plan.text
            let cursorMoves=plan.leftMoves
            let wpm=self.settings.wpm, charsPerWord=self.settings.charsPerWord
            self.isInjecting=true
            self.executionQueue.async {
                // Never type into an unrelated destination after an application switch.
                let active=NSWorkspace.shared.frontmostApplication
                let isSnips=["com.snips.app","com.github.Electron"].contains(active?.bundleIdentifier ?? "")
                var delivered=false
                if active?.processIdentifier==pid || isSnips {
                    self.refocusFrontmost(pid:pid,bundleId:bundleId)
                    if NSWorkspace.shared.frontmostApplication?.processIdentifier==pid {
                        self.injectionPid=pid
                        self.sendBackspaces(count:typedLength+delimiter.count)
                        if typedLength>0 {usleep(90000)}
                        self.insertByTyping(output)
                        for _ in 0..<cursorMoves {self.sendKey(keyCode:123)}
                        delivered=true
                    }
                }
                let success=delivered
                DispatchQueue.main.async {
                    self.isInjecting=false
                    let keys=self.deferredKeys;self.deferredKeys.removeAll()
                    for event in keys {event.setIntegerValueField(.eventSourceUserData,value:self.injectionMarker);event.post(tap:.cghidEventTap)}
                    if success {self.emitExpansionEvent(snippet:snippet,output:output,wpm:wpm,charsPerWord:charsPerWord,bundleId:bundleId)}
                }
            }
        }
        let fields=extractFillFields(snippet.content)
        if fields.isEmpty {complete([:])}
        else {
            isInjecting=false
            if !deferredKeys.isEmpty {complete(nil);return}
            requestFillValues(fields:fields,frontmostBundleId:bundleId,complete:complete)
        }
    }

    private func outputPlan(_ rendered:String, delimiter:String,cursorMarker:String="\u{E000}") -> (text:String,leftMoves:Int) {
        let pieces=rendered.components(separatedBy:cursorMarker)
        return (pieces.joined()+delimiter,pieces.count>1 ? pieces.dropFirst().joined().count+delimiter.count : 0)
    }

    private func renderWithFillValues(content: String, fillValues: [String:String],cursorMarker:String) -> String {
        // Match original template tokens once; inserted clipboard/fill text stays literal.
        let pattern = #"\[\[(date:([^\]]+)|clipboard|fill:([^\]|]+)(?:\|([^\]]*))?|cursor)\]\]"#
        guard let regex=try? NSRegularExpression(pattern:pattern) else {return content}
        var rendered=content
        for match in regex.matches(in:content,range:NSRange(content.startIndex...,in:content)).reversed() {
            guard let full=Range(match.range,in:rendered),let tokenRange=Range(match.range(at:1),in:content) else {continue}
            let token=String(content[tokenRange]);let replacement:String
            if token=="cursor" {replacement=cursorMarker}
            else if token=="clipboard" {replacement=NSPasteboard.general.string(forType:.string) ?? ""}
            else if token.hasPrefix("date:"),let range=Range(match.range(at:2),in:content) {replacement=formatDate(String(content[range]))}
            else if let range=Range(match.range(at:3),in:content) {
                let label=String(content[range]).trimmingCharacters(in:.whitespacesAndNewlines)
                let fallback=Range(match.range(at:4),in:content).map{String(content[$0])} ?? ""
                replacement=fillValues[label] ?? fallback
            } else {replacement=token}
            rendered.replaceSubrange(full,with:replacement)
        }
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

    private func requestFillValues(fields: [(label:String,defaultValue:String)], frontmostBundleId:String?, timeout:Double=90, complete:@escaping ([String:String]?) -> Void) {
        guard !settings.eventCallbackUrl.isEmpty,fields.count<=50 else {complete(nil);return}
        let id=UUID().uuidString
        pendingFillRequests[id]=PendingFillRequest(complete)
        postEvent(["type":"fill_request","payload":["requestId":id,"fields":fields.map{["label":$0.label,"defaultValue":$0.defaultValue]},"frontmostBundleId":frontmostBundleId ?? ""]])
        queue.asyncAfter(deadline:.now()+timeout) { [weak self] in
            self?.pendingFillRequests.removeValue(forKey:id)?.complete(nil)
        }
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

		down.setIntegerValueField(.eventSourceUserData,value:injectionMarker)
		up.setIntegerValueField(.eventSourceUserData,value:injectionMarker)
		if let pid=injectionPid {down.postToPid(pid);up.postToPid(pid)}
	}

	private func sendKey(keyCode: CGKeyCode) {
		guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
		      let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
			return
		}
		down.setIntegerValueField(.eventSourceUserData,value:injectionMarker)
		up.setIntegerValueField(.eventSourceUserData,value:injectionMarker)
		if let pid=injectionPid {down.postToPid(pid);up.postToPid(pid)}
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
        if !["com.snips.app","com.github.Electron"].contains(application?.bundleIdentifier ?? "") {
            if destinationPid != application?.processIdentifier {buffer=""}
            destinationPid=application?.processIdentifier;destinationBundleId=application?.bundleIdentifier
        }
		frontmostBundleId = application?.bundleIdentifier
	}

	private func emitExpansionEvent(snippet: Snippet, output: String, wpm:Int, charsPerWord:Int, bundleId:String?) {
		let charsInserted = output.count
		let charsSaved = max(0, charsInserted - snippet.abbreviation.count)
		let charsPerMinute = max(1, wpm * charsPerWord)
		let cps = Double(charsPerMinute) / 60.0
		let timeSavedMs = Int((Double(charsSaved) / cps) * 1000.0)
		let eventPayload: [String: Any] = [
			"type": "expansion_event",
			"payload": [
				"id": UUID().uuidString,
				"snippetId": snippet.id,
				"timestamp": Int(Date().timeIntervalSince1970 * 1000.0),
				"charsInserted": charsInserted,
				"charsSaved": charsSaved,
				"timeSavedMs": timeSavedMs,
				"appBundleId": bundleId ?? ""
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
		      let body = try? JSONSerialization.data(withJSONObject: payload.merging(["protocolVersion":1,"requestId":UUID().uuidString]){_,new in new}) else {
			return
		}
		var request = URLRequest(url: url)
		request.httpMethod = "POST"
        request.timeoutInterval=5
        request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = body
		URLSession.shared.dataTask(with: request).resume()
	}
}

let helper=SnipsHelper()
if CommandLine.arguments.contains("--version") {print("{\"version\":\"0.5.0\",\"protocolVersion\":1}")}
else if CommandLine.arguments.contains("--ipc-test-server") {helper.serveTest()}
else if CommandLine.arguments.contains("--benchmark") {helper.benchmark()}
else if CommandLine.arguments.contains("--self-test") {helper.selfTest()}
else {helper.run()}
