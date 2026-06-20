# Arc Browser Control MCP Server

Arc Browser を AppleScript 経由で制御する MCP サーバーです。

> **対応環境**: macOS 専用（AppleScript を使用）

## 機能一覧（58個）

### タブ操作（6個）

| ツール | 説明 |
|--------|------|
| `arc_open_url` | URL を開く（新規タブ/現在のタブ/指定Space） |
| `arc_get_active_tab` | アクティブタブの情報を取得 |
| `arc_list_tabs` | すべてのタブを一覧表示 |
| `arc_close_tab` | タブを閉じる |
| `arc_switch_tab` | タブを切り替える |
| `arc_reload_tab` | タブをリロード |

### Space操作（3個）

| ツール | 説明 |
|--------|------|
| `arc_list_spaces` | すべてのSpaceを一覧表示 |
| `arc_focus_space` | 指定Spaceにフォーカス |
| `arc_get_tabs_in_space` | Space内のタブを一覧表示 |

### ウィンドウ操作（5個）

| ツール | 説明 |
|--------|------|
| `arc_new_window` | 新しいウィンドウを開く |
| `arc_new_little_arc` | Little Arc でURLを開く |
| `arc_list_windows` | ウィンドウ一覧を取得 |
| `arc_focus_window` | ウィンドウにフォーカス |
| `arc_close_window` | ウィンドウを閉じる |

### ページ操作（3個）

| ツール | 説明 |
|--------|------|
| `arc_execute_javascript` | JavaScript を実行 |
| `arc_get_page_content` | ページのテキストを取得 |
| `arc_get_page_html` | ページのHTMLを取得 |

### ナビゲーション（2個）

| ツール | 説明 |
|--------|------|
| `arc_go_back` | 履歴を戻る |
| `arc_go_forward` | 履歴を進む |

### タブ情報拡充（3個）

| ツール | 説明 |
|--------|------|
| `arc_get_tab_location` | タブ位置情報（pinned/unpinned/topApp） |
| `arc_list_pinned_tabs` | ピン留めタブ一覧 |
| `arc_get_version` | Arc バージョン取得 |

### タブ操作拡張（3個）

| ツール | 説明 |
|--------|------|
| `arc_duplicate_tab` | タブを複製 |
| `arc_search_tabs` | タブを検索 |
| `arc_get_current_space` | 現在のSpace取得 |

### 高度な操作（1個）

| ツール | 説明 |
|--------|------|
| `arc_move_tab_to_space` | タブを別Spaceに移動 |

### フロントエンド開発向け機能（23個）

#### ページ情報・SEO（5個）

| ツール | 説明 |
|--------|------|
| `arc_get_page_info` | ページ詳細情報（URL、ビューポート、UserAgent） |
| `arc_get_page_links` | ページ内リンク抽出 |
| `arc_get_page_images` | ページ内画像抽出 |
| `arc_get_page_forms` | フォーム情報取得 |
| `arc_get_meta_tags` | メタタグ情報（SEO確認用） |

#### スタイル・パフォーマンス（3個）

| ツール | 説明 |
|--------|------|
| `arc_inject_css` | CSS注入 |
| `arc_get_computed_styles` | 要素のスタイル取得 |
| `arc_get_page_performance` | パフォーマンス情報 |

#### ストレージ（2個）

| ツール | 説明 |
|--------|------|
| `arc_get_storage_info` | ストレージ情報（localStorage/sessionStorage） |
| `arc_clear_storage` | ストレージクリア |


#### Cookie管理（3個）

| ツール | 説明 |
|--------|------|
| `arc_get_cookies` | すべてのCookieを取得（名前、値） |
| `arc_set_cookie` | Cookieを設定（path, domain, expires, secure, sameSite対応） |
| `arc_delete_cookie` | 指定したCookieを削除 |

#### ServiceWorker（2個）

| ツール | 説明 |
|--------|------|
| `arc_get_service_workers` | 登録されているServiceWorkerの情報を取得（※2回呼び出し） |
| `arc_unregister_service_worker` | すべてのServiceWorkerの登録を解除（※2回呼び出し） |

