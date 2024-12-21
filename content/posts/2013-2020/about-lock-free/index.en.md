+++
title = 'About Lock-free Multithreading'
date = 2020-12-12T15:08:22+08:00
categories = ['技术']
tags = ['多线程']
summary = "Introduce concepts and techniques of lock-free programming, including atomic operations, memory model, memory order, CAS, etc." 
+++

[中文版]({{< ref path="about-lock-free.md" lang="zh-cn" >}})

Let's start with a simple question: we have an integer with initial an value `0` as a counter, if we want to write a function that adds `1` to it in each call but resets it to `0` after its value reaches 10, how should this function be implemented?

Just a piece of cake, isn't it? I think even beginners could easily write out the following code:

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

Okay, let's make it a little harder by putting it into a concurrent environment. It seems still not difficult, we only need to add a lock:

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

This is correct, but if we count performance and memory usage in, then it is not good enough: for performance, though the implementation of `Lock` differs from operating systems, it usually requires a switch from user mode to kernel mode and then back to user mode, compare to the simple self increment operation, this is too expensive; for memory usage, the `counter` variable only needs 4 bytes typically, but `lock` may use as many as dozens of bytes, which is also big waste.

To avoid these two issues, we need to introduce the protagonist of this article, "Lock-free multithreading technologies".

But don't be fooled by the word "lock-free": strictly speaking, as long as there are write operations in the concurrent access of multiple threads to the same object, a lock is needed. The so-called lock-free just means "no additional lock is required (i.e., the object to be protected by the lock itself is used as the lock)" and/or "only use lightweight locks (never enter the kernel)".

However, multithreading is hard already, thus multithreading with the word "lock-free" will be harder.

# Why lock-free multithreading is hard?

For the sake of precision, documents of lock-free technology are all quite obscure. I wrote this article in the hope of making it easier to understand, but in the process of preparing the materials, I found that my understanding of many details is inaccurate, so putting my goal aside, I'm now doubting if I could make it correct.

Also, lock-free multithreading is more counter-intuitive: for performance optimization, both compiler and CPU reorder the code, which makes the actual execution order of the code differ from expectation, this will not cause an issue in a single-threaded program but will affect the result of a multithreaded one.

Compiler reordering is easy to understand, take the following code as an example: because the execution order of statements 2, 3, and 4 won't affect the final result, compilers may reorder them, and an aggressive compile may even merge 2 and 4 into one statement, `a += 2`.

```c
int a = 0, b = 0;                  // 1
a++;                               // 2
b++;                               // 3
a++;                               // 4
printf( "a + b = %d\n", a + b );   // 5
```

But CPU reordering is tricky, for example: suppose `x`, and `y` are two integer variables with an initial value of 0, and thread 1 executes (we should use assembly code here, but using C/C++ code makes it easier to understand, and since all the statements are simple assignment operations, we can assume that each line of code corresponds to one CPU instruction): 

```c
x = 1;
int r1 = y;
```

Thread 2 executes:

```c
y = 1;
int r2 = x;
```

Then, what the final value of `r1` and `r2` will be?

The answer seems to be: it depends on the order in which the two threads are executed, so it's hard to say what the result will be, but what we do know is that at least one of `r1` and `r2` will be 1, that is to say, they cannot both be 0.

Well, the unpredictable execution order of the two threads leads to an unpredictable final result, that sounds correct. So, although the CPU-caused reordering is more complex, it looks nothing more than that either.

But wait a minute, the execution order of the two threads is determined by the operating system's scheduling, and has nothing to do with the CPU, so what does the CPU-caused reordering look like?

