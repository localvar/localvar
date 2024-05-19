+++
title = '_tfopen 指定文件编码后程序崩溃'
date = 2008-11-03T09:00:00+08:00
categories = ['技术']
tags = ['C++', 'Windows']
+++

vs05 和 08 的 CRT 增加了一点功能，使用 `fopen`/`_wfopen` 时可以指定文件的编码，但我发现这个功能好像有很多 bug, 会导致程序崩溃。我是使用下面的形式打开文件的：

```cpp
TCHAR buf[1024];
FILE* fp = _tfopen( _T("a.txt") , _T("rt,ccs=UNICODE") );
_fgetts( buf, _countof(buf), fp );
```

按 MSDN 的说法，这时 `fopen` 会根据文件的 `BOM` 自动判断文件的编码，并保证 `buf` 中字符的编码总是我希望的那一种。
可是这个程序在使用 `mbcs` 并打开 `unicode` 编码的文件时会崩溃，考虑到我的程序只发布 `unicode` 版本，所以忍了，啥也不说。
但这两天发现，`unicode` 版本在 `fgets` 时也会崩溃，方法是新建一个 `excel` 文件然后重命名为 `a.txt`。

我仔细读了两天 MSDN，并测试了各种形式，感觉不像是我的错误。在网上没找到类似的描述，所以记下来，也许有人会碰到同样的问题。
