+++
title = '无锁多线程那些事'
date = 2020-12-12T15:08:22+08:00
categories = ['技术']
tags = ['多线程']
summary = "无锁多线程相关概念和技术，包括原子操作、内存顺序、内存模型、CAS等。"
aliases = ["/archives/lock-free"]
+++

首先来看一个问题：有一个初值为零的整形计数器，如果要写一个函数对其进行加一操作，但是超过 10 后要归零重新开始，最后返回本次操作的结果，这个函数应该怎么写？

太简单了是不是？相信即使是初学者也能很容易的写出下面的代码：

```c
int counter = 0;

int increase_counter() {
    counter++;
    if( counter > 10 ) {
        counter = 0;
    }
    return counter;
}
```

那我们就加大一点难度，把它放到多线程环境中去。看起来也不难，只要加一个锁就行了：

```c
Lock lock;
int counter = 0;

int increase_counter() {
    lock.Lock();
    counter++;
    if( counter > 10 ) {
        counter = 0;
    }
    int result = counter;
    lock.Unlock();
    return result;
}
```

这个实现逻辑上是对的，但在效率和内存占用上都有一点问题。

先看效率问题，代码中的 `Lock` 在不同操作系统上的实现可能不尽相同，但发生冲突时，一般会出现“用户态 - 内核态 - 用户态”的切换，相对于简单的自增操作来说，这个代价有点高的离谱。而在内存占用上，变量 `counter`  一般只有 4 个字节，`lock` 却可能多达几十个字节，也存在严重的浪费。要解决这两个问题，就需要引出本文的主角“无锁（Lock Free）多线程技术”了。

但大家不要被“无锁”这两个字骗了：严格的说，只要多个线程对同一个对象的并发访问中有写操作，就需要锁，所谓的无锁，只是“不额外再使用一个锁（也就是把需要被锁保护的对象自身用作锁）”和/或“只使用轻量级（不会进入内核态）的锁”而已。

不过，多线程本身就不容易写对了，而加上“无锁”两个字的多线程，则要更难一些。

# 无锁多线程难在哪？

为了严谨，无锁技术相关的文档都相当的晦涩，很难看明白。我写这篇文章是希望将它们讲的通俗一点，但准备资料的过程中却发现自己之前对好多细节的理解都有问题，所以能不能达到目的先放在一边，反而连能不能写对都心里没底了，实在是汗颜。

而且，无锁多线程更反直觉：出于性能优化的需要，编译器会对代码的顺序进行重排，CPU 则会乱序执行指令，这都会让代码的实际执行顺序与预期不一致，这不会造成单个线程中的操作出现错误，但却会影响多线程的执行结果。

编程器重排造成的乱序比较好理解，比如下面的代码中，2、3、4 这三条语句的执行顺序并不影响最终的输出，所以编译器可能会调整它们的顺序，甚至可能会把 2、4 这两条语句合并成一句 `a += 2`。

```c
int a = 0, b = 0;                  // 1
a++;                               // 2
b++;                               // 3
a++;                               // 4
printf( "a + b = %d\n", a + b );   // 5
```

CPU 造成的乱序就不这么直观了，举个例子：假设 x, y 是两个初值为 0 的整形全局变量，并且线程 1 执行（这里应该使用汇编代码，但为了便于理解，使用了 C/C++ 代码，由于都是简单的赋值语句，我们可以认为下面的每一行代码都仅对应一条 CPU 指令）：

```c
x = 1;
int r1 = y;
```

线程 2 执行：

```c
y = 1;
int r2 = x;
```

那么，r1, r2 最后会是什么值呢？这取决于两个线程的执行顺序，所以不好说结果一定是什么，但我们能确定的是，r1 和 r2 中至少有一个会是 1。嗯，两个线程的执行顺序不可预测导致最终结果不可预测，好像 CPU 造成的乱序也不过如此，没什么难的。但等等，线程的执行顺序主要取决于操作系统的调度，与 CPU 没有太多直接关系，所以，CPU 造成的乱序到底是什么样子呢？

让我们把上面的示例代码变成实际程序执行一下看看，使用`g++ -O3 <xxxx>.cpp -lpthread` 编译下面的程序。