Let's turn the above example into a real program and check, compile the following code with `g++ -O3 <xxxx>.cpp -lpthread`:

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
        while( !run_thread1 );           // wait the signal from main thread to execute

        x = 1;
        asm volatile( "" ::: "memory" ); // prevent compiler reordering
        r1 = y;

        run_thread1 = false;
        done++;                          // notify main thread that this thread is done
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
        x = 0, y = 0, r1 = -1, r2 = -1;  // reset

        // notify the two working threads to start their tasks
        done = 0;
        run_thread1 = true;
        run_thread2 = true;

        while( done < 2 );              // wait until both threads are done

        // check if both r1 and r2 are 0
        if ( r1 == 0 && r2 == 0 ) {
            reorder++;
            printf( "number of reorders: %d, iterations: %d\n", reorder, i );
        }

        // sleep a while to prevent too fast output, if you can't see the expected result,
        // try to adjust the sleep time
        std::this_thread::sleep_for( 50ms );
    }
    return 0;
}
```

In my environment (Ubuntu 20.04 running in WSL 2, CPU i5-8265, different hardware and software may give different results), the output is:

```shell
~/test$ ./a.out
number of reorders: 1, iterations: 3
number of reorders: 2, iterations: 4
number of reorders: 3, iterations: 6
number of reorders: 4, iterations: 7
number of reorders: 5, iterations: 9
number of reorders: 6, iterations: 11
number of reorders: 7, iterations: 12
number of reorders: 8, iterations: 13
number of reorders: 9, iterations: 17
```

Oops, not only do we see that `r1` and `r2` are both 0, but also the probability is very high. And this is the CPU reordering!

I think everyone will get confused when he/she first sees these counter-intuitive things, and even if not confused anymore, it is still not easy to make things 100% correct, because controlling the code that doesn't follow common sense is sometimes very subtle, and mistakes can be made as the result of a most slightly careless.

To understand lock-free multithreading, resolve confusion and avoid mistakes, we need to learn some theoretical knowledge. Let's get started.

# Atomic Operations

Atomic operations are the basic building blocks of multithreading programming, nearly all multithreading articles talk about them, so do this one.

Most CPUs guarantee the atomicity of some operations from the hardware level. These operations are the basis of data consistency of a multi-threaded program. For example, starting from the Pentium processors, without any additional processing, 1/2/4/8 byte aligned 1/2/4/8 byte reads/writes are atomic on x86 series CPUs, and 16-byte aligned 16-byte reads/writes are also atomic on AMD64 series CPUs.

In addition to the simple reads and writes, most CPUs guarantee the atomicity of some more complex "read-modify-write" operations too, such as addition, subtraction, bitwise AND, bitwise OR, etc.

And the most important atomic operation is the CAS(compare and swap) operation, which we will talk about in detail later.

Though CPUs support atomic operations, there are differences in how they support them. Thus, all major programming languages provide a set of equivalent APIs through built-in functions or library to mask these differences and improve portability. For examples:

* GCC provides built-in functions prefixed with `__atomic`;
* MSVC provides built-in functions prefixed with `_Interlocked`;
* C\+\+11 provides the `std::atomic` template class (this is what we are using in this article)
* Java provides the `java.util.concurrent.atomic` package
* Go provides the `sync/atomic` package
* Rust provides the `std::sync::atomic` package

It should be noted that most of the atomic operations require a correct byte alignment, and the above APIs are generally translated into corresponding CPU instructions directly, so they are still not atomic unless the alignment and length of the data are correct. In this article, we will call data that satisfies the requirements an "atomic variable".

And, readers who are new to multithreading often expect to fetch the latest value through atomic operations. For example, if we have an integer with an initial value of 0 (all bits are 0), and, while one thread is reading it, another thread changes it to -1 (all bits are 1), we may expect the first thread to get -1.

However, this is not the case, atomic operations can only guarantee that the value we get is consistent(0 or -1, not other values with only some bits set to 1), but not which one it is. In fact, it is very important to ensure that the data is consistent in multithreading, while it is generally not necessary and often impossible to ensure that the data is up-to-date. This is a major difference between multithreaded and single-threaded programming.

# Memory Model

There are only two kinds of accesses a CPU can make to memory(including CPU cache), read and write. But when talking about memory models of CPU, the equivalent words `LOAD(L)` and `STORE(S)` are used instead of READ and WRITE.

If we consider any two consecutive memory accesses, there are four combinations: `LL`, `LS`, `SL`, and `SS`. The memory model could tell us, for a given combination, whether or not the two memory accesses are allowed to be performed in reverse order, and note that "reverse order is allowed" does not mean "if reverse order is allowed then the order will always be reversed". In addition, the two memory accesses mentioned here must be accessing different memory addresses, if they are accessing the same address, then the two operations themselves have dependencies and will never be executed in reverse order.

Based on the allowed reversible combinations, there are 4 commonly used memory models:
* **Sequentially consistent**: no combination is allowed to be reversed.
* **Strong**: only allow `SL` to be reversed, please be careful not to mix it up with the "sequentially consistent" model.
* **Weak with data dependency**: all combinations are allowed to be reversed, but if there is a data dependency between the two operations, then not.
* **Weak**: allow all combinations to be reversed.

Among the common CPUs, the x86/64 series uses the "strong" model, so `SL` may become `LS`, this is why we can see that `r1` and `r2` are both 0 in the example above.

And the arm/arm64 series uses the "weak with data dependency" model. Here, "data dependency" means that the latter operation depends on the result of the former operation, for example, coping one byte from address A to address B is a combination of `LS` that reads first and then writes, because the data to be written is the result of the read operation, there's a dependency between these two operations. On the CPUs of this model, combinations with similar dependencies are not allowed to be reversed.

Because the arm/arm64 series uses a weaker model, some programs that don't have problems on x86/64 will have a problem on arm/arm64. To show the difference, we can revise the previous example to make thread 1 execute `SS`:

```c
x = 1;
y = 1;
```

And thread 2 execute `LL`

```c
r1 = y;
r2 = x;
```

On x86/64, we can never see the result of `r1` is 1 and `r2` is 0, because neither `SS` nor `LL` can be executed in reverse order, but on arm/arm64, we might see this result.

However, I didn't see the desired result by simply making the above modifications to the code on arm/arm64, actually, I took a lot of effort to change the code to below(please refer to [《与程序员相关的CPU缓存知识》](https://coolshell.cn/articles/20793.html) to find out why) before I saw the result.

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
    char dummy[60];    // ensure x and y are not in the same cache line
    int y;             // z must be next to y to try to put them in the
    int z;             // same cache line
} s;

int r1, r2;

void thread1() {
    for( ; ; ) {
        while( !run_thread1 );           // wait the signal from main thread to execute

        s.z = 1;                         // z must be assigned first
        asm volatile( "" ::: "memory" ); // prevent compiler reordering
        s.x = 1;
        asm volatile( "" ::: "memory" );
        s.y = 1;

        run_thread1 = false;
        done++;                          // notify main thread that this thread is done
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
        s.x = 0, s.y = 0, s.z = 0, r1 = -1, r2 = -1;  // reset

        // notify the two working threads to start their tasks
        done = 0;
        run_thread1 = true;
        run_thread2 = true;

        while( done < 2 );              // wait until both threads are done

        // check if r1 is 1 and r2 is 0
        if ( r1 == 1 && r2 == 0 ) {
            reorder++;
            printf( "number of reorders: %d, iterations: %d\n", reorder, i );
        }
    }
    return 0;
}
```

