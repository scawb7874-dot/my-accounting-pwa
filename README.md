# Accounting PWA v4

本版調整：

## 首頁只保留
1. 月份與收支統計
2. 新增紀錄
3. 記帳紀錄

## 右上角主選單
右上角 ☰ 可進入：
- 首頁
- 定期自動記帳
- 類別與支付方式
- 圖表
- 資料匯入 / 匯出
- 本機備份

## 原始預設選項已加回
類別：
- 飲食
- 交通
- 購物
- 娛樂
- 生活
- 房租
- 薪資
- 其他

支付方式：
- 現金
- 信用卡
- LINE Pay
- 悠遊卡
- 轉帳
- 其他

如果先前已自行新增其他項目，v4 會把「原始預設 + 你的自訂項目」合併，不會刪掉自訂項目。

## 更新方式
將檔案覆蓋到原 repository：

git add .
git commit -m "Redesign home and add side menu"
git push

DB_NAME 仍為 AccountingDB，DB_VERSION 升至 4。
既有 transactions、recurring、settings、backups 都不會因升級被清除。
