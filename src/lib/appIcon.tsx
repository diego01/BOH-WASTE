import { ImageResponse } from "next/og";

/** Neutral app mark: white bin on brand blue, drawn so it survives maskable cropping. */
export function appIcon(size: number, rounded = false) {
  const s = size / 100;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1565C0",
          borderRadius: rounded ? 22 * s : 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 16 * s, height: 5 * s, background: "#fff", borderRadius: 2 * s }} />
          <div style={{ width: 44 * s, height: 6 * s, background: "#fff", borderRadius: 3 * s, marginTop: 2 * s }} />
          <div
            style={{
              width: 36 * s,
              height: 40 * s,
              marginTop: 3 * s,
              background: "#fff",
              borderBottomLeftRadius: 6 * s,
              borderBottomRightRadius: 6 * s,
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 4 * s, height: 26 * s, background: "#1565C0", borderRadius: 2 * s }} />
            ))}
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
