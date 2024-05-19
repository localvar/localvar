+++
title = '编译选项的统一管理'
date = 2008-12-31T19:00:00+08:00
categories = ['技术']
tags = ['其他']
+++

当一个 solution 中的项目越来越多以后，管理编译选项，将成为一件很麻烦的事，单独对每个项目进行设置不仅繁琐，而且容易出错。但实际上，Visual Studio 已经为我们提过了统一的管理界面——Property Manager。

在 Visual Studio 中，每个 C++ 项目的 `general` 属性页中，都有一项 `Inherited Project Property Sheets`，我们可以在这里指定一个或多个 `Property Sheet`（不要和 GUI 开发中的 Property Sheet 搞混了，完全两个概念）供项目继承。在被继承的属性表（父属性表）中，我们设置好默认选项，然后把项目中对应的选项设置为 `inherit from parent or project defaults` 就可以使用父属性表中的设置了。这样，在 solution 层面上准备一个 `Property Sheet`，再让其下的所有项目继承，即可实现编译选项的统一管理。

在 Visual Studio 的 `view` 菜单中选择 `property manager`，还可以更清楚的看到每个项目继承了哪些 `property sheet`，并且有更多的编辑功能（如创建新 `property sheet`、清除项目已经设置了的选项等）。另外，`property sheet` 还支持多级继承，而实践上一般也是每个 solution 一个根 `Property Sheet`，然后为每个 Configruation（Debug 版、Release 版等）分别派生出一个，各个项目的不同 Configruation 继承对应的 `Property Sheet`。

最后要注意的就是 `property sheet` 对应的文件（.vsprops），也应该加入配置管理系统。
