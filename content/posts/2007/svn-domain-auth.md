+++
title = 'Windows 下配置 SVN 1.4.5 + APACHE 2.2.6 使用域认证'
date = 2007-12-20T14:00:00+08:00
categories = ['技术']
tags = ['Windows', '其他']
+++

其实在网上搜索这个主题，已经有很多文章了，而且 Subversion 和 TortoiseSVN 的文档上也有相关介绍。但在我自己配置的过程中，发现它们好像都不完全对。所以我觉得有必要把自己摸索的过程写出来，供大家参考。不过已经有那么多“前车之鉴”了，我的方法是否真的有用，只能靠老天保佑了。

要想配置成功，首先要保证 Apache、Svn 和 mod_auth_sspi 这几个模块的版本是匹配的。我最开始就是在这上面栽的跟头。Apache 有很多个版本（以 2.0.x 和 2.2.x 最常见），作为对应，每个版本的 svn 都有一些子版本与其匹配。例如 1.4.5 版的 svn 就有针对 2.0.x 和 2.2.x 的两个子版本。不幸的是，网上搜到的 svn 下载链接多是指向针对 Apache 2.0.x 的那个子版本，当把它用在最新版（目前是 2.2.6）的 Apache 上时，出问题就是必然的了。实际上，当使用 2.2.x 版的 Apache 时，我们应该到这里，点击左侧的文件夹 Windows Apache 2.2.x（等以后有了新版的 apache，可能就是其它对应的文件夹了），然后在右侧的文件列表中下载对应得 svn（我下载的是 svn-win32-1.4.5.zip）。mod_auth_sspi 我们也下载针对 2.2.x 版 apache 的那个就可以了。

以下是我的安装配置过程，它是针对 apache2.2.6 和 svn1.4.5 的，如果你用的是其它版本，可能一些细节上会有所不同。

分别安装 apache 和 svn（svn 就是把压缩包解开就行），然后把 svn\bin 文件夹下的 mod_dav_svn.so、mod_authz_svn.so、libdb44.dll 和 intl3_svn.dll 拷贝到 apache 的 modules 文件夹下，mod_auth_sspi 中的 mod_auth_sspi.so 也拷贝到那去。

最后是修改 apache 的配置文件 httpd.conf，经过我的试验，最后确定使用下面配置文件就行了。

```
ThreadsPerChild 250
MaxRequestsPerChild 0

ServerRoot "C:/Program Files/Apache Software Foundation/Apache2.2"   # 根据实际情况修改
ServerName svnserver.mydomain.net:8080   # 根据实际情况修改
ServerSignature Off
ServerTokens Prod
DocumentRoot "htdocs"
Listen 8080   # 根据实际情况修改

LoadModule sspi_auth_module modules/mod_auth_sspi.so
#LoadModule auth_basic_module modules/mod_auth_basic.so
#LoadModule auth_digest_module modules/mod_auth_digest.so
#LoadModule authn_file_module modules/mod_authn_file.so
LoadModule authz_svn_module modules/mod_authz_svn.so
LoadModule dir_module modules/mod_dir.so
LoadModule deflate_module modules/mod_deflate.so
LoadModule mime_module modules/mod_mime.so
LoadModule setenvif_module modules/mod_setenvif.so
LoadModule dav_module modules/mod_dav.so
LoadModule dav_svn_module modules/mod_dav_svn.so

<Directory />
  Options FollowSymLinks
  AllowOverride None
</Directory>

<IfModule dir_module>
    DirectoryIndex index.html
</IfModule>

ErrorLog "e:/svn/server.log"   # 根据实际情况修改
LogLevel error

DefaultType text/plain

<IfModule mime_module>
    TypesConfig conf/mime.types
    AddType application/x-compress .Z
    AddType application/x-gzip .gz .tgz
    AddType application/x-x509-ca-cert .crt
    AddType application/x-pkcs7-crl .crl
</IfModule>

# 注意“/svn/”中最后的斜杠是必须的, 否则列不出版本库列表
# 访问时的url也要带着它, 想要去掉它可搜索RedirectMatch
<Location /svn/>   # 根据实际情况修改
    # configure SVN
    DAV svn
    SVNListParentPath on
    # 版本库的根目录
    SVNParentPath e:/svn   # 根据实际情况修改
    # 权限控制文件
    AuthzSVNAccessFile e:/svn/authz   # 根据实际情况修改
    # 认证时的提示信息(中文不好使)
    AuthName "My Subversion"
    # 使用域认证
    AuthType SSPI
    SSPIAuth On
    SSPIAuthoritative On
    # 指定使用那个域
    SSPIDomain mydomain.net   # 根据实际情况修改
    # 是否省略掉用户id的域名部分(好像只是影响svn的一些日志记录)
    SSPIOmitDomain On
    # 是否允许非IE客户端(必须打开)
    SSPIOfferBasic On
    # 基本认证(非域认证方式)具有更高的优先级?
    SSPIBasicPreferred Off
    # 用户名大小写
    SSPIUsernameCase lower
    # 用户必须通过认证
    Require valid-user
</Location>
```

最后如果大家觉得手工编辑那个权限控制文件 `authz` 很麻烦的话，也有一个取巧的办法，就是使用 visualsvn server，虽然它目前还不支持域认证，但是我们可以借用它的权限管理界面。操作如下（假设版本库的根目录是 e:\svn，并且权限控制文件的名字这时必须用 authz）：

1. 按前面的操作安装好 apache 和 svn，但不要启动 apache
2. 把 e:\svn 改名为 e:\svn1
3. 下载并安装 visualsvn server，安装时指定版本库根目录为 e:\svn
4. 停掉并禁用 visualsvn server 的服务（VisualSVNServer），删除 e:\svn
5. 把 e:\svn1 的名字改回 e:\svn
6. 启动 apache
7. 启动 visualsvn server 的管理界面，把要使用这个版本库的所有人的域帐号都添加到它的用户列表中去（密码不会被实际使用，随便设或留空都行）。
8. 万事 ok 了，设置权限吧！

ps: 2008-05-23

tortoisesvn(1.4.8 版)文档中关于使用多认证源的描述中有一个错误，其中的 `AuthAthoritative` 和 `AuthAuthoritative` 都应该改成 `AuthBasicAuthoritative`。另外，多认证源还要求域用户登录时必须用“domain\user”的形式，只输 user 部分就会用其他认证方式。所以，如果你按我前面的描述用了 visual svn server，增加多认证源后，域用户的密码就千万不要留空了，因为那样不用密码就能登录了。
