import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function Today() {
  const [name, setName] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function ping() {
    setError(null);
    try {
      const msg = await invoke<string>("greet", { name: name || "world" });
      setReply(msg);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="page">
      <header className="page__head">
        <h1>Today</h1>
        <span className="page__sub">最小可运行骨架 · 校验 Tauri 桥接</span>
      </header>

      <div className="card">
        <h2>Bridge check</h2>
        <p>调用 Rust 端 <code>greet</code> 命令，验证 Tauri ↔ React 通路。</p>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
          />
          <button onClick={ping}>Invoke greet</button>
        </div>
        {reply && <p className="ok">{reply}</p>}
        {error && <p className="err">{error}</p>}
      </div>

      <div className="card">
        <h2>Next up</h2>
        <ul className="todo">
          <li><b>CL-02</b> 本地 SQLite 存储与 Repository 层</li>
          <li><b>BE-01</b> OIDC / Gateway</li>
          <li><b>NB-01</b> Windows 浮窗 Win32 桥接</li>
        </ul>
      </div>
    </section>
  );
}
