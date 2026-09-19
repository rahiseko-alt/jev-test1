import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [{ title: "ファクトチェッカー" }];
}

/**
 * 起動できていることだけを示す。検証の画面は次のチケットで作る。
 *
 * 設定の確認は起動前（scripts/prepare.ts）で済ませている。ここで読み直すと、
 * 起動できたのに画面を開いた瞬間に失敗する、という分かりにくい壊れ方をする。
 */
export default function Home() {
  return (
    <main>
      <h1>ファクトチェッカー</h1>
      <p>起動できています。主張を確定する画面は、これから作ります。</p>
    </main>
  );
}