This new program generated the desired result (`r1` is 1 and `r2` is 0) successfully on my Raspberry Pi 4, which uses an arm CPU, but not on my x86/64 laptop.

At the time I wrote this part, Apple released its new M1 MacBook, with a huge edge over x86/64 in terms of performance and power consumption. But as the M1 chip is in the ARM camp, we developers could not be happy yet, because, if portability hasn't been considered before, migrating our programs written for x86/64 to it by a simple re-compilation will result in great potential risks.

# Memory Order

Due to the application of technologies such as superpipelined, multiple issues, superscalar, etc., modern CPUs may execute multiple instructions at the same time even if there's only one core. However, for our programs, the behavior of the CPU is only visible when there is a memory (including CPU cache) access, so we can think of the order in which the CPU accesses memory as the order in which it executes instructions. Therefore, as long as we can control the order of memory access, we can avoid the issues caused by the CPU memory models.

The method of controlling the memory access order is called "memory order", and the C/C++ language defines six memory orders, all of which only make sense for atomic operations. By using them wisely, we can prevent the compiler and CPU from reordering instructions in key places, ensuring that the logic of the program is correct, and improving portability. These memory orders are explained separately below.

## Relaxed

The `relaxed` memory order only guarantees the atomicity of the operation, the compiler and CPU are still free to reorder operations that use this memory order. When using reference counting to manage the lifecycle of an object, we can use this memory order when increasing the count, because we only need to ensure that the count increases, but when decrementing, we must use the `acquire-release` memory order described below to ensure that the destruction operation is performed after the count is reduced to 0.