#### IndexedDB（2個）

| ツール | 説明 |
|--------|------|
| `arc_get_indexeddb_info` | IndexedDBのデータベース一覧とストア情報を取得（※2回呼び出し） |
| `arc_clear_indexeddb` | 指定したIndexedDBデータベースを削除（※2回呼び出し） |

> **※2回呼び出しについて**: これらの機能は非同期APIを使用するため、1回目の呼び出しでリクエストを開始し、2回目の呼び出しで結果を取得します。「取得中...」というメッセージが表示されたら、少し待ってから再度同じコマンドを実行してください。

#### Network/API監視（3個）

| ツール | 説明 |
|--------|------|
| `arc_start_network_monitor` | ネットワークリクエスト（fetch/XHR）の監視を開始 |
| `arc_get_network_requests` | 監視中のリクエスト一覧を取得（URL、メソッド、ステータス、レスポンス時間） |
| `arc_stop_network_monitor` | ネットワーク監視を停止 |

#### Console監視（3個）

| ツール | 説明 |
|--------|------|
| `arc_start_console_capture` | コンソールログのキャプチャを開始（log/info/warn/error/debug） |
| `arc_get_console_logs` | キャプチャしたログを取得（レベル別フィルタ対応） |
| `arc_stop_console_capture` | コンソールキャプチャを停止 |

**Console監視の特徴:**

- すべてのコンソールレベル（log, info, warn, error, debug）をキャプチャ
- キャッチされなかったエラー（uncaught error）を自動キャプチャ
- 未処理のPromise Rejection（unhandledrejection）を自動キャプチャ
- エラー発生箇所（ファイル名、行番号、列番号）を記録

### バックエンド開発向け機能（9個） 🆕

#### APIテスト（2個）

| ツール | 説明 |
|--------|------|
| `arc_fetch` | ブラウザのセッション・Cookieを使ってAPIリクエストを送信（※2回呼び出し） |
| `arc_get_fetch_result` | arc_fetchで送信したリクエストの結果を取得 |

**arc_fetchの特徴:**

- ブラウザの認証セッションをそのまま使用可能
- CORS制限を回避してAPIテストが可能
- GET/POST/PUT/DELETE/PATCH対応
- カスタムヘッダー・ボディ設定可能

#### Storage操作（3個）

| ツール | 説明 |
|--------|------|
| `arc_set_storage` | localStorage/sessionStorageに値を設定 |
| `arc_get_storage_item` | 特定キーの値を取得 |
| `arc_remove_storage_item` | 特定キーを削除 |

**ユースケース:**

- 認証トークンの手動設定
- アプリ状態のリセット
- デバッグ用データの注入

#### DOM監視（3個）

| ツール | 説明 |
|--------|------|
| `arc_watch_element` | DOM要素の変更を監視開始（MutationObserver使用） |
| `arc_get_element_changes` | 監視中の変更履歴を取得 |
| `arc_stop_watch_element` | DOM監視を停止 |

**監視可能な変更:**

- 子要素の追加・削除（childList）
- 属性の変更（attributes）
- テキスト内容の変更（characterData）
- 子孫要素の変更（subtree）

#### スクリーンショット（1個）

| ツール | 説明 |
|--------|------|
| `arc_take_screenshot` | スクリーンショットを取得（インタラクティブモード） |

**スクリーンショット機能の特徴:**

> **注意**: macOS の `screencapture` コマンドを使用するため、macOS 専用です。

| モード | 説明 | 操作方法 |
|--------|------|----------|
| `selection`（デフォルト） | 範囲選択でキャプチャ | ドラッグで範囲を指定 |
| `window` | ウィンドウ単位でキャプチャ | クリックでウィンドウを選択 |

**パラメータ:**

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `mode` | string | `selection`（デフォルト）または `window` |
| `save_path` | string | 保存先パス（省略時は自動命名） |

**ファイル命名規則:**

