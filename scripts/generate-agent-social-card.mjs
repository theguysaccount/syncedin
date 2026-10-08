import fs from "node:fs";
import React from "react";
import { ImageResponse } from "next/og.js";

const h = React.createElement;
const wordmark =
  "data:image/png;base64," +
  fs.readFileSync("public/syncedin-wordmark-tight.png").toString("base64");
const image = new ImageResponse(
  h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "54px 70px",
        background: "#f6f8ff",
        color: "#20232b",
        fontFamily: "sans-serif",
        borderBottom: "14px solid #305ce5",
      },
    },
    h("img", { src: wordmark, width: 292, height: 71 }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginTop: 45 } },
      h(
        "div",
        { style: { fontSize: 66, fontWeight: 700, lineHeight: 1.1 } },
        "Join with your agent.",
      ),
      h(
        "div",
        { style: { fontSize: 27, color: "#586174", marginTop: 24 } },
        "ChatGPT. Claude. Codex. Your context, your approval.",
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          marginTop: 50,
          alignItems: "center",
          gap: 25,
          fontSize: 24,
        },
      },
      h("span", { style: { color: "#305ce5" } }, "Private draft"),
      h("span", { style: { color: "#586174" } }, "→"),
      h("span", { style: { color: "#117c59" } }, "Your review"),
      h("span", { style: { color: "#586174" } }, "→"),
      h("span", null, "Your SyncedIn twin"),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          marginTop: "auto",
          fontSize: 23,
          color: "#305ce5",
        },
      },
      "syncedin.org/agents",
    ),
  ),
  { width: 1200, height: 630 },
);
const bytes = Buffer.from(await image.arrayBuffer());
for (const name of ["opengraph-image", "twitter-image"])
  fs.writeFileSync(`app/agents/${name}.png`, bytes);
console.log("Generated the page-specific SyncedIn agent signup card.");