## Acquire / Consume and Release

There is a strong connection between `acquire`/`consume` and `release`, so put them together. As the name suggests, `acquire` is great for acquiring locks (locking), and `release` is great for releasing locks (unlocking).

If a read operation uses the `acquire` memory order, then no operation in the current thread is allowed to be reordered before the read, but it does not prevent operations from being reordered after the read. For example, suppose `x`, `y`, and `z` are three integer atomic variables:

```c
x.store( 1, std::memory_order_relaxed );      // use relaxed to set x to 1
int n = y.load( std::memory_order_acquire );  // use acquire to read the value of y
z.store( 2, std::memory_order_relaxed );      // use relaxed to set z to 2
```

Then, writing to `z` will never be executed before reading from `y` because `acquire` doesn't allow this kind of reordering. But writing to `x` may be executed after reading from `y` because `acquire` allows it.

`Consume` is similar to `acquire` in that it is used for read operations, but it only ensures that operations in the current thread that depend on the result of the read are not reordered before the read.

If a write operation uses the `release` memory order, then no operation in the current thread is allowed to be reordered after the write, but it does not prevent operations from being reordered before the write. For example, suppose `x`, `y`, and `z` are three integer atomic variables again:

```c
x.store( 1, std::memory_order_relaxed );      // use relaxed to set x to 1
y.store( 2, std::memory_order_release );      // use release to set y to 2
z.store( 3, std::memory_order_relaxed );      // use relaxed to set z to 3
```

Then, writing to `x` will never be executed after writing to `y` because `release` does't allow this kind of reordering. But writing to `z` may be executed before writing to `y` because `release` allows it.

While using them alone can prevent reordering, it makes more sense to use `acquire`/`consume` and `release` together, take the combination of `acquire` and `release` as an example: if thread A writes an atomic variable using `release`, and thread B reads the same variable using `acquire`, then the combination guarantees that if B's `acquire` operation sees the result of A's `release` operation, then it can also see the result of other operations in A that before the `release` operation, even if these operations are not atomic(but this doesn't mean B can't see the results of these operations before it sees the result of the `release` operation).

## Acquire_release

`Acquire` and `release` can be used on one operation at the same time, in which case the memory order is called `acquire-release`, it prevents any operation from being recordered before or after the current operation and is useful for the "read-modify-write" operations, such as the self increment operation.

## Sequentially consistent

At first glance, `sequentially consistent` seems to be the simplest one of the six memory orders, but this is a misunderstanding. It seems simple because it seems to mean "reorder is completely prohibited, and the code must be executed in the order in which they are written"; It is a misunderstanding because it means more than that, otherwise, the same can be done via using `acquire` for all read, `release` for all write, and `acquire-release` for all read-modify-write, why introduce a new `sequential consistent`? 

In fact, for a single operation, the semantics of `sequential consistent` are indeed the same as acquire, release, or acquire-release. But if we put all the `sequential consistent` operations together, it can also guarantee that all threads see the results of all operations in a globally consistent order. Note that it is impossible to predict the order in advance, so "see" means "observed" rather than "predict".

Take the following code as an example: suppose there are 4 threads, and each executes one of the 4 functions, because all operations are `sequentially consistent`, so if one thread sees A happen before C, then no other threads can see C happen before A, and vice versa, this means, when all threads finish executing, `z` can't be 0.

However, even if we see A happens before C, and know that B happens before C because of `write_a_then_y`, we still can't tell the order of A and C(although theoretically, it must be one after the other), this is why this memory order is named with "consistent" rather than other words.

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

