import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("claims/:claimId", "routes/claim.tsx"),
] satisfies RouteConfig;
