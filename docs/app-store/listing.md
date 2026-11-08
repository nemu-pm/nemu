# App Store Connect listing (version 0.1.0)

Limits from [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
and [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information),
read 2026-11-08:

| Field | Limit | Notes |
|---|---|---|
| Name | 2-30 characters | |
| Subtitle | 30 characters | |
| Promotional text | 170 characters | |
| Description | 4000 characters | plain text, no HTML |
| Keywords | 100 **bytes** | each keyword longer than two characters; no app or company names |
| What's New | 4000 characters | **not available for the first version**, required afterwards |
| Support URL | | must lead to actual contact information |
| Copyright | | Apple adds the symbol |

Every string below was measured against these limits. Lengths are in the section
"Measured lengths". The description uses the app's words (sources, servers, source
directories, Example Sources). It names no third-party site or directory except in
the attribution paragraph that licence terms require.

## English (primary language)

**Name:** `nemu` (if taken: `nemu: Manga Reader`)

**Subtitle:** `Magical manga reader`

**Promotional text**

```text
A manga reader for the sources and servers you add. Pick up where you left off on iPhone, iPad and iPhone Duo.
```

**Description**

```text
nemu is a manga reader. Read manga from the sources and servers you add.

nemu comes with a few example sources to get you started: public-domain works, and comics their authors share under open licences. Add more anytime: a source directory, a server you run, or your own CBZ and ZIP files. nemu doesn't host any manga.

Reading
- Right to left, left to right, or scroll. Each title opens the way its source reads, and you can change it.
- Turn pages with a curl, a slide or a push.
- Page fit, page width, and a page background that can match the page.
- Optimized for both screens of iPhone Duo.

Your Library
- Collections and reading progress, kept on your device.
- No account needed. Sign in to sync your library and reading progress across all your devices, and delete your account anytime.

Learning Japanese
- Detect the text on a page, look up words, and see how a sentence is put together.
- Sign in to chat with nemu and listen to it read aloud.

Made for Every Screen
- iPhone, iPad and iPhone Duo.
- No ads, no in-app purchases, no tracking.

Example content: Pepper&Carrot and Mini Fantasy Theater by David Revoy (CC BY 4.0 / CC BY-SA 4.0); Little Nemo in Slumberland by Winsor McCay (public domain); Japanese works from the National Diet Library, Japan (public domain).
```

**Keywords**

```text
manga,comics,reader,webcomic,cbz,japanese,ocr,dictionary,library,sync,server,right-to-left
```

**What's New** (Apple does not offer this field for 0.1.0. Use it as TestFlight's
What to Test, and keep it for reference.)

```text
The first version of nemu: read manga from the sources and servers you add, with open-licensed example sources to start with. On iPhone, iPad and iPhone Duo.
```

## 简体中文 (zh-Hans)

**名称:** `nemu`(如被占用:`nemu: 漫画阅读器`)

**副标题:** `魔法漫画阅读器`

**推广文本**

```text
阅读你自行添加的来源和服务器中的漫画。在 iPhone、iPad 和 iPhone Duo 上随时接着读。
```

**描述**

```text
nemu 是一款漫画阅读器，可阅读你自行添加的来源和服务器中的漫画。

nemu 自带几个示例来源，帮你快速上手：公有领域的作品，以及作者以开放许可分享的漫画。你可以随时添加更多：来源目录、你自己的服务器，或者你自己的 CBZ 和 ZIP 文件。nemu 不托管任何漫画。

阅读
- 从右到左、从左到右或滚动阅读。每部作品按来源的方向打开，你也可以随时更改。
- 卷页、滑动或推移翻页。
- 页面适应、页面宽度，以及可以匹配页面的页面背景。
- 为 iPhone Duo 的两块屏幕优化。

你的书库
- 收藏夹和阅读进度，保存在你的设备上。
- 无需账户。登录即可在所有设备间同步你的书库和阅读进度，也可以随时删除账户。

学习日语
- 识别页面上的文字、查词，看看一句话是怎么组成的。
- 登录后可以和 nemu 聊天，也可以听它朗读。

适配每一块屏幕
- iPhone、iPad 和 iPhone Duo。
- 无广告、无内购、无追踪。

示例内容：Pepper&Carrot 与 Mini Fantasy Theater，作者 David Revoy（CC BY 4.0 / CC BY-SA 4.0）；Little Nemo in Slumberland，作者 Winsor McCay（公有领域）；日本作品来自日本国立国会图书馆（公有领域）。
```

**关键词**

```text
漫画阅读器,看漫画,漫画书,网络漫画,日语学习,日语词典,文字识别,CBZ
```

**What's New** (同上,首个版本不可填写)

```text
nemu 的第一个版本:阅读你自行添加的来源和服务器中的漫画,内置开放授权的示例来源。支持 iPhone、iPad 和 iPhone Duo。
```

## 日本語 (ja)

**名前:** `nemu`(使用済みの場合:`nemu: 漫画リーダー`)

**サブタイトル:** `魔法の漫画リーダー`

**プロモーション用テキスト**

```text
追加したソースやサーバーの漫画を読める漫画リーダーです。iPhone、iPad、iPhone Duoで、続きからすぐに読めます。
```

**概要**

