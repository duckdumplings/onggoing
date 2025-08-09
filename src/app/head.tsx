export default function Head() {
  return (
    <>
      <link rel="preconnect" href="https://apis.openapi.sk.com" />
      <link rel="preconnect" href="https://topopentile3.tmap.co.kr" />
      <script
        type="text/javascript"
        src={`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${process.env.NEXT_PUBLIC_TMAP_API_KEY}`}
      />
    </>
  );
}


