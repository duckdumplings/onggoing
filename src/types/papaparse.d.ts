declare module 'papaparse' {
  export interface ParseMeta {
    delimiter?: string;
    linebreak?: string;
    aborted?: boolean;
    truncated?: boolean;
    cursor?: number;
    fields?: string[];
  }

  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }

  export interface ParseResult<T = any> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface ParseConfig<T = any> {
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    dynamicTyping?: boolean;
    complete?: (results: ParseResult<T>) => void;
    error?: (error: any) => void;
    chunk?: (results: ParseResult<T>, parser: any) => void;
  }

  export function parse<T = any>(file: File | string, config?: ParseConfig<T>): void;

  const Papa: {
    parse: typeof parse;
  };

  export default Papa;
}
