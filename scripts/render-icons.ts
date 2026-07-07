// One-time icon rasterizer: renders the SVG favicon into the PNG sizes that
// don't support SVG (apple-touch-icon). Deno-only toolchain.
import { Resvg } from "npm:@resvg/resvg-js@2.6.2";

const svg = await Deno.readTextFile("assets/favicon.svg");

const targets = [
  { file: "assets/apple-touch-icon.png", size: 180 },
  { file: "assets/favicon-32.png", size: 32 },
];

for (const { file, size } of targets) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: size },
  });
  const png = resvg.render().asPng();
  await Deno.writeFile(file, png);
  console.log(`${file} (${size}x${size}, ${png.length} bytes)`);
}
