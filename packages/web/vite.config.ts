import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: Number(process.env.PORT ?? 3000),
  },
  plugins: [reactRouter()],
});
