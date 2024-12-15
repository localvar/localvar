+++
title = '使用 Easegress 和 WebAssembly 做秒杀'
date = 2021-09-03T20:54:00+08:00
categories = ['技术']
tags = ['其他', 'MegaEase']
summary = "“秒杀”是一种经常被各家电商采用的，在短时间内提供超高折扣的促销方式。参与秒杀的商品数量往往很少，但在巨大折扣的吸引力下，会在短暂的时间导致流量请求的激增，这往往会导致服务缓慢、拒绝服务，甚至宕机。 本文介绍了如何利用 Easegress 的 WasmHost 过滤器来保护秒杀中的后端服务。"
+++

[English Version]({{< ref path="flash-sale.en.md" lang="en" >}})

“秒杀”是一种经常被各家电商采用的，在短时间内提供超高折扣的促销方式。参与秒杀的商品数量往往很少，但在巨大折扣的吸引力下，会在短暂的时间导致流量请求的激增，这往往会导致服务缓慢、拒绝服务，甚至宕机。

本文介绍了如何利用 [WasmHost 过滤器](https://github.com/megaease/easegress/blob/main/docs/03.Advanced-Cookbook/3.07.WasmHost.md) 来保护秒杀中的后端服务。[WebAssembly](https://webassembly.org/) 代码是通过使用 [Easegress AssemblyScript SDK](https://github.com/megaease/easegress-assemblyscript-sdk)，以 [AssemblyScript](https://www.assemblyscript.org/) 语言（类似于 TypeScript）编写的。

在开始前，需要介绍一下为什么会是这样的组合：Easegress 作为流量网关更多的是需要负责控制逻辑，而秒杀这样的业务逻辑则更多的会有很定制化的东西。通过 WebAssembly 写业务逻辑，可以在运行时动态加载，而且 WebAssembly 的代码有足够强的性能和安全性，所以，在安全、高性能和定制化扩展上，这个组合能够提供很好的解决方案。

在我们开始之前，请确保你的环境已经安装了最新版本的 [Git](https://git-scm.com/)、[Golang](https://golang.org)、[Node.js](https://nodejs.org/) 和它的包管理器 [npm](https://www.npmjs.com/)。另外，虽然不是必须，但如果你还具备编写和使用 TypeScript 模块的基本知识就更好了，因为 AssemblyScript 与 TypeScript 非常像。

注意：默认情况下，Easegress 中没有包含 WasmHost 过滤器，要启用它，需要用下面的命令构建 Easegress。

```shell
$ make build_server GOTAGS=wasmhost
```

# 1. 准备工作

## 1.1 创建“秒杀”项目

1）克隆 git 仓库 easegress-assemblyscript-sdk 到一个本地目录：

```bash
 $ git clone https://github.com/megaease/easegress-assemblyscript-sdk.git
```

2）切换到一个新目录并初始化一个新的 node module：

```bash
$ npm init
```

3）使用 npm 安装 AssemblyScript 编译器（假设我们只需要在开发环境中使用它）：

```bash
$ npm install --save-dev assemblyscript
```

4）安装完成后，我们可以在刚刚初始化的 node module的目录中，使用编译器提供的脚手架实用程序来快速设置好这个 AssemblyScript 项目：

```bash
$ npx asinit .
```

5）将 `--use abort=` 添加到 `package.json` 中的 `asc` 命令中：

```
"asbuild:untouched": "asc assembly/index.ts --target debug --use abort=",
"asbuild:optimized": "asc assembly/index.ts --target release --use abort=",
```

6）将 `assembly/index.ts` 的内容替换为下面的代码，注意将 `{EASEGRESS_SDK_PATH}` 替换为步骤`1）`中的路径。这段代码目前还只是一个骨架，什么都做不了：

```typescript
// this line exports everything required by Easegress,
export * from '{EASEGRESS_SDK_PATH}/easegress/proxy'

// import everything you need from the SDK,
import { Program, registerProgramFactory } from '{EASEGRESS_SDK_PATH}/easegress'

// define the program, 'FlashSale' is the name
class FlashSale extends Program {
	// constructor is the initializer of the program, will be called once at the startup
	constructor(params: Map<string, string>) {
		super(params)
	}

	// run will be called for every request
	run(): i32 {
		return 0
	}
}

// register a factory method of the FlashSale program
registerProgramFactory((params: Map<string, string>) => {
	return new FlashSale(params)
})
```

7）使用以下命令构建，如果一切正常，会在 build文件夹中生成两个文件，一个是 `untouched.wasm`（调试版本），另一个是 `optimized.wasm`（发布版本）。

```bash
$ npm run asbuild
```

## 1.2 配置 Easegress

下面，我们在 Easegress 中创建一个监听 10080 端口的 HTTPServer 来接收 HTTP 流量：

```bash
$ echo '
kind: HTTPServer
name: http-server
port: 10080
keepAlive: true
https: false
rules:
- paths:
  - pathPrefix: /flashsale
    backend: flash-sale-pipeline' | egctl create -f -
```

再创建一个包含 WasmHost 过滤器的Pipeline —— `flash-sale-pipeline`：

```bash
$ echo '
name: flash-sale-pipeline
kind: Pipeline
flow:
- filter: wasm
- filter: mock

filters:
- name: wasm
  kind: WasmHost
  maxConcurrency: 2
  code: /home/megaease/example/build/optimized.wasm
  timeout: 100ms
- name: mock
  kind: Mock
  rules:
  - body: "You can buy the laptop for $1 now.\n"
    code: 200' | egctl create -f -
```

注意将 `/home/megaease/example/build/optimized.wasm` 替换为步骤 `7）`中生成的文件的路径。另外，在上面的 pipeline 配置中，使用了一个 Mock 过滤器作为后端服务。在实际中，您需要使用 Proxy 过滤器来将请求转发给真正的后端服务。 

## 1.3 验证

执行以下命令，如果一切正常，您应该可以得到同样的结果：

```bash
$ curl http://127.0.0.1:10080/flashsale
You can buy the laptop for $1 now.
```

# 2. 在秒杀开始之前阻止所有请求

所有秒杀活动都有开始时间，在活动开始前，我们需要阻止所有的请求。假设开始时间是 `UTC 2021-08-08 00:00:00`，那我们代码可以写成下面这样：

```typescript
export * from '{EASEGRESS_SDK_PATH}/easegress/proxy'

import { Program, response, parseDate, getUnixTimeInMs, registerProgramFactory } from '{EASEGRESS_SDK_PATH}/easegress'

class FlashSale extends Program {
	// startTime is the start time of the flash sale, unix timestamp in millisecond
	startTime: i64

	constructor(params: Map<string, string>) {
		super(params)
		this.startTime = parseDate("2021-08-08T00:00:00+00:00").getTime()
	}

	run(): i32 {
		// if flash sale not start yet
		if (getUnixTimeInMs() < this.startTime) {
			// we just set response body to 'not start yet' here, in practice,
			// we will use 'response.setStatusCode(302)' to redirect user to
			// a static page.
			response.setBody(String.UTF8.encode("not start yet.\n"))
			return 1
		}

		return 0
	}
}

registerProgramFactory((params: Map<string, string>) => {
	return new FlashSale(params)
})
```

接下来，我们编译一下，并让 Easegress 重新加载 WebAssembly 的代码：

```bash
$ npm run asbuild
$ egctl wasm reload-code
```

现在，curl 一下我们的秒杀 URL链接，在秒杀活动还没有开始前，我们会得到还没有开始的消息 —— `not start yet`. 

```bash
$ curl http://127.0.0.1:10080/flashsale
not start yet.
```

# 3. 随机阻止请求

在秒杀开始后，Easegress 会随机阻止请求，这大大减少了发送到后端服务的请求数，从而保护服务免受流量高峰的冲击。随机阻止请求还带来另一个好处：地域差异导致的时延差异，时延低的用户，其请求更早到达 Easegress 的可能也更大，随机性消除了这些用户的优势，使秒杀更加公平。而且随机算法没有状态，在架构上也很容易运维。

```typescript
export * from '{EASEGRESS_SDK_PATH}/easegress/proxy'

import { Program, response, parseDate, getUnixTimeInMs, rand, registerProgramFactory } from '{EASEGRESS_SDK_PATH}/easegress'

class FlashSale extends Program {
	startTime: i64

	// blockRatio is the ratio of requests being blocked to protect backend service
	// for example: 0.4 means we blocks 40% of the requests randomly.
	blockRatio: f64

	constructor(params: Map<string, string>) {
		super(params)
		this.startTime = parseDate("2021-08-08T00:00:00+00:00").getTime()
		this.blockRatio = 0.4
	}

	run(): i32 {
		if (getUnixTimeInMs() < this.startTime) {
			response.setBody(String.UTF8.encode("not start yet.\n"))
			return 1
		}

		if (rand() > this.blockRatio) {
			// the lucky guy
			return 0
		}

		// block this request, set response body to `sold out`
		response.setBody(String.UTF8.encode("sold out.\n"))
		return 2
	}
}

registerProgramFactory((params: Map<string, string>) => {
	return new FlashSale(params)
})
```

构建并验证（假设秒杀闪购已经开始）：

```bash
$ npm run asbuild
$  egctl wasm apply-data --reload-code
$ curl http://127.0.0.1:10080/flashsale
sold out.
$ curl http://127.0.0.1:10080/flashsale
You can buy the laptop for $1 now.
$ curl http://127.0.0.1:10080/flashsale
sold out.
```

上面，我们以 40% 的可能性收到售罄的消息 —— sold out。请注意，本示例中的 blockRatio 为 0.4，仅仅只是为了演示。而在实践中，具体需要阻止多少比例的用户，还需要知道参与用户的总数，否则的话，随机的比例设的过大或是过小都不好。

# 4. 只要能进来就永远能进来

从业务的角度来看，我们允许某个用户进入后，就应该始终允许该用户进入；但是从上一步代码的逻辑来看，如果用户再次访问秒杀URL，则该请求可能会被阻止。

但秒杀活动对用户有一个潜在要求，那就是所有参与的用户都需要提前登录，所以，请求中会包含用户的标识符，我们可以使用该标识符来记录幸运用户。

我们假设 `Authorization` 标头的值是所需的标识符（如果标识符是 JWT 令牌，可以使用 [Validator 过滤器](https://github.com/megaease/easegress-assemblyscript-sdk)来进行验证，但这超出了本文的讨论范围）。

然而，由于过滤器配置中的 `maxConcurrency` 选项，在代码中简单的使用 Set 或 Map 来存储所有幸运用户解决不了我们面临的问题。

`maxConcurrency` 是 WasmHost 过滤器中的 WebAssembly 虚拟机的数量，由于 WebAssembly的安全性设计，两个虚拟机即使执行的是同一份代码，也不能共享数据。也就是说，在VM1允许用户进入后，如果用户的下一个请求是由VM2处理的，仍可能被阻止。当Easegress被布署为一个集群时，这种情况也可能发生。

为了克服这个问题，Easegress 提供了访问共享数据的API。export * from'{EASEGRESS_SDK_PATH}/easegress/proxy'

```typescript
export * from '{EASEGRESS_SDK_PATH}/easegress/proxy'

import { Program, request, parseDate, response, cluster, getUnixTimeInMs, rand, registerProgramFactory } from '{EASEGRESS_SDK_PATH}/easegress'

class FlashSale extends Program {
	startTime: i64
	blockRatio: f64

	constructor(params: Map<string, string>) {
		super(params)
		this.startTime = parseDate("2021-08-08T00:00:00+00:00").getTime()
		this.blockRatio = 0.4
	}

	run(): i32 {
		if (getUnixTimeInMs() < this.startTime) {
			response.setBody(String.UTF8.encode("not start yet.\n"))
			return 1
		}

		// check if the user was already permitted
		let id = request.getHeader("Authorization")
		if (cluster.getString("id/" + id) == "true") {
			return 0
		}

		if (rand() > this.blockRatio) {
			// add the lucky guy to permitted users
			cluster.putString("id/" + id, "true")
			return 0
		}

		response.setBody(String.UTF8.encode("sold out.\n"))
		return 2
	}
}

registerProgramFactory((params: Map<string, string>) => {
	return new FlashSale(params)
})
```

构建和验证：

```bash
$ npm run asbuild
$ egctl wasm apply-data --reload-code
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user1
sold out.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user1
You can buy the laptop for $1 now.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user1
You can buy the laptop for $1 now.
```

重复 curl 命令，我们会发现，在用户第一次被允许通过后，以后就再也不会被阻止了。

# 5. 限制允许的用户数

由于参与秒杀的商品数量通常都是有限的，所以，我们允许一定数量（大于商品数量）的用户通过之后，就可以阻止后面的用户了。例如，如果秒杀商品数量是 100，那么，大多数情况下我们允许 200 个用户就足够了。

在下面的代码中，为了更快的看到结果，我们仅允许最多 3 个用户通过：

```typescript
export * from '{EASEGRESS_SDK_PATH}/easegress/proxy'

import { Program, request, parseDate, response, cluster, getUnixTimeInMs, rand, registerProgramFactory } from '{EASEGRESS_SDK_PATH}/easegress'

class FlashSale extends Program {
	startTime: i64
	blockRatio: f64

	// maxPermission is the upper limits of permitted users
	maxPermission: i32

	constructor(params: Map<string, string>) {
		super(params)
		this.startTime = parseDate("2021-08-08T00:00:00+00:00").getTime()
		this.blockRatio = 0.4
		this.maxPermission = 3
	}

	run(): i32 {
		if (getUnixTimeInMs() < this.startTime) {
			response.setBody(String.UTF8.encode("not start yet.\n"))
			return 1
		}

		let id = request.getHeader("Authorization")
		if (cluster.getString("id/" + id) == "true") {
			return 0
		}

		// check the count of identifiers to see if we have reached the upper limit
		if (cluster.countKey("id/") < this.maxPermission) {
			if (rand() > this.blockRatio) {
				cluster.putString("id/" + id, "true")
				return 0
			}
		}

		response.setBody(String.UTF8.encode("sold out.\n"))
		return 2
	}
}

registerProgramFactory((params: Map<string, string>) => {
	return new FlashSale(params)
})
```

构建和验证：

```bash
$ npm run asbuild
$ egctl wasm apply-data --reload-code
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user1
You can buy the laptop for $1 now.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user2
sold out.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user2
You can buy the laptop for $1 now.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user3
You can buy the laptop for $1 now.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user4
sold out.
$ curl http://127.0.0.1:10080/flashsale -HAuthorization:user4
sold out.
```

在允许3个用户后，第4个用户被永远的挡在了外面。

# 6. 代码复用

## 6.1 参数

我们在前面的例子中硬编码了 `startTime`、`blockRatio` 和 `maxPermission`，这意味着如果有另一场秒杀活动，我们就需要修改代码，这显然不是一个好办法。

更好的方法是将这些参数放入配置中：

```yaml
filters:
  - name: wasm
    kind: WasmHost
    parameters:                                        # +
      startTime: "2021-08-08T00:00:00+00:00"           # +
      blockRatio: "0.4"                                # +
      maxPermission: "3"                               # +
```

然后修改程序的构造函数来读入这些参数：

```typescript
	constructor(params: Map<string, string>) {
		super(params)

		let key = "startTime"
		if (params.has(key)) {
			let val = params.get(key)
			this.startTime = parseDate(val).getTime()
		}

		key = "blockRatio"
		if (params.has(key)) {
			let val = params.get(key)
			this.blockRatio = parseFloat(val)
		}

		key = "maxPermission"
		if (params.has(key)) {
			let val = params.get(key)
			this.maxPermission = i32(parseInt(val))
		}
	}
```

## 6.2 管理共享数据

正如我们在“只要能进来就永远能进来”中看到的那样，共享数据非常有用，但当我们复用已有代码和配置来处理新的秒杀活动时，遗留的数据可能会造成问题。Easegress提供了管理这些数据的命令。

我们可以查看当前数据（其中 flash-sale-pipeline 是 pipeline 名称，wasm 是过滤器名称）：

```bash
$ egctl wasm list-data flash-sale-pipeline wasm
id/user1: "true"
id/user2: "true"
id/user3: "true"
```

更新数据：

```bash
$ echo '
id/user4: "true"
id/user5: "true"' | egctl wasm apply-data flash-sale-pipeline wasm
$ egctl wasm list-data flash-sale-pipeline wasm
id/user1: "true"
id/user2: "true"
id/user3: "true"
id/user4: "true"
id/user5: "true"
```

删除所有数据：

```bash
$ egctl wasm delete-data flash-sale-pipeline wasm
$ egctl wasm list-data flash-sale-pipeline wasm
{}
```

好了，上面就是整个技术的细节，你可以使用这些代码自由的扩展你的业务逻辑。不过，需要注意的是，上面只是一个演示，真正的秒杀方案还要更复杂，因为还需要过滤爬虫以及一些“羊毛党”，如果需要更为专业的秒杀方案，欢迎联系我们。

# 7. 总结

利用 WebAssembly 的安全、高性能和实时动态加载的能力，我们不仅可以在网关上做秒杀这样的高并发业务， 甚至可以实现一些更复杂业务逻辑支撑。 因为，WebAssembly 可以复用多种高级语言（如：Javascript，C/C++, Rust, Python, C# 等）的特性加持下， 让 Easegress 在高性能分布式架构下有了更大的想像和发挥的空间，并让流量编排的逻辑可以被更丝滑的运行和高效运维。

最后，欢迎大家关注我们的[开源项目](https://github.com/megaease)。
