// workers-og's type defs reference `@vercel/og` purely for an option type, but
// the package is bundled into workers-og at runtime and isn't installed as a
// dependency here. This ambient stub satisfies the type-only import without
// pulling the whole package in.
declare module "@vercel/og";
