+++
title = 'Extend Backend Application With WebAssembly'
date = 2021-09-17T10:15:00+08:00
categories = ['技术']
tags = ['其他', 'MegaEase']
summary = "This article describes the process of using WebAssembly to extend a backend application and how to solve common problems."
+++

[中文版]({{< ref path="wasm-at-backend.md" lang="zh-cn" >}})

# 1. WebAssembly Introduction

With the evolution of the Internet, more and more applications have been migrated to the web with
the help of JavaScript, but people also notice that downloading, parsing, and compiling JavaScript
consumes a lot of time, resulting in long page loading time, and finally, loss of users.

In order to solve these problems, Alon Zakai, an engineer from Mozilla, proposed Asm.js in 2012.
After several years of development, it finally evolved into WebAssembly in 2015.

> WebAssembly (abbreviated Wasm) is a binary instruction format for a stack-based virtual machine.
Wasm is designed as a portable compilation target for programming languages, enabling deployment on
the web for client and server applications.

This is the official definition of WebAssembly on [webassembly.org](https://webassembly.org). From
this definition, we can see that WebAssembly is a binary instruction format. But WebAssembly Text
Format is often called WebAssembly too, while in fact, this text format is more like a programming
language.

After the official announcement, WebAssembly got rapid development. By November 2017, Mozilla
announced that all major browsers including Chrome, Firefox, Safari, etc. have supported
WebAssembly. And according to the data in July 2021, 94% of the browsers being used have supported
WebAssembly.

After being widely supported by browsers, some heavyweight applications have been gradually ported
to the Web, including:
- [Google Earth](https://earth.google.com/web/) - A Software renders a 3D representation of Earth
  based primarily on satellite imagery.
- [AutoCAD](https://web.autocad.com/) - A computer-aided design and drafting software application.
  It is a desktop app running on microcomputers with internal graphics controllers.
- [Doom](http://www.continuation-labs.com/projects/d3wasm/) - A video games consist of first-person
  shooters 
- [TensorFlow](https://blog.tensorflow.org/2020/03/introducing-webassembly-backend-for-tensorflow-js.html) - A
  free and open-source software library for machine learning and artificial intelligence. 
- ...

These cases also show that WebAssembly has reached its design goal - enabling deployment on the web
for desktop applications.

The rapid development of WebAssembly comes from its special characteristics:
- **Nearly native performance**: benchmarks show it is only about 10% slower than native code.
- **Small in size and fast to load**: WebAssembly is a compact binary format, usually much smaller
  than the equivalent Javascript code.
- **Safe and Secure**: WebAssembly code runs in the sandbox, and no external access is allowed by
  default.
- **Supports multiple languages**: WebAssembly does not limit the language users use for development.
  As long as there is a corresponding compiler, any language can be compiled into WebAssembly.

# 2. WebAssembly On Backend

In the official definition of WebAssembly, the phrase "for a stack-based virtual machine" is also
worthy of attention, because it leads WebAssembly, a technology that was originally designed for the
Web, and with the name contains the word "Web", eventually enters the field of back-end.

This is because, from VMWare WorkStation and VirtualBox in the earlier days to Docker of today,
virtualization technology has always been a foundation of cloud computing. Therefore, as a virtual
machine code format with many advantages, WebAssembly entering the field of back-end application is
an inevitable trend. Solomon Hykes, the founder of Docker, said in 2019, *"If WASM+WASI existed in
2008, we wouldn’t have needed to created Docker"*, this shows the promising prospects for WebAssembly
adoption in back-end applications.

Of course, Solon Hykes said that he did not mean "WebAssembly will replace Docker" a little later.
This is also the common view in the industry today: WebAssembly and Docker have their own advantages
and complement each other. Specifically:
- The size of the WebAssembly program is usually around 1M, while the Docker image often easily
  exceeds 100M, so WebAssembly has a much faster loading speed.
- The cold start speed of WebAssembly programs is approximately 100 times faster than that of Docker
  containers.
- WebAssembly runs in the sandbox, and any interaction with the outside can only be carried out
  after obtaining explicit permission, which results in excellent security.
- The WebAssembly module is just a binary program and does not include an operating system
  environment, so it is not executable just after compilation, as what we can do in Docker.

Next, let’s go through the usage of WebAssembly in the back-end by examples.

## 2.1. Embed WebAssembly in Your Application

As shown in the figure below, whether it is a web application or a non-web application, we need to
embed the WebAssembly runtime in the host program to use WebAssembly. The only difference is that in
a web application, the host program is the browser, while in a non-web scenario, the host program is
our own application, specific to the back-end application that this article focuses on, the host
program is our back-end service.

![wasm](1.png)

Currently available WebAssembly runtimes include [Wasmtime](https://wasmtime.dev/),
[WasmEdge](https://wasmedge.org/), [WAVM](https://wavm.org/), [Wasmer](https://wasmer.io/), etc.,
each with its own advantages and disadvantages. This article will take Wasmtime as an example to
introduce how to embed WebAssembly in a host program developed in the Go language.

Embedding a WebAssembly runtime and instantiating a WebAssembly module is quite simple,  the few
lines of code below do everything about these, if omitting error handling.

```go
func createWasmVM(code []byte) {
    engine := wasmtime.NewEngine()
    module, _ := wasmtime.NewModule(engine, code)
    store := wasmtime.NewStore(engine)
    linker := wasmtime.NewLinker(engine)
    inst, _ := linker.Instantiate(store, module)
    _ = inst
}
```

But this code snippet involves several important concepts, and a brief introduction is as below:
- **Engine**: a global context for compilation and management of wasm modules.
- **Module**: a compiled WebAssembly module. This structure represents in-memory JIT code which is
  ready to execute after being instantiated.
- **Store**: all WebAssembly objects and host values will be "connected" to a store.
- **Instance**: an instantiated WebAssembly module, where you can actually acquire a function from,
  for example, to call. At the time of instantiation, the start function of the module is called.
- **Linker**(wasmtime only): a helper structure to link wasm modules/instances together.

Although the above code creates an instance of a WebAssembly module, and according to the
WebAssembly specification, the start function will be executed. But due to the security limit, the
execution result cannot be output, so the "execution" is useless. Therefore, we need to implement
interoperability between the host program and the WebAssembly program to provide input/output
interfaces for the WebAssembly program.

## 2.2. Host Call WebAssembly

Assuming that our WebAssembly program has a function named `sum` that receives two integer variables
as parameters and returns their sum, the host program can use the following code to call this
function:

```go
    fn := inst.GetExport(store, "sum").Func()
    r, _ := fn.Call(store, 1, 2)
    fmt.Println(r.(int32))
```

Although the specific calling methods differ from the programming language of the host program and
the WebAssembly runtime being used, the documentation of the runtime usually has relevant
instructions, so it is just fine to follow the documentation.

The difficulty here is how to export the `sum` function from the WebAssembly program so that the
host program can find and call it. As mentioned earlier, as long as there is a compiler, any
language ​​can be compiled into WebAssembly, but most languages ​​are designed without considering the
needs of WebAssembly, and there is no way to export functions in WebAssembly. So this problem can
only be solved by non-standard extensions of specific compilers. In other words, finding this
non-standard extension is the most critical step in solving the problem. But, also due to
"non-standard", the relevant information is often not easy to get.

As an example, the following is how to export functions in C/C++ (use emscripten as the compiler)
and AssemblyScript:

```c
// C/C++
EMSCRIPTEN_KEEPALIVE int sum( int a, int b ) {
    return a + b;
}
```

```js
// AssemblyScript
export function sum( a: i32, b: i32 ): i32 {
    return a + b
}
```

## 2.3. WebAssembly Call Host

Similar to the host calling WebAssembly, the documentation of the WebAssembly runtime usually
describes how the host exports a function to the WebAssembly program.

```go
    fn := func() {
        fmt.Println("hello wasm")
    }
    linker.DefineFunc(store, "easegress", "hello", fn)
```

The difficulty of the problem also lies in how to use non-standard extensions of the language to
import this function in the WebAssembly program. The following are the specific methods in C/C++ and
AssemblyScript:

```c
// C/C++
__attribute__((import_module("easegress"), import_name("hello"))) void hello();
void call_hello() {
    hello();
}
```

```js
// AssemblyScript
@external("easegress", "hello") declare function hello(): void
export function callHello(): void {
    hello()
}
```

## 2.4. Non-primitive Parameters

When the host and the WebAssembly program call each other's functions, they also need to pass
parameters and return values. If it is a primitive data type such as an integer, just pass it
directly. But when the parameter or return value is a non-primitive type such as a string, we get
new problems:

- The programming language of the host program and the WebAssembly program are generally different,
  so the memory layout of non-primitive parameters is also different. If it is passed directly, the
  receiver cannot understand it at all, let alone use it.
- Due to the security design, the memory of the host program and the WebAssembly program are
  isolated, and the WebAssembly program cannot access the host's memory.

Because the host program can access the memory of WebAssembly, the solution to the second problem is
that the WebAssembly program exports memory management functions to enable the host to manipulate
its memory, for example:

```c
// C/C++
EMSCRIPTEN_KEEPALIVE void* wasm_alloc( int size ) {
    return malloc( size );
}
 
EMSCRIPTEN_KEEPALIVE void wasm_free( void* p ) {
    free( p );
}
```

```js
// AssemblyScript
export function wasm_alloc(size: i32): number {
    let buf = new ArrayBuffer(size)
    let ptr = changetype<usize>(buffer)
    return __pin(ptr)
}
 
export function wasm_free(ptr: number): void {
    __unpin(ptr)
}
```

After that, we can leverage these memory management functions to pass parameters/return values
through marshaling/unmarshaling of related data types. For example, the following WebAssembly
function calls a host function, both the parameter and return value are strings at first, but after
marshaling/unmarshaling, we turned the strings to addresses (which are integers) in WebAssembly
memory:

```go
// Host: Go
func foo(addr int32) int32 {
    // ...
    mem := inst.GetExport(store, "memory").Memory().UnsafeData(store)
    start := addr
    for mem[addr] != 0 {
        addr++
    }
    data := make([]byte, addr-start)
    copy(data, mem[start:addr])
    param := string(data)
    // ...
    result := "result"
    vaddr, _ := inst.GetExport(store, "wasm_alloc").Func().Call(store, len(result)+1) 
    addr = vaddr.(in32)
    copy(mem[addr:], []byte(result))
    mem[addr + int32(len(result))] = 0
    return addr
}
```

```js
// WebAssembly: AssemblyScript
@external("easegress", "foo") declare function foo(addr: number): number
export func callFoo(name: string): string {
    let buf = String.UTF8.encode(name + '\0')
    let addr = changetype<number>(buf)
    addr = foo(addr)
    buf = changetype<ArrayBuffer>(addr)
    wasm_free(addr)
    buf = buf.slice(0, buf.byteLength - 1)
    return String.UTF8.decode(buf)
}
```

## 2.5. SDK

After going through the process of interoperating between the host program and the WebAssembly
program, I believe you have found that it is very similar to the process of RPC calls. The
difference is that in RPC calls, the boring marshaling/unmarshaling operations are accomplished by
the automatically generated code of relevant tools, and users don’t need to care at all.

In the development of WebAssembly applications, users do not want to deal with so many details
either. Therefore, as the developer of the host program, we need to provide users with relevant SDKs
to hide the underlying details so that users can focus on the development of business logic.

Since users can develop WebAssembly applications in many languages, we need to provide SDKs for
different languages, or at least for the major languages ​​used by our users.

## 2.6. Host Handling Errors In WebAssembly

Like other programs, WebAssembly programs will have various bugs. Although, as a host program
developer, we can’t predict a specific bug, we must limit the impact of these bugs to the
WebAssembly virtual machine and prevent them from affecting the host.

The first type of bug that the host program must prevent is infinite loops. In practice, the host
program has no way to know whether there is an infinite loop. Therefore, the compromise solution is
to set a timeout duration for the WebAssembly program. Once this duration is exceeded, we consider
there’s an infinite loop, and terminate the execution of the WebAssembly program. The code to
terminate execution is as below:

```go
ih, _ := store.InterruptHandle()
ih.Interrupt()
```

The second type of bug is the crashes caused by something like illegal memory access in the
WebAssembly program. The WebAssembly runtime engine usually converts such errors into exceptions in
the host program (a panic in the Go language), that’s we only need to deal with this exception.
Since the host program does not know the root cause of the bug, nor does it know the state of the
WebAssembly program after the bug occurs, it can only release the resources occupied by the
problematic WebAssembly virtual machine and re-create a virtual machine to replace it.

# 3. WebAssembly In Easegress

[Easegress](https://github.com/megaease/easegress) is a next-generation traffic gateway developed by
[MegaEase](https://megaease.com/), which is cloud-native, highly available, observable, and scalable.
Before Easegress, there were already many mature gateway products, including Nginx, on the market.
However, MegaEase believes that a gateway is not just a reverse proxy, but also needs to be able to
orchestrate and schedule traffic. In addition, various business logic intrusions are also involved,
so it must be highly extensible too.

Based on the views above, MegaEase regards extensibility as an important requirement from the first
day of Easegress development and has relevant designs in several aspects.

First of all, is the choice of development language. 
- Using C/C++ or Rust will definitely bring the best performance to Easegress, but these languages
  ​​are too hard to be mastered by users, so it is impossible for them to extend the business logic by
  modifying the code if these languages are chosen. 
- Java is easy to learn and use, and has very good productivity. but its size and performance cannot
  meet the requirements;
- Relatively, Go is easy to learn and has better performance, especially in the network application
  field where Easegress is targeted, because of the excellent design, the performance gap between Go
  and  C++ is often negligible. Therefore, Easegress choose Go as the development language. But no
  matter what language is used, source-level extensions will inevitably limit users to a specific
  language and will involve recompiling, re-deployment, and restarting, causing service interruptions.

The second way to provide extensibility is FaaS and Easegress has supported FaaS already. FaaS does
not limit the user's development language, and it also has good scalability. The disadvantage is
that it relies heavily on external dependencies such as Kubernetes, which brings the complexity of
the operation.

The third way is embedding an interpreter. At first, we put our focus on Lua, a language that is
designed for embedding into other programs, but after a detailed evaluation, we believe that Lua has
two weak points. One is that it is not expressive enough and is not suitable for writing complex
business logic; the other is that it is not popular enough and it is hard to find programmers with
relevant experience. Therefore, Easegress decide to embed WebAssembly, mainly based on two
considerations: one is the nearly native performance; the other is it is not restricting the user's
development language, users can use their favorite or familiar language to develop business logic.

As an example of extending business logic with WebAssembly, we have published [Handle Flash Sale
With Easegress And WebAssembly]({{<ref "flash-sale.md">}}). Please feel free to let us know if
you have any feedback, and welcome to provide more use cases to us.

As I have mentioned above, choosing WebAssembly means that we need to develop SDKs for many
languages. We have completed the development of the
[SDK for AssemblyScript](https://github.com/megaease/easegress-assemblyscript-sdk). We believe that
with both the efforts of MegaEase and the entire open source community, we could support more and
more languages in the near future.