```c
#include <thread>
#include <atomic>
#include <stdio.h>
using namespace std::chrono_literals;

std::atomic<bool> run_thread1;
std::atomic<bool> run_thread2;
std::atomic<int> done;

int x, y, r1, r2;

void thread1() {
    for( ; ; ) {
        while( !run_thread1 );           // 等待主线程的执行信号

        x = 1;
        asm volatile( "" ::: "memory" ); // 阻止编译器重排
        r1 = y;

        run_thread1 = false;
        done++;                          // 通知主线程
    }
};

void thread2() {
    for( ; ; ) {
        while( !run_thread2 );
        y = 1;
        asm volatile( "" ::: "memory" );
        r2 = x;
        run_thread2 = false;
        done++;
    }
};

int main() {
    std::thread t1( thread1 );
    std::thread t2( thread2 );

    int reorder = 0;
    for( int i = 1; ; i++ ) {
        x = 0, y = 0, r1 = -1, r2 = -1;  // 重置

        // 通知两个工作线程开始执行任务
        done = 0;
        run_thread1 = true;
        run_thread2 = true;

        while( done < 2 );              // 等待两个线程完成任务

        // 检查 r1、r2 都为 0 的情况
        if ( r1 == 0 && r2 == 0 ) {
            reorder++;
            printf( "number of reorders: %d, iterations: %d\n", reorder, i );
        }

        // 睡一会儿，防止输出过快，如果你的环境看不到期望的结果，可以试着调整下睡眠时间
        std::this_thread::sleep_for( 50ms );
    }
    return 0;
}
```

在我的环境上（在 WSL 2 中运行的 Ubuntu 20.04，CPU i5-8265，不同的软硬件环境可能得到不同的结果），这段程序给出了下面的信息：

```shell
~/test$ ./a.out
number of recorders: 1, iterations: 3
number of recorders: 2, iterations: 4
number of recorders: 3, iterations: 6
number of recorders: 4, iterations: 7
number of recorders: 5, iterations: 9
number of recorders: 6, iterations: 11
number of recorders: 7, iterations: 12
number of recorders: 8, iterations: 13
number of recorders: 9, iterations: 17
```

可见，不但出现了 r1 和 r2 都为 0 的情况，而且概率还不低。这就是 CPU 造成的乱序！

且不说这种反直觉的东西本身就容易让人犯晕，就算已经不晕了，实践上也不容易百分之百的做对，因为我们需要控制那些不按常理出牌的代码，让它们不至于乱的太离谱，这种控制有时很微妙，稍有疏忽就会犯错。

犯晕归犯晕，犯错归犯错，要理解无锁多线程，还是让我们学习下理论知识吧。

# 原子操作

多线程相关的话题永远离不开原子操作这个概念，我们也不免俗，就从它开始。

常见 CPU 都会从硬件层面保证一些操作的原子性，这些操作是多线程中实现数据一致的基础。例如，从最早的奔腾处理器开始，无需任何额外处理，x86 系列 CPU 对 1/2/4/8 字节对齐的 1/2/4/8 字节的读或写就是原子的；而 AMD64 系列更是保证了 16 字节对齐的 16 字节的读或写的原子性。

除了简单的读、写，常见 CPU 也能支持一部分像“加、减、按位与、按位或”等复杂一些的“读 - 修改 - 写”操作的原子性。

而最重要的原子操作，是一种被称为“比较并交换（Compare And Swap, CAS）”的操作，我们后面会详细讨论。

虽然 CPU 可以支持原子操作，但支持的方式却有区别，因此，主要的编译型语言，都或者通过编译器内置函数，或者通过库的方式提供了一组等价的 API 来屏蔽这些区别，提高程序的可移植性。比如：

* GCC 提供了以 `__atomic`  为前缀的内置函数
* VC 提供了以 `__Interloked` 为前缀的内置函数
* C\+\+11 标准提供了 `std::atomic` 模板类（本文代码示例使用了这个模板类）
* Java 提供了 `java.util.concurrent.atomic` 包
* Go 提供了 `sync/atomic` 包
* Rust 提供了 `std::sync::atomic` 包

需要注意，CPU 支持的原子操作很多都要求字节对齐，而上面的这些 API 一般会被直接翻译成对应的 CPU 指令，所以，不是用了这些 API，操作就是原子的，还要数据满足对齐需求，并且长度合适才行。后文中，我们会把满足原子操作要求的数据称为“原子变量”。

另外，刚刚接触多线程的读者，可能会希望通过原子操作来读到最新的数据，比如一个初值为 0（所有二进制位都是 0）的整数，如果在一个线程读它的同时，另一个线程将其改成了 -1（所有二进制位都是 1），那么就一定要读到 -1。但事实不是这样的，本节讨论的原子操作只能保证读到的值是一致的（或者 0 或者 -1，而不能是只有部分二进制位变成 1 的其它值），而不能保证读到的到底是哪一个。实际上，在多线程中，保证数据一致非常重要，但保证数据最新一般不重要甚至不可能，这也是多线程和单线程的重要区别之一。

