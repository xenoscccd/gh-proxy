'use strict'

const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/';
const PREFIX = '/';
const Config = { jsdelivr: 0 };
const whiteList = [];

// CORS 预检配置
const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
};

// GitHub URL 正则表达式
const regexPatterns = [
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
    /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i,
    /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i,
];

// 创建响应
function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*';
    return new Response(body, { status, headers });
}

// 检查 URL 是否匹配
function checkUrl(u) {
    return regexPatterns.some(pattern => pattern.test(u));
}

// 处理请求
async function fetchHandler(e) {
    const req = e.request;
    const urlObj = new URL(req.url);
    let path = urlObj.searchParams.get('q');

    if (path) {
        return Response.redirect('https://' + urlObj.host + PREFIX + path, 301);
    }

    path = urlObj.href.substr(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://');
    
    if (checkUrl(path)) {
        return httpHandler(req, path);
    } else {
        return fetch(ASSET_URL + path);
    }
}

// 处理 HTTP 请求
async function httpHandler(req, pathname) {
    if (req.method === 'OPTIONS' && req.headers.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT);
    }

    const reqHdrNew = new Headers(req.headers);
    const isAllowed = whiteList.length === 0 || whiteList.some(item => pathname.includes(item));

    if (!isAllowed) {
        return new Response("blocked", { status: 403 });
    }

    const urlStr = pathname.startsWith('http') ? pathname : 'https://' + pathname;
    const urlObj = new URL(urlStr);
    
    return proxy(urlObj, {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body,
    });
}

// 代理请求
async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit);
    const resHdrNew = new Headers(res.headers);

    if (resHdrNew.has('location')) {
        const location = resHdrNew.get('location');
        if (checkUrl(location)) {
            resHdrNew.set('location', PREFIX + location);
        } else {
            reqInit.redirect = 'follow';
            return proxy(new URL(location), reqInit);
        }
    }

    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');

    return new Response(res.body, { status: res.status, headers: resHdrNew });
}

// 事件监听
addEventListener('fetch', e => {
    e.respondWith(fetchHandler(e).catch(err => makeRes('cfworker error:\n' + err.message, 502)));
});
