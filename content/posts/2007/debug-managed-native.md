+++
title = '调试托管代码调用的本机代码'
date = 2007-04-17T14:19:00+08:00
categories = ['技术']
tags = ['其他']
+++

本来不是什么大问题，不过鉴于我对 .NET 的熟悉程度，和半天的时间，还是记录一下。另外 blog 也好久没更新了，顺便刷一篇。

本问题涉及到两个模块：

* a.dll：C++ 编写，本机代码；
* b.exe：c# 编写，托管代码。

b 调用 a，运行时有点问题，但不确定是哪边的原因，故开始 debug。但发现，不管是从 a 启动还是从 b 启动，调试器都跟不进 a 的源代码。浪费一上午的时间后发现，进行如下设置即可：

如果从 a 启动，`a的项目属性 | Debugging | Debugger Type` 必须设为 `Mixed` 或 `Native Only`。这一点上我一开始被默认值 `Auto` 给误导了，以为调试器会智能选择，没想到它“大智若愚”。

如果从 b 启动，则需要选中 `b的项目属性 | Debug | Enable unmanaged code debugging`。

另外 C# 调用 COM 时传递数组的方法，参见：[http://support.microsoft.com/kb/305990/zh-cn](http://support.microsoft.com/kb/305990/zh-cn)