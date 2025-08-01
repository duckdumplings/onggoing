// Deno 전역 객체 타입 정의
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}

export { }; 