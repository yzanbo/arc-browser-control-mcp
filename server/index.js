#!/usr/bin/env node

/**
 * Arc Browser Control MCP Server
 *
 * Arc Browser を AppleScript 経由で制御する MCP サーバー
 *
 * 機能:
 * - タブ操作（開く、閉じる、切り替え、リロード）
 * - Space操作（一覧取得、切り替え、Space内でタブを開く）
 * - ページ操作（JavaScript実行、コンテンツ取得）
 * - ウィンドウ操作（新規ウィンドウ、Little Arc）
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

class ArcBrowserControlServer {
  constructor() {
    this.server = new Server(
      {
        name: 'arc-browser-control',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * AppleScript を実行する
   * @param {string} script - 実行するAppleScriptコード
   * @returns {Promise<string>} - 実行結果
   */
  async executeAppleScript(script) {
    try {
      const { stdout, stderr } = await execFileAsync('osascript', ['-e', script]);
      if (stderr) {
        console.error('AppleScript stderr:', stderr);
      }
      return stdout.trim();
    } catch (error) {
      console.error('AppleScript execution error:', error);

      // 権限関連のエラーチェック
      if (error.message.includes('(-1743)') ||
          error.message.includes('not allowed assistive access') ||
          error.message.includes('not authorized') ||
          error.message.includes('System Events')) {
        throw new Error(
          'Permission denied: Arc Browser の制御には自動化権限が必要です。\n\n' +
          '権限を付与するには:\n' +
          '1. システム設定 > プライバシーとセキュリティ > オートメーション を開く\n' +
          '2. リストから "Claude" を探す\n' +
          '3. Claude の下にある "Arc" を有効にする\n' +
          '4. 権限付与後、Claude の再起動が必要な場合があります\n\n' +
          'Note: 初回使用時に権限プロンプトが表示されます。'
        );
      }

      // Arc が起動していない場合のエラーチェック
      if (error.message.includes('(-600)') ||
          error.message.includes("application isn't running")) {
        throw new Error(
          'Arc Browser が起動していません。Arc を起動してから再度お試しください。'
        );
      }

      throw new Error(`AppleScript エラー: ${error.message}`);
    }
  }

  /**
   * 文字列をAppleScript用にエスケープする
   * @param {string} str - エスケープする文字列
   * @returns {string} - エスケープされた文字列
   */
  escapeForAppleScript(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  setupHandlers() {
    // ツール一覧を返す
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // === タブ操作 ===
        {
          name: 'arc_open_url',
          description: 'Arc Browser で URL を開く',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '開く URL'
              },
              new_tab: {
                type: 'boolean',
                description: '新しいタブで開くかどうか（デフォルト: true）',
                default: true
              },
              space: {
                type: 'string',
                description: '開くSpace名（指定しない場合は現在のSpace）'
              }
            },
            required: ['url']
          }
        },
        {
          name: 'arc_get_active_tab',
          description: '現在アクティブなタブの情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'arc_list_tabs',
          description: 'すべての開いているタブを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {
              space: {
                type: 'string',
                description: '特定のSpace名でフィルタ（指定しない場合はすべて）'
              }
            }
          }
        },
        {
          name: 'arc_close_tab',
          description: '指定したタブを閉じる',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（1から始まる）'
              },
              url: {
                type: 'string',
                description: '閉じるタブのURL（部分一致）'
              }
            }
          }
        },
        {
          name: 'arc_switch_tab',
          description: '指定したタブに切り替える',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（1から始まる）'
              },
              url: {
                type: 'string',
                description: '切り替えるタブのURL（部分一致）'
              }
            }
          }
        },
        {
          name: 'arc_reload_tab',
          description: 'タブをリロードする',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === Space操作 ===
        {
          name: 'arc_list_spaces',
          description: 'すべてのSpaceを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'arc_focus_space',
          description: '指定したSpaceにフォーカスする',
          inputSchema: {
            type: 'object',
            properties: {
              space: {
                type: 'string',
                description: 'フォーカスするSpace名'
              }
            },
            required: ['space']
          }
        },
        {
          name: 'arc_get_tabs_in_space',
          description: '指定したSpace内のタブを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {
              space: {
                type: 'string',
                description: 'Space名'
              }
            },
            required: ['space']
          }
        },

        // === ウィンドウ操作 ===
        {
          name: 'arc_new_window',
          description: '新しいウィンドウを開く',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '開くURL（指定しない場合は空のウィンドウ）'
              },
              incognito: {
                type: 'boolean',
                description: 'シークレットモードで開くかどうか',
                default: false
              }
            }
          }
        },
        {
          name: 'arc_new_little_arc',
          description: 'Little Arc ウィンドウで URL を開く',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '開く URL'
              }
            },
            required: ['url']
          }
        },

        // === ページ操作 ===
        {
          name: 'arc_execute_javascript',
          description: 'JavaScriptコードを実行する（async/await対応、エラーハンドリング付き）',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: '実行するJavaScriptコード（async関数として実行される）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['code']
          }
        },
        {
          name: 'arc_get_page_content',
          description: 'ページのテキストコンテンツを取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_page_html',
          description: 'ページのHTML全体を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === ナビゲーション ===
        {
          name: 'arc_go_back',
          description: 'ブラウザ履歴を戻る',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_go_forward',
          description: 'ブラウザ履歴を進む',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === ウィンドウ操作（拡張） ===
        {
          name: 'arc_list_windows',
          description: '開いているすべてのウィンドウを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'arc_focus_window',
          description: '指定したウィンドウにフォーカスする',
          inputSchema: {
            type: 'object',
            properties: {
              window_index: {
                type: 'number',
                description: 'ウィンドウのインデックス（1から始まる）'
              }
            },
            required: ['window_index']
          }
        },
        {
          name: 'arc_close_window',
          description: '指定したウィンドウを閉じる',
          inputSchema: {
            type: 'object',
            properties: {
              window_index: {
                type: 'number',
                description: 'ウィンドウのインデックス（1から始まる）'
              }
            },
            required: ['window_index']
          }
        },

        // === タブ情報拡充 ===
        {
          name: 'arc_get_tab_location',
          description: 'タブの位置情報を取得する（pinned/unpinned/topApp）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（1から始まる、指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_list_pinned_tabs',
          description: 'ピン留めされたタブのみを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'arc_get_version',
          description: 'Arc Browserのバージョン情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },

        // === タブ操作拡張 ===
        {
          name: 'arc_duplicate_tab',
          description: '現在のタブを複製する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_search_tabs',
          description: 'タイトルまたはURLでタブを検索する',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '検索クエリ（タイトルまたはURLに部分一致）'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'arc_get_current_space',
          description: '現在アクティブなSpaceの情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },

        // === 高度な操作 ===
        {
          name: 'arc_move_tab_to_space',
          description: 'タブを別のSpaceに移動する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: '移動するタブのインデックス'
              },
              target_space: {
                type: 'string',
                description: '移動先のSpace名'
              }
            },
            required: ['tab_index', 'target_space']
          }
        },

        // === Web開発向け機能 ===
        {
          name: 'arc_get_page_info',
          description: 'ページの詳細情報を取得する（URL、タイトル、ビューポート、UserAgent）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_page_links',
          description: 'ページ内のすべてのリンクを抽出する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              },
              limit: {
                type: 'number',
                description: '取得するリンクの最大数（デフォルト: 100）',
                default: 100
              }
            }
          }
        },
        {
          name: 'arc_get_page_images',
          description: 'ページ内のすべての画像を抽出する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              },
              limit: {
                type: 'number',
                description: '取得する画像の最大数（デフォルト: 50）',
                default: 50
              }
            }
          }
        },
        {
          name: 'arc_get_page_forms',
          description: 'ページ内のフォーム情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_storage_info',
          description: 'ローカルストレージ/セッションストレージの情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_meta_tags',
          description: 'ページのメタタグ情報を取得する（SEO確認用）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_page_performance',
          description: 'ページのパフォーマンス情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_clear_storage',
          description: 'ストレージをクリアする（開発中のリセット用）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              },
              type: {
                type: 'string',
                description: 'クリアするストレージの種類（localStorage/sessionStorage/all）',
                enum: ['localStorage', 'sessionStorage', 'all'],
                default: 'all'
              }
            }
          }
        },
        {
          name: 'arc_inject_css',
          description: 'CSSを注入する（スタイルのテスト用）',
          inputSchema: {
            type: 'object',
            properties: {
              css: {
                type: 'string',
                description: '注入するCSSコード'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['css']
          }
        },
        {
          name: 'arc_get_computed_styles',
          description: '要素の計算済みスタイルを取得する',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },

        // === React/Next.js開発向け機能 ===
        // Cookie管理
        {
          name: 'arc_get_cookies',
          description: 'すべてのCookieを取得する（名前、値、詳細情報）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_set_cookie',
          description: 'Cookieを設定する',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Cookie名'
              },
              value: {
                type: 'string',
                description: 'Cookie値'
              },
              options: {
                type: 'object',
                description: 'オプション（path, domain, expires, secure, sameSite）',
                properties: {
                  path: { type: 'string' },
                  domain: { type: 'string' },
                  expires: { type: 'string', description: '有効期限（日数または日付文字列）' },
                  secure: { type: 'boolean' },
                  sameSite: { type: 'string', enum: ['Strict', 'Lax', 'None'] }
                }
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['name', 'value']
          }
        },
        {
          name: 'arc_delete_cookie',
          description: '指定したCookieを削除する',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '削除するCookie名'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['name']
          }
        },

        // ServiceWorker
        {
          name: 'arc_get_service_workers',
          description: '登録されているServiceWorkerの情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_unregister_service_worker',
          description: 'ServiceWorkerの登録を解除する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // IndexedDB
        {
          name: 'arc_get_indexeddb_info',
          description: 'IndexedDBのデータベース一覧とストア情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              database: {
                type: 'string',
                description: '特定のデータベース名（指定しない場合はすべて）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_clear_indexeddb',
          description: 'IndexedDBのデータベースを削除する',
          inputSchema: {
            type: 'object',
            properties: {
              database: {
                type: 'string',
                description: '削除するデータベース名'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['database']
          }
        },

        // Network/API監視
        {
          name: 'arc_start_network_monitor',
          description: 'ネットワークリクエストの監視を開始する（fetch/XHR）',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                description: 'URLフィルタ（部分一致）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_network_requests',
          description: '監視中のネットワークリクエスト一覧を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: '取得する最大件数（デフォルト: 50）',
                default: 50
              },
              includePreservedRequests: {
                type: 'boolean',
                description: '過去のナビゲーションで保存されたリクエストも含めるか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_stop_network_monitor',
          description: 'ネットワーク監視を停止する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // Console監視
        {
          name: 'arc_start_console_capture',
          description: 'コンソールログのキャプチャを開始する',
          inputSchema: {
            type: 'object',
            properties: {
              levels: {
                type: 'array',
                items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
                description: 'キャプチャするログレベル（デフォルト: すべて）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_console_logs',
          description: 'キャプチャしたコンソールログを取得する',
          inputSchema: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['log', 'info', 'warn', 'error', 'debug', 'all'],
                description: 'フィルタするログレベル（デフォルト: all）'
              },
              limit: {
                type: 'number',
                description: '取得する最大件数（デフォルト: 100）',
                default: 100
              },
              includePreservedMessages: {
                type: 'boolean',
                description: '過去のナビゲーションで保存されたメッセージも含めるか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_stop_console_capture',
          description: 'コンソールキャプチャを停止してログをクリアする',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === バックエンド開発向け機能 ===
        // API テスト
        {
          name: 'arc_fetch',
          description: 'ブラウザのセッション・Cookieを使ってAPIリクエストを送信する（非同期、arc_get_fetch_resultで結果取得）',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'リクエストURL'
              },
              method: {
                type: 'string',
                description: 'HTTPメソッド（GET/POST/PUT/DELETE/PATCH）',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                default: 'GET'
              },
              headers: {
                type: 'object',
                description: 'リクエストヘッダー（Content-Typeなど）'
              },
              body: {
                type: 'string',
                description: 'リクエストボディ（JSON文字列など）'
              },
              request_id: {
                type: 'string',
                description: 'リクエストID（結果取得時に使用、省略時は自動生成）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['url']
          }
        },
        {
          name: 'arc_get_fetch_result',
          description: 'arc_fetchで送信したリクエストの結果を取得する（※2回呼び出し）',
          inputSchema: {
            type: 'object',
            properties: {
              request_id: {
                type: 'string',
                description: 'リクエストID（arc_fetchで返されたID）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['request_id']
          }
        },

        // Storage 操作
        {
          name: 'arc_set_storage',
          description: 'localStorage/sessionStorageに値を設定する',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'キー名'
              },
              value: {
                type: 'string',
                description: '値（オブジェクトの場合はJSON文字列化される）'
              },
              storage_type: {
                type: 'string',
                description: 'ストレージタイプ',
                enum: ['localStorage', 'sessionStorage'],
                default: 'localStorage'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['key', 'value']
          }
        },
        {
          name: 'arc_get_storage_item',
          description: 'localStorage/sessionStorageから特定のキーの値を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'キー名'
              },
              storage_type: {
                type: 'string',
                description: 'ストレージタイプ',
                enum: ['localStorage', 'sessionStorage'],
                default: 'localStorage'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'arc_remove_storage_item',
          description: 'localStorage/sessionStorageから特定のキーを削除する',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'キー名'
              },
              storage_type: {
                type: 'string',
                description: 'ストレージタイプ',
                enum: ['localStorage', 'sessionStorage'],
                default: 'localStorage'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['key']
          }
        },

        // DOM 監視
        {
          name: 'arc_watch_element',
          description: 'DOM要素の変更を監視開始する（MutationObserver使用）',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              watch_id: {
                type: 'string',
                description: '監視ID（結果取得・停止時に使用、省略時は自動生成）'
              },
              options: {
                type: 'object',
                description: '監視オプション',
                properties: {
                  childList: { type: 'boolean', description: '子要素の変更を監視', default: true },
                  attributes: { type: 'boolean', description: '属性の変更を監視', default: true },
                  characterData: { type: 'boolean', description: 'テキスト内容の変更を監視', default: true },
                  subtree: { type: 'boolean', description: '子孫要素も監視', default: true }
                }
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'arc_get_element_changes',
          description: '監視中のDOM要素の変更履歴を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              watch_id: {
                type: 'string',
                description: '監視ID'
              },
              limit: {
                type: 'number',
                description: '取得する最大件数（デフォルト: 50）',
                default: 50
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['watch_id']
          }
        },
        {
          name: 'arc_stop_watch_element',
          description: 'DOM要素の監視を停止する',
          inputSchema: {
            type: 'object',
            properties: {
              watch_id: {
                type: 'string',
                description: '監視ID'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['watch_id']
          }
        },

        // スクリーンショット
        {
          name: 'arc_take_screenshot',
          description: 'スクリーンショットを取得する。mode="selection"で範囲選択、mode="window"でウィンドウ選択',
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                description: 'キャプチャモード: selection（ユーザーが範囲をドラッグ選択）、window（ユーザーがウィンドウをクリック選択）',
                enum: ['selection', 'window'],
                default: 'selection'
              },
              save_path: {
                type: 'string',
                description: '保存先パス（省略時は自動命名: screenshot_{mode}_{timestamp}.png）'
              }
            }
          }
        },

        // === ページ操作（DOM操作） ===
        {
          name: 'arc_click',
          description: '指定したセレクタの要素をクリックする',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              dblClick: {
                type: 'boolean',
                description: 'ダブルクリックするかどうか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'arc_hover',
          description: '指定したセレクタの要素にホバーする',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'arc_fill',
          description: 'input、textarea に値を入力する、または select から選択する',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              value: {
                type: 'string',
                description: '入力する値'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector', 'value']
          }
        },
        {
          name: 'arc_fill_form',
          description: '複数のフォーム要素に一括で値を入力する',
          inputSchema: {
            type: 'object',
            properties: {
              fields: {
                type: 'array',
                description: '入力するフィールドの配列',
                items: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string', description: 'CSSセレクタ' },
                    value: { type: 'string', description: '入力する値' }
                  },
                  required: ['selector', 'value']
                }
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['fields']
          }
        },
        {
          name: 'arc_press_key',
          description: 'キーまたはキーの組み合わせを押す',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'キーまたは組み合わせ（例: "Enter", "Control+A", "Escape"）'
              },
              selector: {
                type: 'string',
                description: 'フォーカスする要素のCSSセレクタ（省略時はアクティブな要素）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'arc_drag',
          description: '要素を別の要素にドラッグ&ドロップする',
          inputSchema: {
            type: 'object',
            properties: {
              from_selector: {
                type: 'string',
                description: 'ドラッグ元のCSSセレクタ'
              },
              to_selector: {
                type: 'string',
                description: 'ドロップ先のCSSセレクタ'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['from_selector', 'to_selector']
          }
        },
        {
          name: 'arc_upload_file',
          description: 'ファイルアップロード用のinputにファイルパスを設定する',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'ファイルinputのCSSセレクタ'
              },
              file_path: {
                type: 'string',
                description: 'アップロードするファイルのローカルパス'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector', 'file_path']
          }
        },
        {
          name: 'arc_handle_dialog',
          description: 'ブラウザのダイアログ（alert, confirm, prompt）を処理する',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'ダイアログを承認するか却下するか',
                enum: ['accept', 'dismiss']
              },
              prompt_text: {
                type: 'string',
                description: 'promptダイアログに入力するテキスト（任意）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['action']
          }
        },
        {
          name: 'arc_wait_for',
          description: '指定したテキストまたはセレクタがページに表示されるまで待機する',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: '待機するテキスト（部分一致）'
              },
              selector: {
                type: 'string',
                description: '待機する要素のCSSセレクタ'
              },
              timeout: {
                type: 'number',
                description: 'タイムアウト（ミリ秒、デフォルト: 30000）',
                default: 30000
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === ウィンドウ・ブラウザ操作 ===
        {
          name: 'arc_quit',
          description: 'Arc Browserを終了する',
          inputSchema: {
            type: 'object',
            properties: {
              save_state: {
                type: 'boolean',
                description: '状態を保存して終了するか（デフォルト: true）',
                default: true
              }
            }
          }
        },

        // === 拡張機能 ===
        {
          name: 'arc_get_network_request',
          description: '特定のネットワークリクエストの詳細を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              reqid: {
                type: 'number',
                description: 'リクエストのID（arc_get_network_requestsで取得したID）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['reqid']
          }
        },
        {
          name: 'arc_get_console_message',
          description: '特定のコンソールメッセージの詳細を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              msgid: {
                type: 'number',
                description: 'メッセージのID（arc_get_console_logsで取得したID）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['msgid']
          }
        },
        {
          name: 'arc_get_performance_metrics',
          description: 'ページのパフォーマンスメトリクス（Core Web Vitals等）を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_resource_timing',
          description: 'リソースのタイミング情報を取得する（パフォーマンス分析用）',
          inputSchema: {
            type: 'object',
            properties: {
              resource_type: {
                type: 'string',
                description: 'リソースタイプでフィルタ（script, css, img, fetch, xmlhttprequest等）',
                enum: ['all', 'script', 'css', 'img', 'font', 'fetch', 'xmlhttprequest', 'document']
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_emulate_network',
          description: 'ネットワーク速度をエミュレートする（スロットリング）',
          inputSchema: {
            type: 'object',
            properties: {
              preset: {
                type: 'string',
                description: 'ネットワークプリセット',
                enum: ['offline', 'slow-3g', 'fast-3g', 'slow-4g', 'fast-4g', 'no-throttle']
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['preset']
          }
        },
        {
          name: 'arc_emulate_geolocation',
          description: '位置情報をエミュレートする',
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                description: '緯度（-90〜90）'
              },
              longitude: {
                type: 'number',
                description: '経度（-180〜180）'
              },
              accuracy: {
                type: 'number',
                description: '精度（メートル、デフォルト: 100）',
                default: 100
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['latitude', 'longitude']
          }
        },
        {
          name: 'arc_emulate_cpu',
          description: 'CPU速度をエミュレートする（スロットリング）',
          inputSchema: {
            type: 'object',
            properties: {
              slowdown_factor: {
                type: 'number',
                description: 'CPU速度の低下係数（1=通常、2=2倍遅い、4=4倍遅い等）',
                minimum: 1,
                maximum: 20
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['slowdown_factor']
          }
        },
        {
          name: 'arc_measure_performance',
          description: 'ページのパフォーマンスを計測する（ナビゲーションタイミング、ペイントタイミング等）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        }
      ]
    }));

    // ツール実行ハンドラ
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // === タブ操作 ===
          case 'arc_open_url': {
            const { url, new_tab = true, space } = args;
            const escapedUrl = this.escapeForAppleScript(url);

            let script;
            if (space) {
              const escapedSpace = this.escapeForAppleScript(space);
              script = `
                tell application "Arc"
                  tell front window
                    tell space "${escapedSpace}"
                      make new tab with properties {URL:"${escapedUrl}"}
                    end tell
                  end tell
                  activate
                end tell
              `;
            } else if (new_tab) {
              script = `
                tell application "Arc"
                  tell front window
                    make new tab with properties {URL:"${escapedUrl}"}
                  end tell
                  activate
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  set URL of active tab of front window to "${escapedUrl}"
                  activate
                end tell
              `;
            }

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `Arc で ${url} を開きました${space ? ` (Space: ${space})` : ''}`
              }]
            };
          }

          case 'arc_get_active_tab': {
            const script = `
              tell application "Arc"
                set tabUrl to URL of active tab of front window
                set tabTitle to title of active tab of front window
                return tabUrl & "|||" & tabTitle
              end tell
            `;
            const result = await this.executeAppleScript(script);
            const [url, title] = result.split('|||');

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ url, title }, null, 2)
              }]
            };
          }

          case 'arc_list_tabs': {
            const { space } = args;

            let script;
            if (space) {
              const escapedSpace = this.escapeForAppleScript(space);
              script = `
                tell application "Arc"
                  tell front window
                    set tabsList to ""
                    set tabIndex to 1
                    tell space "${escapedSpace}"
                      repeat with t in tabs
                        set tabUrl to URL of t
                        set tabTitle to title of t
                        set tabsList to tabsList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                        set tabIndex to tabIndex + 1
                      end repeat
                    end tell
                  end tell
                  return tabsList
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  tell front window
                    set tabsList to ""
                    set tabIndex to 1
                    repeat with t in tabs
                      set tabUrl to URL of t
                      set tabTitle to title of t
                      set tabsList to tabsList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                      set tabIndex to tabIndex + 1
                    end repeat
                  end tell
                  return tabsList
                end tell
              `;
            }

            const result = await this.executeAppleScript(script);
            const tabs = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, url, title] = line.split('|||');
                return { index: parseInt(index), url, title };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(tabs, null, 2)
              }]
            };
          }

          case 'arc_close_tab': {
            const { tab_index, url } = args;

            let script;
            if (url) {
              const escapedUrl = this.escapeForAppleScript(url);
              script = `
                tell application "Arc"
                  tell front window
                    repeat with t in tabs
                      if URL of t contains "${escapedUrl}" then
                        close t
                        return "タブを閉じました"
                      end if
                    end repeat
                    return "該当するタブが見つかりません"
                  end tell
                end tell
              `;
            } else if (tab_index) {
              script = `
                tell application "Arc"
                  tell front window
                    close tab ${tab_index}
                    return "タブ ${tab_index} を閉じました"
                  end tell
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  tell front window
                    close active tab
                    return "アクティブタブを閉じました"
                  end tell
                end tell
              `;
            }

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_switch_tab': {
            const { tab_index, url } = args;

            let script;
            if (url) {
              const escapedUrl = this.escapeForAppleScript(url);
              script = `
                tell application "Arc"
                  tell front window
                    set tabIndex to 1
                    repeat with t in tabs
                      if URL of t contains "${escapedUrl}" then
                        tell tab tabIndex to select
                        activate
                        return "タブに切り替えました"
                      end if
                      set tabIndex to tabIndex + 1
                    end repeat
                    return "該当するタブが見つかりません"
                  end tell
                end tell
              `;
            } else if (tab_index) {
              script = `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index} to select
                  end tell
                  activate
                end tell
              `;
            } else {
              return {
                content: [{
                  type: 'text',
                  text: 'tab_index または url を指定してください'
                }],
                isError: true
              };
            }

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブ ${tab_index || url} に切り替えました`
              }]
            };
          }

          case 'arc_reload_tab': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index} to reload
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab to reload
                  end tell
                end tell
              `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブ ${tab_index || 'アクティブ'} をリロードしました`
              }]
            };
          }

          // === Space操作 ===
          case 'arc_list_spaces': {
            const script = `
              tell application "Arc"
                tell front window
                  set spacesList to ""
                  set spaceIndex to 1
                  repeat with s in spaces
                    set spaceName to title of s
                    set spaceId to id of s
                    set spacesList to spacesList & spaceIndex & "|||" & spaceId & "|||" & spaceName & "\\n"
                    set spaceIndex to spaceIndex + 1
                  end repeat
                end tell
                return spacesList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const spaces = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, id, name] = line.split('|||');
                return { index: parseInt(index), id, name };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(spaces, null, 2)
              }]
            };
          }

          case 'arc_focus_space': {
            const { space } = args;
            const escapedSpace = this.escapeForAppleScript(space);

            const script = `
              tell application "Arc"
                tell front window
                  tell space "${escapedSpace}" to focus
                end tell
                activate
              end tell
            `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `Space "${space}" にフォーカスしました`
              }]
            };
          }

          case 'arc_get_tabs_in_space': {
            const { space } = args;
            const escapedSpace = this.escapeForAppleScript(space);

            const script = `
              tell application "Arc"
                tell front window
                  set tabsList to ""
                  set tabIndex to 1
                  tell space "${escapedSpace}"
                    repeat with t in tabs
                      set tabUrl to URL of t
                      set tabTitle to title of t
                      set tabsList to tabsList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                      set tabIndex to tabIndex + 1
                    end repeat
                  end tell
                end tell
                return tabsList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const tabs = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, url, title] = line.split('|||');
                return { index: parseInt(index), url, title };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ space, tabs }, null, 2)
              }]
            };
          }

          // === ウィンドウ操作 ===
          case 'arc_new_window': {
            const { url, incognito = false } = args;

            let script;
            if (incognito) {
              script = `
                tell application "Arc"
                  make new window with properties {incognito:true}
                  ${url ? `tell front window to make new tab with properties {URL:"${this.escapeForAppleScript(url)}"}` : ''}
                  activate
                end tell
              `;
            } else if (url) {
              script = `
                tell application "Arc"
                  make new window
                  tell front window
                    make new tab with properties {URL:"${this.escapeForAppleScript(url)}"}
                  end tell
                  activate
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  make new window
                  activate
                end tell
              `;
            }

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `新しいウィンドウを開きました${incognito ? ' (シークレットモード)' : ''}${url ? `: ${url}` : ''}`
              }]
            };
          }

          case 'arc_new_little_arc': {
            const { url } = args;
            const escapedUrl = this.escapeForAppleScript(url);

            const script = `
              tell application "Arc"
                make new tab with properties {URL:"${escapedUrl}"}
                tell front window
                  tell active tab
                    set location to "unpinned"
                  end tell
                end tell
                activate
              end tell
            `;

            // Note: Little Arc の直接的な AppleScript サポートは限定的
            // 代替として通常タブで開く
            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `Little Arc で ${url} を開きました`
              }]
            };
          }

          // === ページ操作 ===
          case 'arc_execute_javascript': {
            const { code, tab_index } = args;

            // コードをasync IIFEでラップして実行（async/await対応、エラーハンドリング付き）
            const wrappedCode = `
              (async function() {
                try {
                  ${code}
                } catch (e) {
                  return JSON.stringify({ error: e.message, stack: e.stack });
                }
              })()
            `;

            const escapedCode = this.escapeForAppleScript(wrappedCode);

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${escapedCode}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${escapedCode}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: result || JSON.stringify({ success: true })
              }]
            };
          }

          case 'arc_get_page_content': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "document.body.innerText"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "document.body.innerText"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_html': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "document.documentElement.outerHTML"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "document.documentElement.outerHTML"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === ナビゲーション ===
          case 'arc_go_back': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "history.back()"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "history.back()"
                    end tell
                  end tell
                end tell
              `;

            await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: '前のページに戻りました' }] };
          }

          case 'arc_go_forward': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "history.forward()"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "history.forward()"
                    end tell
                  end tell
                end tell
              `;

            await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: '次のページに進みました' }] };
          }

          // === ウィンドウ操作（拡張） ===
          case 'arc_list_windows': {
            const script = `
              tell application "Arc"
                set windowList to ""
                set windowIndex to 1
                repeat with w in windows
                  set windowName to name of w
                  set windowList to windowList & windowIndex & "|||" & windowName & "\\n"
                  set windowIndex to windowIndex + 1
                end repeat
                return windowList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const windows = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, name] = line.split('|||');
                return { index: parseInt(index), name };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(windows, null, 2)
              }]
            };
          }

          case 'arc_focus_window': {
            const { window_index } = args;

            const script = `
              tell application "Arc"
                set index of window ${window_index} to 1
                activate
              end tell
            `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `ウィンドウ ${window_index} にフォーカスしました`
              }]
            };
          }

          case 'arc_close_window': {
            const { window_index } = args;

            const script = `
              tell application "Arc"
                close window ${window_index}
              end tell
            `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `ウィンドウ ${window_index} を閉じました`
              }]
            };
          }

          // === タブ情報拡充 ===
          case 'arc_get_tab_location': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    set loc to location of tab ${tab_index}
                    return loc as string
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    set loc to location of active tab
                    return loc as string
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ location: result }, null, 2)
              }]
            };
          }

          case 'arc_list_pinned_tabs': {
            // Note: 'location of t is pinned' は型エラーになるため文字列比較を使用
            const script = `
              tell application "Arc"
                tell front window
                  set pinnedList to ""
                  set tabIndex to 1
                  repeat with t in tabs
                    set tabLoc to location of t as string
                    if tabLoc is "pinned" then
                      set tabUrl to URL of t
                      set tabTitle to title of t
                      set pinnedList to pinnedList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                    end if
                    set tabIndex to tabIndex + 1
                  end repeat
                end tell
                return pinnedList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const tabs = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, url, title] = line.split('|||');
                return { index: parseInt(index), url, title, location: 'pinned' };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(tabs, null, 2)
              }]
            };
          }

          case 'arc_get_version': {
            const script = `
              tell application "Arc"
                return version
              end tell
            `;

            const result = await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ version: result }, null, 2)
              }]
            };
          }

          // === タブ操作拡張 ===
          case 'arc_duplicate_tab': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    set tabUrl to URL of tab ${tab_index}
                    make new tab with properties {URL:tabUrl}
                  end tell
                  activate
                end tell
              `
              : `
                tell application "Arc"
                  set tabUrl to URL of active tab of front window
                  tell front window
                    make new tab with properties {URL:tabUrl}
                  end tell
                  activate
                end tell
              `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブを複製しました`
              }]
            };
          }

          case 'arc_search_tabs': {
            const { query } = args;
            const escapedQuery = this.escapeForAppleScript(query);

            const script = `
              tell application "Arc"
                tell front window
                  set matchList to ""
                  set tabIndex to 1
                  repeat with t in tabs
                    set tabUrl to URL of t
                    set tabTitle to title of t
                    if (tabUrl contains "${escapedQuery}") or (tabTitle contains "${escapedQuery}") then
                      set matchList to matchList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                    end if
                    set tabIndex to tabIndex + 1
                  end repeat
                end tell
                return matchList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const tabs = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, url, title] = line.split('|||');
                return { index: parseInt(index), url, title };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ query, matches: tabs.length, tabs }, null, 2)
              }]
            };
          }

          case 'arc_get_current_space': {
            // Note: 'first space' の直接アクセスは型変換エラーが発生するため、
            // spaces をイテレートして最初のスペースを取得
            const script = `
              tell application "Arc"
                tell front window
                  set spaceIndex to 1
                  repeat with s in spaces
                    set spaceName to title of s
                    return spaceIndex & "|||" & spaceName
                  end repeat
                  return "0|||"
                end tell
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const [index, name] = result.split('|||');

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ index: parseInt(index), name }, null, 2)
              }]
            };
          }

          // === 高度な操作 ===
          case 'arc_move_tab_to_space': {
            const { tab_index, target_space } = args;
            const escapedSpace = this.escapeForAppleScript(target_space);

            const script = `
              tell application "Arc"
                tell front window
                  set tabUrl to URL of tab ${tab_index}
                  close tab ${tab_index}
                  tell space "${escapedSpace}"
                    make new tab with properties {URL:tabUrl}
                  end tell
                end tell
                activate
              end tell
            `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブを "${target_space}" に移動しました`
              }]
            };
          }

          // === Web開発向け機能 ===
          case 'arc_get_page_info': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify({
              url: window.location.href,
              title: document.title,
              viewport: { width: window.innerWidth, height: window.innerHeight },
              devicePixelRatio: window.devicePixelRatio,
              userAgent: navigator.userAgent,
              language: navigator.language,
              cookiesEnabled: navigator.cookieEnabled
            })`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_links': {
            const { tab_index, limit = 100 } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('a[href]'))
                .slice(0, ${limit})
                .map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 100) }))
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_images': {
            const { tab_index, limit = 50 } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('img'))
                .slice(0, ${limit})
                .map(img => ({ src: img.src, alt: img.alt, width: img.width, height: img.height }))
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_forms': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('form'))
                .map(form => ({
                  action: form.action,
                  method: form.method,
                  id: form.id,
                  name: form.name,
                  fields: Array.from(form.elements).map(el => ({
                    name: el.name,
                    type: el.type,
                    id: el.id
                  })).filter(f => f.name || f.id)
                }))
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_storage_info': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify({
              cookies: document.cookie.length,
              localStorage: {
                count: Object.keys(localStorage).length,
                keys: Object.keys(localStorage)
              },
              sessionStorage: {
                count: Object.keys(sessionStorage).length,
                keys: Object.keys(sessionStorage)
              }
            })`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_meta_tags': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('meta'))
                .map(meta => ({
                  name: meta.name || meta.getAttribute('property') || meta.getAttribute('http-equiv'),
                  content: meta.content
                }))
                .filter(m => m.name && m.content)
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_performance': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify({
              timing: {
                domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
                load: performance.timing.loadEventEnd - performance.timing.navigationStart,
                firstByte: performance.timing.responseStart - performance.timing.navigationStart
              },
              memory: performance.memory ? {
                usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
                totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB'
              } : null,
              resources: performance.getEntriesByType('resource').length
            })`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_clear_storage': {
            const { tab_index, type = 'all' } = args;
            let jsCode;
            switch (type) {
              case 'localStorage':
                jsCode = `localStorage.clear(); 'localStorage をクリアしました'`;
                break;
              case 'sessionStorage':
                jsCode = `sessionStorage.clear(); 'sessionStorage をクリアしました'`;
                break;
              default:
                jsCode = `localStorage.clear(); sessionStorage.clear(); 'すべてのストレージをクリアしました'`;
            }

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_inject_css': {
            const { css, tab_index } = args;
            const escapedCss = css.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const jsCode = `(function() {
              const style = document.createElement('style');
              style.textContent = "${escapedCss}";
              document.head.appendChild(style);
              return 'CSS を注入しました';
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_computed_styles': {
            const { selector, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);
            const jsCode = `(function() {
              const el = document.querySelector("${escapedSelector}");
              if (!el) return JSON.stringify({error: '要素が見つかりません: ${escapedSelector}'});
              const styles = window.getComputedStyle(el);
              return JSON.stringify({
                selector: "${escapedSelector}",
                display: styles.display,
                position: styles.position,
                width: styles.width,
                height: styles.height,
                color: styles.color,
                backgroundColor: styles.backgroundColor,
                fontSize: styles.fontSize,
                fontFamily: styles.fontFamily,
                margin: styles.margin,
                padding: styles.padding,
                border: styles.border
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === React/Next.js開発向け機能 ===
          // Cookie管理
          case 'arc_get_cookies': {
            const { tab_index } = args;
            const jsCode = `(function() {
              const cookies = document.cookie.split(';').map(c => c.trim()).filter(c => c);
              const parsed = cookies.map(cookie => {
                const [name, ...valueParts] = cookie.split('=');
                return {
                  name: name,
                  value: valueParts.join('='),
                  raw: cookie
                };
              });
              return JSON.stringify({
                count: parsed.length,
                cookies: parsed
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_set_cookie': {
            const { name, value, options = {}, tab_index } = args;
            const escapedName = this.escapeForAppleScript(name);
            const escapedValue = this.escapeForAppleScript(value);

            let cookieString = `${escapedName}=${escapedValue}`;
            if (options.path) cookieString += `; path=${options.path}`;
            if (options.domain) cookieString += `; domain=${options.domain}`;
            if (options.expires) {
              const days = parseInt(options.expires);
              if (!isNaN(days)) {
                const expiresDate = new Date(Date.now() + days * 864e5).toUTCString();
                cookieString += `; expires=${expiresDate}`;
              } else {
                cookieString += `; expires=${options.expires}`;
              }
            }
            if (options.secure) cookieString += '; secure';
            if (options.sameSite) cookieString += `; SameSite=${options.sameSite}`;

            const jsCode = `(function() {
              document.cookie = "${cookieString}";
              return 'Cookie "${escapedName}" を設定しました';
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_delete_cookie': {
            const { name, tab_index } = args;
            const escapedName = this.escapeForAppleScript(name);

            const jsCode = `(function() {
              document.cookie = "${escapedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
              return "Cookie \\"${escapedName}\\" を削除しました";
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // ServiceWorker
          case 'arc_get_service_workers': {
            const { tab_index } = args;
            // 非同期APIを同期的に扱うため、結果をグローバル変数に保存してから取得
            const jsCode = `(function() {
              if (!('serviceWorker' in navigator)) {
                return JSON.stringify({ error: 'ServiceWorkerはこのブラウザでサポートされていません' });
              }
              // すでに結果がある場合はそれを返す
              if (window.__arcServiceWorkerResult) {
                const result = window.__arcServiceWorkerResult;
                delete window.__arcServiceWorkerResult;
                return result;
              }
              // 非同期で取得してグローバル変数に保存
              navigator.serviceWorker.getRegistrations().then(registrations => {
                const workers = registrations.map(reg => ({
                  scope: reg.scope,
                  active: reg.active ? {
                    state: reg.active.state,
                    scriptURL: reg.active.scriptURL
                  } : null,
                  installing: reg.installing ? {
                    state: reg.installing.state,
                    scriptURL: reg.installing.scriptURL
                  } : null,
                  waiting: reg.waiting ? {
                    state: reg.waiting.state,
                    scriptURL: reg.waiting.scriptURL
                  } : null
                }));
                window.__arcServiceWorkerResult = JSON.stringify({
                  count: workers.length,
                  workers: workers
                });
              }).catch(e => {
                window.__arcServiceWorkerResult = JSON.stringify({ error: e.message });
              });
              return JSON.stringify({ status: 'fetching', message: '取得中...もう一度このコマンドを実行してください' });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_unregister_service_worker': {
            const { tab_index } = args;
            const jsCode = `(function() {
              if (!('serviceWorker' in navigator)) {
                return JSON.stringify({ error: 'ServiceWorkerはこのブラウザでサポートされていません' });
              }
              // すでに結果がある場合はそれを返す
              if (window.__arcUnregisterSWResult) {
                const result = window.__arcUnregisterSWResult;
                delete window.__arcUnregisterSWResult;
                return result;
              }
              // 非同期で解除してグローバル変数に保存
              navigator.serviceWorker.getRegistrations().then(async registrations => {
                let unregistered = 0;
                for (const reg of registrations) {
                  await reg.unregister();
                  unregistered++;
                }
                window.__arcUnregisterSWResult = JSON.stringify({
                  message: unregistered + '個のServiceWorkerを解除しました',
                  count: unregistered
                });
              }).catch(e => {
                window.__arcUnregisterSWResult = JSON.stringify({ error: e.message });
              });
              return JSON.stringify({ status: 'processing', message: '解除中...もう一度このコマンドを実行してください' });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // IndexedDB
          case 'arc_get_indexeddb_info': {
            const { database, tab_index } = args;
            const escapedDatabase = database ? this.escapeForAppleScript(database) : '';
            const jsCode = `(function() {
              if (!('indexedDB' in window)) {
                return JSON.stringify({ error: 'IndexedDBはこのブラウザでサポートされていません' });
              }
              // すでに結果がある場合はそれを返す
              if (window.__arcIndexedDBResult) {
                const result = window.__arcIndexedDBResult;
                delete window.__arcIndexedDBResult;
                return result;
              }
              // 非同期で取得してグローバル変数に保存
              indexedDB.databases().then(async databases => {
                ${database ? `
                const targetDb = databases.find(db => db.name === "${escapedDatabase}");
                if (!targetDb) {
                  window.__arcIndexedDBResult = JSON.stringify({ error: 'データベースが見つかりません: ${escapedDatabase}' });
                  return;
                }
                const dbs = [targetDb];
                ` : 'const dbs = databases;'}

                const result = [];
                for (const dbInfo of dbs) {
                  try {
                    const db = await new Promise((resolve, reject) => {
                      const request = indexedDB.open(dbInfo.name);
                      request.onsuccess = () => resolve(request.result);
                      request.onerror = () => reject(request.error);
                    });
                    const stores = Array.from(db.objectStoreNames);
                    result.push({
                      name: dbInfo.name,
                      version: db.version,
                      objectStores: stores
                    });
                    db.close();
                  } catch (e) {
                    result.push({
                      name: dbInfo.name,
                      error: e.message
                    });
                  }
                }
                window.__arcIndexedDBResult = JSON.stringify({
                  count: result.length,
                  databases: result
                });
              }).catch(e => {
                window.__arcIndexedDBResult = JSON.stringify({ error: e.message });
              });
              return JSON.stringify({ status: 'fetching', message: '取得中...もう一度このコマンドを実行してください' });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_clear_indexeddb': {
            const { database, tab_index } = args;
            const escapedDb = this.escapeForAppleScript(database);
            const jsCode = `(function() {
              // すでに結果がある場合はそれを返す
              if (window.__arcClearIndexedDBResult) {
                const result = window.__arcClearIndexedDBResult;
                delete window.__arcClearIndexedDBResult;
                return result;
              }
              // 非同期で削除してグローバル変数に保存
              const request = indexedDB.deleteDatabase("${escapedDb}");
              request.onsuccess = () => {
                window.__arcClearIndexedDBResult = JSON.stringify({
                  message: 'データベース "${escapedDb}" を削除しました'
                });
              };
              request.onerror = () => {
                window.__arcClearIndexedDBResult = JSON.stringify({
                  error: '削除に失敗しました: ' + request.error
                });
              };
              request.onblocked = () => {
                window.__arcClearIndexedDBResult = JSON.stringify({
                  warning: 'データベースがブロックされています。他のタブで開いている可能性があります'
                });
              };
              return JSON.stringify({ status: 'processing', message: '削除中...もう一度このコマンドを実行してください' });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // Network/API監視
          case 'arc_start_network_monitor': {
            const { filter = '', tab_index } = args;
            const escapedFilter = this.escapeForAppleScript(filter);
            const jsCode = `(function() {
              if (window.__arcNetworkMonitor) {
                return JSON.stringify({ warning: 'ネットワーク監視は既に実行中です' });
              }

              // 過去のリクエストを保存（最大3回分のナビゲーション）
              if (!window.__arcPreservedRequests) {
                window.__arcPreservedRequests = [];
              }
              if (window.__arcNetworkRequests && window.__arcNetworkRequests.length > 0) {
                window.__arcPreservedRequests.push(...window.__arcNetworkRequests);
                // 最大300件に制限
                if (window.__arcPreservedRequests.length > 300) {
                  window.__arcPreservedRequests = window.__arcPreservedRequests.slice(-300);
                }
              }
              window.__arcNetworkRequests = [];
              window.__arcNetworkFilter = "${escapedFilter}";
              window.__arcNetworkRequestId = 0;

              // Fetch のオーバーライド
              const originalFetch = window.fetch;
              window.__arcOriginalFetch = originalFetch;
              window.fetch = async function(...args) {
                const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                const method = args[1]?.method || 'GET';
                const startTime = Date.now();

                const entry = {
                  id: window.__arcNetworkRequestId++,
                  type: 'fetch',
                  url: url,
                  method: method,
                  startTime: new Date(startTime).toISOString(),
                  status: 'pending'
                };

                if (!window.__arcNetworkFilter || url.includes(window.__arcNetworkFilter)) {
                  window.__arcNetworkRequests.push(entry);
                }

                try {
                  const response = await originalFetch.apply(this, args);
                  entry.status = response.status;
                  entry.statusText = response.statusText;
                  entry.duration = Date.now() - startTime;
                  return response;
                } catch (error) {
                  entry.status = 'error';
                  entry.error = error.message;
                  entry.duration = Date.now() - startTime;
                  throw error;
                }
              };

              // XHR のオーバーライド
              const originalXHROpen = XMLHttpRequest.prototype.open;
              const originalXHRSend = XMLHttpRequest.prototype.send;
              window.__arcOriginalXHROpen = originalXHROpen;
              window.__arcOriginalXHRSend = originalXHRSend;

              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this.__arcMethod = method;
                this.__arcUrl = url;
                return originalXHROpen.apply(this, [method, url, ...rest]);
              };

              XMLHttpRequest.prototype.send = function(...args) {
                const startTime = Date.now();
                const entry = {
                  id: window.__arcNetworkRequestId++,
                  type: 'xhr',
                  url: this.__arcUrl,
                  method: this.__arcMethod,
                  startTime: new Date(startTime).toISOString(),
                  status: 'pending'
                };

                if (!window.__arcNetworkFilter || this.__arcUrl.includes(window.__arcNetworkFilter)) {
                  window.__arcNetworkRequests.push(entry);
                }

                this.addEventListener('load', () => {
                  entry.status = this.status;
                  entry.statusText = this.statusText;
                  entry.duration = Date.now() - startTime;
                });

                this.addEventListener('error', () => {
                  entry.status = 'error';
                  entry.duration = Date.now() - startTime;
                });

                return originalXHRSend.apply(this, args);
              };

              window.__arcNetworkMonitor = true;
              return JSON.stringify({
                message: 'ネットワーク監視を開始しました',
                filter: window.__arcNetworkFilter || '(フィルタなし)'
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_network_requests': {
            const { limit = 50, includePreservedRequests = false, tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcNetworkRequests) {
                return JSON.stringify({ error: 'ネットワーク監視が開始されていません。arc_start_network_monitorを先に実行してください' });
              }
              let allRequests = window.__arcNetworkRequests;
              let preservedCount = 0;
              if (${includePreservedRequests} && window.__arcPreservedRequests) {
                preservedCount = window.__arcPreservedRequests.length;
                allRequests = [...window.__arcPreservedRequests, ...window.__arcNetworkRequests];
              }
              const requests = allRequests.slice(-${limit});
              return JSON.stringify({
                count: requests.length,
                total: allRequests.length,
                currentCount: window.__arcNetworkRequests.length,
                preservedCount: preservedCount,
                requests: requests
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_stop_network_monitor': {
            const { tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcNetworkMonitor) {
                return JSON.stringify({ warning: 'ネットワーク監視は実行されていません' });
              }

              // Fetch を復元
              if (window.__arcOriginalFetch) {
                window.fetch = window.__arcOriginalFetch;
                delete window.__arcOriginalFetch;
              }

              // XHR を復元
              if (window.__arcOriginalXHROpen) {
                XMLHttpRequest.prototype.open = window.__arcOriginalXHROpen;
                delete window.__arcOriginalXHROpen;
              }
              if (window.__arcOriginalXHRSend) {
                XMLHttpRequest.prototype.send = window.__arcOriginalXHRSend;
                delete window.__arcOriginalXHRSend;
              }

              const count = window.__arcNetworkRequests ? window.__arcNetworkRequests.length : 0;
              delete window.__arcNetworkRequests;
              delete window.__arcNetworkFilter;
              delete window.__arcNetworkMonitor;

              return JSON.stringify({
                message: 'ネットワーク監視を停止しました',
                capturedRequests: count
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // Console監視
          case 'arc_start_console_capture': {
            const { levels = ['log', 'info', 'warn', 'error', 'debug'], tab_index } = args;
            const levelsJson = JSON.stringify(levels);
            const jsCode = `(function() {
              if (window.__arcConsoleCapture) {
                return JSON.stringify({ warning: 'コンソールキャプチャは既に実行中です' });
              }

              // 過去のログを保存（最大3回分のナビゲーション）
              if (!window.__arcPreservedLogs) {
                window.__arcPreservedLogs = [];
              }
              if (window.__arcConsoleLogs && window.__arcConsoleLogs.length > 0) {
                window.__arcPreservedLogs.push(...window.__arcConsoleLogs);
                // 最大500件に制限
                if (window.__arcPreservedLogs.length > 500) {
                  window.__arcPreservedLogs = window.__arcPreservedLogs.slice(-500);
                }
              }
              window.__arcConsoleLogs = [];
              window.__arcOriginalConsole = {};
              window.__arcConsoleLogId = 0;
              const levels = ${levelsJson};

              levels.forEach(level => {
                window.__arcOriginalConsole[level] = console[level];
                console[level] = function(...args) {
                  window.__arcConsoleLogs.push({
                    id: window.__arcConsoleLogId++,
                    level: level,
                    timestamp: new Date().toISOString(),
                    message: args.map(arg => {
                      try {
                        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                      } catch (e) {
                        return String(arg);
                      }
                    }).join(' ')
                  });
                  window.__arcOriginalConsole[level].apply(console, args);
                };
              });

              // エラーイベントもキャプチャ
              window.__arcErrorHandler = function(event) {
                window.__arcConsoleLogs.push({
                  id: window.__arcConsoleLogId++,
                  level: 'error',
                  timestamp: new Date().toISOString(),
                  message: event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno,
                  type: 'uncaught'
                });
              };
              window.addEventListener('error', window.__arcErrorHandler);

              // unhandled promise rejection もキャプチャ
              window.__arcRejectionHandler = function(event) {
                window.__arcConsoleLogs.push({
                  id: window.__arcConsoleLogId++,
                  level: 'error',
                  timestamp: new Date().toISOString(),
                  message: 'Unhandled Promise Rejection: ' + (event.reason?.message || event.reason || 'Unknown'),
                  type: 'unhandledrejection'
                });
              };
              window.addEventListener('unhandledrejection', window.__arcRejectionHandler);

              window.__arcConsoleCapture = true;
              return JSON.stringify({
                message: 'コンソールキャプチャを開始しました',
                levels: levels
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_console_logs': {
            const { level = 'all', limit = 100, includePreservedMessages = false, tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcConsoleLogs) {
                return JSON.stringify({ error: 'コンソールキャプチャが開始されていません。arc_start_console_captureを先に実行してください' });
              }
              let allLogs = window.__arcConsoleLogs;
              let preservedCount = 0;
              if (${includePreservedMessages} && window.__arcPreservedLogs) {
                preservedCount = window.__arcPreservedLogs.length;
                allLogs = [...window.__arcPreservedLogs, ...window.__arcConsoleLogs];
              }
              let logs = allLogs;
              if ("${level}" !== 'all') {
                logs = logs.filter(log => log.level === "${level}");
              }
              logs = logs.slice(-${limit});

              const summary = {
                log: allLogs.filter(l => l.level === 'log').length,
                info: allLogs.filter(l => l.level === 'info').length,
                warn: allLogs.filter(l => l.level === 'warn').length,
                error: allLogs.filter(l => l.level === 'error').length,
                debug: allLogs.filter(l => l.level === 'debug').length
              };

              return JSON.stringify({
                filter: "${level}",
                count: logs.length,
                total: allLogs.length,
                currentCount: window.__arcConsoleLogs.length,
                preservedCount: preservedCount,
                summary: summary,
                logs: logs
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_stop_console_capture': {
            const { tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcConsoleCapture) {
                return JSON.stringify({ warning: 'コンソールキャプチャは実行されていません' });
              }

              // console を復元
              if (window.__arcOriginalConsole) {
                Object.keys(window.__arcOriginalConsole).forEach(level => {
                  console[level] = window.__arcOriginalConsole[level];
                });
                delete window.__arcOriginalConsole;
              }

              // イベントリスナーを削除
              if (window.__arcErrorHandler) {
                window.removeEventListener('error', window.__arcErrorHandler);
                delete window.__arcErrorHandler;
              }
              if (window.__arcRejectionHandler) {
                window.removeEventListener('unhandledrejection', window.__arcRejectionHandler);
                delete window.__arcRejectionHandler;
              }

              const count = window.__arcConsoleLogs ? window.__arcConsoleLogs.length : 0;
              delete window.__arcConsoleLogs;
              delete window.__arcConsoleCapture;

              return JSON.stringify({
                message: 'コンソールキャプチャを停止しました',
                capturedLogs: count
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === バックエンド開発向け機能 ===
          // API テスト
          case 'arc_fetch': {
            const { url, method = 'GET', headers = {}, body, request_id, tab_index } = args;
            const reqId = request_id || `req_${Date.now()}`;
            const escapedUrl = this.escapeForAppleScript(url);
            // ヘッダーは JSON.stringify で二重にエンコードしない
            const headersJson = JSON.stringify(headers);
            const escapedBody = body ? this.escapeForAppleScript(body) : '';

            const jsCode = `(function() {
              if (!window.__arcFetchResults) {
                window.__arcFetchResults = {};
              }

              const reqId = "${reqId}";
              const options = {
                method: "${method}",
                headers: JSON.parse("${this.escapeForAppleScript(headersJson)}"),
                credentials: 'include'
              };

              ${body ? `options.body = "${escapedBody}";` : ''}

              window.__arcFetchResults[reqId] = { status: 'pending', startTime: Date.now() };

              fetch("${escapedUrl}", options)
                .then(async response => {
                  const contentType = response.headers.get('content-type') || '';
                  let data;
                  if (contentType.includes('application/json')) {
                    data = await response.json();
                  } else {
                    data = await response.text();
                  }

                  const headers = {};
                  response.headers.forEach((v, k) => headers[k] = v);

                  window.__arcFetchResults[reqId] = {
                    status: 'completed',
                    statusCode: response.status,
                    statusText: response.statusText,
                    headers: headers,
                    data: data,
                    duration: Date.now() - window.__arcFetchResults[reqId].startTime
                  };
                })
                .catch(error => {
                  window.__arcFetchResults[reqId] = {
                    status: 'error',
                    error: error.message,
                    duration: Date.now() - window.__arcFetchResults[reqId].startTime
                  };
                });

              return JSON.stringify({
                message: 'リクエストを送信しました',
                request_id: reqId,
                url: "${escapedUrl}",
                method: "${method}"
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_fetch_result': {
            const { request_id, tab_index } = args;
            const escapedReqId = this.escapeForAppleScript(request_id);

            const jsCode = `(function() {
              if (!window.__arcFetchResults) {
                return JSON.stringify({ error: 'フェッチ結果がありません' });
              }

              const result = window.__arcFetchResults["${escapedReqId}"];
              if (!result) {
                return JSON.stringify({ error: 'リクエストID "${escapedReqId}" が見つかりません' });
              }

              if (result.status === 'pending') {
                return JSON.stringify({ status: 'pending', message: '処理中...もう一度このコマンドを実行してください' });
              }

              // 完了したら結果を削除
              delete window.__arcFetchResults["${escapedReqId}"];

              return JSON.stringify(result);
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // Storage 操作
          case 'arc_set_storage': {
            const { key, value, storage_type = 'localStorage', tab_index } = args;
            if (storage_type !== 'localStorage' && storage_type !== 'sessionStorage') {
              throw new Error(`storage_type は 'localStorage' または 'sessionStorage' のみ指定可能です: ${storage_type}`);
            }
            const escapedKey = this.escapeForAppleScript(key);
            const escapedValue = this.escapeForAppleScript(value);

            const jsCode = `(function() {
              try {
                ${storage_type}.setItem("${escapedKey}", "${escapedValue}");
                return JSON.stringify({
                  message: "${storage_type} に値を設定しました",
                  key: "${escapedKey}",
                  value: "${escapedValue}"
                });
              } catch (e) {
                return JSON.stringify({ error: e.message });
              }
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_storage_item': {
            const { key, storage_type = 'localStorage', tab_index } = args;
            if (storage_type !== 'localStorage' && storage_type !== 'sessionStorage') {
              throw new Error(`storage_type は 'localStorage' または 'sessionStorage' のみ指定可能です: ${storage_type}`);
            }
            const escapedKey = this.escapeForAppleScript(key);

            const jsCode = `(function() {
              try {
                const value = ${storage_type}.getItem("${escapedKey}");
                if (value === null) {
                  return JSON.stringify({ key: "${escapedKey}", value: null, exists: false });
                }
                // JSON として解析を試みる
                let parsed = value;
                try {
                  parsed = JSON.parse(value);
                } catch (e) {
                  // JSON でない場合はそのまま
                }
                return JSON.stringify({
                  key: "${escapedKey}",
                  value: parsed,
                  raw: value,
                  exists: true
                });
              } catch (e) {
                return JSON.stringify({ error: e.message });
              }
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_remove_storage_item': {
            const { key, storage_type = 'localStorage', tab_index } = args;
            if (storage_type !== 'localStorage' && storage_type !== 'sessionStorage') {
              throw new Error(`storage_type は 'localStorage' または 'sessionStorage' のみ指定可能です: ${storage_type}`);
            }
            const escapedKey = this.escapeForAppleScript(key);

            const jsCode = `(function() {
              try {
                const existed = ${storage_type}.getItem("${escapedKey}") !== null;
                ${storage_type}.removeItem("${escapedKey}");
                return JSON.stringify({
                  message: existed ? 'キー "${escapedKey}" を削除しました' : 'キー "${escapedKey}" は存在しませんでした',
                  key: "${escapedKey}",
                  existed: existed
                });
              } catch (e) {
                return JSON.stringify({ error: e.message });
              }
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // DOM 監視
          case 'arc_watch_element': {
            const { selector, watch_id, options = {}, tab_index } = args;
            const watchId = watch_id || `watch_${Date.now()}`;
            const escapedSelector = this.escapeForAppleScript(selector);
            const watchOptions = {
              childList: options.childList !== false,
              attributes: options.attributes !== false,
              characterData: options.characterData !== false,
              subtree: options.subtree !== false,
              attributeOldValue: true,
              characterDataOldValue: true
            };

            const jsCode = `(function() {
              if (!window.__arcWatchers) {
                window.__arcWatchers = {};
              }

              const watchId = "${watchId}";
              const selector = "${escapedSelector}";
              const element = document.querySelector(selector);

              if (!element) {
                return JSON.stringify({ error: '要素が見つかりません: ${escapedSelector}' });
              }

              if (window.__arcWatchers[watchId]) {
                return JSON.stringify({ warning: '監視ID "${watchId}" は既に使用されています' });
              }

              const changes = [];
              const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                  const change = {
                    timestamp: new Date().toISOString(),
                    type: mutation.type
                  };

                  if (mutation.type === 'attributes') {
                    change.attributeName = mutation.attributeName;
                    change.oldValue = mutation.oldValue;
                    change.newValue = mutation.target.getAttribute(mutation.attributeName);
                  } else if (mutation.type === 'characterData') {
                    change.oldValue = mutation.oldValue;
                    change.newValue = mutation.target.textContent;
                  } else if (mutation.type === 'childList') {
                    change.addedNodes = mutation.addedNodes.length;
                    change.removedNodes = mutation.removedNodes.length;
                    if (mutation.addedNodes.length > 0) {
                      change.addedContent = Array.from(mutation.addedNodes)
                        .map(n => n.textContent || n.outerHTML || '')
                        .slice(0, 3);
                    }
                    if (mutation.removedNodes.length > 0) {
                      change.removedContent = Array.from(mutation.removedNodes)
                        .map(n => n.textContent || n.outerHTML || '')
                        .slice(0, 3);
                    }
                  }

                  changes.push(change);
                });
              });

              observer.observe(element, ${JSON.stringify(watchOptions)});

              window.__arcWatchers[watchId] = {
                observer: observer,
                changes: changes,
                selector: selector,
                startTime: new Date().toISOString()
              };

              return JSON.stringify({
                message: 'DOM監視を開始しました',
                watch_id: watchId,
                selector: selector,
                options: ${JSON.stringify(watchOptions)}
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_element_changes': {
            const { watch_id, limit = 50, tab_index } = args;
            const escapedWatchId = this.escapeForAppleScript(watch_id);

            const jsCode = `(function() {
              if (!window.__arcWatchers || !window.__arcWatchers["${escapedWatchId}"]) {
                return JSON.stringify({ error: '監視ID "${escapedWatchId}" が見つかりません' });
              }

              const watcher = window.__arcWatchers["${escapedWatchId}"];
              const changes = watcher.changes.slice(-${limit});

              return JSON.stringify({
                watch_id: "${escapedWatchId}",
                selector: watcher.selector,
                startTime: watcher.startTime,
                count: changes.length,
                total: watcher.changes.length,
                changes: changes
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_stop_watch_element': {
            const { watch_id, tab_index } = args;
            const escapedWatchId = this.escapeForAppleScript(watch_id);

            const jsCode = `(function() {
              if (!window.__arcWatchers || !window.__arcWatchers["${escapedWatchId}"]) {
                return JSON.stringify({ error: '監視ID "${escapedWatchId}" が見つかりません' });
              }

              const watcher = window.__arcWatchers["${escapedWatchId}"];
              watcher.observer.disconnect();
              const count = watcher.changes.length;

              delete window.__arcWatchers["${escapedWatchId}"];

              return JSON.stringify({
                message: 'DOM監視を停止しました',
                watch_id: "${escapedWatchId}",
                capturedChanges: count
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // スクリーンショット
          case 'arc_take_screenshot': {
            const { mode = 'selection', save_path } = args;
            const fs = await import('fs');
            const path = await import('path');
            const os = await import('os');

            // タイムスタンプ生成（YYYYMMDD_HHmmss形式）
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
              String(now.getMonth() + 1).padStart(2, '0') +
              String(now.getDate()).padStart(2, '0') + '_' +
              String(now.getHours()).padStart(2, '0') +
              String(now.getMinutes()).padStart(2, '0') +
              String(now.getSeconds()).padStart(2, '0');

            // デフォルトの保存先（プロジェクトルートまたは現在のディレクトリ）
            const defaultPath = save_path || `screenshot_${mode}_${timestamp}.png`;

            // === selection モード: ユーザーが範囲を選択してキャプチャ ===
            if (mode === 'selection') {
              try {
                // Arc をアクティブにする
                await this.executeAppleScript(`tell application "Arc" to activate`);
                await new Promise(resolve => setTimeout(resolve, 300));

                // インタラクティブモード: ユーザーが範囲をドラッグして選択
                // -i: インタラクティブ, -s: 選択モード（範囲選択のみ）
                await execFileAsync('screencapture', ['-i', '-s', defaultPath]);

                // ファイルを確認（ユーザーがキャンセルした場合は作成されない）
                if (fs.existsSync(defaultPath)) {
                  const stats = fs.statSync(defaultPath);
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'completed',
                        mode: 'selection',
                        message: `スクリーンショットを保存しました: ${defaultPath}`,
                        size: stats.size,
                        path: defaultPath
                      }, null, 2)
                    }]
                  };
                } else {
                  // ユーザーがキャンセルした場合
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'cancelled',
                        message: 'スクリーンショットがキャンセルされました'
                      }, null, 2)
                    }]
                  };
                }
              } catch (error) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({ error: `スクリーンショットエラー: ${error.message}` })
                  }],
                  isError: true
                };
              }
            }

            // === window モード: ユーザーがウィンドウをクリックしてキャプチャ ===
            if (mode === 'window') {
              try {
                // Arc をアクティブにする
                await this.executeAppleScript(`tell application "Arc" to activate`);
                await new Promise(resolve => setTimeout(resolve, 300));

                // インタラクティブモード: ユーザーがウィンドウをクリックして選択
                // -i: インタラクティブ, -w: ウィンドウモード, -o: 影なし
                await execFileAsync('screencapture', ['-i', '-w', '-o', defaultPath]);

                // ファイルを確認
                if (fs.existsSync(defaultPath)) {
                  const stats = fs.statSync(defaultPath);
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'completed',
                        mode: 'window',
                        message: `スクリーンショットを保存しました: ${defaultPath}`,
                        size: stats.size,
                        path: defaultPath
                      }, null, 2)
                    }]
                  };
                } else {
                  // ユーザーがキャンセルした場合
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'cancelled',
                        message: 'スクリーンショットがキャンセルされました'
                      }, null, 2)
                    }]
                  };
                }
              } catch (error) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({ error: `スクリーンショットエラー: ${error.message}` })
                  }],
                  isError: true
                };
              }
            }

            // 不明なモード
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: `不明なモード: ${mode}。selection または window を指定してください。` })
              }],
              isError: true
            };
          }

          // === ページ操作（DOM操作） ===
          case 'arc_click': {
            const { selector, dblClick = false, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);

            const clickType = dblClick ? 'dblclick' : 'click';
            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const event = new MouseEvent("${clickType}", {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(event);
                if (!${dblClick}) {
                  el.click();
                }
                return JSON.stringify({ success: true, selector: "${escapedSelector}", action: "${clickType}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_hover': {
            const { selector, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);

            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const event = new MouseEvent('mouseover', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(event);
                const enterEvent = new MouseEvent('mouseenter', {
                  bubbles: false,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(enterEvent);
                return JSON.stringify({ success: true, selector: "${escapedSelector}", action: "hover" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_fill': {
            const { selector, value, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);
            const escapedValue = this.escapeForAppleScript(value);

            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();

                if (el.tagName === 'SELECT') {
                  el.value = "${escapedValue}";
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                  el.value = "${escapedValue}";
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  el.textContent = "${escapedValue}";
                }
                return JSON.stringify({ success: true, selector: "${escapedSelector}", value: "${escapedValue}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_fill_form': {
            const { fields, tab_index } = args;

            const jsCode = `
              (function() {
                const fields = ${JSON.stringify(fields)};
                const results = [];
                for (const field of fields) {
                  const el = document.querySelector(field.selector);
                  if (!el) {
                    results.push({ selector: field.selector, error: "要素が見つかりません" });
                    continue;
                  }
                  el.focus();
                  if (el.tagName === 'SELECT') {
                    el.value = field.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = field.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  results.push({ selector: field.selector, success: true });
                }
                return JSON.stringify({ results });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_press_key': {
            const { key, selector, tab_index } = args;
            const escapedKey = this.escapeForAppleScript(key);
            const escapedSelector = selector ? this.escapeForAppleScript(selector) : '';

            const jsCode = `
              (function() {
                let targetEl = document.activeElement;
                ${selector ? `
                  targetEl = document.querySelector("${escapedSelector}");
                  if (!targetEl) {
                    return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                  }
                  targetEl.focus();
                ` : ''}

                const keyStr = "${escapedKey}";
                const parts = keyStr.split('+');
                const keyName = parts[parts.length - 1];
                const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

                const event = new KeyboardEvent('keydown', {
                  key: keyName,
                  code: 'Key' + keyName.toUpperCase(),
                  bubbles: true,
                  cancelable: true,
                  ctrlKey: modifiers.includes('control') || modifiers.includes('ctrl'),
                  altKey: modifiers.includes('alt'),
                  shiftKey: modifiers.includes('shift'),
                  metaKey: modifiers.includes('meta') || modifiers.includes('command') || modifiers.includes('cmd')
                });
                targetEl.dispatchEvent(event);

                const keyupEvent = new KeyboardEvent('keyup', {
                  key: keyName,
                  code: 'Key' + keyName.toUpperCase(),
                  bubbles: true,
                  cancelable: true
                });
                targetEl.dispatchEvent(keyupEvent);

                return JSON.stringify({ success: true, key: "${escapedKey}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_drag': {
            const { from_selector, to_selector, tab_index } = args;
            const escapedFrom = this.escapeForAppleScript(from_selector);
            const escapedTo = this.escapeForAppleScript(to_selector);

            const jsCode = `
              (function() {
                const fromEl = document.querySelector("${escapedFrom}");
                const toEl = document.querySelector("${escapedTo}");

                if (!fromEl) {
                  return JSON.stringify({ error: "ドラッグ元の要素が見つかりません: ${escapedFrom}" });
                }
                if (!toEl) {
                  return JSON.stringify({ error: "ドロップ先の要素が見つかりません: ${escapedTo}" });
                }

                const fromRect = fromEl.getBoundingClientRect();
                const toRect = toEl.getBoundingClientRect();

                const dragStartEvent = new DragEvent('dragstart', {
                  bubbles: true,
                  cancelable: true,
                  clientX: fromRect.left + fromRect.width / 2,
                  clientY: fromRect.top + fromRect.height / 2
                });
                fromEl.dispatchEvent(dragStartEvent);

                const dragOverEvent = new DragEvent('dragover', {
                  bubbles: true,
                  cancelable: true,
                  clientX: toRect.left + toRect.width / 2,
                  clientY: toRect.top + toRect.height / 2
                });
                toEl.dispatchEvent(dragOverEvent);

                const dropEvent = new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  clientX: toRect.left + toRect.width / 2,
                  clientY: toRect.top + toRect.height / 2
                });
                toEl.dispatchEvent(dropEvent);

                const dragEndEvent = new DragEvent('dragend', {
                  bubbles: true,
                  cancelable: true
                });
                fromEl.dispatchEvent(dragEndEvent);

                return JSON.stringify({ success: true, from: "${escapedFrom}", to: "${escapedTo}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_upload_file': {
            const { selector, file_path, tab_index } = args;

            // ファイルアップロードはJavaScriptからセキュリティ上直接できないため、
            // ファイル選択ダイアログをトリガーする方法を案内
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'ファイルアップロードはセキュリティ上の制約により、JavaScriptから直接実行できません。',
                  suggestion: 'arc_clickでファイルinputをクリックし、手動でファイルを選択するか、Playwrightを使用してください。',
                  selector: selector,
                  file_path: file_path
                })
              }],
              isError: true
            };
          }

          case 'arc_handle_dialog': {
            const { action, prompt_text, tab_index } = args;

            // ブラウザダイアログはJavaScriptから事前にフックする必要がある
            const escapedPromptText = prompt_text ? this.escapeForAppleScript(prompt_text) : '';

            const jsCode = `
              (function() {
                // ダイアログをフックして自動処理する
                const originalAlert = window.alert;
                const originalConfirm = window.confirm;
                const originalPrompt = window.prompt;

                window.alert = function(msg) {
                  console.log('Alert intercepted:', msg);
                  return undefined;
                };

                window.confirm = function(msg) {
                  console.log('Confirm intercepted:', msg);
                  return ${action === 'accept' ? 'true' : 'false'};
                };

                window.prompt = function(msg, defaultValue) {
                  console.log('Prompt intercepted:', msg);
                  return ${action === 'accept' ? `"${escapedPromptText}"` : 'null'};
                };

                return JSON.stringify({
                  success: true,
                  action: "${action}",
                  note: "ダイアログハンドラーを設定しました。次回のダイアログは自動的に処理されます。"
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_wait_for': {
            const { text, selector, timeout = 30000, tab_index } = args;
            const escapedText = text ? this.escapeForAppleScript(text) : '';
            const escapedSelector = selector ? this.escapeForAppleScript(selector) : '';

            const jsCode = `
              (function() {
                return new Promise((resolve) => {
                  const startTime = Date.now();
                  const timeoutMs = ${timeout};

                  function check() {
                    ${text ? `
                      if (document.body.innerText.includes("${escapedText}")) {
                        resolve(JSON.stringify({ success: true, found: "text", text: "${escapedText}" }));
                        return;
                      }
                    ` : ''}
                    ${selector ? `
                      if (document.querySelector("${escapedSelector}")) {
                        resolve(JSON.stringify({ success: true, found: "selector", selector: "${escapedSelector}" }));
                        return;
                      }
                    ` : ''}

                    if (Date.now() - startTime > timeoutMs) {
                      resolve(JSON.stringify({ error: "タイムアウト: 要素が見つかりませんでした", timeout: timeoutMs }));
                      return;
                    }

                    setTimeout(check, 100);
                  }

                  check();
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          // === ウィンドウ・ブラウザ操作 ===
          case 'arc_quit': {
            const { save_state = true } = args;

            const script = save_state
              ? `tell application "Arc" to quit saving yes`
              : `tell application "Arc" to quit saving no`;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Arc Browserを終了しました',
                  save_state: save_state
                })
              }]
            };
          }

          // === 拡張機能 ===
          case 'arc_get_network_request': {
            const { reqid, tab_index } = args;

            const jsCode = `
              (function() {
                if (!window.__arcNetworkRequests) {
                  return JSON.stringify({ error: "ネットワーク監視が開始されていません。先にarc_start_network_monitorを実行してください。" });
                }
                const request = window.__arcNetworkRequests.find(r => r.id === ${reqid});
                if (!request) {
                  return JSON.stringify({ error: "リクエストが見つかりません: ID ${reqid}" });
                }
                return JSON.stringify(request);
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_get_console_message': {
            const { msgid, tab_index } = args;

            const jsCode = `
              (function() {
                if (!window.__arcConsoleLogs) {
                  return JSON.stringify({ error: "コンソールキャプチャが開始されていません。先にarc_start_console_captureを実行してください。" });
                }
                const message = window.__arcConsoleLogs.find(m => m.id === ${msgid});
                if (!message) {
                  return JSON.stringify({ error: "メッセージが見つかりません: ID ${msgid}" });
                }
                return JSON.stringify(message);
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_get_performance_metrics': {
            const { tab_index } = args;

            const jsCode = `
              (function() {
                const metrics = {};

                // Navigation Timing API
                if (performance.getEntriesByType) {
                  const navTiming = performance.getEntriesByType('navigation')[0];
                  if (navTiming) {
                    metrics.navigation = {
                      dnsLookup: navTiming.domainLookupEnd - navTiming.domainLookupStart,
                      tcpConnection: navTiming.connectEnd - navTiming.connectStart,
                      serverResponse: navTiming.responseStart - navTiming.requestStart,
                      domContentLoaded: navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart,
                      domComplete: navTiming.domComplete - navTiming.domInteractive,
                      loadComplete: navTiming.loadEventEnd - navTiming.loadEventStart,
                      totalLoadTime: navTiming.loadEventEnd - navTiming.startTime
                    };
                  }

                  // Paint Timing
                  const paintTimings = performance.getEntriesByType('paint');
                  metrics.paint = {};
                  paintTimings.forEach(entry => {
                    metrics.paint[entry.name] = entry.startTime;
                  });

                  // Largest Contentful Paint
                  const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                  if (lcpEntries.length > 0) {
                    metrics.lcp = lcpEntries[lcpEntries.length - 1].startTime;
                  }
                }

                // Memory (if available)
                if (performance.memory) {
                  metrics.memory = {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                  };
                }

                // Core Web Vitals estimation
                metrics.coreWebVitals = {
                  FCP: metrics.paint ? metrics.paint['first-contentful-paint'] : null,
                  LCP: metrics.lcp || null,
                  note: "CLS and INP require PerformanceObserver and are not available via this method"
                };

                return JSON.stringify(metrics);
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_get_resource_timing': {
            const { resource_type = 'all', tab_index } = args;

            const jsCode = `
              (function() {
                const resources = performance.getEntriesByType('resource');
                let filtered = resources;

                if ("${resource_type}" !== "all") {
                  filtered = resources.filter(r => r.initiatorType === "${resource_type}");
                }

                const result = filtered.map(r => ({
                  name: r.name,
                  initiatorType: r.initiatorType,
                  duration: r.duration,
                  transferSize: r.transferSize,
                  encodedBodySize: r.encodedBodySize,
                  decodedBodySize: r.decodedBodySize,
                  startTime: r.startTime,
                  responseEnd: r.responseEnd,
                  timing: {
                    dns: r.domainLookupEnd - r.domainLookupStart,
                    tcp: r.connectEnd - r.connectStart,
                    ttfb: r.responseStart - r.requestStart,
                    download: r.responseEnd - r.responseStart
                  }
                }));

                return JSON.stringify({
                  count: result.length,
                  totalTransferSize: result.reduce((sum, r) => sum + (r.transferSize || 0), 0),
                  resources: result.slice(0, 50) // 最大50件
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_emulate_network': {
            const { preset, tab_index } = args;

            // ネットワークエミュレーションの設定
            const presets = {
              'offline': { online: false, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
              'slow-3g': { online: true, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 },
              'fast-3g': { online: true, latency: 150, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
              'slow-4g': { online: true, latency: 100, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 },
              'fast-4g': { online: true, latency: 50, downloadThroughput: 10 * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 },
              'no-throttle': { online: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
            };

            const config = presets[preset];

            const jsCode = `
              (function() {
                // ネットワーク状態をシミュレート
                window.__arcNetworkEmulation = ${JSON.stringify(config)};

                // オフラインモードの場合
                if (!${config.online}) {
                  // Service Workerにオフラインモードを通知
                  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'OFFLINE_MODE', enabled: true });
                  }
                }

                // fetchをラップしてレイテンシをシミュレート
                if (!window.__originalFetch) {
                  window.__originalFetch = window.fetch;
                  window.fetch = async function(...args) {
                    const emulation = window.__arcNetworkEmulation;
                    if (!emulation.online) {
                      throw new Error('Network is offline');
                    }
                    if (emulation.latency > 0) {
                      await new Promise(r => setTimeout(r, emulation.latency));
                    }
                    return window.__originalFetch.apply(this, args);
                  };
                }

                return JSON.stringify({
                  success: true,
                  preset: "${preset}",
                  config: ${JSON.stringify(config)},
                  note: "ネットワークエミュレーションを設定しました。fetch APIに遅延が追加されます。"
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_emulate_geolocation': {
            const { latitude, longitude, accuracy = 100, tab_index } = args;

            const jsCode = `
              (function() {
                // Geolocation APIをオーバーライド
                const mockPosition = {
                  coords: {
                    latitude: ${latitude},
                    longitude: ${longitude},
                    accuracy: ${accuracy},
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                  },
                  timestamp: Date.now()
                };

                navigator.geolocation.getCurrentPosition = function(success, error, options) {
                  setTimeout(() => success(mockPosition), 100);
                };

                navigator.geolocation.watchPosition = function(success, error, options) {
                  const watchId = Math.random();
                  setTimeout(() => success(mockPosition), 100);
                  return watchId;
                };

                return JSON.stringify({
                  success: true,
                  latitude: ${latitude},
                  longitude: ${longitude},
                  accuracy: ${accuracy},
                  note: "位置情報をエミュレートしました。getCurrentPositionとwatchPositionがオーバーライドされています。"
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_emulate_cpu': {
            const { slowdown_factor, tab_index } = args;

            const jsCode = `
              (function() {
                // CPUスロットリングをシミュレート（setTimeoutとrequestAnimationFrameを遅延）
                window.__arcCpuSlowdown = ${slowdown_factor};

                if (!window.__originalSetTimeout) {
                  window.__originalSetTimeout = window.setTimeout;
                  window.setTimeout = function(callback, delay, ...args) {
                    const slowdown = window.__arcCpuSlowdown || 1;
                    return window.__originalSetTimeout(callback, delay * slowdown, ...args);
                  };
                }

                if (!window.__originalSetInterval) {
                  window.__originalSetInterval = window.setInterval;
                  window.setInterval = function(callback, delay, ...args) {
                    const slowdown = window.__arcCpuSlowdown || 1;
                    return window.__originalSetInterval(callback, delay * slowdown, ...args);
                  };
                }

                if (!window.__originalRAF) {
                  window.__originalRAF = window.requestAnimationFrame;
                  window.requestAnimationFrame = function(callback) {
                    const slowdown = window.__arcCpuSlowdown || 1;
                    if (slowdown > 1) {
                      return window.__originalSetTimeout(() => {
                        window.__originalRAF(callback);
                      }, (1000 / 60) * (slowdown - 1));
                    }
                    return window.__originalRAF(callback);
                  };
                }

                return JSON.stringify({
                  success: true,
                  slowdown_factor: ${slowdown_factor},
                  note: "CPUスロットリングをシミュレートしました。setTimeout、setInterval、requestAnimationFrameが遅延されます。"
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_measure_performance': {
            const { tab_index } = args;

            const jsCode = `
              (function() {
                const result = {
                  timestamp: new Date().toISOString(),
                  url: window.location.href,
                  timing: {},
                  resources: {},
                  memory: null
                };

                // Navigation Timing
                const navTiming = performance.getEntriesByType('navigation')[0];
                if (navTiming) {
                  result.timing = {
                    // 接続関連
                    dnsLookup: Math.round(navTiming.domainLookupEnd - navTiming.domainLookupStart),
                    tcpConnect: Math.round(navTiming.connectEnd - navTiming.connectStart),
                    sslHandshake: navTiming.secureConnectionStart > 0 ? Math.round(navTiming.connectEnd - navTiming.secureConnectionStart) : 0,

                    // リクエスト/レスポンス
                    ttfb: Math.round(navTiming.responseStart - navTiming.requestStart),
                    responseTime: Math.round(navTiming.responseEnd - navTiming.responseStart),

                    // DOM処理
                    domParsing: Math.round(navTiming.domInteractive - navTiming.responseEnd),
                    domContentLoaded: Math.round(navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart),
                    domComplete: Math.round(navTiming.domComplete - navTiming.domInteractive),

                    // 総合
                    loadEvent: Math.round(navTiming.loadEventEnd - navTiming.loadEventStart),
                    totalPageLoad: Math.round(navTiming.loadEventEnd - navTiming.startTime)
                  };
                }

                // Paint Timing
                const paintEntries = performance.getEntriesByType('paint');
                result.paint = {};
                paintEntries.forEach(entry => {
                  result.paint[entry.name] = Math.round(entry.startTime);
                });

                // LCP
                const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                if (lcpEntries.length > 0) {
                  const lcp = lcpEntries[lcpEntries.length - 1];
                  result.lcp = {
                    time: Math.round(lcp.startTime),
                    element: lcp.element ? lcp.element.tagName : null,
                    size: lcp.size
                  };
                }

                // Resource Summary
                const resources = performance.getEntriesByType('resource');
                const byType = {};
                resources.forEach(r => {
                  const type = r.initiatorType || 'other';
                  if (!byType[type]) {
                    byType[type] = { count: 0, totalSize: 0, totalDuration: 0 };
                  }
                  byType[type].count++;
                  byType[type].totalSize += r.transferSize || 0;
                  byType[type].totalDuration += r.duration || 0;
                });
                result.resources = {
                  total: resources.length,
                  byType: byType,
                  totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0)
                };

                // Memory
                if (performance.memory) {
                  result.memory = {
                    usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
                    totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
                    jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
                  };
                }

                return JSON.stringify(result);
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `エラー: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Arc Browser Control MCP server running on stdio');
  }
}

const server = new ArcBrowserControlServer();
server.run().catch(console.error);