```text
nemuは漫画リーダーです。追加したソースやサーバーの漫画を読むことができます。

すぐに始められるよう、いくつかのサンプルソースが付いています。パブリックドメインの作品や、作者がオープンライセンスで公開している漫画です。ソースディレクトリ、ご自身のサーバー、手持ちのCBZやZIPファイルから、いつでも追加できます。nemuは漫画を配信していません。

読む
- 右から左、左から右、またはスクロール。作品はソースに合わせた向きで開き、いつでも変更できます。
- カール、スライド、プッシュでページをめくれます。
- ページフィット、ページ幅、ページに合わせられるページ背景。
- iPhone Duoの両方の画面に最適化。

ライブラリ
- コレクションと読書の進み具合を、端末に保存します。
- アカウントは不要です。サインインすると、すべての端末でライブラリと読書の進み具合を同期できます。アカウントはいつでも削除できます。

日本語を学ぶ
- ページの文字を認識して、単語を調べたり、文の組み立てを確かめたりできます。
- サインインすると、nemuとチャットしたり、読み上げを聞いたりできます。

どの画面にも
- iPhone、iPad、iPhone Duo。
- 広告なし、App内課金なし、トラッキングなし。

サンプルコンテンツ：Pepper&CarrotとMini Fantasy Theater（作：David Revoy、CC BY 4.0 / CC BY-SA 4.0）、Little Nemo in Slumberland（作：Winsor McCay、パブリックドメイン）、日本の作品は国立国会図書館より（パブリックドメイン）。
```

**キーワード**

```text
漫画リーダー,マンガ,コミック,ウェブコミック,日本語学習,文字認識,CBZ
```

**What's New**(同上、最初のバージョンでは入力できません)

```text
nemu の最初のバージョンです。追加したソースやサーバーの漫画を読めます。オープンライセンスのサンプルソースも付属しています。iPhone、iPad、iPhone Duo に対応しています。
```

## TestFlight test information

Limits are not stated on [Provide test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information);
Beta App Description and Feedback Email are required for external testers.

**Beta App Description**

```text
nemu is a manga reader. It reads the sources and servers you add, and comes with open-licensed example sources. This beta is for checking reading, library and sync on iPhone, iPad and iPhone Duo.
```

**What to Test**

```text
Install the suggested example source during setup and read a work right to left. Try the reader settings, and rotate or fold the device while reading. If you sign in, check that your library syncs, and that Delete Account in Settings > Account works with a test account.
```

## Fields shared by all languages

| Field | Value | Status |
|---|---|---|
| Primary category | **Books** | Apple lists "comics, eReaders, ... graphic novels" ([categories](https://developer.apple.com/app-store/categories/)) |
| Secondary category | **Education** | Apple lists "language learning"; the Japanese tools are real but secondary. Entertainment is the alternative |
| Privacy policy URL | `https://nemu.pm/privacy` | route exists (`src/router.tsx`) and the page responds |
| Support URL | **blocker, see below** | |
| Marketing URL | leave empty for 0.1.0 | optional, see below |
| Copyright | `2026 Man To Tang` | owner to confirm; Apple adds the symbol. Do not type it |
| Price | Free | no in-app purchases |
| Content rights | **Yes**, the app shows and accesses third-party content, and **yes**, it has the rights or is otherwise permitted | the built-in content is public domain or under a free licence. Sources a user adds are the user's own choice and nemu does not list them. Owner signs off |
| Age rating | 16+, answers in `age-rating.md` | Unrestricted Web Access = Yes; Graphic Sexual Content and Prolonged Graphic Violence = None |

### URLs in the web app

`src/router.tsx` has `/`, `/search`, `/settings`, `/browse`, `/library/...`,
`/sources/...` and `/privacy`. There is no `/support` or `/help`. A status code proves
nothing here: `https://nemu.pm/support` returns 200 because the app shell answers
every path. `https://www.nemu.pm/` fails with an expired certificate, so use the apex
domain only.

- **Support URL is missing.** Apple says it must "lead to actual contact information
  (legal address, email address, telephone number)". The only contact today is
  `https://github.com/nemu-pm/nemu/issues` (public, issues on), which has no such
  details, and the policy points to it too. Recommended: add a `nemu.pm/support` page
  with a real email address, then update the policy's contact line. The Issues URL is
  the stopgap if that cannot land in time.
- **Marketing URL.** `https://nemu.pm/` exists, but the web welcome wizard offers named
  third-party sources and the web strings still say "bypass Cloudflare protection". Leave
  the field empty until the web matches the app.

### Attribution for example content

- **In the app (exists):** a title's page shows its author and its licence (License
  row; `getMobileDetailSourceLicense`). Pepper&Carrot credits translators per language
  and on each episode's credits page. Mini Fantasy Theater ends each chapter on a
  credits page. NDL works credit 国立国会図書館 on each work and chapter. The registry
  records the wording in `curation/entries.json`.
- **In the description (the last paragraph above):** required only because the
  screenshots show the art outside the app, where the in-app credits cannot reach. If
  a final set shows no Pepper&Carrot or Mini Fantasy Theater art, the paragraph can be
  shortened. Keep it anyway: it costs nothing and is a clear answer to a rights question.
- Mini Fantasy Theater is CC BY-SA. Show its pages unaltered, not recoloured or cropped
  into new art, so a screenshot stays a depiction and not an adaptation.

## Measured lengths

Counted by script from the blocks above on 2026-11-08.

| Language | Name | Subtitle | Promo (170) | Description (4000) | Keywords (100 bytes) |
|---|---|---|---|---|---|
| en | 4 | 20 | 142 | 1708 | 90 |
| zh-Hans | 4 | 7 | 62 | 822 | 91 |
| ja | 4 | 9 | 77 | 1023 | 96 |
