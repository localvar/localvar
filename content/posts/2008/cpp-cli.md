+++
title = 'C++/CLI的用途'
date = 2008-12-29T18:00:00+08:00
categories = ['技术']
tags = ['C++', 'Windows']
+++

作为一个有着正常审美观的人，我简直无法忍受 `C++/CLI`（以及 `managed c++`）的丑陋。不过，近来发现，这个丑东西也还有点用，在把原生开发接口包装成托管开发接口时，比 C# 的互操作容易的多（互操作看了看，头大呀）。磕磕绊绊几天，终于把一个 SDK 开发包转换完成了。总结经验如下：

1. 对于 clr 中的引用类型，定义变量时要用个 `^` 符，如 `String^ var1`、`array<int>^ var2`、`array<String^>^ strarr` 等，值类型不用。一个类型是值类型还是引用类型，取决于定义时用的是 `value struct/class` 还是 `ref struct/class`。

2. 定义枚举要用 `enum struct/class`，否则是个原生枚举，C# 里不能用。可指定数值类型和 `flags` 属性，如下：

```csharp
[FlagsAttribute]
public enum class TestEnum : unsigned int
{
   flag1 = 0x00000001,
   flag2 = 0x00000002,
};
```

3. 原生字符串转换为托管字符串时，用：

```cpp
char* s1 = "native string1";
wchar_t* s2 = L"native string2";
String^ str1 = gcnew String( s1 );
String^ str2 = gcnew String( s2 );
```

托管字符串转换为原生字符串时，用：

```cpp
pin_ptr<const wchar_t> p = PtrToStringChars( str );
```

如果需要 ANSI 字符集，可再对 `p` 进行一些常规字符集转换。

4. 指针、句柄等与 0 进行赋值比较等操作时用 `nullptr`，而不是 `NULL` 或 0，后者会导致装箱等操作，如：

```cpp
HANDLE h = nullptr;
if( h == nullptr ){}
```

5. C# 中定义函数参数时的 `ref` 关键字在 C++/CLI 中用 `%` 号对应，如：

```cpp
void foo( String^% refstr );
```

`out` 关键字，需要用 `[System::Runtime::InteropServices::OutAttribute]` 声明一下。

6. 数组空间初始化，用 `()` 而不是 `[]`，也就是说它是一个函数调用，如：

```cpp
array<int>^ arr = gcnew array<int>(100);
```

的作用是定义一个有 100 个元素的数组。

7. C++/CLI 中很多地方不能用 `const`、`volatile` 等关键字，如果编译报错，就把它们去掉吧。

8. 尽量不要定义自己的 `DllMain`，如果必须定义的话，`DllMain` 中不要进行任何托管操作，否则极易导致死锁。可以 `#pragma managed` 编译指令，临时打开或关闭托管。

9. 暂时没有了，等想起来再补充。
