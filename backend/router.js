// router.js — Express kullanmadan minimal ama yeterli bir router.
// Neden: Bu geliştirme ortamında internete çıkıp npm paketi kurulamıyor.
// Node'un yerleşik http modülü üzerine ince bir katman yazmak, hiçbir
// dış bağımlılık olmadan gerçek ve çalışan bir backend sağlıyor.

function pathToRegex(path) {
  const paramNames = [];
  const pattern = path
    .replace(/\/+$/, '') // sondaki slash'ı temizle
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}/?$`), paramNames };
}

class Router {
  constructor() {
    this.routes = []; // { method, regex, paramNames, handlers: [...] }
  }

  _add(method, path, handlers) {
    const { regex, paramNames } = pathToRegex(path);
    this.routes.push({ method, regex, paramNames, handlers });
  }

  get(path, ...handlers) { this._add('GET', path, handlers); }
  post(path, ...handlers) { this._add('POST', path, handlers); }
  patch(path, ...handlers) { this._add('PATCH', path, handlers); }
  put(path, ...handlers) { this._add('PUT', path, handlers); }
  delete(path, ...handlers) { this._add('DELETE', path, handlers); }

  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams.entries());

    const candidates = this.routes.filter((r) => r.method === req.method);
    for (const route of candidates) {
      const match = pathname.match(route.regex);
      if (match) {
        req.params = {};
        route.paramNames.forEach((name, i) => { req.params[name] = match[i + 1]; });
        return runHandlers(route.handlers, req, res);
      }
    }
    res.status(404).json({ error: 'Bulunamadı: ' + req.method + ' ' + pathname });
  }
}

async function runHandlers(handlers, req, res) {
  let i = 0;
  const next = async (err) => {
    if (err) {
      console.error(err);
      if (!res.writableEnded) res.status(500).json({ error: 'Sunucu hatası.' });
      return;
    }
    const handler = handlers[i++];
    if (!handler) return;
    try {
      await handler(req, res, next);
    } catch (e) {
      next(e);
    }
  };
  await next();
}

module.exports = { Router };
