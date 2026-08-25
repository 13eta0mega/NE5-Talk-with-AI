import { CHARACTERS } from "../../characters/catalog";

export function CharacterPicker({ selected, onSelect, onClose }: { selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="character-title">
        <div className="modal-heading">
          <div><span className="eyebrow">CHARACTERS</span><h2 id="character-title">오늘 함께할 친구</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="character-grid">
          {CHARACTERS.map((pet) => (
            <button key={pet.id} className={`character-card ${selected === pet.id ? "selected" : ""}`} onClick={() => onSelect(pet.id)}>
              <img src={pet.asset} alt="" />
              <span><strong>{pet.displayName}</strong><small>{pet.teaser}</small></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
