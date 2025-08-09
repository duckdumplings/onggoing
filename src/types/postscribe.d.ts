declare module 'postscribe' {
  interface PostscribeOptions {
    done?: () => void;
    error?: (error: any) => void;
  }

  function postscribe(
    element: HTMLElement,
    html: string,
    options?: PostscribeOptions
  ): void;

  export default postscribe;
} 