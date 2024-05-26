import { Hono, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

type Bindings = {
  blogpv: KVNamespace;
  db: D1Database;
};

type LetterRow = {
  time: string;
  ip: string;
  url: string;
  served: number;
  ua: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const blockedUAs = [
  "SM801 Build/LMY47V",
  "OPPO R9s Build/MMB29M",
  "Coolpad Y82-520 Build/KTU84P",
  "HUAWEI ALE-CL00 Build/HuaweiALE-CL00",
  "SM-G900P Build/LRX21T",
  "Windows",
  "Ubuntu",
  "Macintosh",
  "baidu.sogo.uc",
  "curl/",
  'Googlebot',
  'AdsBot',
  'spider',
  'Spider',
  'bingbot',
]

const Head = () => <head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no" />
  <title></title>
</head>;

app.on('GET', ['/', '/index', '/index.html'], (c) => {
  return c.html(<html lang='zh-cn'><Head />
    <body>
      <p>建设中……</p>
      <a href='https://beian.miit.gov.cn/'>京ICP备17043225号-1</a>
    </body>
  </html>)
})

app.get('/nohup', async (c) => {
  const ua = c.req.header('User-Agent') || '';
  if (blockedUAs.some(bua => ua.includes(bua))) {
    return c.text("Internal Server Error", 500);
  }

  const rows = (await c.env.db.prepare("select * from letter").all<LetterRow>()).results;
  c.header('Cache-Control', 'no-cache');
  return c.html(<html lang="zh-cn"><Head />
    <body>{rows.map(r => <p>
      {r.time}<br />
      {r.ip + ' served=' + (r.served ? 'true ' : 'false ') + r.url}<br />
      {r.ua}<br />
    </p>)
    }</body></html>
  );
})

app.get('/letter/:id{[^\./]+\.html$}', async (c) => {
  const ua = c.req.header('User-Agent') || '';
  if (blockedUAs.some(bua => ua.includes(bua))) {
    return c.text("Internal Server Error", 500);
  }

  const url = c.req.url;
  await c.env.db
    .prepare("INSERT INTO letter (time, url, served, ua, ip) VALUES (?, ?, ?, ?, ?)")
    .bind(
      dayjs().tz("Asia/Shanghai").format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      url.substring(url.indexOf('/letter/')),
      false,
      ua,
      c.req.header('x-real-ip') || '',
    )
    .run();

  c.header('Cache-Control', 'no-cache');
  return c.html(<html lang="zh-cn"><Head />
    <body>今天与昨天无关</body>
  </html>)
})

// use middleware to check host and referer
app.use('/pvc/*', ((): MiddlewareHandler => async (ctx, next) => {
  const host = ctx.req.header('Host')
  if (host !== "blog.localvar.cn") {
    throw new HTTPException(404)
  }

  const referer = ctx.req.header('Referer') || ''
  if (!referer.startsWith("https://blog.localvar.cn")) {
    throw new HTTPException(403)
  }

  await next()
})()
)

// retrieve page view counter of all blog pages
app.get('/pvc/', async (c) => {
  let result = new Map<string, number>();
  for (const key of (await c.env.blogpv.list()).keys) {
    if (!key.name.startsWith('/')) {
      const val = await c.env.blogpv.get(key.name);
      result.set(key.name, parseInt(val || '0'))
    }
  }
  return c.json(Object.fromEntries(result))
})

// retrieve page view counter of one blog page,
// and update the counter if this is a POST request
app.on(['GET', 'POST'], '/pvc/:path{.+}', async (c) => {
  const path = c.req.param('path')
  let value = await c.env.blogpv.get(path) || '0';
  if (c.req.method === 'POST') {
    value = (parseInt(value) + 1).toString();
    await c.env.blogpv.put(path, value);
  }
  return c.text(value)
})


export default app;
