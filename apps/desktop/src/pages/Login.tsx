import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate("/today");
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={onSubmit}>
        <h1>Momo</h1>
        <p className="auth__hint">
          OIDC / Passkeys 登录链路待接入（BE-01）。当前为占位入口。
        </p>
        <label className="auth__label">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <button type="submit">Continue</button>
      </form>
    </div>
  );
}
