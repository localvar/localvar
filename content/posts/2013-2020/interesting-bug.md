+++
title = '一个有趣的Bug'
date = 2013-10-27T15:00:00+08:00
categories = ['技术']
tags = ['C++']
+++

今早一到公司，就看到隔壁组一堆人在讨论一个 Bug，足足半个多小时没有结果。人散了以后，一位同事找我帮忙看一下，发现是因为一个函数被递归调用导致栈溢出并崩溃，但奇怪的是代码中并没有递归调用这个函数。

看到这个现象，我立刻想到了以前遇到的[这个Bug]({{<ref "reinterept_cast-and-static_cast.md">}})，经过排查，果然是类似的原因，于是十分钟不到就解决了问题，引来一片佩服的目光。把这个 Bug 的代码整理简化后如下：

```cpp
struct Base1
{
	virtual void Foo1()
	{
		printf("Base1::Foo1\n");
	}
};

struct Base2
{
	virtual void Foo2()
	{
		printf("Base2::Foo2\n");
	}
};

void Bar(void* p)
{
	Base2* p2 = (Base2*)(p);  // 这一句写错了
	p2->Foo2();               // 这一句实际调用的是 Derived::Foo1，导致递归
}

struct Derived : public Base1, public Base2
{
	virtual void Foo1()   // 这个函数会被递归调用
	{
		printf("Derived::Foo1\n");
		Bar(this);
	}
};

int main()
{
	Derived d;
	d.Foo1();
	return 0;
}
```

这里有意思的是，原始代码中的 `Derived::Foo1` 相当复杂，指针乱了以后没有直接 Access Violation 而是等到多次递归后栈溢出才崩掉，也算是小概率事件了。如果直接崩了，我应该不会马上想到正确的排查方向，也就没法秀一把自己的技术能力了。
