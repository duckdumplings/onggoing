// Tmap 스크립트 전역 관리자
class TmapLoader {
  private static instance: TmapLoader;
  private isLoaded = false;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;
  private callbacks: Array<() => void> = [];

  private constructor() { }

  static getInstance(): TmapLoader {
    if (!TmapLoader.instance) {
      TmapLoader.instance = new TmapLoader();
    }
    return TmapLoader.instance;
  }

  async loadTmap(): Promise<void> {
    // 이미 로드된 경우
    if (this.isLoaded && window.Tmap) {
      return Promise.resolve();
    }

    // 로딩 중인 경우 기존 Promise 반환
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // 새로운 로드 시작
    this.isLoading = true;
    this.loadPromise = this.loadTmapScript();

    try {
      await this.loadPromise;
      this.isLoaded = true;
      this.isLoading = false;

      // 등록된 콜백들 실행
      this.callbacks.forEach(callback => callback());
      this.callbacks = [];

      return Promise.resolve();
    } catch (error) {
      this.isLoading = false;
      this.loadPromise = null;
      throw error;
    }
  }

  private loadTmapScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;

      if (!apiKey) {
        reject(new Error('Tmap API 키가 설정되지 않았습니다.'));
        return;
      }

      // 기존 스크립트 제거
      const existingScript = document.querySelector('script[src*="tmap"]');
      if (existingScript) {
        existingScript.remove();
      }

      // 콜백 함수 설정
      (window as any).TmapCallback = () => {
        console.log('Tmap 콜백 호출됨 - 전역 로더');
        resolve();
      };

      const script = document.createElement('script');
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}&callback=TmapCallback`;
      script.async = true;

      script.onload = () => {
        console.log('Tmap 스크립트 로드 완료 - 전역 로더');
      };

      script.onerror = () => {
        reject(new Error('Tmap 스크립트 로드 실패'));
      };

      document.head.appendChild(script);
    });
  }

  onLoad(callback: () => void): void {
    if (this.isLoaded && window.Tmap) {
      callback();
    } else {
      this.callbacks.push(callback);
    }
  }

  isTmapReady(): boolean {
    return this.isLoaded && !!window.Tmap;
  }
}

// 전역 인스턴스
export const tmapLoader = TmapLoader.getInstance();

// 타입 정의
declare global {
  interface Window {
    Tmap: any;
    TmapCallback: () => void;
  }
} 