# Accounting PWA v2

新增功能：
- 月份篩選
- 收入 / 支出 / 結餘統計
- 編輯紀錄
- CSV 匯入 / 匯出
- 本月支出分類圖
- 近 6 個月收支圖
- IndexedDB 自動本機備份（24 小時檢查，保留 30 份）
- 本機備份還原
- JSON 完整備份匯入 / 匯出

更新原 GitHub Pages 專案後執行：

git add .
git commit -m "Add statistics edit import charts and backups"
git push

注意：iOS PWA 關閉後不保證背景執行，因此自動備份是在 App 開啟/回前景、App 開著時定期檢查，以及資料變動後檢查是否已超過 24 小時。

IndexedDB 備份與主資料仍屬同一個網站儲存空間。若 Safari 網站資料被清除，兩者都可能消失；請定期使用「匯出 JSON 備份」存到 iPhone Files 或 iCloud Drive。
