// Browser mode of the Computer tab: the live browser stream's messages, the
// view folded from them, and the SSE event name the stream relies on.
import XCTest
@testable import CompanionCore

final class BrowserLiveTests: XCTestCase {
    func testParsesTheViewerProtocol() {
        XCTAssertEqual(BrowserLiveMessage.parse(event: "ready", data: #"{"viewerId":"v1"}"#), .ready(viewerId: "v1"))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "waiting", data: #"{"reason":"busy"}"#), .waiting(reason: "busy"))
        let png = Data([0x89, 0x50, 0x4E, 0x47]).base64EncodedString()
        XCTAssertEqual(BrowserLiveMessage.parse(event: "frame", data: #"{"seq":7,"data":"\#(png)","format":"png","metadata":{"deviceWidth":1440,"deviceHeight":900}}"#),
                       .frame(seq: 7, image: Data([0x89, 0x50, 0x4E, 0x47]), width: 1440, height: 900))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "url", data: #"{"url":"https://example.test/a"}"#), .url("https://example.test/a"))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "tabs", data: #"{"tabs":[{"tabId":"t1","title":"A","url":"https://a.test/","active":false},{"tabId":"t2","title":"B","url":"https://b.test/","active":true}]}"#),
                       .tabs([BrowserLiveTab(tabId: "t1", title: "A", url: "https://a.test/", active: false), BrowserLiveTab(tabId: "t2", title: "B", url: "https://b.test/", active: true)]))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "status", data: #"{"connected":true,"screencasting":true}"#), .status(connected: true))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "error", data: #"{"retryable":false,"message":"Gone"}"#), .error(message: "Gone", retryable: false))
        XCTAssertEqual(BrowserLiveMessage.parse(event: "heartbeat", data: "{}"), .heartbeat)
        // what this build does not read is skipped, never a crash
        XCTAssertNil(BrowserLiveMessage.parse(event: "control", data: #"{"held":true}"#))
        XCTAssertNil(BrowserLiveMessage.parse(event: "frame", data: #"{"seq":0,"data":"x"}"#))
        XCTAssertNil(BrowserLiveMessage.parse(event: nil, data: "{}"))
        XCTAssertNil(BrowserLiveMessage.parse(event: "ready", data: "not json"))
    }

    func testTheViewFoldsTheStreamAndAcknowledgesEachFrame() {
        var state = BrowserLiveState()
        XCTAssertNil(state.apply(.ready(viewerId: "v1")))
        XCTAssertEqual(state.viewerId, "v1")
        XCTAssertNil(state.apply(.waiting(reason: "busy")))
        XCTAssertTrue(state.waiting)
        XCTAssertEqual(state.apply(.frame(seq: 3, image: Data([1]), width: 800, height: 600)), 3)
        XCTAssertFalse(state.waiting)
        XCTAssertEqual(state.size, BrowserPageSize(width: 800, height: 600))
        _ = state.apply(.tabs([BrowserLiveTab(tabId: "t1", title: "Docs", url: "https://docs.test/", active: true)]))
        XCTAssertEqual(state.title, "Docs")
        XCTAssertEqual(state.url, "https://docs.test/")
        _ = state.apply(.error(message: "Gone", retryable: true))
        XCTAssertEqual(state.error, "Gone")
    }

    func testTheParserKeepsTheEventName() {
        var parser = SSEParser()
        XCTAssertNil(parser.line("event: ready"))
        XCTAssertNil(parser.line(#"data: {"viewerId":"v1"}"#))
        let event = parser.line("")
        XCTAssertEqual(event?.event, "ready")
        XCTAssertEqual(BrowserLiveMessage.parse(event: event?.event, data: event?.data ?? ""), .ready(viewerId: "v1"))
    }
}
