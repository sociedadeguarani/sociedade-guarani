import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const logoUrl = new URL("/apple-icon-guarani.png", request.url).toString();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#003D2B",
        }}
      >
        <img
          src={logoUrl}
          width={420}
          height={420}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
