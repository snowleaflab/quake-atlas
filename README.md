# Quake Atlas

日本の地震の頻度と震度を市区町村別に調べる静的Webアプリ。Vite・React・TypeScript、Leaflet、Apache EChartsを使用。Pythonの取り込み処理は標準ライブラリのみ。

## 起動

Node.js 24、Python 3.11以上を使用します。初回取り込みにはインターネット接続が必要です。

```sh
npm ci
python3 -m unittest discover -s tests
python3 tools/history.py
python3 tools/update.py
python3 tools/publish.py
npm run dev
```

運用開始後は、リポジトリ内の archive があれば publish だけで同じデータをローカル表示できます。ビルドは `npm run build`。

## GitHub Pages

Settings → Pages → Build and deployment → Source で **GitHub Actions** を選択します。Actionsの「Update and publish Quake Atlas」はmainへのpush、手動実行、毎時7・22・37・52分の予定で動きます。スケジュールには遅延があります。データ更新、履歴保存、ビルドが成功した版だけをデプロイします。更新ボタンは公開済みデータを再取得します。

## データ

- [気象庁 地震月報（カタログ編）](https://www.data.jma.go.jp/eqev/data/bulletin/shindo.html) の年別震度ファイル（1919年以降）。全国の1地震を1件、地域は該当観測点の最大震度として集計。記録にある旧震度5・6は保持。有感・階級不明と日時を特定できない記録は数値グラフの対象外。観測網の変更をまたぐ長期間の比較に注意してください。
- [気象庁防災情報XML](https://xml.kishou.go.jp/xmlpull.html) の震源・震度に関する情報（VXSE53）。市区町村コードと観測点を別に保持し、EventIDと発表時刻で訂正・取消を適用。緊急地震速報ではありません。
- [P2P地震情報](https://www.p2pquake.net/develop/json_api_v2/) の各地の震度情報を、年別資料とXMLの間をつなぐ期間に使用。初回は約2か月、以後の更新ごとにさらに1か月ずつ遡ります。この区間の同定は発生時刻と震源名に依存し、配信の欠落・訂正時の不一致があり得ます。
- 位置判定と地図は国土交通省 国土数値情報（行政区域）を[スマートニュース メディア研究所](https://github.com/smartnews-smri/japan-topography)が加工した2021年の簡略境界を使用。歴史資料の観測点と市区町村の対応は現境界の近似で、境界・合併前後は原資料と異なる場合があります。端末座標はブラウザ内のみで処理し、地域を明示的に共有したときだけURLに含めます。
- 観測点一覧は気象庁震度観測点一覧をCSV化した [shiwaku/jma-earthquake-data-converter](https://github.com/shiwaku/jma-earthquake-data-converter/blob/main/data/code_p.csv) より。地図には位置が判明した点を表示。原データにない震度を0扱いしません。
- テスト用の実電文は[気象庁 2026年11月9日14時05分発表](https://www.data.jma.go.jp/developer/xml/data/20261109050528_0_VXSE53_010000.xml)。
