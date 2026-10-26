' NT 本地调试启动器
' 1) 静默起本地服务器（端口已占用则复用，不报错）
' 2) 打开带 ?debug=1 的页面（右下角出现「界面参数」面板）
Set sh = CreateObject("WScript.Shell")
sh.Run "node ""D:\myproject\money-way\nt\tools\serve.mjs""", 0, False
WScript.Sleep 2000
sh.Run "http://127.0.0.1:8080/nt/index.html?debug=1", 1, False
