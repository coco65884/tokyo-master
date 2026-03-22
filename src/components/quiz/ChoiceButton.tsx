import type { QuizChoice } from '@/types';

type ChoiceState = 'default' | 'correct' | 'wrong' | 'revealed';

interface Props {
  choice: QuizChoice;
  state: ChoiceState;
  suffix?: string;
  disabled: boolean;
  onClick: (choice: QuizChoice) => void;
}

export default function ChoiceButton({ choice, state, suffix, disabled, onClick }: Props) {
  const stateClass = state !== 'default' ? `choice-btn--${state}` : '';

  return (
    <button
      className={`choice-btn ${stateClass}`}
      disabled={disabled}
      onClick={() => onClick(choice)}
      type="button"
    >
      <span className="choice-btn__label">
        {choice.label}
        {suffix && <span className="choice-btn__suffix">{suffix}</span>}
      </span>
    </button>
  );
}
