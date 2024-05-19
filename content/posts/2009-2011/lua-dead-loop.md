+++
title = '检测 Lua 脚本中的死循环'
date = 2011-05-07T13:00:00+08:00
categories = ['技术']
tags = ['其他']
+++

论坛上有人问，所以把以前做的东西拿出来秀一下。

Lua 是一门小巧精致的语言，特别适用于嵌入其它的程序为它们提供脚本支持。不过脚本通常是用户编写的，很有可能出现死循环，虽说这是用户的问题，但却会造成我们的宿主程序死掉。所以检测用户脚本中的死循环并中止这段脚本的运行就显得非常重要了。

可是，一个现实的问题是死循环并不好检测，一些隐藏较深的死循环连人都很难找出来，更不用说让机器去找了。所以实际采用的方案多是检测脚本的执行时间，如果超过一定的限度，就认为里面有死循环，我下面的例子也是用的这种方法。

以下是几个相关的全局变量（我是喜欢把 C++ 当 C 用的程序员，C++ 的忠实粉丝请忍耐一下😄）的定义。

```cpp
lua_State* g_lua = NULL;            // lua脚本引擎
volatile unsigned g_begin = 0;        // 脚本开始执行的时间
volatile long g_counter = 0;        // 脚本执行计数, 用于判断执行超时
volatile long g_check = 0;           // 进行超时检查时的执行计数
```

`run_user_script` 用来执行用户脚本，它首先通过 `GetTickCount` 把当前的时间记录到 `g_begin` 中去。然后将 `g_counter` 加一，在执行完用户脚本后再将其加一，这样就可以保证执行用户脚本时它是个奇数，而不执行时是偶数，检测脚本超时的代码可以籍此来判断当前是否在执行用户脚本。

还要注意调用用户脚本要使用 `lua_pcall` 而不是 `lua_call`，因为我们中止脚本的执行会产生一个 Lua 中的“错误”，在 C/C++ 中它是一个异常，只有用 `lua_pcall` 才能保证这个错误被 Lua 脚本引擎正确处理。

```cpp
int run_user_script( int nargs, int nresults, int errfunc )
{
    g_begin = GetTickCount();
    _InterlockedIncrement( &g_counter );
    int err = lua_pcall( g_lua, nargs, nresults, errfunc );
    _InterlockedIncrement( &g_counter );
    return err;
}
```

下面的 `check_script_timeout` 用来检测脚本超时，需要在另外一个线程中周期性的调用，原因我想就不用解释了吧。它首先检查是否在执行用户脚本，或者是否已经让当前执行的用户脚本中止过。然后看这段脚本执行了多长时间，超过限度就把当前脚本计数记录到 `g_check` 中去，并通过 `lua_sethook` 设置一个钩子函数 `timeout_break`，这个钩子函数会在用户脚本执行时被调用。

```cpp
void check_script_timeout()
{
    long counter = g_counter;
 
    // 没有执行用户脚本, 不检查超时
    if( (counter & 0x00000001) == 0 )
        return;
 
    // 已经让当前执行的用户脚本中止了
    if( g_check == counter )
        return;
 
    // 如果执行时间超过了设置的超时时间(这里是1秒), 终止它
    if( GetTickCount() - g_begin > 1000 )
    {
        g_check = counter;
        int mask = LUA_MASKCALL | LUA_MASKRET | LUA_MASKLINE | LUA_MASKCOUNT;
        lua_sethook( g_lua, timeout_break, mask, 1);
    }
}
```

最后就是那个钩子函数了，它首先把钩子去掉，因为这个钩子只要执行一次就行了。由于设置钩子和执行钩子是在不同的线程中，并且钩子从设置到执行需要一定的时间，所以它要通过对比 `g_check` 和 `g_counter` 来判断是否还在运行判断超时所执行的那段脚本，不是就什么也不做，是就通过 `luaL_error` 产生一个错误，并中止脚本的执行，而这个错误最终会被 `run_user_script` 中的 `lua_pcall` 捕获。

```cpp
void timeout_break( lua_State* L, lua_Debug* ar )
{
    lua_sethook( L, NULL, 0, 0 );
    // 钩子从设置到执行, 需要一段时间, 所以要检测是否仍在执行那个超时的脚本
    if( g_check == g_counter )
        luaL_error( L, "script timeout." );
}
```

上面的检测使用了两个线程，其实在一个线程中也可以做到，并且更简单。但那样会导致钩子函数频繁执行，影响效率，如果对性能没什么要求的话，也可以采用。