```text
screenshot_{mode}_{YYYYMMDD_HHmmss}.png
例: screenshot_selection_20231225_143052.png
```

**使い分け:**

- 通常は `selection` モードを使用（デフォルト）
- ウィンドウ全体をキャプチャしたい場合のみ `window` モードを指定

## セットアップ

### 1. 依存関係のインストール

```bash
cd ~/.claude/mcp-servers/arc
npm install
```

### 2. Claude Code 設定

`~/.claude.json` に以下を追加：

```json
{
  "mcpServers": {
    "arc": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/Users/[ユーザー名]/.claude/mcp-servers/arc/server/index.js"
      ]
    }
  }
}
```

### 3. 権限設定

初回実行時に macOS の権限プロンプトが表示されます：

1. **システム設定** > **プライバシーとセキュリティ** > **オートメーション** を開く
2. **Claude** を探す
3. **Arc** を有効にする

## 使用例

### 基本操作

```text
arc_open_url で https://example.com を開いて
arc_list_tabs でタブ一覧を表示して
arc_focus_space で "Work" に切り替えて
```

### Web開発

```text
arc_get_page_info でページ情報を取得して
arc_get_meta_tags でSEO用のメタタグを確認して
arc_get_computed_styles で body のスタイルを取得して
arc_inject_css で "body { background: red; }" を注入して
arc_clear_storage でlocalStorageをクリアして
```

### タブ管理

```text
arc_search_tabs で "github" を検索して
arc_list_pinned_tabs でピン留めタブを確認して
arc_duplicate_tab でタブを複製して
arc_move_tab_to_space でタブ 5 を "Personal" に移動して
```

### フロントエンド開発（Cookie / SW / IndexedDB / 監視）

```text
# Cookie確認
arc_get_cookies でCookieを確認して

# ServiceWorkerのリセット
arc_get_service_workers でServiceWorkerを確認して
arc_unregister_service_worker でServiceWorkerを解除して

# IndexedDB確認
arc_get_indexeddb_info でIndexedDBを確認して
arc_clear_indexeddb で "myDatabase" を削除して

# API通信の監視
arc_start_network_monitor で監視を開始して
（アプリを操作）
arc_get_network_requests でリクエストを確認して
arc_stop_network_monitor で監視を停止して

# エラー監視（特に便利！）
arc_start_console_capture でコンソールキャプチャを開始して
（アプリを操作）
arc_get_console_logs level="error" でエラーのみ表示して
arc_stop_console_capture でキャプチャを停止して
```

### バックエンド開発 🆕

```text
# 認証済みセッションでAPIテスト
arc_fetch で https://api.example.com/users を取得して
（少し待ってから）
arc_get_fetch_result で req_xxx の結果を取得して

# POSTリクエスト
arc_fetch で https://api.example.com/users に {"name": "test"} を POST して

# localStorage 操作
arc_set_storage で token に "abc123" を設定して
arc_get_storage_item で token を取得して

# DOM 変更の監視（API後のUI更新確認）
arc_watch_element で "#user-list" を監視して
（APIを呼び出し）
arc_get_element_changes で watch_xxx の変更を確認して
arc_stop_watch_element で watch_xxx の監視を停止して

# スクリーンショット（macOS専用）
arc_take_screenshot でスクリーンショットを撮って
→ ドラッグで範囲を選択するとキャプチャされる

arc_take_screenshot を window モードで撮って
→ クリックでウィンドウを選択するとキャプチャされる
```

## トラブルシューティング

### 権限エラーが発生する

- システム設定でオートメーション権限を確認
- Claude Code を再起動

### Arc が見つからない

- Arc Browser が起動していることを確認
- `/Applications/Arc.app` にインストールされていることを確認

### JavaScript実行が失敗する

- CSP（Content Security Policy）制限のあるページでは動作しない場合があります

### Network/Console監視が機能しない

- 監視はページリロード後にリセットされます
- 監視開始後のリクエスト/ログのみがキャプチャされます
- CSP制限のあるページでは動作しない場合があります

## ライセンス

MIT
