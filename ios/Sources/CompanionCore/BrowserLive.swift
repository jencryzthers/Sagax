// The bot's live browser, watched from the phone (browser mode of the
// Computer tab; the desktop's LiveBrowser, src/components/BrowserPanel.tsx).
// The stream is `GET /api/bots/:id/browser/live` (server/browser-live.ts):
// `event: <type>` lines with a JSON body. Each frame is acknowledged with
// `POST /api/bots/:id/browser/action {viewerId, type: "ack", seq}`, which is
// what lets the next one come. The phone only watches: it never takes the
// browser from the bot (no input, no navigation).
import Foundation

/// One tab of the bot's browser, as the stream lists it.
public struct BrowserLiveTab: Equatable, Sendable {
    public var tabId: String
    public var title: String
    public var url: String
    public var active: Bool
}

/// What the live browser stream says, already understood.
public enum BrowserLiveMessage: Equatable, Sendable {
    /// The view is open; `viewerId` names this viewer in its actions.
    case ready(viewerId: String)
    /// The browser is busy with the bot's own command, or starting.
    case waiting(reason: String?)
    /// A JPEG or PNG frame of the page, and the page's size in pixels.
    case frame(seq: Int, image: Data, width: Int, height: Int)
    case url(String)
    case tabs([BrowserLiveTab])
    case status(connected: Bool)
    case error(message: String, retryable: Bool)
    case heartbeat

    /// One SSE event of the stream, or nil for anything this build does not
    /// read (control, a malformed body).
    public static func parse(event: String?, data: String) -> BrowserLiveMessage? {
        guard let event,
              let raw = data.data(using: .utf8),
              let body = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any]
        else { return nil }
        switch event {
        case "ready":
            guard let viewer = body["viewerId"] as? String, !viewer.isEmpty else { return nil }
            return .ready(viewerId: viewer)
        case "waiting":
            return .waiting(reason: body["reason"] as? String)
        case "frame":
            guard let seq = (body["seq"] as? NSNumber)?.intValue, seq > 0,
                  let text = body["data"] as? String,
                  let image = Data(base64Encoded: text), !image.isEmpty
            else { return nil }
            let meta = body["metadata"] as? [String: Any]
            let width = (meta?["deviceWidth"] as? NSNumber)?.intValue ?? 1280
            let height = (meta?["deviceHeight"] as? NSNumber)?.intValue ?? 720
            return .frame(seq: seq, image: image, width: width, height: height)
        case "url":
            return .url(body["url"] as? String ?? "")
        case "tabs":
            let tabs = (body["tabs"] as? [[String: Any]] ?? []).compactMap { tab -> BrowserLiveTab? in
                guard let id = tab["tabId"] as? String else { return nil }
                return BrowserLiveTab(tabId: id, title: tab["title"] as? String ?? "", url: tab["url"] as? String ?? "",
                                      active: tab["active"] as? Bool ?? false)
            }
            return .tabs(tabs)
        case "status":
            guard let connected = body["connected"] as? Bool else { return nil }
            return .status(connected: connected)
        case "error":
            return .error(message: body["message"] as? String ?? "The browser stream was interrupted.",
                          retryable: body["retryable"] as? Bool ?? true)
        case "heartbeat":
            return .heartbeat
        default:
            return nil
        }
    }
}

/// What the browser view shows, folded from the stream.
public struct BrowserLiveState: Equatable, Sendable {
    public var viewerId: String?
    public var image: Data?
    public var size = BrowserPageSize(width: 1280, height: 720)
    public var url = ""
    public var title = ""
    public var waiting = false
    public var error: String?

    public init() {}

    /// The latest frame's number, for its acknowledgement.
    public private(set) var lastSeq: Int?

    /// Applies one message; returns the frame number to acknowledge, if any.
    public mutating func apply(_ message: BrowserLiveMessage) -> Int? {
        switch message {
        case let .ready(viewer):
            viewerId = viewer
            waiting = false
            error = nil
        case .waiting:
            waiting = true
        case let .frame(seq, data, width, height):
            image = data
            size = BrowserPageSize(width: width, height: height)
            waiting = false
            error = nil
            lastSeq = seq
            return seq
        case let .url(value):
            url = value
        case let .tabs(tabs):
            if let active = tabs.first(where: \.active) ?? tabs.first {
                title = active.title
                if !active.url.isEmpty { url = active.url }
            }
        case .status, .heartbeat:
            break
        case let .error(message, _):
            error = message
        }
        return nil
    }
}

/// The page's size in pixels (the core builds without CoreGraphics).
public struct BrowserPageSize: Equatable, Sendable {
    public var width: Int
    public var height: Int
}
