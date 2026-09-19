import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // データベースの接続部分は、まとめ込まずに実行時に読み込ませる。
  // 中で使われている読み込み方が、まとめ込んだ形では動かないため。
  ssr: {
    external: ["better-sqlite3", "pg"],
  },
  server: {
    host: true,
    port: Number(process.env.PORT ?? 3000),
  },
  plugins: [reactRouter()],
});
