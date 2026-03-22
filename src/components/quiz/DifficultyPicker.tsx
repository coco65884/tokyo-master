import type { DifficultyLevel } from '@/types';
import { DIFFICULTY_LABELS } from '@/utils/difficultySettings';

interface Props {
  value: DifficultyLevel;
  onChange: (level: DifficultyLevel) => void;
}

const LEVELS: DifficultyLevel[] = ['kantan', 'futsuu', 'muzukashii'];

export default function DifficultyPicker({ value, onChange }: Props) {
  return (
    <div className="difficulty-picker">
      {LEVELS.map((level) => {
        const label = DIFFICULTY_LABELS[level];
        return (
          <button
            key={level}
            className={`difficulty-picker__pill ${value === level ? 'difficulty-picker__pill--active' : ''}`}
            onClick={() => onChange(level)}
            type="button"
          >
            <span className="difficulty-picker__name">{label.name}</span>
            <span className="difficulty-picker__desc">{label.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
