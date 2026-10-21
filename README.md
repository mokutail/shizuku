# しずく

自分専用の生理管理アプリです。Androidのホーム画面に追加して使います。

- カレンダーで生理の記録・予定日・排卵日(目安)を表示
- 体調はアイコンをタップして記録
- 予定日の数日前に通知
- 招待した相手(彼氏さんなど)は、選んだ項目だけを見られる。生理がはじまったら相手に通知
- 「きろく」画面は病院で見せたり、印刷してPDFにできる

`docs/js/config.js` が空のままだと **デモモード**(サンプルデータ入り、この端末の中だけで動く)になります。

---

## セットアップ

所要時間は30〜40分くらいです。すべて無料枠で動きます(Firebase は「Spark」プランのままでOK)。

### 1. GitHub にリポジトリを作る

1. GitHub で新しいリポジトリを作る(例:`shizuku`、**Public**)
2. このフォルダの中身を全部アップロードする(`.github` フォルダも忘れずに)

> 記録データはリポジトリには入りません。Firebase に保存され、ログインした本人と招待した相手しか読めないようにしてあります。

### 2. GitHub Pages で公開する

1. リポジトリの **Settings → Pages**
2. Source を **Deploy from a branch**、Branch を `main` / フォルダを **`/docs`** にして Save
3. 数分後、`https://mokutail.github.io/shizuku/` で開けるようになります(この時点ではデモモード)

### 3. Firebase プロジェクトを作る

1. https://console.firebase.google.com/ で「プロジェクトを作成」(Google アナリティクスはオフでOK)
2. **Authentication** → 始める → ログイン方法で **Google** を有効にする
3. Authentication → **設定 → 承認済みドメイン** に `mokutail.github.io` を追加
4. **Firestore Database** → データベースを作成 → ロケーションは `asia-northeast1`(東京)→ **本番環境モード**
5. Firestore の **ルール** タブを開き、このフォルダの `firestore.rules` の中身を全部貼り付けて「公開」

### 4. アプリに Firebase の設定を入れる

1. Firebase の **プロジェクトの設定(歯車)→ 全般 → マイアプリ** で「ウェブ」(`</>`)を追加
2. 表示される `firebaseConfig = { ... }` の中身を、`docs/js/config.js` の `firebaseConfig` に貼る
3. プロジェクトの設定 → **Cloud Messaging** → ウェブプッシュ証明書で「鍵ペアを生成」し、出てきた鍵を `config.js` の `vapidKey` に貼る
4. GitHub に上書きアップロード

> `firebaseConfig` は公開されても問題ない値です。データはルールで守られています。

### 5. 通知を送るしくみを設定する

通知は GitHub Actions が30分ごとに確認して送ります(8時〜23時のみ)。

1. Firebase の **プロジェクトの設定 → サービス アカウント → 新しい秘密鍵の生成** で JSON ファイルをダウンロード
2. GitHub のリポジトリ **Settings → Secrets and variables → Actions**
   - **Secrets** タブ → New repository secret → 名前 `FIREBASE_SERVICE_ACCOUNT`、値に JSON ファイルの中身を全部貼る
   - **Variables** タブ → New repository variable → 名前 `APP_URL`、値 `https://mokutail.github.io/shizuku/`
3. **Actions** タブ → `notify` → 「Run workflow」で一度動かし、緑のチェックになればOK

> ダウンロードした JSON は強い権限を持つ鍵です。リポジトリには入れず、Secrets に貼ったらファイルは消してください。

### 6. スマホで使いはじめる

1. Android の Chrome でアプリのURLを開き、Googleでログイン
2. Chrome のメニュー(︙)→ **ホーム画面に追加**(または「アプリをインストール」)
3. ホーム画面のアイコンから開き、**設定 → 通知をオンにする**
4. ルナルナの記録は **きろく → 過去の記録をまとめて入力** に、履歴を見ながら1行ずつ書く
   (例:`2026/9/12〜9/17`、`8/15-8/20`、`7/18` のどれでも読めます)

### 7. 彼氏さんに共有する

1. **共有** タブで見せたい項目をオンにする
2. 「招待リンクをつくる」→「送る」で LINE などから送る(24時間有効・1人だけ)
3. 彼氏さんがリンクを開いて Google でログイン →「見られるようにする」
4. 彼氏さんも同じようにホーム画面に追加 → 設定 → 通知をオン(iPhone でもホーム画面に追加すれば通知が届きます)

解除したいときは、共有タブの「見ている人」から「解除」を押します。

---

## 知っておいてほしいこと

- **予定日・排卵日は目安です。** 最近6回の周期の平均から計算しています。避妊には使えません。
- **通知が少し遅れることがあります。** GitHub Actions の予定実行は混雑時に数十分遅れることがあります。
- **60日間リポジトリを更新しないと、通知の自動実行が止まります**(GitHub の仕様)。止まると GitHub からメールが来るので、Actions タブで「Enable workflow」を押せば再開します。
- 終わった日を入れ忘れても、はじまった日から10日たつと自動で「終わり」扱いになります。

## ファイル構成

```
docs/                アプリ本体(GitHub Pages で公開)
  js/config.js       ← Firebase の設定を貼るところ
  js/cycle.js        周期・予測の計算(通知スクリプトと共用)
  js/app.js          画面
  js/store-*.js      保存先(Firebase/デモ)
  js/icons.js        アイコン(すべてこのアプリ用に描いたもの)
  sw.js              オフライン対応と通知の表示
firestore.rules      Firestore の保存ルール
scripts/notify.mjs   通知を送るスクリプト
.github/workflows/   通知を30分ごとに動かす設定
```