But if we change one of the operations to not use `sequential consistent`, such as below, then it is possible that `read_x_then_y` sees `x` modified before `y`, and `read_y_then_x` sees `y` modified before `x`, resulting in `z` ending up at 0.

```c
void read_y_then_x() {
    while( !y.load(std::memory_order_seq_cst) );
    // make x.load to use acquire, this change doesn't affect the execution
    // order of the current thread
    if( x.load(std::memory_order_acquire) ) {
        ++z;
    }
}
```

If you wonder why threads may see different memory modification orders, please think about this scenario: there's a computer with two CPUs, and each CPU has two cores. If thread `write_x` and `read_x_then_y` run on the two cores of CPU1, and the other two threads run on the two cores of CPU2, since cores of the same CPU can synchronize data more efficiently through the cache, while cores of different CPUs can only synchronize data slowly through the memory, then both reading threads may see operations of its CPU before the operations of the other CPU. This does not violate the specified memory order but will result in z being 0 once occurs.

Some readers may argue that at least one of the two reading threads hasn't got the latest data in this case, it is weird! But just as I have mentioned before: it is very important to ensure that the data is consistent in multithreading, while it is generally not necessary and often impossible to ensure that the data is up-to-date.  So, this is actually a common case.

If you're still confused, please think about this: one thread does get the latest data via a read, but immediately after that, another thread modifies it, is the data of the first thread still up-to-date?

Compared to other memory orders, the pro of `sequential consistent` is that "all threads see the same order", but this also means that "all sequential consistent operations are done serially", so it will inevitably impact the performance of the program.

Theoretically, most operations that use `sequential consistent` can switch to use other memory orders through a proper modification of the code. But we should also be aware that the control of memory order is subtle and mistakes can be made easily, so if you're not sure which memory order to use, choose `sequential consistent` - it's not good to be slow, but better than a bug.

## How memory order is implemented

Memory order is achieved by the cooperation of the compiler and CPU. Some CPUs inherently guarantee certain memory orders, such as x86/64:

* A write will never be reordered before another write, because reordering of `SS` is not allowed;
* A write will never be reordered before a read, because reordering of `LS` is not allowed.

That is to say, for a write operation, the CPU guarantees that any operation that precedes it will complete before it, which is the semantics of `release`. In this case, the memory order specified in the code is only to prevent the compiler from an aggressive optimiztion.

And if a CPU cannot guarantee a certain memory order inherently, the compiler will do more to insert some special instructions supported by the CPU into the code to build a "memory fence/barrier" and prevent the CPU from executing out of order.

# Compare And Swap(CAS)

We have mentioned "Compare and Swap (CAS)" earlier in the discussion of "atomic operations", it can do the job of the below function atomically.

```c
bool cas( int* dst, int expected, int val ) {
    if( *dst == expected ) {
        *dst = val;
        return true;
    }
    return false;
}
```

The function above is for integers, but other basic data types are also supported. And its prototype also varies, some return the original value of `*dst`, some use a different parameter order, etc., but in general, there's no essential difference and they are basically the same.

One thing worth mentioning is that the variants could also be "strong" or "weak", with the difference that the weak one may return `false` even if `*dst` and `expected` are equal, which can sometimes improve performance.

That's all of the knowledge about CAS, let's go back to the question at the beginning of this article to see if we can write a lock-free version with the help of CAS.

Some readers may do it like this:

```c
std::atomic<int> counter = 0;

int increase_counter() {
    int result = counter.fetch_add( 1, std::memory_order_acq_rel ) + 1;
    // use CAS to reset 11 to 0
    if( counter.compare_exchange_strong( 11, 0, std::memory_order_acq_rel ) ) {
        result = 0;
    }
    retur result;
}
```

Unfortunately, this is incorrect, because: although we are using atomic operations, we are using two of them, and concurrent calls can be made between the operations, thus the entire function is not atomic. Therefore, we need to change it as below:

```c
std::atomic<int> counter = 0;

int increase_counter() {
    int old, val;
    do {
        // save the old value
        old = counter.load( std::memory_order_acquire );
        // calculate the new value
        val = old + 1;
        if( val > 10 ) {
            val = 0;
        }
    // compare counter with the old value, if equal then assign new value to
    // counter and exit the loop, otherwise, try again until succeed.
    // note we are using the weak variant of CAS here.
    } while( !counter.compare_exchange_weak(old, val, std::memory_order_acq_rel) );
    return val;
}
```

As we can see, by putting CAS into a loop, we can detect race conditions and make retries when necessary to ensure the result is correct. But this hasn't shown the real power of CAS!

You may already notice that the core functionality of the function is done by the "calculate the new value" part of the loop, the atomicity of the function is achieved by the reset parts of the loop, and the two parts are completely independent. This means, that by replacing the "calculate the new value" part with a new one, the entire function becomes a new atomic operation, the possibilities are endless!

Moreover, we can go even further, by combining several atomic operations implemented by CAS, we can make many lightweight locks for more complex scenarios, for example, the following single-writer-multiple-reader-lock only uses several bytes of memory, this makes it a better choice when we need to use a lot of locks.

```c
class swmrl {
private:
    const uint32_t WRITING_FLAG = 0x80000000;
    std::atomic<uint32_t> lock;

public:
    void rlock() {
        while( true ) {
            auto old = lock.load( std::memory_order_acquire );
            if( old & WRITING_FLAG ) { // other threads are writing
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
            if( old & WRITING_FLAG ) { // other threads are writting
                continue;
            }
            auto xchg = old | WRITING_FLAG;
            if( lock.compare_exchange_weak(old, xchg, std::memory_order_acq_rel) ) {
                break;
            }
        }

        // wait for all read operations to complete
        while( lock.load(std::memory_order_acquire) != WRITING_FLAG );
    }

    void wunlock() {
        lock.store( 0, std::memory_order_release );
    }
};
```

# The ABA Problem

While the last version of `increase_counter` above can detect data races, it cannot detect all of them. Consider this scenario: after the old value is saved, if other threads successfully execute the function 11 times before the CAS operation, then the counter will be restored to the saved value, and  `increase_counter` cannot notice it at all! This is an example of the ABA problem.

ABA means, the value we saved at the beginning is A, but was modified to B and then back to A again, and after all of these, because CAS still sees A, it assumes that the value was not been modified. In the case of `increase_counter`, it should not be a big issue even if there is an ABA problem, so we can just ignore it. But it may cause serious bugs in other cases, let's show this with an example of a singly linked list-based lock-free stack:

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

In the push and pop operations, although the code ensures that the stack pointer does not change via CAS, there's a bug in the following execution sequence.

```c
// thread 1 calls stack_pop, saves the original stack pointer and the
// expected new stack pointer
	do {
		old = s->load( std::memory_order_acquire );
		if( old == nullptr ) {
			break;
		}
		next = old->next;
        // thread 1 suspends here


// now, thread 2 pops two items, a and b out from the stack, and then
// pushes a into the stack again
	node* a = stack_pop( &stack ); // a is the original stack pointer saved by thread 1
	node* b = stack_pop( &stack ); // b is the expected new stack pointer of thread 1
	stack_push( &stack, a );       // stack pointer becomes a again

// thread 1 resumes execution and replaces the stack pointer with b!
	} while( !s->compare_exchange_weak(old, next, std::memory_order_acq_rel) );
```

Without hardware support, we will have to use additional locks to fix the bug above, but fortunately, all common CPUs support double-word length CAS operations, so we have an extra CPU word to provide the CAS operation with some additional information.

Specifically, when saving the stack pointer, we will save an additional counter which increases for each stack operation (no matter push or pop), and then use CAS to operate both at the same time. Because the counter is immune from the ABA problem (well, I know the counter may overflow, but even on a 16-bit system, this means that the current thread is losing tens of thousands of times in a row in competition with other threads before it cause a real problem), the entire stack is also immune from it.

The following is the new implementation, but since 128-bit integers are not a standard data type in C++, the target system of this example is 32-bit, which means that a pointer takes up 4 bytes of memory.

