/** OG image template — rendered by workers-og (Satori). No AI involved. */
import { SHARE_HOST, SITE_NAME } from "../config.ts";

export function OgTermCard(props: {
  term: string;
  ipa: string;
  pos: string;
  dayNumber: number;
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(160deg, #070D19 0%, #111D33 70%, #1a1440 100%)",
        fontFamily: "IBM Plex Sans",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "48px",
          left: "64px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <span style={{ color: "#F0C05A", fontSize: "36px", fontWeight: 600 }}>
          {SITE_NAME}
        </span>
        <span
          style={{
            color: "#0a1020",
            background: "#F0C05A",
            borderRadius: "999px",
            padding: "4px 18px",
            fontSize: "24px",
          }}
        >
          day {props.dayNumber}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            color: "#F0C05A",
            fontSize: props.term.length > 14 ? "96px" : "132px",
            fontWeight: 700,
            textShadow: "0 0 60px rgba(240,192,90,0.55)",
          }}
        >
          {props.term}
        </span>
        <span style={{ color: "#8fa3c8", fontSize: "36px" }}>
          {props.ipa} · {props.pos}
        </span>
      </div>
      <span
        style={{
          position: "absolute",
          bottom: "44px",
          color: "#5FD4C8",
          fontSize: "28px",
        }}
      >
        {SHARE_HOST}
      </span>
    </div>
  );
}