# CPU 的内存模型

CPU 对内存（包括高速缓存 cache）的访问，无非读（Read）、写（Write）两种，但在描述内存模型时，没有使用 Read 和 Write 这两个单词，而是用了等价的 Load（简写为 L）和 Store（简写为 S）。

如果我们考虑任意两次连续的内存访问，那么有 LL、LS、SL 和 SS 四种组合。内存模型能告诉我们：对于一种确定的组合，是否允许逆序执行这两次内存访问，注意，只是是否允许逆序，而不是允许逆序就一定会逆序。另外，这里说的两次内存访问必须是访问不同的内存地址，如果是同一个地址，则两次操作本身有依赖关系，是绝对不会逆序执行的。

根据允许的逆序组合，常见的内存模型有四种：

* 顺序一致（Sequentially consistent）模型：不允许任何一种组合逆序。
* 强序（Strong）模型：只允许 SL 逆序。需要特别注意，不要因为有个“强”字，就把它和“顺序一致”模型搞混了。
* 支持数据依赖的弱序（Weak with data dependency ordering）模型：允许所有组合逆序，但如果前后两个操作有数据依赖关系，就不允许逆序。
* 弱序（Weak）模型：允许所有组合逆序。

常见的 CPU 中，x86/64 使用的是强序模型，所以在这类 CPU 上，先写后读可能会变成先读后写，这也是上面的例子中会看到 r1 和 r2 同时为 0 的原因。

而 ARM/ARM64 使用的是支持数据依赖的弱序模型。所谓数据依赖，是指后一个操作依赖前一个操作的结果，比如说把地址 A 的一个字节复制到地址 B，这是一个先读后写的 LS 组合，由于要写的数据是读操作的结果，就形成了依赖，在这类 CPU 上，有类似依赖关系的组合是不会逆序执行的。

由于 ARM/ARM64 使用了更弱的模型，所以一些在 x86/64 上没有问题的程序，到了 ARM/ARM64 上就会出错。我们可以稍微改造一下前面的例子，让线程 1 执行 SS：

```c
x = 1;
y = 1;
```

线程 2 执行 LL：

```c
r1 = y;
r2 = x;
```

在 x86/64 上，由于 SS 和 LL 都不会被逆序执行，所以我们不会看到 r1 为 1、r2 为 0 的结果，但在 ARM/ARM64 上却可能看到。

