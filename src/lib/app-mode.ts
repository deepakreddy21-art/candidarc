export function isProductionAppMode() {
  return process.env.NEXT_PUBLIC_APP_MODE === "production";
}

export function allowDemoFallback() {
  return (
    process.env.NEXT_PUBLIC_APP_MODE === "demo" ||
    process.env.NEXT_PUBLIC_USE_MOCK_API === "true"
  );
}
