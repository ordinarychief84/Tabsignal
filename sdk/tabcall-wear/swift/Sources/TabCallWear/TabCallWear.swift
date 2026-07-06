import Foundation

/// TabCall Wear SDK — Swift client for watchOS (and the paired iPhone app).
///
/// Mirrors the TypeScript core in `sdk/tabcall-wear/typescript` 1:1.
/// Zero dependencies: URLSession + Codable. All calls are async/await.
///
/// Lifecycle:
///   1. The waiter opens /staff/watch on their phone → 6-digit code.
///   2. `pair(code:deviceName:)` exchanges it for a long-lived device
///      token. Persist it in the Keychain via the `onToken` hook.
///   3. Poll `queue()` at the pace the server suggests (`pollAfterMs`);
///      on watchOS, drive polls from your extended runtime session or
///      `TimelineView`, and lean on the paired iPhone's push to wake you.
///   4. `acknowledge(_:)` / `resolve(_:action:)` from the wrist.
///
/// Any 401 (`needsRepair == true`) means the token is dead — revoked
/// from the staff console, staff removed, or re-paired elsewhere. Wipe
/// the stored token and show the pairing screen.
public final class TabCallWear {

    // MARK: - Types

    public enum RequestType: String, Codable, Sendable {
        case drink = "DRINK", bill = "BILL", help = "HELP", refill = "REFILL"
    }

    public enum RequestStatus: String, Codable, Sendable {
        case pending = "PENDING", acknowledged = "ACKNOWLEDGED"
        case resolved = "RESOLVED", escalated = "ESCALATED"
    }

    public enum ResolutionAction: String, Codable, CaseIterable, Sendable {
        case served = "SERVED", comped = "COMPED", refused = "REFUSED"
        case escalated = "ESCALATED", notActionable = "NOT_ACTIONABLE", other = "OTHER"
    }

    public struct QueueItem: Codable, Identifiable, Sendable {
        public let id: String
        public let type: RequestType
        public let status: RequestStatus
        public let table: String
        public let note: String?
        public let idCheck: Bool
        public let ageSeconds: Int
        public let assignedToMe: Bool
        public let mine: Bool
        public let ackedBy: String?
    }

    public struct Queue: Codable, Sendable {
        public struct Staff: Codable, Sendable { public let id: String; public let name: String }
        public let serverTime: String
        public let staff: Staff
        /// Server-suggested delay before the next poll, in milliseconds.
        public let pollAfterMs: Int
        public let requests: [QueueItem]
    }

    public struct PairResult: Codable, Sendable {
        public struct Device: Codable, Sendable { public let id: String; public let name: String; public let platform: String }
        public struct Staff: Codable, Sendable { public let id: String; public let name: String }
        public struct Venue: Codable, Sendable { public let name: String; public let slug: String }
        public let apiVersion: Int
        public let token: String
        public let device: Device
        public let staff: Staff
        public let venue: Venue
    }

    public struct AckResult: Codable, Sendable {
        public let id: String
        public let status: RequestStatus
        public let mine: Bool
        public let ackedBy: String?
        public let alreadyAcked: Bool
    }

    public struct ResolveResult: Codable, Sendable {
        public let id: String
        public let status: RequestStatus
        public let resolutionAction: ResolutionAction?
        public let alreadyResolved: Bool
    }

    public struct WearError: Error, LocalizedError {
        public let status: Int
        public let code: String
        public let detail: String?

        /// Token is dead — wipe it and show the pairing screen.
        public var needsRepair: Bool { status == 401 }
        public var errorDescription: String? { detail ?? "\(code) (HTTP \(status))" }
    }

    // MARK: - State

    private let baseURL: URL
    private let session: URLSession
    private let onToken: ((String) -> Void)?
    private var token: String?
    private static let sdkTag = "swift/1.0.0"

    /// - Parameters:
    ///   - baseURL: e.g. `URL(string: "https://tab-call.com")!`
    ///   - token: previously persisted device token (Keychain), if any.
    ///   - onToken: called after a successful `pair` — persist the token.
    public init(
        baseURL: URL,
        token: String? = nil,
        onToken: ((String) -> Void)? = nil,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.token = token
        self.onToken = onToken
        self.session = session
    }

    public var isPaired: Bool { token != nil }

    /// Forget the local token (server-side revoke lives in the staff console).
    public func unpair() { token = nil }

    // MARK: - API

    public func pair(code: String, deviceName: String = "Apple Watch") async throws -> PairResult {
        struct Body: Codable { let code: String; let name: String; let platform: String }
        let result: PairResult = try await request(
            "POST", "/api/wear/claim",
            body: Body(code: code, name: deviceName, platform: "watchos"),
            authenticated: false
        )
        token = result.token
        onToken?(result.token)
        return result
    }

    public func queue() async throws -> Queue {
        try await request("GET", "/api/wear/queue")
    }

    public func acknowledge(_ requestId: String) async throws -> AckResult {
        try await request("POST", "/api/wear/requests/\(requestId)/ack")
    }

    public func resolve(_ requestId: String, action: ResolutionAction, note: String? = nil) async throws -> ResolveResult {
        struct Body: Codable { let action: String; let note: String? }
        return try await request(
            "POST", "/api/wear/requests/\(requestId)/resolve",
            body: Body(action: action.rawValue, note: note)
        )
    }

    /// watchOS apps usually receive push via the paired iPhone; if your
    /// watch app registers its own FCM/APNs bridge token, store it here.
    public func registerPushToken(_ pushToken: String?) async throws {
        struct Body: Codable { let token: String? }
        struct Ok: Codable { let ok: Bool }
        let _: Ok = try await request("POST", "/api/wear/fcm-token", body: Body(token: pushToken))
    }

    // MARK: - Plumbing

    private func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: (some Encodable)? = Optional<Int>.none,
        authenticated: Bool = true
    ) async throws -> T {
        if authenticated && token == nil {
            throw WearError(status: 401, code: "NOT_PAIRED", detail: "No device token — call pair() first.")
        }
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue(Self.sdkTag, forHTTPHeaderField: "x-tabcall-wear-sdk")
        if authenticated, let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw WearError(status: 0, code: "NETWORK", detail: error.localizedDescription)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw WearError(status: status, code: parsed?.error ?? "HTTP_ERROR", detail: parsed?.detail)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// Wire shape of API error responses ({ error, detail? }).
private struct ErrorBody: Codable {
    let error: String?
    let detail: String?
}