不过，我简单的修改了示例代码后并没有达到目的，而是费了一番气力把它改成下面的样子后才看到期望的结果（各位读者可以思考下为什么要这样改，参考[《与程序员相关的CPU缓存知识》](https://coolshell.cn/articles/20793.html)）：

```c
#include <thread>
#include <atomic>
#include <stdint.h>
#include <stdio.h>

std::atomic<bool> run_thread1;
std::atomic<bool> run_thread2;
std::atomic<int> done;

struct {
    int x;
    char dummy[60];    // 确保 x 和 y 不在一个 cache line 中
    int y;             // z 必须紧挨着 y
    int z;             // 以尽量让它俩在同一个 cache line 中
} s;

int r1, r2;

void thread1() {
    for( ; ; ) {
        while( !run_thread1 );           // 等待主线程的执行信号

        s.z = 1;                         // 必须先为 z 赋值
        asm volatile( "" ::: "memory" ); // 阻止编译器重排
        s.x = 1;
        asm volatile( "" ::: "memory" );
        s.y = 1;

        run_thread1 = false;
        done++;                          // 通知主线程
    }
};

void thread2() {
    for( ; ; ) {
        while( !run_thread2 );
        r1 = s.y;
        asm volatile( "" ::: "memory" );
        r2 = s.x;
        run_thread2 = false;
        done++;
    }
};

int main() {
    std::thread t1( thread1 );
    std::thread t2( thread2 );

    int reorder = 0;
    for( int i = 1; ; i++ ) {
        s.x = 0, s.y = 0, s.z = 0, r1 = -1, r2 = -1;  // 重置

        // 通知两个工作线程开始执行任务
        done = 0;
        run_thread1 = true;
        run_thread2 = true;

        while( done < 2 );              // 等待两个线程完成任务

        // 检查 r1  为 1、r2 为 0 的情况
        if ( r1 == 1 && r2 == 0 ) {
            reorder++;
            printf( "number of reorders: %d, iterations: %d\n", reorder, i );
        }
    }
    return 0;
}
```

这段新程序在我使用 ARM CPU 的树莓派4上成功制造出了 r1 为 1、r2 为 0 的结果，但在我使用 x64 CPU 的笔记本上就怎么也出不来。

写到这一部分的时候，正赶上苹果使用 M1 芯片的新 MacBook 上市，性能和功耗都吊打 x86/64，着实火了一把。但程序员朋友们先不要高兴了，因为 M1 芯片是 ARM 阵营的，如果之前没有考虑过可移植性的问题，现在要把为 x86/64 编写的程序搬到它上面去，简单的重新编译一下会留下非常大的隐患。

# 内存顺序（Memory Order）

由于多流水线、多发射、超标量等技术的应用，即使只有一个核心，现代 CPU 也可能同时执行多条指令。但对我们编写的程序来说，CPU 的行为只有在出现内存（这里所说的内存也包括高速缓存）访问时，才是可观测的，所以，我们可以认为 CPU 访问内存的顺序就是其执行指令的顺序。因此，只要能控制这个访问内存的顺序，我们就能避免 CPU 内存模型导致的逻辑错误和可移植性问题了。

控制内存访问顺序的方法就叫做“内存顺序（memory order）”，C/C++ 语言定义了六种内存顺序，都只对原子操作才有意义。通过合理的使用它们，我们可以禁止编译器和 CPU 重排一些关键位置的指令，保证程序的逻辑正确，同时提高可移植性。下面分别说明。

## 宽松（Relaxed）

只保证操作的原子性，编译器和 CPU 仍然可以自由的重排使用这种内存顺序的操作。在使用引用计数来维护对象的生命周期时，一般可以在增加计数的时候使用这种内存顺序，因为只要保证计数增加了就行，但减计数时，因为要确保减到 0 时的销毁操作在减计数之后执行，就必须使用下面介绍的 acquire_release 了。

## Acquire / Consume 和 Release

Acquire / consume 和 release 的联系很紧密，所以放在一起说。就像名字所暗示的，acquire 非常适合用来获取锁（加锁），release 非常适合用来释放锁（解锁）。

如果一个读操作在读一个原子变量时使用的内存顺序是 acquire，那么当前线程中的任何操作都不会被重排到这个读操作之前执行。但是，它并不阻止其它操作被重排到这个读操作之后执行。举个例子，假设 x、y、z 是三个整形的原子变量：

```c
x.store( 1, std::memory_order_relaxed );      // 使用 relaxed 将 x 置为 1
int n = y.load( std::memory_order_acquire );  // 使用 acquire 读取 y 的值
z.store( 2, std::memory_order_relaxed );      // 使用 relaxed 将 z 置为 2
```

那么，因为读 y 时使用了 acquire，所以写 z 绝不会在读 y 之前执行，但写 x 却可能被重排到读 y 之后执行，acquire 不禁止这种重排。

Consume 与 acquire 类似，也是用在读操作上，但是，它只保证当前线程中对正在读的原子变量有依赖的操作不被重排到这个读操作之前执行。

如果一个写操作在写一个原子变量时使用的内存顺序是 release，那么当前线程中的任何操作都不会被重排到这个写操作之后执行。但是，它并不阻止其它操作被重排到这个写操作之前执行。同样假设 x、y、z 是三个整形的原子变量：

```c
x.store( 1, std::memory_order_relaxed );      // 使用 relaxed 将 x 置为 1
y.store( 2, std::memory_order_release );      // 使用 release 将 y 置为 2
z.store( 3, std::memory_order_relaxed );      // 使用 relaxed 将 z 置为 3
```

由于写 y 时使用了 release，所以，写 x 不会被重排的写 y 之后执行，但写 z 却可能被重排到写 y 之前执行。

虽然单独使用能阻止指令重排，但 acquire / consume 和 release 配合使用才更有意义，以 acquire 和 release 的组合为例：如果 A 线程使用 release 写了一个原子变量，B 线程使用 acquire 读了同一个变量，那么这对组合就可以保证：如果 B 线程的 acquire 操作看到了 A 线程 release 操作的结果，就一定也会看到 A 线程在 release 操作之前的所有内存修改，即使这些修改操作不是原子的也没有关系（注意，这不代表 B 线程没看到 release 操作的结果，就一定看不到 release 之前的操作）。

## Acquire_release

这种内存顺序是 acquire 和 release 的合体，用在“读 - 修改 - 写”操作上，它的作用是：当前线程中，任何其它操作都不能被重排到这个操作之前或之后执行。

## 顺序一致（Sequentially consistent）

在六种内存顺序中，顺序一致乍看起来是最简单的那个，但也是最容易引起误解的一个。说它看起来简单，是因为它好像是“完全禁止重排，代码必须按编写的顺序执行”的意思；说它容易引起误解，是因为它并不仅仅是这个意思，否则，对所有读操作使用 acquire，对所有写操作使用 release，对所有“读 - 修改 - 写”操作使用 acquire_release 不就够了吗？何必再引入一个“顺序一致”呢？

实际上，对单个操作来说，顺序一致的语义确实与 acquire、release 或 acquire_release 相同。但如果把所有顺序一致的操作放到一起，它还可以保证所有线程以一个全局一致的顺序看到所有这些操作的结果，而不管这些操作针对的是否是同一个原子变量。注意，操作实际完成的顺序无法事前预测，所以“看到”在这里的含义是“实际观测到”而不是“事前预测到”。

比如下面这段代码，如果有四个线程分别执行其中的四个函数，因为所有操作都是顺序一致的，那么所有四个线程看到的操作顺序必须是一致的，这意味着，如果一个线程看到 A 先于 C 完成，其它线程就不可能看到 C 先于 A 完成，反之亦然，所以当四个线程都执行完毕时，z 不可能为 0。 但即使我们看到了 A 先于 C，也因为 `write_a_then_y` 的观测知道 B 先于 C，却仍无法知道 A 和 C 到底谁先谁后（虽然理论上它们俩必然一个在前一个在后），这也是这种内存顺序使用“一致”而不是其它什么词命名的原因。

```c
std::atomic<bool> a = {false};
std::atomic<bool> x = {false};
std::atomic<bool> y = {false};
std::atomic<int> z = {0};

void write_x() {
    x.store( true, std::memory_order_seq_cst );  // A
}

void write_a_then_y() {
    a.store( true, std::memory_order_seq_cst );  // B
    y.store( true, std::memory_order_seq_cst );  // C
}

void read_x_then_y() {
    while( !x.load(std::memory_order_seq_cst) );
    if( y.load(std::memory_order_seq_cst) ) {
        ++z;
    }
}

void read_y_then_x() {
    while( !y.load(std::memory_order_seq_cst) );
    if( x.load(std::memory_order_seq_cst) ) {
        ++z;
    }
}
```

但如果我们把某个操作改成非顺序一致的，比如把 `read_y_then_x` 改成下面的样子：

```c
void read_y_then_x() {
    while( !y.load(std::memory_order_seq_cst) );
    // 把 x.load 改成了 acquire，这个改动并不影响当前线程中代码的执行顺序
    if( x.load(std::memory_order_acquire) ) {
        ++z;
    }
}
```

就有可能出现 `read_x_then_y`  看到 x 先于 y 被修改，而 `read_y_then_x`  看到 y 先于 x 被修改，从而导致 z 最终为 0。

那为什么不同线程看到的内存修改顺序会不同呢？我们可以考虑这样一个场景：系统有两个 CPU，每个 CPU 又有两个内核。如果线程 `write_x` 和 `read_x_then_y` 分别运行在 CPU1 的两个内核上，另两个线程分别运行在 CPU2 的两个内核上，那么由于同一个 CPU 的内核之间可以通过高速缓存高效的同步数据，而两个 CPU 之间只能通过内存低效的同步数据，所以两个读线程就可能都先看到自己所在的 CPU 上的操作，后看到另一个 CPU 上的操作，这并不与代码中指定的内存顺序矛盾，但一旦出现就会导致 z 为 0 的结果。

可能有的读者会注意到，这种情况下，两个读线程肯定至少有一个没有读到最新的数据，这太诡异了！但大家应该记得我们前面说过，“在多线程中，保证数据一致非常重要，但保证数据最新一般不重要甚至不可能”，所以，这种事真的非常正常。如果还是感到困惑的话，可以考虑这样一个问题：假设我们读到了最新的值，但读到之后，另一个线程马上就把它修改了，那它还是最新的吗？

相对于其它内存顺序，顺序一致的优点是“所有线程看到的顺序是一致的”，但这个优点同样也意味着“所有顺序一致的操作都是串行完成的” ，所以它必然会降低程序的性能。而实践上，绝大多数需要使用顺序一致的地方，都可以通过适当的调整代码来转而使用效率更高的其它内存顺序。但是，我们也应该意识到，内存顺序的控制非常微妙，稍有不慎就会犯错，所以，在不确定该用哪个的时候，请选择顺序一致——算的慢虽然不好，但总比算错了强。

## 实现原理

内存顺序是由编译器和 CPU 分工合作实现的。一部分 CPU 天然就能保证某些内存顺序，比如 x86/64：

* 因为不允许 SS 逆序执行，所以前面的写操作一定先于后面的写操作完成
* 因为不允许 LS 逆序执行，所以前面的读操作一定先于后面的写操作完成

也就是说，对于一个写操作，CPU 可以直接保证排在它前面的任何操作都先于它完成，这正是 release 的语义。在这种情况下，代码中指定的内存顺序仅仅用于防止编译器进行过激的优化。

而在 CPU 无法直接保证某个内存顺序的时候，编译器除了会避免过度优化，也会在生成的代码中插入 CPU 提供的一些特殊指令来构建“内存屏障（memory fence / barrier）”以阻止 CPU 乱序执行。

# 比较并交换（CAS）

我们前面讨论“原子操作”时提到了“比较并交换（CAS）”，它的作用是原子的完成下面这个函数的功能：

```
bool cas( int* dst, int expected, int val ) {
    if( *dst == expected ) {
        *dst = val;
        return true;
    }
    return false;
}
```

这里是以整数为例，实际也支持其它基本数据类型。另外，它的实际实现也存在一些变化，比如有些实现会返回 `*dst` 的原始值，有的实现会使用不同的参数顺序等，但总的来说大同小异，没有本质区别。值得一提的是，有些实现会提供强（strong）、弱（weak）两个版本，区别是弱的那个版本在值相等的情况下也可能不进行赋值而返回 false，这有时能大幅提高性能。

理论知识到这就讲完了，我们回到本文开头的问题，看能否依靠 CAS 操作写一个无锁的版本出来。

可能有的读者会这样写：

```c
std::atomic<int> counter = 0;

int increase_counter() {
    int result = counter.fetch_add( 1, std::memory_order_acq_rel ) + 1;
    // 使用 CAS，到了 11 就归 0
    if( counter.compare_exchange_strong( 11, 0, std::memory_order_acq_rel ) ) {
        result = 0;
    }
    retur result;
}
```

但这个实现是错的，原因在于：虽然我们使用了原子操作，但却使用了两个，所以并发的其它调用可能会在两次操作之间执行，并不能保证整个函数的原子性。因此，我们需要把它改成下面的样子才可以：

```c
std::atomic<int> counter = 0;

int increase_counter() {
    int old, val;
    do {
        // 记录原始值
        old = counter.load( std::memory_order_acquire );
        // 计算新值
        val = old + 1;
        if( val > 10 ) {
            val = 0;
        }
    // 如果 counter 的值仍然是 old，那赋值成功退出循环
    // 否则，进入下一次循环再来一遍
    // 注意，这里可以使用“弱”版的 CAS
    } while( !counter.compare_exchange_weak(old, val, std::memory_order_acq_rel) );
    return val;
}
```

可见，把 CAS 放到一个循环里后，我们就可以在检测到竞争调用时通过重算来确保最终结果的正确了。

但仅仅是这些，还体现不出 CAS 的价值。我们注意到，这个函数的逻辑功能是由“计算新值”这一步完成的，而它的原子性是由函数的其它部分保证的，两部分完全独立，所以，只要我们使用一个新的“计算新值”的逻辑，整个函数就能变成一个新的原子操作，玩法简直无穷无尽。而且，我们还可以再进一步，把通过它实现的多个原子操作组合起来，这样就可以做出很多种轻量级的锁来支持更复杂的逻辑，比如下面这个仅占几个字节内存的单写多读锁，就非常适合锁数量多而冲突概率低的场景：

```c
class swmrl {
private:
    const uint32_t WRITING_FLAG = 0x80000000;
    std::atomic<uint32_t> lock;

public:
    void rlock() {
        while( true ) {
            auto old = lock.load( std::memory_order_acquire );
            if( old & WRITING_FLAG ) { // 其它线程正在写
                continue;
            }
            auto xchg = old + 1;
            if( lock.compare_exchange_weak(old, xchg, std::memory_order_acq_rel) ) {
                break;
            }
        }
    }

    void runlock() {
        lock.fetch_sub( 1, std::memory_order_acq_rel );
    }

    void wlock() {
        while( true ) {
            auto old = lock.load( std::memory_order_acquire );
            if( old & WRITING_FLAG ) { // 其它线程正在写
                continue;
            }
            auto xchg = old | WRITING_FLAG;
            if( lock.compare_exchange_weak(old, xchg, std::memory_order_acq_rel) ) {
                break;
            }
        }

        // 等待所有读操作完成
        while( lock.load(std::memory_order_acquire) != WRITING_FLAG );
    }

    void wunlock() {
        lock.store( 0, std::memory_order_release );
    }
};
```

# ABA 问题

虽然上面最后一个版本的 `increase_counter` 可以检测到竞争调用，但它并不能检测到全部的竞争调用。考虑这样一个场景：在记录原始值后，进行 CAS 操作前，如果其它线程成功执行了 11 次这个函数， counter 就会被恢复成原始值，而它根本发现不了！

这就是 ABA 问题的一个实例。ABA 的意思是，一开始我们记录的值是 A，然后它被修改为 B 再改回 A，这时因为 CAS 操作看到的仍然是 A，就认为值没有被修改过。在 `increase_counter` 这个例子中，即使出现了 ABA 问题，应该也不会造成什么后果，所以我们可以忽略它。但在其它场景下，就必须要小心处理了。

来看一个通过单链表实现无锁栈的例子：

```c
struct node {
	node* next;
	int data;
};

typedef atomic<node*> stack;

void stack_push( stack* s, node* item ) {
	node* old;
	do {
		old = s->load( std::memory_order_acquire );
		item->next = old;
	} while( !s->compare_exchange_weak(old, item, std::memory_order_acq_rel) );
}

node* stack_pop( stack* s ) {
	node* old;
	node* next;

	do {
		old = s->load( std::memory_order_acquire );
		if( old == nullptr ) {
			break;
		}
		next = old->next;
	} while( !s->compare_exchange_weak(old, next, std::memory_order_acq_rel) );

	return old;
}
```

在入栈和出栈时，虽然代码都通过 CAS 保证了栈顶指针的没有发生变化，但在下面的调用序列中却会出问题：

```c
// 线程 1 调用 stack_pop 记录了栈顶的原始位置和期望的新栈顶位置
	do {
		old = s->load( std::memory_order_acquire );
		if( old == nullptr ) {
			break;
		}
		next = old->next;
		// 线程 1 执行到了这里


// 这时线程 2 弹出了 a、b 两个元素，并将 a 重新压入了栈中
	node* a = stack_pop( &stack ); // a 是线程 1 记录的栈顶的原始位置
	node* b = stack_pop( &stack ); // b 是线程 1 期望的新栈顶位置
	stack_push( &stack, a );       // 栈顶重新变成了 a


// 线程 1 继续执行，将栈顶换成了已经被弹出的 b!
	} while( !s->compare_exchange_weak(old, next, std::memory_order_acq_rel) );
```

如果没有硬件的支持，就必须使用额外的锁才能解决上面例子中的问题，但幸运的是，常用 CPU 都支持双倍字长的 CAS 操作，所以，我们就多出了一个 CPU 字长的空间来为 CAS 额外提供一些不会重复的信息，具体点说，就是记录栈顶位置时，除了原有的指针外，再增加一个每次操作（不论出栈还是入栈）都会加一的计数器，然后用 CAS 同时操作二者，这样，因为计数器不存在 ABA 问题（好吧，我知道溢出会导致计数器重复，但即使是在 16 位系统上，这也意味着当前线程在和其它线程的竞争中，连续输了几万次），整个栈操作也就不再有问题。

下面就是新的实现，由于 128 位整数在 C++ 中不是标准的数据类型，所以我们这个实现的目标系统是 32 位的，也就是一个普通指针占用 4 字节的内存。

```c
struct node {
    node* next;
    int data;
};

union stack_head {
    uint64_t v;
    struct {
        node* n;    // 栈顶指针
        uint32_t c; // 计数器
    };
};

typedef atomic<uint64_t> stack;

void stack_push( stack* s, node* item ) {
    stack_head oldHead, newHead;
    newHead.n = item;
    do {
        oldHead.v = s->load( std::memory_order_acquire );
        item->next = oldHead.n;
        newHead.c = oldHead.c + 1;
    } while( !s->compare_exchange_weak(oldHead.v, newHead.v, std::memory_order_acq_rel) );
}

node* stack_pop( node* stack ) {
    stack_head oldHead, newHead;

    do {
        oldHead.v = s->load( std::memory_order_acquire );
        if( oldHead.n == nullptr ) {
            break;
        }
        newHead.n = oldHead.n->next;
        newHead.c = oldHead.c + 1;
    } while( !s->compare_exchange_weak(oldHead.v, newHead.v, std::memory_order_acq_rel) );

    return oldHead.n;
}
```

# 尴尬的结尾

这一节本来不在写作计划内，但写前面一节的时候，突然发现那个栈的最终实现有问题，而从我第一次看到这样的栈到现在已经十多年了，你说尴尬不尴尬？

那个栈的问题在于 `stack_pop`  中的 `newHead.n = oldHead.n->next` 这一行，它访问 `oldHead.n` 没有问题，但访问 `oldHead.n->next` 却可能导致程序崩溃，因为在多线程中，`oldHead.n` 指向的结点有被其它线程弹出并释放了的可能。当然，触发这个问题不仅需要应用程序释放结点，还需要操作系统回收了结点使用的物理内存。我的程序之所以一直没出错，就是因为我用这个栈实现的是一个[内存池](https://github.com/localvar/legacy/tree/master/lockfree/mempool)，所以结点占用的内存永远不会被操作系统回收。

而更为尴尬的，是这个错误并不是我一个人在犯。比如 [reactos](https://reactos.org/) （一个开源的 windows 系统的克隆）中的[这个实现](https://github.com/reactos/reactos/blob/893a3c9d030fd8b078cbd747eeefd3f6ce57e560/sdk/lib/rtl/i386/interlck.S)，虽然是用汇编写的，但存在的问题一模一样。

而 reactos 模仿的是 windows 上的 `InterlockPushEntrySList` 和 `InterlockPopEntrySList`， 后者也是我十多年前参考的对象。这两个函数操作的是一个名为 `SLIST_HEADER` 结构体，与前面我定义的 `stack_head` 区别不大，具体如下：

```c
typedef struct _SLIST_HEADER
{
     union
     {
          UINT64 Alignment;
          struct
          {
               SINGLE_LIST_ENTRY Next;
               WORD Depth;    // 多了栈的深度，即入栈的元素数量
               WORD Sequence; // 但计数器变成了 16 位的
          };
     };
} SLIST_HEADER, *PSLIST_HEADER;
```

大家应该已经发现，单单依靠这样一个结构体，无法解决上面提到的问题，必须引入一个锁才行，而在这个场景下，最合适的方案是在结构体中增加一个整数成员，并使用 CAS 操作将它变成自旋锁，这样，只付出很少的成本，就可以保证每个 `SLIT_HEADER` 独自享有一个锁。

条件所限，我懒得去查这两个函数在 windows xp 上的实现细节了，但通过反汇编 windows 10 上的实现，我发现它采用的方案是预定义 32 个自旋锁，然后通过当前 `SLIST_HEADER`  的地址的哈希值来决定使用哪个锁，也就是说，有可能出现两个或多个 `SLIST_HEADER`  竞争一个锁的情况。

而且，用了自旋锁之后，`Sequence` 字段就没什么用了，把它去掉，把 `Depth` 变成 32 位的不是更香吗？

综上，请允许我无责的推理一下：windows 上最早的实现也是错的，然后微软发现了问题，可是 `SLIST_HEADER` 已经被广泛使用，修改其定义的后果是无法接受的，所以只好退而求其次选择了现在的方案。

最后，这个问题也反映出多线程里的坑不仅多而且隐蔽，我们看到了 ABA 这个坑，小心翼翼地躲过去了，却马上栽到了另一个坑里。而且，一旦栽倒，我们就会发现爬出来有多难：问题的现象看到了，却怎么也找不到根源——二者距离太远了，只能靠猜；好不容易猜了一个，想再进坑验证一下，却又找不到坑了，只能靠长时间的运行来提高概率碰运气。这也是很尬尴的。所以，多线程的开发中，小心一点，再小心一点，尽最大努力躲开坑，或许才是避免尴尬的最佳选择。

## 参考资料

* [std::memory_order](https://en.cppreference.com/w/cpp/atomic/memory_order)
* [Weak vs. Strong Memory Models](https://preshing.com/20120930/weak-vs-strong-memory-models/)
* [Memory Reordering Caught in the Act](https://preshing.com/20120515/memory-reordering-caught-in-the-act/)
* [Intel® 64 and IA-32 Architectures Software Developer’s Manual: Volume 3](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-system-programming-manual-325384.pdf)
* [AMD64 Architecture Programmer’s Manual, Volume 2](https://www.amd.com/system/files/TechDocs/24593.pdf)
