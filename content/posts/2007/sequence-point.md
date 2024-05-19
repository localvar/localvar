+++
title = 'C/C++中的序列点'
date = 2007-02-07T10:30:00+08:00
categories = ['技术']
tags = ['C++']
[params.author]
  name = '佚名'
+++

[原文链接](http://www.newsmth.net/bbstcon.php?board=CPlusPlus&gid=177091)

# 0\. 什么是副作用（side effects）

C99 定义如下：

> Accessing a volatile object, modifying an object, modifying a file, or calling a function that does any of those operations are all side effects, which are changes in the state of the execution environment.

C++ 2003 定义如下：

> Accessing an object designated by a volatile lvalue, modifying an object, calling a library I/O function, or calling a function that does any of those operations are all side effects, which are changes in the state of the execution environment.

可以看出 C99 和 C++ 2003 对副作用的定义基本类似，一个程序可以看作一个状态机，在任意一个时刻程序的状态包含了它的所有对象内容以及它的所有文件内容（标准输入输出也是文件），副作用会导致状态的跳转。

一个变量一旦被声明为 `volatile-qualified` 类型，则表示该变量的值可能会被程序之外的事件改变，每次读取出来的值只在读取那一刻有效，之后如果再用到该变量的值必须重新读取，不能沿用上一次的值，因此读取 `volatile-qualified` 类型的变量也被认为是有副作用，而不仅仅是改写。

注，一般不认为程序的状态包含了 CPU 寄存器的内容，除非该寄存器代表了一个变量，例如: 

```cpp
void foo() { 
   register int i = 0;  // 变量 i 被直接放入寄存器中，本文中被称为寄存器变量 
                        // 注，register 只是一个建议，不一定确实放入寄存器中 
                        // 而且没有 register 关键字的 auto 变量也可能放入寄存器 
                        // 这里只是用来示例，假设 i 确实放入了寄存器中 
   i = 1;               // 寄存器内容改变，对应了程序状态的改变，该语句有副作用 
   i + 1;               // 编译时该语句一般有警告：“warning: expression has no effect” 
                        // CPU 如果执行这个语句，也肯定会改变某个寄存器的值，但是程序状态 
                        // 并未改变，除了代表 i 的寄存器，程序状态不包含其他寄存器的内容， 
                        // 因此该语句没有任何副作用 
}
```

特别的，C99 和 C++ 2003 都指出，no effect 的 expression 允许不被执行：

> An actual implementation need not evaluate part of an expression if it can deduce that its value is not used and that no needed side effects are produced (including any caused by calling a function or accessing a volatile object).

# 1\. 什么是序列点（sequence points）

C99 和 C++ 2003 对序列点的定义相同：

> At certain specified points in the execution sequence called sequence points, all side effects of previous evaluations shall be complete and no side effects of subsequent evaluations shall have taken place.

中文表述为，序列点是一些被特别规定的位置，要求在该位置前的 evaluations 所包含的一切副作用在此处均已完成，而在该位置之后的evaluations所包含的任何副作用都还没有开始。

例如 C/C++ 都规定完整表达式（full-expression）后有一个序列点：

```cpp
extern int i, j; 
i = 0; 
j = i;
```

上面的代码中 `i = 0` 以及 `j = i` 都是一个完整表达式，`;` 说明了表达式的结束，因此在 `;` 处有一个序列点，按照序列点的定义，要求在 `i = 0` 之后 `j = i` 之前的那个序列点上对 `i = 0` 的求值以及副作用全部结束（0 被写入 `i` 中），而 `j = i` 的任何副作用都还没有开始。由于 `j = i` 的副作用是把 `i` 的值赋给 `j`，而 `i = 0` 的副作用是把 `i` 赋值为 0，如果 `i = 0` 的副作用发生在 `j = i` 之后，就会导致赋值后 `j` 的值是 `i` 的旧值，这显然是不对的。

由序列点以及副作用的定义很容易看出，在一个序列点上，所有可能影响程序状态的动作均已完成，那这样能否推断出在一个序列点上一个程序的状态应该是确定的呢？！答案是不一定，这取决于我们代码的写法。但是，如果在一个序列点上程序的状态不能被确定，那么标准规定这样的程序是 undefined behavior，稍后会解释这个问题。

# 2\. 表达式求值（evaluation of expressions）与副作用发生的相互顺序

C99 和 C++ 2003 都规定：

> Except where noted, the order of evaluation of operands of individual operators and subexpressions of individual expressions, and the order in which side effects take place, is unspecified.

也就是说，C/C++ 都指出一般情况下在表达式求值过程中的操作数求值顺序以及副作用发生顺序是未说明的（unspecified）。为什么 C/C++ 不详细定义这些顺序呢？原因是因为 C/C++ 都是极端追求效率的语言，不规定这些顺序，是为了允许编译器有更大的优化余地，例如： 

```cpp
extern int *p; 
extern int i; 
*p = i++;     // 表达式(1)
```

根据前述规定，在表达式 (1) 中到底是 `*p` 先被求值还是 `i++` 先被求值是由编译器决定的；两次副作用（对 `*p` 赋值以及 `i++`）发生的顺序是由编译器决定的；甚至连子表达式 `i++` 的求值（就是初始时 `i` 的值）以及副作用（将 `i` 增加 1）都不需要同步发生，编译器可以先用初始时 `i` 的值（即子表达式 `i++` 的值）对 `*p` 赋值，然后再将 `i` 增加 1，这样就把子表达式 `i++` 的整个计算过程分成了两个不相邻的步骤。而且通常编译器都是这么实现的，原因在于 `i++` 的求值过程同 `*p = i++` 是有区别的，对于单独的表达式 `i++`，执行顺序一般是（假设不考虑 `inc` 指令）：先将 `i` 加载到某个寄存器 A（如果 `i` 是寄存器变量则此步骤可以跳过）、将寄存器 A 的值加 1、将寄存器 A 的新值写回 `i` 的地址；对于 `*p = i++`，如果要先完整的计算子表达式 `i++`，由于 `i++` 表达式的值是 `i` 的旧值，因此还需要一个额外的寄存器 B 以及一条额外的指令来辅助 `*p = i++` 的执行，但是如果我们先将加载到 A 的值写回到 `*p`，然后再执行对 `i` 增加 1 的指令，则只需要一个寄存器即可，这种做法在很多平台都有重要意义，因为寄存器的数目往往是有限的，特别是假如有人写出如下的语句：

```cpp
extern int i, j, k, x; 
x = (i++) + (j++) + (k++);
```

编译器可以先计算 `(i++) + (j++) + (k++)` 的值，然后再对 `i`、`j`、`k` 各自加 1，最后将 `i`、`j`、`k`、`x` 写回内存，这比每次完整的执行完 `++` 语义效率要高。

# 3\. 序列点对副作用的限制

C99 和 C++ 2003 都有类似的如下规定：

> Between the previous and next sequence point a scalar object shall have its stored value modified at most once by the evaluation of an expression. Furthermore, the prior value shall be accessed only to determine the value to be stored. The requirements of this paragraph shall be met for each allowable ordering of the subexpressions of a full expression; otherwise the behavior is undefined.

也就是说，在相邻的两个序列点之间，一个对象只允许被修改一次，而且如果一个对象被修改则在这两个序列点之间对该变量的读取的唯一目的只能是为了确定该对象的新值（例如 `i++`，需要先读取 `i` 的值以确定 `i` 的新值是旧值 `+1`）。特别的，标准要求任意可能的执行顺序都必须满足该条件，否则代码将是 undefined behavior。

之所以序列点会对副作用有如此的限制，就是因为 C/C++ 标准没有规定子表达式求值以及副作用发生之间的顺序，例如： 

```cpp
extern int i, a[]; 
extern int foo(int, int); 
i = ++i + 1;     // 该表达式对 i 所做的两次修改都需要写回对象，i 的最终值取决 
                 // 于到底哪次写回最后发生，如果赋值动作最后写回，则 i 的值 
                 // 是 i 的旧值加，如果 ++i 动作最后写回，则 i 的值是旧值加， 
                 // 因此该表达式的行为是 undefined 
a[i++] = i;      // 如果 = 左边的表达式先求值并且 i++ 的副作用被完成，则右边的 
                 // 值是 i 的旧值加，如果 i++ 的副作用最后完成，则右边的值是 i 
                 // 的旧值，这也导致了不确定的结果，因此该表达式的行为将是 
                 // undefined 
foo(foo(0, i++), i++); // 对于函数调用而言，标准没有规定函数参数的求值 
                 // 顺序，但是标准规定所有参数求值完毕进入函数体 
                 // 执行之前有一个序列点，因此这个表达式有两种执 
                 // 行方式，一种是先求值外层 foo 调用的 i++ 然后求值 
                 // foo(0, i++)，然后进入到 foo(0, i++) 执行，这之 
                 // 前有个序列点，这种执行方式还是在两个相邻序列 
                 // 点之间修改了 i 两次，undefined 
                 // 另一种执行方式是先求值 foo(0, i++)，由于这里 
                 // 有一个序列点，随后的第二个 i++ 求值是在新序列 
                 // 点之后，因此不算是两个相邻的序列点之间修改i两次 
                 // 但是，前面已经指出标准规定任意可能的执行路径 
                 // 都必须满足条件才是定义好的行为，这种代码仍然 
                 // 是 undefined
```

前面我提到在一个序列点上程序的状态不一定是确定的，原因就在于相邻的两个序列点之间可能会发生多个副作用，这些副作用的发生顺序是未指定的，如果多于一个的副作用用于修改同一个对象，例如示例代码 `i = ++i + 1`，则程序的结果是依赖于副作用发生顺序的；另外，如果某个表达式既修改了某个对象又需要读取该对象的值，且读取对象的值并不用于确定对象新值，则读取和修改两个动作的先后顺序也会导致程序的状态不能唯一确定。

所幸的是，“在相邻的两个序列点之间，一个对象只允许被修改一次，而且如果一个对象被修改则在这两个序列点之间只能为了确定该对象的新值而读一次”这一强制规定保证了符合要求的程序在任何一个序列点位置上其状态都可以确定下来。

注，由于对于 UDT 类型存在 operator 重载，函数语义会提供新的序列点，因此某些对于 built-in 类型是 undefined behavior 的表达式对于 UDT 确可能是良好定义的，例如：

```cpp
i = i++; // 如果 i 是 built-in 类型对象，则该表达式在两个相邻的序列点之间对 
         // i 修改了两次，undefined 
         // 如果 i 是 UDT 类型该表达式也许是 i.operator=(i.operator++(int))， 
         // 函数参数求值完毕后会有一个序列点，因此该表达式并没有在两个 
         // 相邻的序列点之间修改 i 两次，OK
```

由此可见，常见的问题如 `printf("%d, %d", i++, i++)` 这种写法是错误的，这类问题作为笔试题或者面试题是没有任何意义的。

类似的问题同样发生在 `cout << i++ << i++` 这种写法上，如果 overload resolution 选择成员函数 `operator<<`，则等价于 `(cout.operator<<(i++)).operator<<(i++)`，否则等价于 `operator<<(operator<<(cout, i++), i++)`，如果 `i` 是 built-in 类型对象，这种写法跟 `foo(foo(0, i++), i++)` 的问题一致，都是未定义行为，因为存在某条执行路径使得 `i` 会在两个相邻的序列点之间被修改两次；如果 `i` 是 UDT 则该写法是良好定义的，跟 `i = i++` 一样，但是这种写法也是不推荐的，因为标准对于函数参数的求值顺序是 unspecified，因此哪个 `i++` 先计算是不能预计的，这仍旧会带来移植性的问题，这种写法应该避免。

# 4\. 编译器的跨序列点优化

根据前述讨论可知，在同一个表达式内对于同一个变量 `i`，允许的行为是： 

**A**. 不读取，改写一次，例如：

```cpp
i = 0;
```

**B**. 读取一次或者多次，改写一次，但所有读取仅仅用于决定改写后的新值，例如：

```cpp
i = i + 1; // 读取一次，改写一次 
i = i & (i - 1);
```

**C**. 不改写，读取一次或者多次，例如：

```cpp
j = i & (i - 1);
```

对于情况 B 和 C，编译器是有一定的优化权利的，它可以只读取一次变量的值然后直接使用该值多次。

但是，当该变量是 volatile-qualified 类型时编译器允许的行为究竟如何目前还没有找到明确的答案，ctrlz 认为如果在两个相邻序列点之间读取同一个 volatile-qualified 类型对象多次仍旧是 undefined behavior，原因在于该读取动作有副作用且该副作用等价于修改该对象，RoachCock 的意见是两个相邻的序列点之间读取同一个 volatile-qualified 类型应该是合法的，但是不能被优化成只读一次。一段在嵌入式开发中很常见的代码示例如下：

```cpp
extern volatile int i; 
if (i != i) { // 探测很短的时间内 i 是否发生了变化 
  // ... 
}
```

如果 `i != i` 被优化为只读一次，则结果恒为 `false`，故 RoachCock 认为编译器不能够对 volatile-qualified 类型的变量做出只读一次的优化。ctrlz 则认为这段代码本身是不正确的，应该改写成： 

```cpp
int j = i; 
if (j != i) { // 将对 volatile-qualified 类型变量的多次读取用序列点隔开 
  // ... 
}
```

虽然尚不能确定 volatile-qualified 类型的变量在相邻两个序列点之间读取多次行为是否合法以及将如何优化（不管怎么样，对于 volatile-qualified 类型这种代码应该尽量避免），但是可以肯定的是，对于 volatile-qualified 类型的变量在跨序列点之后必须要重新读取，volatile 就是用来阻止编译器做出跨序列点的过激优化的，而对于 non-volatile-qualified 类型的跨序列点多次读取则可能被优化成只读一次（直到某个语句或者函数对该变量发生了修改，在此之前编译器可以假定 non-volatile-qualified 类型的变量是不会变化的，因为目前的 C/C++ 抽象机器模型是单线程的），例如：

```cpp
bool flag = true; 
void foo() { 
    while (flag) { // (2) 
        // ... 
    } 
}
```

如果编译器探测到 `foo()` 没有任何语句（包括 `foo()` 调用过的函数）对 `flag` 有过修改，则也许会把 (2) 优化成只在进入 `foo()` 的时候读一次 `flag` 的值而不是每次循环都读一次，这种跨序列点的优化很有可能导致死循环。但是这种代码在多线程编程中很常见，虽然 `foo()` 没有修改过 `flag`，也许在另一个线程的某个函数调用中会修改 `flag` 以终止循环，为了避免这种跨序列点优化带来到错误，应该把 `flag` 声明为 volatile bool，C++ 2003 对 volatile 的说明如下：

> Note: volatile is a hint to the implementation to avoid aggressive optimization involving the object because the value of the object might be changed by means undetectable by an implementation. See 1.9 for detailed semantics. In general, the semantics of volatile are intended to be the same in C++ as they are in C.

# 5\. C99 定义的序列点列表

* The call to a function, after the arguments have been evaluated.
* The end of the first operand of the following operators:
  * logical AND && ;
  * logical OR || ;
  * conditional ?: ;
  * comma , .
* The end of a full declarator:
  * declarators;
* The end of a full expression:
  * an initializer;
  * the expression in an expression statement;
  * the controlling expression of a selection statement (if or switch);
  * the controlling expression of a while or do statement;
  * each of the expressions of a for statement;
  * the expression in a return statement.
* Immediately before a library function returns.
* After the actions associated with each formatted input/output function conversion specifier.
* Immediately before and immediately after each call to a comparison function, and also between any call to a comparison function and any movement of the objects passed as arguments to that call.

# 6\. C++ 2003 定义的序列点列表

所有 C99 定义的序列点同样是 C++ 2003 所定义的序列点。此外，C99 只是规定库函数返回之后有一个序列点，并没有规定普通函数返回之后有一个序列点，而 C++ 2003 则特别指出，进入函数（function-entry）和退出函数（function-exit）各有一个序列点，即拷贝一个函数的返回值之后同样存在一个序列点。

需要特别说明的是，由于 `operator||`、`operator&&` 以及 `operator,` 可以重载，当它们使用函数语义的时候并不提供 built-in operators 所规定的那几个序列点，而仅仅只是在函数的所有参数求值后有一个序列点，此外函数语义也不支持 `||`、`&&` 的短路语义，这些变化很有可能会导致难以发觉的错误，因此一般不建议重载这几个运算符。

# 7\. C++ 2003 中两处关于 lvalue 的修改对序列点的影响

在 C 语言中，assignment operators 的结果是 non-lvalue，C++ 2003 则将 assignment operators 的结果改成了 lvalue，目前尚不清楚这一改动对于 built-in 类型有何意义，但是它却导致了很多在合法的C代码在目前的 C++ 中是 undefined behavior，例如：

```cpp 
extern int i; 
extern int j; 
i = j = 1;
```

由于 `j = 1` 的结果是 lvalue，该结果作为给 `i` 赋值的右操作数，需要一个 lvalue-to-rvalue conversion，这个 conversion 代表了一个读取语义，因此 `i = j = 1` 就是先将 1 赋值给 `j`，然后读取 `j` 的值赋值给 `i`，这个行为是 undefined，因为标准规定两个相邻序列点之间的读取只能用于决定修改对象的新值，而不能发生在修改之后再读取。

由于 C++ 2003 规定 assignment operators 的结果是 lvalue，因此下列在 C99 中非法的代码在 C++ 2003 中却是可以通过编译的： 

```cpp
extern int i; 
(i += 1) += 2;
```

显然按照 C++ 2003 的规定这个代码的行为是 undefined，它在两个相邻的序列点之间修改了 `i` 两次。

类似的问题同样发生在 built-in 类型的前缀 `++`/`--` operators 上，C++ 2003 将前缀 `++`/`--` 的结果从 rvalue 修改为 lvalue，这甚至导致了下列代码也是 undefined behavior：

```cpp
extern int i; 
extern int j; 
i = ++j;
```

同样是因为 lvalue 作为 assignment operator 的右操作数需要一个左值转换，该转换导致了一个读取动作且这个读取动作发生在修改对象之后。

C++ 的这一改动显然是考虑不周的，导致了很多 C 语言的习惯写法都成了 undefined behavior，因此 Andrew Koenig 在 1999 年的时候就向 C++ 标准委员会提交了一个建议要求为 assignment operators 增加新的序列点，但是到目前为止 C++ 标准委员会都还没有就该问题达成一致意见。
