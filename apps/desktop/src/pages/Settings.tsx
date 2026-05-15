export default function Settings() {
  return (
    <section className="page">
      <header className="page__head">
        <h1>Settings</h1>
        <span className="page__sub">偏好 · 同步 · 模型路由 · 安全</span>
      </header>
      <div className="card">
        <h2>Build</h2>
        <ul className="kv">
          <li><span>Stage</span><b>Foundation / MVP-bootstrap</b></li>
          <li><span>Frontend</span><b>Tauri 2 + React 19 + TypeScript</b></li>
          <li><span>Backend</span><b>未接入（设计阶段）</b></li>
        </ul>
      </div>
    </section>
  );
}
