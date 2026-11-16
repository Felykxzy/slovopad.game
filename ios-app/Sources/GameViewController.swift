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
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()
        if CommandLine.arguments.contains("-shot") {
            let js = "try{localStorage.setItem('tutDone','1');localStorage.setItem('cfg',JSON.stringify({gls:1}))}catch(e){}"
            cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
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
        buildDock()
        timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.syncDock() }
    }

    // MARK: - Настоящее жидкое стекло (iOS 26): родная панель поверх игры

    private var dock: UIVisualEffectView!
    private var timer: Timer?
    private let items: [(icon: String, id: String, title: String)] = [
        ("play.fill", "tp", "Играть"),
        ("dot.radiowaves.left.and.right", "echoB", "Эхо"),
        ("bag.fill", "shopB", "Магазин"),
        ("slider.horizontal.3", "gs", "Настройки"),
    ]

    private func makeGlass() -> UIVisualEffectView {
        if #available(iOS 26.0, *) {
            let e = UIGlassEffect()
            e.isInteractive = true
            return UIVisualEffectView(effect: e)
        }
        return UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    }

    private func buildDock() {
        let g = makeGlass()
        g.translatesAutoresizingMaskIntoConstraints = false
        g.clipsToBounds = true
        g.layer.cornerRadius = 34
        g.alpha = 0
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.spacing = 6
        stack.translatesAutoresizingMaskIntoConstraints = false
        for (i, it) in items.enumerated() {
            var c = UIButton.Configuration.plain()
            c.image = UIImage(systemName: it.icon)
            c.title = it.title
            c.imagePlacement = .top
            c.imagePadding = 4
            c.baseForegroundColor = .white
            c.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
                var a = a; a.font = UIFont.systemFont(ofSize: 10, weight: .semibold); return a
            }
            let b = UIButton(configuration: c)
            b.tag = i
            b.addTarget(self, action: #selector(tapDock(_:)), for: .touchUpInside)
            stack.addArrangedSubview(b)
        }
        g.contentView.addSubview(stack)
        view.addSubview(g)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: g.contentView.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: g.contentView.trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: g.contentView.topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: g.contentView.bottomAnchor, constant: -8),
            g.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            g.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
            g.heightAnchor.constraint(equalToConstant: 68),
            g.widthAnchor.constraint(equalToConstant: 320),
        ])
        dock = g
    }

    @objc private func tapDock(_ b: UIButton) {
        let id = items[b.tag].id
        web.evaluateJavaScript("(function(){var e=document.getElementById('\(id)');if(e)e.click()})()")
    }

    /// Панель видна только в главном меню игры.
    private func syncDock() {
        let js = "(function(){var m=document.getElementById('o1');return !!(m&&m.classList.contains('s')&&!document.querySelector('.ov.s:not(#o1)')&&!document.body.classList.contains('hold'))})()"
        web.evaluateJavaScript(js) { [weak self] r, _ in
            let on = (r as? Bool) ?? false
            guard let d = self?.dock, (d.alpha > 0.5) != on else { return }
            UIView.animate(withDuration: 0.3) { d.alpha = on ? 1 : 0 }
        }
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
