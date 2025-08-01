import Foundation

/// Centralized bundle identifiers for external applications
enum BundleIdentifiers {
    // MARK: - VibeTunnel

    static let main = "sh.vibetunnel.vibetunnel"
    static let vibeTunnel = "sh.vibetunnel.vibetunnel"

    /// Logging subsystem identifier for unified logging
    static let loggerSubsystem = "sh.vibetunnel.vibetunnel"

    // MARK: - Terminal Applications

    static let terminal = "com.apple.Terminal"
    static let iTerm2 = "com.googlecode.iterm2"
    static let ghostty = "com.mitchellh.ghostty"
    static let wezterm = "com.github.wez.wezterm"
    static let warp = "dev.warp.Warp-Stable"
    static let alacritty = "org.alacritty"
    static let hyper = "co.zeit.hyper"
    static let kitty = "net.kovidgoyal.kitty"

    /// Terminal application bundle identifiers.
    ///
    /// Groups bundle identifiers for terminal emulator applications
    /// to provide a centralized reference for terminal app detection.
    enum Terminal {
        static let apple = "com.apple.Terminal"
        static let iTerm2 = "com.googlecode.iterm2"
        static let ghostty = "com.mitchellh.ghostty"
        static let wezTerm = "com.github.wez.wezterm"
    }

    // MARK: - Git Applications

    static let cursor = "com.todesktop.230313mzl4w4u92"
    static let fork = "com.DanPristupov.Fork"
    static let githubDesktop = "com.github.GitHubClient"
    static let gitup = "co.gitup.mac"
    static let juxtaCode = "com.naiveapps.juxtacode"
    static let sourcetree = "com.torusknot.SourceTreeNotMAS"
    static let sublimeMerge = "com.sublimemerge"
    static let tower = "com.fournova.Tower3"
    static let vscode = "com.microsoft.VSCode"
    static let windsurf = "com.codeiumapp.windsurf"

    /// Git application bundle identifiers.
    ///
    /// Groups bundle identifiers for Git GUI applications to provide
    /// a centralized reference for Git app detection and integration.
    enum Git {
        static let githubDesktop = "com.todesktop.230313mzl4w4u92"
        static let fork = "com.DanPristupov.Fork"
        static let githubClient = "com.github.GitHubClient"
        static let juxtaCode = "com.naiveapps.juxtacode"
        static let sourceTree = "com.torusknot.SourceTreeNotMAS"
        static let sublimeMerge = "com.sublimemerge"
        static let tower = "com.fournova.Tower3"
    }

    // MARK: - Code Editors

    /// Code editor bundle identifiers.
    ///
    /// Groups bundle identifiers for code editors that can be launched
    /// from VibeTunnel for repository editing.
    enum Editor {
        static let vsCode = "com.microsoft.VSCode"
        static let windsurf = "com.codeiumapp.windsurf"
    }
}