```c
struct node {
    node* next;
    int data;
};

union stack_head {
    uint64_t v;
    struct {
        node* n;    // the stack pointer
        uint32_t c; // the counter
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

# An Embarrassing Ending Section

This section was not originally in the writing plan, but when I wrote the previous section, I suddenly noticed that there was a problem with the final implementation of the stack, and it has been more than ten years since I first saw such a stack, what an embarrassment!

The problem with the above implementation is at line `newHead.n = oldHead.n->next` of function `stack_pop`, it is safe to access `oldHead.n`, but accessing `oldHead.n->next` is not. Because in a multithreading program, the node that `oldHead.n` points can be popped out and released by other threads. However, triggering this bug not only requires the program to release the node but also requires the corresponding memory to be inaccessible. The reason that my program has never gone wrong in more than ten years is that I implemented a memory pool with this stack, and the memory of the nodes was never actually freed.

What's more embarrassing is, that not only did I make this mistake, for example, [this implementation](https://github.com/reactos/reactos/blob/893a3c9d030fd8b078cbd747eeefd3f6ce57e560/sdk/lib/rtl/i386/interlck.S) in [ReactOS](https://reactos.org/)(an open-source Windows clone), although written in assembly code, has the same problem.

ReactOS, on the other hand, is mimicking `InterlockPushEntrySList` and `InterlockPopEntrySList` of Windows. The two Windows APIs are also my reference a decade ago, they operate on a struct called `SLIST_HEADER`, which is not much different from the `stack_head` I defined above:

```c
typedef struct _SLIST_HEADER
{
     union
     {
          UINT64 Alignment;
          struct
          {
               SINGLE_LIST_ENTRY Next;
               WORD Depth;    // stack depth (number of elements in the stack)
               WORD Sequence; // the counter
          };
     };
} SLIST_HEADER, *PSLIST_HEADER;
```

As you may already find out, using such a struct alone cannot solve the problem we mentioned above, thus a lock must be introduced. The most appropriate solution in this scenario is to add an integer member to the struct and use CAS to make it a spin lock so that each `SLIT_HEADER` can have a lock on its own at a very small cost.

As Windows XP expired many years ago, I didn't check the implementation details of these two APIs on it, but by disassembling the implementation on Windows 10, I found that it predefines 32 spin locks and then uses the hash of the current `SLIST_HEADER`'s address to decide which lock to use, i.e., there is a possibility that two or more `SLIST_HEADER` compete for one lock.

Also, the `Sequence` field is useless after adding the spinlocks, wouldn't it be better to remove it and turn the Depth into 32-bit?

Put all above together, please allow me to reason without responsibility: the earliest implementation on Windows was also incorrect, and then Microsoft noticed the problem, but `SLIST_HEADER` is already widely used, and the consequences of changing its definition are unacceptable, so they have to settle for the current solution.

Finally, this problem also shows how many pitfalls we will meet in multithreaded programming: we saw the ABA problem and carefully avoided it, but were defeated by another bug immediately. And, once we meet a bug, we will find out how difficult to fix it: we saw the wrong behavior, but haven't any clue about the root cause as it happened minutes or even days ago, and the crime scene has already been destroyed, thus we can only guess. We guessed one, and try to verify if we are correct, but then sadly discovery that we cannot reproduce the bug, and have to rely on long-term execution to increase the possibility. This is also embarrassing.

Therefore, be careful and be more careful, and try best to not make mistakes will always be the best choice to avoid embarrassment in multi-threaded development.

# Reference

* [std::memory_order](https://en.cppreference.com/w/cpp/atomic/memory_order)
* [Weak vs. Strong Memory Models](https://preshing.com/20120930/weak-vs-strong-memory-models/)
* [Memory Reordering Caught in the Act](https://preshing.com/20120515/memory-reordering-caught-in-the-act/)
* [Intel® 64 and IA-32 Architectures Software Developer’s Manual: Volume 3](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-system-programming-manual-325384.pdf)
* [AMD64 Architecture Programmer’s Manual, Volume 2](https://www.amd.com/system/files/TechDocs/24593.pdf)
