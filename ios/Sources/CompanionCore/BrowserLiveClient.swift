// The wire side of the live browser view (BrowserLive.swift): the stream and
// the frame acknowledgement. Separate from the parser so that one is tested
// without a network.
import Foundation

public extension CompanionClient {
    /// `GET /api/bots/:id/browser/live`, as understood messages. Runs until
    /// the stream ends or the consuming task is cancelled; a 409 or 503 (the
    /// bot's browser is off, or the engine is not installed) throws with the
    /// server's sentence.
    func browserLive(botId: String) throws -> AsyncThrowingStream<BrowserLiveMessage, Error> {
        var request = try makeRequest("GET", "/api/bots/\(botId)/browser/live")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        // a heartbeat comes every few seconds; a quiet gap is not an answer
        request.timeoutInterval = 90
        let session = streamingSession
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await session.bytes(for: request)
                    if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                        var body = Data()
                        for try await byte in bytes {
                            body.append(byte)
                            if body.count > 4096 { break }
                        }
                        try Self.check(response, body)
                    }
                    var parser = SSEParser()
                    var line = [UInt8]()
                    // by hand, for the blank line that ends an event (SSE.swift)
                    for try await byte in bytes {
                        guard byte == 0x0A else {
                            line.append(byte)
                            continue
                        }
                        if line.last == 0x0D { line.removeLast() }
                        let text = String(decoding: line, as: UTF8.self)
                        line.removeAll(keepingCapacity: true)
                        guard let event = parser.line(text),
                              let message = BrowserLiveMessage.parse(event: event.event, data: event.data)
                        else { continue }
                        continuation.yield(message)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// `POST /api/bots/:id/browser/action {viewerId, type: "ack", seq}`:
    /// this viewer has the frame, the next may come.
    func browserAck(botId: String, viewerId: String, seq: Int) async throws {
        let request = try makeRequest("POST", "/api/bots/\(botId)/browser/action",
                                      body: ["viewerId": viewerId, "type": "ack", "seq": seq])
        try await send(request)
    }
}
