+++
title = '对windows互锁函数的补充'
date = 2005-10-22T09:50:00+08:00
categories = ['技术']
tags = ['Windows', '多线程']
+++

互锁函数是多线程处理中最简单高效的手段之一，但这些函数的功能实在是太差劲了，要求稍微复杂一点，就完成不了。比如 `if( n > 100 ) n++;` 这么简单的功能，它们就做不到。以前，为了达到互斥的目的，我都要使用一个临界区，现在想想，这个方法简直太笨了！因为借助 `InterlockedCompareExchange`，甚至更复杂的功能都可以轻松实现，而这个函数曾经是我认为的最没用的互锁函数。例如前面的大于某值才加1的功能就可以通过下面这个函数以原子的形式完成：

```cpp
LONG InterlockedBiggerExchangeAdd( LONG volatile* Addend, LONG Value, LONG Comperand )
{
    LONG lOrigin;
    do lOrigin = *Addend;
    while( (lOrigin > Comperand)
        && (::InterlockedCompareExchange(Addend, lOrigin + Value, lOrigin) != lOrigin) );
    return lOrigin;
}
```

这个函数比较 `*Addend` 和 `Comperand`, 如果 `*Addend` 大于 `Comperand`, 就给 `*Addend` 加上 `Value`, 返回值则是 `*Addend` 的初值。

仿照上面的例子，我们还可以写出 `InterlockedAnd`、`InterlockedOr` 和 `InterlockedXor` 的实现，这也是我以前经常抱怨的，因为系统只在 DDK 中提供了它们！但话说回来，这三个函数还有更简单的实现方式，因为汇编指令 `and`、`or`、`xor` 都支持 `lock` 前缀，如果直接用汇编实现的话，会更简单高效！
