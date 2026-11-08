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

**Subtitle:** `Read manga from your sources`

**Promotional text**

```text
Read manga from the sources and servers you add. Starts with open-licensed examples, from Edo-period Japanese books to modern webcomics.
```

**Description**

```text
nemu is a manga reader for iPhone and iPad. Read manga from the sources and servers you add.

nemu does not host comics. It comes with a few example sources: public-domain works, and comics their authors publish under open licences. To read more, add a source directory of your own, connect a server you run, or import CBZ and ZIP files. nemu does not host or review the directories you add, so what you read is your choice.

READING
- Right to left, left to right, or a vertical scroll. A title opens the way its source says, and you can change it.
- Turn pages with a curl, a slide or a push.
- Two-page spreads when the screen is wide enough.
- Page fit, page width and page background, including a background that matches the page.

LIBRARY
- Collections and reading progress.
- No account needed. Sign in with Apple or Google if you want to sync between devices. You can delete your account in Settings.

LEARNING JAPANESE
- Recognise the text on a page on your device, look words up, and see how a sentence breaks down.
- When signed in, you can also use cloud text recognition, read-aloud and Nemu Chat. These send the relevant text or page to third-party services, only after you agree. The privacy policy names them.

MADE FOR YOUR SCREEN
- iPhone, iPad, and both displays of iPhone Duo.
- English, Simplified Chinese and Japanese.
- No ads, no in-app purchases, no tracking.

EXAMPLE CONTENT
Pepper&Carrot by David Revoy, peppercarrot.com, CC BY 4.0 (creativecommons.org/licenses/by/4.0). Mini Fantasy Theater by David Revoy, CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0). The author prohibits AI derivation of both. Little Nemo in Slumberland by Winsor McCay, public domain, scans from Wikimedia Commons. Japanese works: public domain, scans by the National Diet Library, Japan (国立国会図書館). nemu is not affiliated with these authors or institutions.
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

**副标题:** `阅读你添加的来源和服务器中的漫画`

**推广文本**

```text
阅读你自行添加的来源和服务器中的漫画。内置几个开放授权的示例来源,从江户时代的日本古籍到当代网络漫画。
```

**描述**

```text
nemu 是一款适用于 iPhone 和 iPad 的漫画阅读器,阅读你自行添加的来源和服务器中的漫画。

nemu 不托管任何漫画。它内置几个示例来源:已进入公有领域的作品,以及作者以开放许可发布的漫画。想读更多内容,可以添加你自己的来源目录、连接你运行的服务器,或导入 CBZ 和 ZIP 文件。nemu 不托管也不审核你添加的目录,读什么由你决定。

阅读
- 从右到左、从左到右或垂直滚动。作品按来源的设定打开,你也可以更改。
- 翻页方式可选卷页、滑动或推移。
- 屏幕够宽时显示双页。
- 可调整页面适配、页面宽度和页面背景,背景也可以跟随页面颜色。

书库
- 收藏夹和阅读进度。
- 无需账号。想在设备之间同步时,可以通过 Apple 或 Google 登录。你可以在设置中删除账号。

学日语
- 在设备上识别页面文字、查词,并查看句子的结构。
- 登录后还可以使用云端文字识别、朗读和 Nemu Chat。这些功能只有在你同意后才会把相关文字或页面发送给第三方服务。隐私政策中列出了这些服务。

适配你的屏幕
- iPhone、iPad,以及 iPhone Duo 的内外两块屏幕。
- 支持英语、简体中文和日语。
- 没有广告,没有 App 内购买,没有跟踪。

示例内容
Pepper&Carrot,作者 David Revoy,peppercarrot.com,CC BY 4.0(creativecommons.org/licenses/by/4.0)。Mini Fantasy Theater,作者 David Revoy,CC BY-SA 4.0(creativecommons.org/licenses/by-sa/4.0)。作者禁止对这两部作品进行 AI 衍生创作。Little Nemo in Slumberland,作者 Winsor McCay,公有领域,扫描件来自 Wikimedia Commons。日本作品:公有领域,扫描件由日本国立国会图书馆提供。nemu 与上述作者和机构没有关联。
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

**サブタイトル:** `追加したソースやサーバーの漫画を読む`

**プロモーション用テキスト**

```text
追加したソースやサーバーの漫画を読めるリーダーです。江戸時代の和本から現代のウェブコミックまで、オープンライセンスのサンプルソースを収録しています。
```

**概要**

```text
nemu は iPhone と iPad 向けの漫画リーダーです。追加したソースやサーバーの漫画を読めます。

nemu は漫画をホストしていません。パブリックドメインの作品や、作者がオープンライセンスで公開している漫画を読めるサンプルソースが付属しています。さらに読みたいときは、ご自身のソースディレクトリを追加するか、運用中のサーバーに接続するか、CBZ や ZIP ファイルを読み込んでください。追加したディレクトリを nemu がホストしたり審査したりすることはないため、何を読むかはご自身で決められます。

読書
- 右から左、左から右、縦スクロールに対応。作品はソースの指定どおりに開き、変更もできます。
- ページめくりはカール、スライド、プッシュから選べます。
- 画面に十分な幅があれば見開きで表示します。
- ページフィット、ページ幅、ページ背景を調整できます。ページの色に合わせた背景も選べます。

ライブラリ
- コレクションと読書の進捗。
- アカウントは不要です。デバイス間で同期したいときは Apple または Google でサインインできます。アカウントは設定から削除できます。

日本語学習
- デバイス上でページの文字を認識し、単語を調べ、文の構造を確認できます。
- サインインすると、クラウド文字認識、読み上げ、Nemu Chat も使えます。これらは同意した場合にのみ、関連するテキストやページを第三者のサービスに送信します。送信先はプライバシーポリシーに記載しています。

画面に合わせて
- iPhone、iPad、iPhone Duo の内側と外側のディスプレイに対応。
- 英語、簡体字中国語、日本語に対応。
- 広告、App 内課金、トラッキングはありません。

サンプルコンテンツ
Pepper&Carrot、作者 David Revoy、peppercarrot.com、CC BY 4.0(creativecommons.org/licenses/by/4.0)。Mini Fantasy Theater、作者 David Revoy、CC BY-SA 4.0(creativecommons.org/licenses/by-sa/4.0)。作者はどちらの作品についても AI による二次創作を禁止しています。Little Nemo in Slumberland、作者 Winsor McCay、パブリックドメイン、スキャンは Wikimedia Commons より。日本の作品:パブリックドメイン、スキャンは国立国会図書館によるものです。nemu はこれらの作者や機関と提携していません。
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
| en | 4 | 28 | 136 | 1866 | 90 |
| zh-Hans | 4 | 16 | 51 | 867 | 91 |
| ja | 4 | 18 | 74 | 1126 | 96 |
