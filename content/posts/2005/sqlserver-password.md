+++
title = 'Sql Server的密码原来不区分大小写'
date = 2005-07-29T09:35:00+08:00
categories = ['技术']
tags = ['数据库']
+++

今天才知道，原来一般情况下 SQL Server 的登录密码不分大小写，被惯性思维蒙了这么长时间，以前登录的时候一直对密码的大小写很小心。不过这一点是可以改的，与默认的排序规则相关。

ps: 同时记录一个 .NET 问题的解决方法，一般的 .Net 应用程序如果使用了 `Application.EnableVisualStyles()`，工具栏和树形控件的图标就显示不了了，解决方式是马上调一下 `Application.DoEvents()`，如下：

```csharp
static void Main() 
 {
    Application.EnableVisualStyles();
    Application.DoEvents(); // 加上这一句
    Application.Run(new MainForm());
 }
```