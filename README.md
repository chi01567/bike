# 八里慢騎｜八里渡船頭自行車租借與數位預約核銷系統

以 Node.js、Express 與原生 HTML/CSS/JavaScript 建置的全端示範專案。單一 Express 服務提供網站與 REST API，資料預設保存於 `data/store.json`；首次啟動時會自動建立四種車款及庫存資料。付款、簡訊、Email 與 ATM 均為展示流程，不會連接實際金流或通知服務。

## 專案結構

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── data/                 # 首次啟動自動建立，保存訂單及團體詢價
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## 本機啟動

需求：Node.js 18 或更新版本、npm。

```bash
npm install
npm start
```

瀏覽 <http://localhost:3000>。後端會優先使用環境變數 `PORT`，未設定時使用 3000。店家演示密碼為 `bali888`，也可以選擇訪客演示入口。

## Render 部署

1. 將專案推送到 GitHub Repository。
2. 在 Render 選擇 **New > Web Service**，連結該 Repository。
3. Runtime 選 Node，Build Command 設為 `npm install`，Start Command 設為 `npm start`（等同 `node server.js`）。
4. 不必手動指定埠號，服務會讀取 Render 注入的 `PORT`。
5. 部署完成後，使用 Render 提供的網址開啟網站。

### 資料持久性

JSON 檔案適合快速展示與原型部署。Render 一般 Web Service 的本機檔案系統可能在重新部署或重啟時重置；免費服務也不保證持久磁碟。因此本專案會在資料檔不存在時自動以 Seed Data 初始化，但要長期保存真實訂單，請為服務掛載 Render Persistent Disk（付費方案及掛載路徑依 Render 方案而定），並將 `DATA_DIR` 設為磁碟掛載目錄，或改接託管資料庫。此原型尚未提供正式身分驗證、實際金流、簡訊或 Email 服務，不應直接收集真實付款資料。

## 功能

- 行動優先 RWD 首頁、四款預設車輛、日期及四個兩小時時段即時庫存。
- 後端庫存檢查與建立訂單時的同步保留，保留時間 10 分鐘；逾時訂單由 API 呼叫時清理並釋放庫存。
- 全額或 20% 訂金付款方案，以及 Line Pay、信用卡、Apple Pay、ATM 的模擬付款選項。
- 付款後產生 QR Code 訂單憑證，可下載 PNG；通知為模擬提示。
- 八個地標及兩條推薦路線、租借政策與 20 人以上團體報價表單。
- 店家演示後台：今日營收與訂單、依時段車款庫存、相機 QR 掃描或手動查單、確認核銷。
- 繁體中文、英文、日文切換主要導覽與首頁文字。

## API 摘要

- `GET /api/bikes?date=YYYY-MM-DD&slot=09:00-11:00`：車款與即時庫存。
- `GET /api/availability?date=YYYY-MM-DD&slot=09:00-11:00`：各車款剩餘庫存。
- `POST /api/reservations`：驗證資料、保留庫存並建立 10 分鐘待付款訂單。
- `POST /api/orders/:id/pay`：模擬付款並產生 QR Code。
- `GET /api/orders/:id`：讀取訂單狀態。
- `GET /api/admin/overview?date=YYYY-MM-DD`：營運與庫存看板資料。
- `POST /api/admin/lookup`、`POST /api/admin/redeem`：查詢及核銷訂單。
- `POST /api/groups`：建立團體需求、報價預覽與演示 ATM 帳號。

## 注意

- 相機掃碼需要支援 `getUserMedia` 的安全來源（HTTPS 或 localhost）及使用者授權；若無法使用，可手動輸入訂單編號。
- 網站首圖與字型使用 Unsplash、Google Fonts CDN；掃碼功能使用 html5-qrcode CDN，因此相關瀏覽器功能需要網路連線。
- JSON 檔案儲存以單一 Node 程序為目標，非多實例交易資料庫；多實例或正式營運請改用具交易能力的資料庫。
