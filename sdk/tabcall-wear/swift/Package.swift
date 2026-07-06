// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "TabCallWear",
    platforms: [
        .watchOS(.v9),
        .iOS(.v16),
        // macOS listed so `swift build` works on dev machines / CI for a
        // compile check; the SDK itself targets the watch + phone.
        .macOS(.v12),
    ],
    products: [
        .library(name: "TabCallWear", targets: ["TabCallWear"]),
    ],
    targets: [
        .target(name: "TabCallWear", path: "Sources/TabCallWear"),
    ]
)
