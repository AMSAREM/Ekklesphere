// Ambient types for Next.js server primitives to support Supabase SSR helpers in full-stack setup
declare module 'next/headers' {
  export interface RequestCookie {
    name: string;
    value: string;
  }
  export interface ResponseCookie extends RequestCookie {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date | number;
    sameSite?: true | false | 'lax' | 'strict' | 'none';
    secure?: boolean;
    httpOnly?: boolean;
    partitioned?: boolean;
  }
  export interface ReadonlyRequestCookies {
    get(name: string): RequestCookie | undefined;
    getAll(): RequestCookie[];
    has(name: string): boolean;
    set(name: string, value: string, options?: Partial<ResponseCookie>): void;
    set(cookie: ResponseCookie): void;
    delete(name: string | string[]): void;
  }
  export function cookies(): Promise<ReadonlyRequestCookies>;
}

declare module 'next/server' {
  export class NextRequest extends Request {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string): void;
      delete(name: string): void;
    };
    nextUrl: URL;
  }

  export class NextResponse extends Response {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string, options?: Record<string, unknown>): void;
      delete(name: string): void;
    };
    static next(init?: { request?: { headers?: Headers } }): NextResponse;
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
}
