import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const USER_NAME_STORAGE_KEY = "deskpet:user-name:v1";

export function normalizeUserName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function UserNameSetting() {
  const [host, setHost] = useState<Element | null>(null);
  const [value, setValue] = useState(() => normalizeUserName(localStorage.getItem(USER_NAME_STORAGE_KEY)));
  const [savedValue, setSavedValue] = useState(value);

  useEffect(() => {
    setHost(document.querySelector(".settings-drawer"));
  }, []);

  const save = () => {
    const next = normalizeUserName(value);
    setValue(next);
    setSavedValue(next);
    if (next) localStorage.setItem(USER_NAME_STORAGE_KEY, next);
    else localStorage.removeItem(USER_NAME_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("deskpet:user-profile-changed", { detail: { userName: next } }));
  };

  if (!host) return null;

  return createPortal(
    <div className="setting-block user-name-setting">
      <div className="label-row">
        <label htmlFor="deskpet-user-name">내 이름</label>
        <span className={`key-status ${savedValue ? "saved" : ""}`}>{savedValue ? `${savedValue}로 기억 중` : "미설정"}</span>
      </div>
      <div className="secret-input">
        <input
          id="deskpet-user-name"
          type="text"
          value={value}
          maxLength={40}
          placeholder="예: 주안"
          autoComplete="name"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") save(); }}
        />
        <button onClick={save}>저장</button>
      </div>
      <p className="hint">이 브라우저에 이름을 저장합니다. 새 Live 연결이나 재연결부터 캐릭터가 이름을 기억하고 필요할 때 자연스럽게 불러요.</p>
    </div>,
    host,
  );
}
