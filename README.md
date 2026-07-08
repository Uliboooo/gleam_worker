# Gleam Playground

スマホのブラウザだけで [Gleam](https://gleam.run) のコードを書き、コンパイルし、実行結果を確認できるプレイグラウンドです。

- **サーバーレス**: Gleam コンパイラ (Rust) の WASM ビルドをブラウザ内で実行。コードが外部に送信されることはありません
- **モバイルファースト**: 上下 2 ペイン(ドラッグで比率変更)、ソフトキーボード直上の入力補助ツールバー、44px タッチターゲット、safe-area 対応
- **オフライン対応 PWA**: Service Worker が WASM・stdlib・アプリ本体をプリキャッシュ
- **共有 URL**: コードを deflate + base64url で URL ハッシュに格納(サーバー不要)

## セットアップ

[Bun](https://bun.sh) を使います。

```sh
bun install

# Gleam WASM コンパイラと stdlib を取得・プリコンパイル(要インターネット接続)
bun run fetch-compiler

bun run dev      # 開発サーバー
bun run build    # 本番ビルド (dist/)
bun run test     # ユニットテスト
```

> **Note**: `public/wasm/`・`public/stdlib/`・`public/precompiled/` は
> `bun run fetch-compiler` が生成します(リポジトリにはコミットしません)。
> 生成前でもアプリは起動しますが、実行ボタンは「実行不可」となり
> エラータブに案内が表示されます。
> バージョン指定は `GLEAM_VERSION=1.11.1 bun run fetch-compiler` のように行います。

## アーキテクチャ

```
エディタ (CodeMirror 6, 自作 Gleam モード)
   │ 入力停止 800ms → 自動コンパイル(診断のみ)
   ▼
CompilerService (src/compiler/service.ts)
   │ gleam_wasm (wasm-bindgen) に stdlib ソース + main.gleam を書き込み
   │ compile_package("javascript") → 生成 JS を取得
   │ 相対 import を /precompiled/ の絶対 URL に書き換え
   ▼
Runner (src/runner/) — module Worker
   │ Blob URL として動的 import、main() を実行
   │ console 出力を postMessage でストリーム、5 秒でタイムアウト terminate
   ▼
出力パネル [実行結果 | エラー | 生成JS]
```

- **stdlib の扱い**: 公式 language-tour と同方式。stdlib の `.gleam` ソースを
  コンパイラのメモリ FS に書き込んで型検査に使い、実行時の import には
  ビルド時にプリコンパイルした JS (`public/precompiled/`) を使います
- **エラー連携**: 診断メッセージから `main.gleam:行:列` を抽出し、
  エディタのインラインハイライトと「→ n 行目へ」ジャンプに反映
- **PWA**: `public/sw.js` がビルド時生成の `asset-manifest.json`(アプリ本体)と
  `wasm/manifest.json`(コンパイラ一式)をプリキャッシュ。更新検知時はトーストで再読み込みを誘導

## ディレクトリ

| パス | 内容 |
|---|---|
| `src/main.ts` | アプリ全体の配線 |
| `src/editor/` | CodeMirror 設定と Gleam ハイライト |
| `src/compiler/` | WASM コンパイラのロードと呼び出し |
| `src/runner/` | サンドボックス実行 (Worker + タイムアウト) |
| `src/ui/` | 出力パネル・ペイン分割・キーボードツールバー・シート・トースト |
| `src/lib/` | 純粋ロジック(共有 URL コーデック、import 書き換え、診断パース)— `test/` で検証 |
| `scripts/fetch-compiler.mjs` | コンパイラ・stdlib の取得とプリコンパイル |
| `scripts/make-icons.mjs` | PWA アイコン生成(Node 標準ライブラリのみ) |

## 配信 (Cloudflare Pages)

純粋な静的 SPA(サーバーコードなし)なので、`dist/` を静的ホスティングに置くだけで動きます。
`wrangler.toml` を用意してあり、Cloudflare Pages にそのままデプロイできます。

### 方法 A: 直接アップロード

```sh
bun run deploy    # fetch-compiler → build → wrangler pages deploy dist
```

初回は Cloudflare へのログイン (`bunx wrangler login`) が必要です。

### 方法 B: Git 連携(ダッシュボードで設定)

| 項目 | 値 |
|---|---|
| Build command | `bun run fetch-compiler && bun run build` |
| Build output directory | `dist` |

> **重要**: コンパイラ一式 (`public/wasm`・`public/precompiled`) は gitignore しているため、
> **ビルド時に必ず `fetch-compiler` を実行**して `dist/` に同梱する必要があります
> (上記のビルドコマンドに含めてあります)。ビルド環境から github.com / hex.pm へ
> アクセスできることが前提です。

`.wasm` / `.mjs` の MIME タイプは Cloudflare が自動付与します。
キャッシュ制御は `public/_headers` で調整済み(ハッシュ付きアセットは immutable、
コンパイラ一式は 1 日、`sw.js` は毎回再検証)。

他のホスティング(GitHub Pages / Netlify / Vercel など)でも `dist/` を置けば動作します。
その場合は `.wasm` に `application/wasm`、`.mjs` に `text/javascript` が付くことを確認してください。
サブパス配信(`example.com/app/` など)にする場合は Vite の `base` 設定と絶対パスの調整が別途必要です。

## スコープ外 (v1)

Erlang ターゲット実行 / 複数ファイル / アカウント・クラウド保存 / LSP 相当の補完(v2 候補)
