/**
 * Cloudflare R2 直连客户端：
 * - 纯 WebCrypto + fetch 计算 AWS SigV4 签名
 * - 零 Node.js 依赖，兼容纯 Web 与 Android Capacitor 移动端
 */

import { R2Config, R2ClientLike } from './types';

function buildEndpoint(accountId: string): string {
  const id = accountId.trim();
  if (!id) throw new Error('Account ID 不能为空');
  return `https://${id}.r2.cloudflarestorage.com`;
}

export function resolveR2Endpoint(input: {
  accountId?: string;
  endpoint?: string;
}): string {
  if (input.endpoint?.trim()) return input.endpoint.trim();
  return buildEndpoint(input.accountId ?? '');
}

const encoder = new TextEncoder();
const DIRECT_REQUEST_TIMEOUT_MS = 15000;

async function hmac(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(message));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** RFC 3986 编码（query 值里 / 也要编码，path 里 / 不编码）。 */
function uriEncode(value: string, encodeSlash: boolean): string {
  let result = '';
  for (const char of value) {
    if (/[A-Za-z0-9_.~-]/.test(char)) {
      result += char;
    } else if (char === '/' && !encodeSlash) {
      result += char;
    } else {
      const bytes = encoder.encode(char);
      for (const b of bytes) result += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

async function signRequest(opts: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyHash = await sha256Hex(opts.body);
  const host = opts.url.host;

  // 合并并小写所有头
  const baseHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };
  for (const [k, v] of Object.entries(opts.headers)) baseHeaders[k.toLowerCase()] = v;
  const sortedHeaderKeys = Object.keys(baseHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${baseHeaders[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // 规范化查询串
  const sortedParams = Array.from(opts.url.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const canonicalQueryString = sortedParams
    .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
    .join('&');

  // path：R2 用 path-style（host/bucket/key），pathname 已经包含 bucket 与 key
  const canonicalRequest = [
    opts.method,
    opts.url.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${opts.region}/s3/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // 派生签名 key
  const kDate = await hmac(encoder.encode('AWS4' + opts.secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, opts.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');

  const signature = bufferToHex(await hmac(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...baseHeaders,
    Authorization: authorization,
  };
}

interface ListContents {
  key: string;
  lastModified: string;
}

function parseListResponse(xml: string): {
  contents: ListContents[];
  nextContinuationToken?: string;
} {
  const contents: ListContents[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    if (!block) continue;
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const lastModified = block.match(/<LastModified>([^<]*)<\/LastModified>/)?.[1];
    if (key && lastModified) contents.push({ key, lastModified });
  }
  const nextToken = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1];
  return nextToken ? { contents, nextContinuationToken: nextToken } : { contents };
}

export class R2Client implements R2ClientLike {
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly region: string;

  constructor(config: R2Config) {
    this.endpoint = resolveR2Endpoint({
      accountId: config.accountId,
      endpoint: config.endpoint,
    }).replace(/\/+$/, '');
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.bucket = config.bucketName;
    this.region = config.region || 'auto';
  }

  private buildUrl(key: string, params?: Record<string, string>): URL {
    // path-style：endpoint/bucket/key
    const url = new URL(`${this.endpoint}/${this.bucket}/${key}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url;
  }

  private async signedFetch(
    url: URL,
    method: string,
    extraHeaders: Record<string, string>,
    body: string
  ): Promise<Response> {
    const headers = await signRequest({
      method,
      url,
      headers: extraHeaders,
      body,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url.toString(), {
        method,
        headers,
        body: body || null,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`R2 请求超时（${DIRECT_REQUEST_TIMEOUT_MS / 1000}s）`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async putJson(key: string, data: unknown): Promise<void> {
    const body = JSON.stringify(data, null, 2);
    const url = this.buildUrl(key);
    const res = await this.signedFetch(url, 'PUT', { 'Content-Type': 'application/json' }, body);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PUT ${key} 失败（${res.status}）：${text}`);
    }
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const url = this.buildUrl(key);
    const res = await this.signedFetch(url, 'GET', {}, '');
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GET ${key} 失败（${res.status}）：${text}`);
    }
    return (await res.json()) as T;
  }

  async list(prefix: string): Promise<Array<{ key: string; lastModified: Date }>> {
    const result: Array<{ key: string; lastModified: Date }> = [];
    let continuationToken: string | undefined;
    do {
      const params: Record<string, string> = { 'list-type': '2', prefix };
      if (continuationToken) params['continuation-token'] = continuationToken;
      const url = this.buildUrl('', params);
      const res = await this.signedFetch(url, 'GET', {}, '');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LIST ${prefix} 失败（${res.status}）：${text}`);
      }
      const xml = await res.text();
      const parsed = parseListResponse(xml);
      for (const obj of parsed.contents) {
        result.push({ key: obj.key, lastModified: new Date(obj.lastModified) });
      }
      continuationToken = parsed.nextContinuationToken;
    } while (continuationToken);
    return result;
  }

  async delete(key: string): Promise<void> {
    const url = this.buildUrl(key);
    const res = await this.signedFetch(url, 'DELETE', {}, '');
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`DELETE ${key} 失败（${res.status}）：${text}`);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = this.buildUrl('', {
        'list-type': '2',
        'max-keys': '1',
        prefix: '_sync/',
      });
      const res = await this.signedFetch(url, 'GET', {}, '');
      if (res.ok) return { ok: true, message: '连接成功 ✅' };
      const text = await res.text().catch(() => '');
      if (res.status === 403)
        return { ok: false, message: 'Access Key 或 Secret Key 不正确' };
      if (res.status === 404) return { ok: false, message: 'Bucket 不存在' };
      return { ok: false, message: `连接失败（${res.status}）：${text}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return { ok: false, message: '无法连接 R2 端点，请检查 Account ID 或 Endpoint' };
      }
      return { ok: false, message: `连接失败：${message}` };
    }
  }
}
