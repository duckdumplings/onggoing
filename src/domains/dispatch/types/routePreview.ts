export interface RoutePreviewOptions {
  useSanitizedFallback?: boolean;
  closeOnSuccess?: boolean;
  silent?: boolean;
  optionsOverride?: {
    optimizeOrder?: boolean;
  };
}

export type RoutePreviewHandler = (
  routeRequest: unknown,
  options?: RoutePreviewOptions,
) => void;
