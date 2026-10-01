# Accounting PWA v3

新增功能：
- 定期自動記帳：每天 / 每週 / 每月 / 每年，可設定每隔 N 個週期
- 類別與支付方式可自行新增、刪除
- 圖表可自訂開始/結束日期
- 收支趨勢可依日 / 月 / 年彙整
- 支出分類圖顯示各分類占比 (%)
- 記帳紀錄可切換「每頁一個月」或「每頁一天」
- 上一頁 / 下一頁與日期/月分直接選擇
- 完整本機備份包含：
  - transactions
  - recurring schedules
  - categories
  - payment methods
- JSON 外部備份也包含上述完整設定

## 更新

將這個資料夾中的檔案覆蓋到既有 repository 後執行：

git add .
git commit -m "Add recurring transactions custom options and advanced charts"
git push

## iOS PWA 的定期記帳限制

iPhone 不允許一般 PWA 在 App 完全關閉時可靠地背景執行 JavaScript。
因此定期記帳的行為是：

1. App 開啟時檢查
2. App 回到前景時檢查
3. App 持續開啟時每小時檢查
4. 若錯過數天 / 數月，會依排程補上所有到期紀錄

例如每月 5 日自動記帳：
如果 App 在 5 日沒開，8 日第一次打開時仍會自動補上 5 日那筆。

## 資料庫 migration

DB_NAME 仍是 AccountingDB。
版本由 v2 升至 v3，既有 transactions 不會因更新而被清除。

新增 object stores：
- recurring
- settings

舊 backups 仍可顯示；還原舊備份時會還原其原本擁有的 transactions。
