import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: false,
  sourcemap: true,
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-apigatewaymanagementapi",
  ],
  banner: {
    // Shim require for ESM compatibility in Lambda
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
};

const handlers = ["connect", "disconnect", "default"];

await Promise.all(
  handlers.map((name) =>
    build({
      ...shared,
      entryPoints: [`src/${name}.ts`],
      outfile: `dist/${name}/index.js`,
    }),
  ),
);

console.log("Built handlers:", handlers.join(", "));
