// swift-tools-version: 5.10
import PackageDescription

let package = Package(
	name: "SnipsHelper",
	platforms: [
		.macOS(.v13)
	],
	products: [
		.executable(name: "SnipsHelper", targets: ["SnipsHelper"])
	],
	targets: [
		.executableTarget(
			name: "SnipsHelper",
			path: "Sources/SnipsHelper"
		)
	]
)
