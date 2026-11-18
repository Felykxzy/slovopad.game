import UIKit
import WebKit

/// Окно с игрой. Показывает тот же сайт, что и в браузере, поэтому обновления приходят сами.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let background = UIColor(red: 0.043, green: 0.027, blue: 0.125, alpha: 1)
    private let home = URL(string: "https://felykxzy.github.io/slovopad.game/")!
    private var web: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        // Сообщаем игре, что приложение само скажет, когда экран опущен вниз (плашка у острова)
        cfg.userContentController.addUserScript(WKUserScript(source: "window.__reachNative=1;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.isOpaque = false
        w.backgroundColor = Self.background
        w.scrollView.backgroundColor = Self.background
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.scrollView.bounces = false
        w.allowsLinkPreview = false
        if #available(iOS 16.4, *) { w.isInspectable = true }
        web = w
        view = w
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        load()
        checkShell()
    }

    // MARK: - Экран опущен вниз (Reachability)

    private var link: CADisplayLink?
    private var reach: Bool? = nil

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if link == nil {
            let l = CADisplayLink(target: self, selector: #selector(tick))
            l.preferredFramesPerSecond = 15
            l.add(to: .main, forMode: .common)
            link = l
        }
    }

    /// Когда пользователь тянет экран вниз, окно приложения сдвигается. Считаем это и сообщаем игре.
    @objc private func tick() {
        guard let win = view.window else { return }
        let onScreen = view.convert(view.bounds, to: win.screen.coordinateSpace).minY
        let shifted = max(onScreen, win.frame.minY, win.layer.presentation()?.frame.minY ?? 0) > 40
        let portrait = view.bounds.height > view.bounds.width
        let noInset = portrait && view.safeAreaInsets.top < 1
        let on = shifted || noInset
        if reach != on {
            reach = on
            pushReach()
        }
    }

    private func pushReach() {
        let on = (reach ?? false) ? "true" : "false"
        web.evaluateJavaScript("document.documentElement.classList.toggle('reach',\(on));window.dispatchEvent(new Event('reachchg'))", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pushReach()
    }

    /// Версия самой оболочки приложения (не игры: игра обновляется сама). Увеличивай, когда меняешь Swift-код.
    private static let shellVersion = 2

    /// Раз в запуск спрашивает shell.json и, если оболочка устарела, показывает окно «Вышла новая версия приложения».
    private func checkShell() {
        guard let u = URL(string: "https://felykxzy.github.io/slovopad.game/shell.json?t=\(Int(Date().timeIntervalSince1970))") else { return }
        var r = URLRequest(url: u); r.cachePolicy = .reloadIgnoringLocalCacheData; r.timeoutInterval = 10
        URLSession.shared.dataTask(with: r) { [weak self] data, _, _ in
            guard let data = data,
                  let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let v = j["v"] as? Int, v > GameViewController.shellVersion,
                  UserDefaults.standard.integer(forKey: "shellAsked") < v else { return }
            let text = (j["text"] as? String) ?? "Вышла новая версия приложения. Установи её через Sideloadly, прогресс сохранится."
            let link = (j["url"] as? String).flatMap(URL.init(string:))
            DispatchQueue.main.async {
                let a = UIAlertController(title: "Новая версия приложения", message: text, preferredStyle: .alert)
                if let link = link { a.addAction(UIAlertAction(title: "Открыть", style: .default) { _ in UIApplication.shared.open(link) }) }
                a.addAction(UIAlertAction(title: "Позже", style: .cancel))
                UserDefaults.standard.set(v, forKey: "shellAsked")
                self?.present(a, animated: true)
            }
        }.resume()
    }

    private func load() {
        web.load(URLRequest(url: home, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20))
    }

    // MARK: - Камера и микрофон для звонков

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == home.host ? .grant : .deny)
    }

    // MARK: - Ссылки: чужие сайты открываем в Safari

    private func isOurs(_ url: URL?) -> Bool {
        guard let url = url else { return true }
        guard let scheme = url.scheme?.lowercased() else { return true }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return true }
        return url.host == home.host
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if navigationAction.targetFrame?.isMainFrame ?? true, !isOurs(url), let url = url {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // MARK: - Окна alert / confirm / prompt из страницы

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }

    // MARK: - Нет интернета

    private func showOffline() {
        let html = """
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0b0720;color:#e8ecff;font-family:-apple-system,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
        <div style="font-size:22px;font-weight:800;letter-spacing:.12em">СЛОВОПАД</div>
        <div style="opacity:.7">Нет соединения с интернетом</div>
        <button onclick="location.href='\(home.absoluteString)'" style="font:inherit;font-weight:700;letter-spacing:.12em;padding:14px 28px;border-radius:16px;border:1px solid #5ef2ff;background:rgba(94,242,255,.15);color:#eaffff">ПОВТОРИТЬ</button>
        </body>
        """
        web.loadHTMLString(html, baseURL: home)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOffline()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }
}
