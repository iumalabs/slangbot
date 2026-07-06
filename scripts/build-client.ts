// Client bundle build: esbuild JS API + Deno resolver so npm: specifiers from
// deno.json resolve without a node_modules directory. Deno-only toolchain.
import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";

const watch = Deno.args.includes("--watch");

const options: esbuild.BuildOptions = {
  plugins: [...denoPlugins({ configPath: `${Deno.cwd()}/deno.json` })],
  entryPoints: ["src/client/entry-client.tsx"],
  outfile: "assets/client.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  minify: !watch,
  sourcemap: false,
  // React ships CJS with process.env.NODE_ENV switches.
  define: { "process.env.NODE_ENV": '"production"' },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("client bundle: watching for changes…");
} else {
  await esbuild.build(options);
  const size = (await Deno.stat("assets/client.js")).size;
  console.log(
    `client bundle: assets/client.js (${(size / 1024).toFixed(1)} KiB)`,
  );
  esbuild.stop();
}
