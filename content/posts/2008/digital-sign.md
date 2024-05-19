+++
title = '命令行下进行数字签名'
date = 2008-11-18T16:00:00+08:00
categories = ['技术']
tags = ['其他']
+++

网上介绍数字签名的文章，大多使用 `signtool` 的 `signwizard` 命令实现，这种方式虽说简单，却需要人为干预，不能自动执行。MSDN 上说 `signtool` 的 `sign` 命令可以在命令行中完成签名，但描述的相当模糊，试了半天，终于找到了它的使用方法，一共执行四条命令即可，前三条一次性执行，最后生成一个个人证书（pfx），最后一条用于实际签名，可以放在 `post build event` 中去自动执行。

1. `makecert` 生成 `x.509` 证书和私钥，会弹出界面要求输入两次密码，我输的是 `123`，其中 `localvar studio` 是公司名：

```
makecert /sv sign.pvk /n "CN=localvar studio" sign.cer
```

2. 把 `x.509` 证书转换为 `Software Publisher Certificate`

```
cert2spc sign.cer sign.spc
```

3. 把 `pvk` 转换为 `pfx`，例子中的 `123` 是私钥密码：

```
pvk2pfx -pvk sign.pvk -pi 123 -spc sign.spc -pfx sign.pfx
```

4. 签名，稍微调整一下，就能写在`post build event`里了，`123`是密码：

```
signtool sign /f sign.pfx /p 123 test.exe
```

上面的例子只是演示签名过程，由于证书是本机做出来的，所以签了名也没用，用户那看到的仍然是“未知发行商”。向证书颁发机构申请真正的证书时，能直接得到 `.spc` 和 `.pvk` 文件，所以就不用执行前两步了。

PS: 证书颁发机构真是坐地收钱呀，几秒钟生成个证书，每年就收好几千。
