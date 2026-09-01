import { CHARACTERS } from "../../characters/catalog";
import { GreusCat } from "./GreusCat";

export function CharacterPicker({
  selected,
  customColor,
  onCustomColor,
  onSelect,
  onClose,
}: {
  selected: string;
  customColor: string;
  onCustomColor: (color: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="character-title">
        <div className="modal-heading">
          <div><span className="eyebrow">GREUS CAT COATS</span><h2 id="character-title">오늘 함께할 고양이</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="character-grid">
          {CHARACTERS.map((pet) => (
            <button key={pet.id} className={`character-card ${selected === pet.id ? "selected" : ""}`} onClick={() => onSelect(pet.id)}>
              <span className="character-preview" aria-hidden="true">
                <GreusCat coat={pet.coat} customColor={customColor} emotion="idle" size={138} durationMs={0} enableIdleActions={false} />
              </span>
              <span><strong>{pet.displayName}</strong><small>{pet.teaser}</small></span>
            </button>
          ))}
        </div>
        <label className="custom-coat-control">
          <span><strong>커스텀 털색</strong><small>색을 고르면 커스텀냥으로 바로 전환됩니다.</small></span>
          <input type="color" value={customColor} onInput={(event) => onCustomColor(event.currentTarget.value)} />
          <output>{customColor.toUpperCase()}</output>
        </label>
      </section>
    </div>
  );
}
