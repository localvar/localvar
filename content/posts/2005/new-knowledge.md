+++
title = '又长见识了'
date = 2005-08-24T09:40:00+08:00
categories = ['技术']
tags = ['C++']
+++

把 `switch case` 和 `do while` 循环混在一起居然可以编译通过，记录一下，以免再见到不认识：

<!--more-->

```c
void* mymemcpy( void* dest, const void* src, size_t count )
{
    char* d = (char*)dest;
    const char* s = (const char*)src;
    int n = (count + 7) / 8; // count > 0 assumed

    switch( count & 7 )
    {
    case 0:  do {  *d++ = *s++;
    case 7:        *d++ = *s++;
    case 6:        *d++ = *s++;
    case 5:        *d++ = *s++;
    case 4:        *d++ = *s++;
    case 3:        *d++ = *s++;
    case 2:        *d++ = *s++;
    case 1:        *d++ = *s++;
               } while (--n > 0);
    }

    return dest;
}
```