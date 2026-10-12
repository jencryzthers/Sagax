import UserNotifications

/// APNs `mutable-content` entry point. The system gives this about 30
/// seconds to download the bot's avatar and attach an `INSendMessageIntent`
/// so the banner names the bot instead of Sagax (docs/ios-push.md).
final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var delivered = false

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttemptContent = content
        Task {
            let updated = await CommunicationNotification.decorate(content)
            finish(updated)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let bestAttemptContent {
            finish(bestAttemptContent)
        }
    }

    private func finish(_ content: UNNotificationContent) {
        lock.lock()
        defer { lock.unlock() }
        guard !delivered, let handler = contentHandler else { return }
        delivered = true
        handler(content)
        contentHandler = nil
        bestAttemptContent = nil
    }
}
