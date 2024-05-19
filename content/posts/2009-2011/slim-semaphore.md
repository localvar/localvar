+++
title = '一个轻量级的信号量'
date = 2011-03-16T18:00:00+08:00
categories = ['技术']
tags = ['多线程']
+++

基于 `SRWLOCK` 和条件变量（Condition Variable）实现，需要 Windows Vista 及以上操作系统，编译时 `_WIN32_WINNT` 要大于 `0x0600`。

基本功能和用 `CreateSemaphore` 创建出来的差不多，不过不支持跨进程使用，也模拟不了 `WaitForMultipleObjects` 的情形。

和系统自带的那个相比一般会快一点，具体结果取决于硬件，有些机器上能快十几倍，有些机器则只稍快一丁点。请注意我说的快十几倍也仅仅是指这两个实现本身的差别，而不是说程序的总体性能提高这么多。具体是否使用，大家可以根据自己的测试结果来决定。

代码和使用应该都很简单，就不多解释和举例了。

```cpp
class CSlimSemaphore
{
private:
    SRWLOCK m_lock;
    CONDITION_VARIABLE m_cv;
    LONG m_value;
    LONG m_maximum;

public:
    CSlimSemaphore( LONG lInitialCount, LONG lMaximumCount )
    {
        InitializeSRWLock( &m_lock );
        InitializeConditionVariable( &m_cv );
        m_value = lInitialCount;
        m_maximum = lMaximumCount;
    }

    ~CSlimSemaphore() { }

    BOOL Release( LONG lReleaseCount, LONG* lpPreviousCount )
    {
        BOOL succeeded = FALSE;

        AcquireSRWLockExclusive( &m_lock );

        if( m_value + lReleaseCount <= m_maximum )
        {
            if( lpPreviousCount != NULL )
                *lpPreviousCount = m_value;
            m_value += lReleaseCount;
            succeeded = TRUE;
        }

        ReleaseSRWLockExclusive( &m_lock );

        if( succeeded )
            WakeAllConditionVariable( &m_cv );
        else
            SetLastError( ERROR_TOO_MANY_POSTS );

        return succeeded;
    }

    DWORD Wait( DWORD dwTimeout )
    {
        DWORD result = WAIT_TIMEOUT;
        DWORD start = GetTickCount();

        AcquireSRWLockExclusive( &m_lock );

        while( true )
        {
            if( m_value > 0 )
            {
                --m_value;
                result = WAIT_OBJECT_0;
                break;
            }

            if( dwTimeout != INFINITE )
            {
                DWORD end = GetTickCount();
                if( end - start >= dwTimeout )
                    break;
                dwTimeout -= end - start;
                start = end;
            }

            if( !SleepConditionVariableSRW( &m_cv, &m_lock, dwTimeout, 0 ) )
            {
                if( GetLastError() != ERROR_TIMEOUT )
                    result = WAIT_FAILED;
                break;
            }
        }

        ReleaseSRWLockExclusive( &m_lock );

        return result;
    }
};
```
